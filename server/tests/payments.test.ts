import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app/create-app.js";
import { loadEnv, resetEnvCacheForTests } from "../src/app/config/env.js";
import { hashPassword } from "../src/lib/security/password.js";
import {
  DuplicateTransactionIdError,
  InvalidUploadIntentError,
  submitPaymentProof
} from "../src/modules/payments/payment.service.js";

const prisma = new PrismaClient();

resetEnvCacheForTests();
const env = loadEnv(process.env);
const app = createApp(env, prisma);

const FINANCE_EMAIL = `test-finance-${Date.now()}@acharya.ac.in`;
const VOLUNTEER_EMAIL = `test-vol-${Date.now()}@acharya.ac.in`;
const PASSWORD = "correct horse battery staple";

const createdRegistrationIds: string[] = [];
let financeCookies: string[];
let volunteerCookies: string[];
let financeCsrfToken: string;

function extractCookie(setCookieHeader: string[] | undefined, name: string): string | undefined {
  const line = setCookieHeader?.find((entry) => entry.startsWith(`${name}=`));
  return line?.split(";")[0]?.split("=")[1];
}

function randomPhone(): string {
  return `9${Math.floor(100000000 + Math.random() * 899999999)}`;
}

async function createTestRegistration(suffix: string) {
  const response = await request(app)
    .post("/api/v1/registrations")
    .set("Idempotency-Key", `pay-test-${suffix}-${Date.now()}`)
    .send({
      registrationType: "ACHARYA_STUDENT",
      name: "Payment Test User",
      phone: randomPhone(),
      email: `pay-test-${suffix}-${Date.now()}@acharya.ac.in`,
      auid: `pay-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      institution: "acharya institute of technology",
      year: 2
    });
  createdRegistrationIds.push(response.body.registrationId);
  return response.body as { registrationId: string; publicCode: string };
}

async function createProofIntent(registrationId: string, objectKey: string) {
  await prisma.uploadIntent.create({
    data: {
      registrationId,
      purpose: "PAYMENT_PROOF",
      objectKey,
      expectedMime: "image/jpeg",
      maxSizeBytes: 2 * 1024 * 1024,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    }
  });
}

// Submitting proof at the service layer, bypassing the HTTP route's R2 image-validation gate
// (added in Phase 13 — see ai/DECISIONS.md), since a real proof object can only exist in R2
// after an actual presigned upload, and R2 credentials are not available in this environment.
// The HTTP-level gate itself is covered separately below ("returns 503 ... before ever
// reaching upload-intent validation").
async function submitProofDirect(registrationId: string, transactionId: string, proofObjectKey: string) {
  return submitPaymentProof(prisma, { registrationId, transactionId, proofObjectKey });
}

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD);
  await prisma.user.create({
    data: { email: FINANCE_EMAIL, passwordHash, role: "FINANCE", status: "ACTIVE" }
  });
  await prisma.user.create({
    data: { email: VOLUNTEER_EMAIL, passwordHash, role: "VOLUNTEER", status: "ACTIVE" }
  });

  const financeLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: FINANCE_EMAIL, password: PASSWORD });
  financeCookies = financeLogin.headers["set-cookie"] as unknown as string[];
  financeCsrfToken = extractCookie(financeCookies, "csrf_token") ?? "";

  const volunteerLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: VOLUNTEER_EMAIL, password: PASSWORD });
  volunteerCookies = volunteerLogin.headers["set-cookie"] as unknown as string[];
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entityType: "Payment" } });
  await prisma.passCredential.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.emailJob.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.attendance.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.uploadIntent.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.payment.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.registration.deleteMany({ where: { id: { in: createdRegistrationIds } } });
  await prisma.refreshToken.deleteMany({
    where: { user: { email: { in: [FINANCE_EMAIL, VOLUNTEER_EMAIL] } } }
  });
  await prisma.auditLog.deleteMany({
    where: { actorUser: { email: { in: [FINANCE_EMAIL, VOLUNTEER_EMAIL] } } }
  });
  await prisma.user.deleteMany({ where: { email: { in: [FINANCE_EMAIL, VOLUNTEER_EMAIL] } } });
  await prisma.$disconnect();
});

describe("payment proof submission (service layer)", () => {
  it("rejects submission without a matching upload intent", async () => {
    const registration = await createTestRegistration("no-intent");

    await expect(
      submitProofDirect(registration.registrationId, `TXN-NO-INTENT-${Date.now()}`, "payments/fake/proof/x.jpg")
    ).rejects.toBeInstanceOf(InvalidUploadIntentError);
  });

  it("accepts a valid submission and moves registration/payment to PROOF_SUBMITTED", async () => {
    const registration = await createTestRegistration("ok");
    const objectKey = `payments/${registration.registrationId}/proof/one.jpg`;
    await createProofIntent(registration.registrationId, objectKey);

    const payment = await submitProofDirect(registration.registrationId, `TXN-OK-${Date.now()}`, objectKey);

    expect(payment.status).toBe("PROOF_SUBMITTED");

    const dbRegistration = await prisma.registration.findUniqueOrThrow({
      where: { id: registration.registrationId }
    });
    expect(dbRegistration.status).toBe("PAYMENT_SUBMITTED");
  });

  it("rejects a duplicate transaction id across different registrations", async () => {
    const txnId = `TXN-DUP-${Date.now()}`;

    const first = await createTestRegistration("dup-a");
    const firstKey = `payments/${first.registrationId}/proof/a.jpg`;
    await createProofIntent(first.registrationId, firstKey);
    const firstPayment = await submitProofDirect(first.registrationId, txnId, firstKey);
    expect(firstPayment.status).toBe("PROOF_SUBMITTED");

    const second = await createTestRegistration("dup-b");
    const secondKey = `payments/${second.registrationId}/proof/b.jpg`;
    await createProofIntent(second.registrationId, secondKey);

    await expect(submitProofDirect(second.registrationId, txnId, secondKey)).rejects.toBeInstanceOf(
      DuplicateTransactionIdError
    );
  });
});

describe("payment proof submission (HTTP route)", () => {
  it("cleanly rejects a proofObjectKey that was never actually uploaded to R2", async () => {
    const registration = await createTestRegistration("http-gate");

    const response = await request(app)
      .post(`/api/v1/registrations/${registration.registrationId}/payment`)
      .send({ transactionId: `TXN-GATE-${Date.now()}`, proofObjectKey: "payments/whatever/proof/x.jpg" });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("IMAGE_VALIDATION_FAILED");
  });
});

describe("finance approve/reject", () => {
  it("blocks a VOLUNTEER from approving a payment", async () => {
    const registration = await createTestRegistration("rbac");
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { registrationId: registration.registrationId }
    });

    const response = await request(app)
      .post(`/api/v1/admin/payments/${payment.id}/approve`)
      .set("Cookie", volunteerCookies);

    expect(response.status).toBe(403);
  });

  it("rejects approving a payment that has no submitted proof yet", async () => {
    const registration = await createTestRegistration("not-submitted");
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { registrationId: registration.registrationId }
    });

    const response = await request(app)
      .post(`/api/v1/admin/payments/${payment.id}/approve`)
      .set("Cookie", financeCookies)
      .set("X-CSRF-Token", financeCsrfToken);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("NOT_REVIEWABLE");
  });

  it("requires a reason to reject", async () => {
    const registration = await createTestRegistration("reject-no-reason");
    const objectKey = `payments/${registration.registrationId}/proof/x.jpg`;
    await createProofIntent(registration.registrationId, objectKey);
    await submitProofDirect(registration.registrationId, `TXN-RNR-${Date.now()}`, objectKey);

    const payment = await prisma.payment.findUniqueOrThrow({
      where: { registrationId: registration.registrationId }
    });

    const response = await request(app)
      .post(`/api/v1/admin/payments/${payment.id}/reject`)
      .set("Cookie", financeCookies)
      .set("X-CSRF-Token", financeCsrfToken)
      .send({});

    expect(response.status).toBe(400);
  });

  it("rejects with a reason, then allows resubmission without duplicating the registration", async () => {
    const registration = await createTestRegistration("reject-flow");
    const firstKey = `payments/${registration.registrationId}/proof/first.jpg`;
    await createProofIntent(registration.registrationId, firstKey);
    await submitProofDirect(registration.registrationId, `TXN-RF-${Date.now()}`, firstKey);

    const payment = await prisma.payment.findUniqueOrThrow({
      where: { registrationId: registration.registrationId }
    });

    const rejectResponse = await request(app)
      .post(`/api/v1/admin/payments/${payment.id}/reject`)
      .set("Cookie", financeCookies)
      .set("X-CSRF-Token", financeCsrfToken)
      .send({ reason: "Screenshot is blurry, transaction ID unreadable" });

    expect(rejectResponse.status).toBe(200);

    const rejectedRegistration = await prisma.registration.findUniqueOrThrow({
      where: { id: registration.registrationId }
    });
    expect(rejectedRegistration.status).toBe("PAYMENT_REJECTED");

    const secondKey = `payments/${registration.registrationId}/proof/second.jpg`;
    await createProofIntent(registration.registrationId, secondKey);
    const resubmitPayment = await submitProofDirect(
      registration.registrationId,
      `TXN-RF2-${Date.now()}`,
      secondKey
    );

    expect(resubmitPayment.status).toBe("PROOF_SUBMITTED");

    const registrationCount = await prisma.registration.count({
      where: { id: registration.registrationId }
    });
    expect(registrationCount).toBe(1);
  });

  it("approves a submitted payment, issues a pass credential, and queues the approval email", async () => {
    const registration = await createTestRegistration("approve-flow");
    const objectKey = `payments/${registration.registrationId}/proof/approve.jpg`;
    await createProofIntent(registration.registrationId, objectKey);
    await submitProofDirect(registration.registrationId, `TXN-AF-${Date.now()}`, objectKey);

    const payment = await prisma.payment.findUniqueOrThrow({
      where: { registrationId: registration.registrationId }
    });

    const approveResponse = await request(app)
      .post(`/api/v1/admin/payments/${payment.id}/approve`)
      .set("Cookie", financeCookies)
      .set("X-CSRF-Token", financeCsrfToken);

    expect(approveResponse.status).toBe(200);

    const approvedRegistration = await prisma.registration.findUniqueOrThrow({
      where: { id: registration.registrationId }
    });
    expect(approvedRegistration.status).toBe("PAYMENT_APPROVED");

    const credential = await prisma.passCredential.findUnique({
      where: { registrationId: registration.registrationId }
    });
    expect(credential).not.toBeNull();
    expect(credential?.credentialType).toBe("PARTICIPANT");

    const emailJob = await prisma.emailJob.findUnique({
      where: { uniquenessKey: `payment-approved-${registration.registrationId}` }
    });
    expect(emailJob).not.toBeNull();
    expect(emailJob?.type).toBe("PAYMENT_APPROVED");
    expect(emailJob?.status).toBe("PENDING");
  });

  it("does not allow approving the same payment twice", async () => {
    const registration = await createTestRegistration("double-approve");
    const objectKey = `payments/${registration.registrationId}/proof/double.jpg`;
    await createProofIntent(registration.registrationId, objectKey);
    await submitProofDirect(registration.registrationId, `TXN-DA-${Date.now()}`, objectKey);

    const payment = await prisma.payment.findUniqueOrThrow({
      where: { registrationId: registration.registrationId }
    });

    const first = await request(app)
      .post(`/api/v1/admin/payments/${payment.id}/approve`)
      .set("Cookie", financeCookies)
      .set("X-CSRF-Token", financeCsrfToken);
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/v1/admin/payments/${payment.id}/approve`)
      .set("Cookie", financeCookies)
      .set("X-CSRF-Token", financeCsrfToken);
    expect(second.status).toBe(409);
  });

  it("blocks a VOLUNTEER from retrieving a payment proof URL", async () => {
    const registration = await createTestRegistration("proof-url-rbac");
    const objectKey = `payments/${registration.registrationId}/proof/pu.jpg`;
    await createProofIntent(registration.registrationId, objectKey);
    await submitProofDirect(registration.registrationId, `TXN-PU-${Date.now()}`, objectKey);

    const payment = await prisma.payment.findUniqueOrThrow({
      where: { registrationId: registration.registrationId }
    });

    const response = await request(app)
      .get(`/api/v1/admin/payments/${payment.id}/proof-url`)
      .set("Cookie", volunteerCookies);

    expect(response.status).toBe(403);
  });
});
