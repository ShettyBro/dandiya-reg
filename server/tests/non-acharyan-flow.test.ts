import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app/create-app.js";
import { loadEnv, resetEnvCacheForTests } from "../src/app/config/env.js";
import { hashPassword } from "../src/lib/security/password.js";
import { submitPaymentProof } from "../src/modules/payments/payment.service.js";

const prisma = new PrismaClient();

resetEnvCacheForTests();
const env = loadEnv(process.env);
const app = createApp(env, prisma);

const FINANCE_EMAIL = `test-na-finance-${Date.now()}@acharya.ac.in`;
const PASSWORD = "correct horse battery staple";
const createdRegistrationIds: string[] = [];

function extractCookie(setCookieHeader: string[] | undefined, name: string): string | undefined {
  const line = setCookieHeader?.find((entry) => entry.startsWith(`${name}=`));
  return line?.split(";")[0]?.split("=")[1];
}

function randomPhone(): string {
  return `9${Math.floor(100000000 + Math.random() * 899999999)}`;
}

let financeCookies: string[];
let financeCsrf: string;

async function createNonAcharyanRegistration(suffix: string) {
  const created = await request(app)
    .post("/api/v1/registrations")
    .set("Idempotency-Key", `na-flow-${suffix}-${Date.now()}`)
    .send({
      registrationType: "NON_ACHARYAN_STUDENT",
      name: `Non Acharyan ${suffix}`,
      phone: randomPhone(),
      email: `na-flow-${suffix}-${Date.now()}@example.com`,
      collegeName: "Some Other College",
      aadhaarNumber: `${Date.now()}${Math.floor(Math.random() * 1000)}`
    });
  createdRegistrationIds.push(created.body.registrationId);
  await prisma.registration.update({
    where: { id: created.body.registrationId },
    data: {
      photoObjectKey: `test-photo/${created.body.registrationId}.jpg`,
      aadhaarImageObjectKey: `test-aadhaar/${created.body.registrationId}.jpg`,
      collegeIdImageObjectKey: `test-college-id/${created.body.registrationId}.jpg`
    }
  });
  return created.body as { registrationId: string; publicCode: string };
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

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD);
  await prisma.user.create({
    data: { email: FINANCE_EMAIL, passwordHash, role: "FINANCE", status: "ACTIVE" }
  });
  const login = await request(app).post("/api/v1/auth/login").send({ email: FINANCE_EMAIL, password: PASSWORD });
  financeCookies = login.headers["set-cookie"] as unknown as string[];
  financeCsrf = extractCookie(financeCookies, "csrf_token") ?? "";
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { in: createdRegistrationIds } } });
  await prisma.passCredential.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.emailJob.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.attendance.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.uploadIntent.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.payment.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.registration.deleteMany({ where: { id: { in: createdRegistrationIds } } });
  await prisma.refreshToken.deleteMany({ where: { user: { email: FINANCE_EMAIL } } });
  await prisma.auditLog.deleteMany({ where: { actorUser: { email: FINANCE_EMAIL } } });
  await prisma.user.deleteMany({ where: { email: FINANCE_EMAIL } });
  await prisma.$disconnect();
});

describe("Non-Acharyan two-stage identity + payment flow", () => {
  it("goes registration -> IDENTITY_PENDING -> blocks payment review -> identity approved -> payment approved", async () => {
    const registration = await createNonAcharyanRegistration("full-flow");
    const objectKey = `payments/${registration.registrationId}/proof/na-flow.jpg`;
    await createProofIntent(registration.registrationId, objectKey);

    const payment = await submitPaymentProof(prisma, {
      registrationId: registration.registrationId,
      transactionId: `TXN-NA-${Date.now()}`,
      proofObjectKey: objectKey
    });
    expect(payment.status).toBe("PROOF_SUBMITTED");

    const afterSubmit = await prisma.registration.findUniqueOrThrow({ where: { id: registration.registrationId } });
    expect(afterSubmit.status).toBe("IDENTITY_PENDING");
    expect(afterSubmit.identityStatus).toBe("PENDING");

    const blockedApprove = await request(app)
      .post(`/api/v1/admin/payments/${payment.id}/approve`)
      .set("Cookie", financeCookies)
      .set("X-CSRF-Token", financeCsrf);
    expect(blockedApprove.status).toBe(409);
    expect(blockedApprove.body.code).toBe("IDENTITY_NOT_APPROVED");

    const approveIdentity = await request(app)
      .post(`/api/v1/admin/identity/non-acharyan/${registration.registrationId}/approve`)
      .set("Cookie", financeCookies)
      .set("X-CSRF-Token", financeCsrf);
    expect(approveIdentity.status).toBe(200);

    const afterIdentityApproved = await prisma.registration.findUniqueOrThrow({
      where: { id: registration.registrationId }
    });
    expect(afterIdentityApproved.status).toBe("PAYMENT_SUBMITTED");
    expect(afterIdentityApproved.identityStatus).toBe("APPROVED");

    const approvePayment = await request(app)
      .post(`/api/v1/admin/payments/${payment.id}/approve`)
      .set("Cookie", financeCookies)
      .set("X-CSRF-Token", financeCsrf);
    expect(approvePayment.status).toBe(200);

    const finalRegistration = await prisma.registration.findUniqueOrThrow({
      where: { id: registration.registrationId }
    });
    expect(finalRegistration.status).toBe("PAYMENT_APPROVED");

    const credential = await prisma.passCredential.findUnique({
      where: { registrationId: registration.registrationId }
    });
    expect(credential).not.toBeNull();
  });

  it("rejecting identity releases the UTR for reuse on a resubmission, without another payment", async () => {
    const registration = await createNonAcharyanRegistration("identity-reject-reuse");
    const utr = `TXN-NA-REUSE-${Date.now()}`;
    const objectKey = `payments/${registration.registrationId}/proof/reject.jpg`;
    await createProofIntent(registration.registrationId, objectKey);
    await submitPaymentProof(prisma, {
      registrationId: registration.registrationId,
      transactionId: utr,
      proofObjectKey: objectKey
    });

    const rejectIdentity = await request(app)
      .post(`/api/v1/admin/identity/non-acharyan/${registration.registrationId}/reject`)
      .set("Cookie", financeCookies)
      .set("X-CSRF-Token", financeCsrf)
      .send({ reason: "Aadhaar image unreadable" });
    expect(rejectIdentity.status).toBe(200);

    const rejected = await prisma.registration.findUniqueOrThrow({ where: { id: registration.registrationId } });
    expect(rejected.status).toBe("IDENTITY_REJECTED");

    const rejectedPayment = await prisma.payment.findUniqueOrThrow({
      where: { registrationId: registration.registrationId }
    });
    expect(rejectedPayment.status).toBe("REJECTED");

    // Resubmission: new registration, same Aadhaar (released since the original is now rejected),
    // reusing the SAME UTR — must succeed since the old payment's UTR no longer counts as active.
    const resubmission = await createNonAcharyanRegistration("identity-reject-reuse-2");
    await prisma.registration.update({
      where: { id: resubmission.registrationId },
      data: { aadhaarNumber: rejected.aadhaarNumber }
    });
    const secondObjectKey = `payments/${resubmission.registrationId}/proof/reused.jpg`;
    await createProofIntent(resubmission.registrationId, secondObjectKey);

    const reusedPayment = await submitPaymentProof(prisma, {
      registrationId: resubmission.registrationId,
      transactionId: utr,
      proofObjectKey: secondObjectKey
    });
    expect(reusedPayment.status).toBe("PROOF_SUBMITTED");
    expect(reusedPayment.transactionId).toBe(utr);
  });
});
