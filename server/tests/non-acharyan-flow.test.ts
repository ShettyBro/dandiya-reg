import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createApp } from "../src/app/create-app.js";
import { loadEnv, resetEnvCacheForTests } from "../src/app/config/env.js";
import { hashPassword } from "../src/lib/security/password.js";
import { getR2Client } from "../src/lib/r2/client.js";
import { submitPaymentProof } from "../src/modules/payments/payment.service.js";

const prisma = new PrismaClient();

resetEnvCacheForTests();
const env = loadEnv(process.env);
const app = createApp(env, prisma);
const r2 = getR2Client(env);
const createdObjectKeys: string[] = [];

// approvePayment/approveIdentity now verify the photo/identity-proof genuinely exist in R2 (not
// just that the DB's object-key field is non-null), so tests that reach either approve step need
// a real object at that key.
async function uploadRealObject(objectKey: string): Promise<void> {
  createdObjectKeys.push(objectKey);
  await r2.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: objectKey,
      Body: Buffer.from(
        "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
        "base64"
      ),
      ContentType: "image/jpeg"
    })
  );
}

const FINANCE_EMAIL = `test-na-finance-${Date.now()}@acharya.ac.in`;
const VERIFIER_EMAIL = `test-na-verifier-${Date.now()}@acharya.ac.in`;
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
let verifierCookies: string[];
let verifierCsrf: string;

async function createNonAcharyanRegistration(suffix: string) {
  const created = await request(app)
    .post("/api/v1/registrations")
    .set("Idempotency-Key", `na-flow-${suffix}-${Date.now()}`)
    .send({
      registrationType: "NON_ACHARYAN_STUDENT",
      name: `Non Acharyan ${suffix}`,
      phone: randomPhone(),
      email: `na-flow-${suffix}-${Date.now()}@example.com`,
      collegeName: "Some Other College"
    });
  createdRegistrationIds.push(created.body.registrationId);
  const photoObjectKey = `test-photo/${created.body.registrationId}.jpg`;
  const collegeIdImageObjectKey = `test-college-id/${created.body.registrationId}.jpg`;
  await uploadRealObject(photoObjectKey);
  await uploadRealObject(collegeIdImageObjectKey);
  await prisma.registration.update({
    where: { id: created.body.registrationId },
    data: { photoObjectKey, collegeIdImageObjectKey }
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
  await prisma.user.create({
    data: { email: VERIFIER_EMAIL, passwordHash, role: "ID_VERIFIER", status: "ACTIVE" }
  });
  const login = await request(app).post("/api/v1/auth/login").send({ email: FINANCE_EMAIL, password: PASSWORD });
  financeCookies = login.headers["set-cookie"] as unknown as string[];
  financeCsrf = extractCookie(financeCookies, "csrf_token") ?? "";

  const verifierLogin = await request(app).post("/api/v1/auth/login").send({ email: VERIFIER_EMAIL, password: PASSWORD });
  verifierCookies = verifierLogin.headers["set-cookie"] as unknown as string[];
  verifierCsrf = extractCookie(verifierCookies, "csrf_token") ?? "";
});

afterAll(async () => {
  for (const key of createdObjectKeys) {
    await r2.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key })).catch(() => undefined);
  }
  await prisma.auditLog.deleteMany({ where: { entityId: { in: createdRegistrationIds } } });
  await prisma.passCredential.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.emailJob.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.attendance.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.uploadIntent.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.payment.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.registration.deleteMany({ where: { id: { in: createdRegistrationIds } } });
  await prisma.refreshToken.deleteMany({ where: { user: { email: { in: [FINANCE_EMAIL, VERIFIER_EMAIL] } } } });
  await prisma.auditLog.deleteMany({ where: { actorUser: { email: { in: [FINANCE_EMAIL, VERIFIER_EMAIL] } } } });
  await prisma.user.deleteMany({ where: { email: { in: [FINANCE_EMAIL, VERIFIER_EMAIL] } } });
  await prisma.$disconnect();
});

describe("Non-Acharyan two-stage identity + payment flow", () => {
  it("goes registration -> IDENTITY_PENDING -> blocks payment review -> identity approved -> payment approved", async () => {
    const registration = await createNonAcharyanRegistration("full-flow");
    const objectKey = `payments/${registration.registrationId}/proof/na-flow.jpg`;
    await uploadRealObject(objectKey);
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

    const financeBlockedFromIdentity = await request(app)
      .post(`/api/v1/admin/identity/non-acharyan/${registration.registrationId}/approve`)
      .set("Cookie", financeCookies)
      .set("X-CSRF-Token", financeCsrf);
    expect(financeBlockedFromIdentity.status).toBe(403);

    const approveIdentity = await request(app)
      .post(`/api/v1/admin/identity/non-acharyan/${registration.registrationId}/approve`)
      .set("Cookie", verifierCookies)
      .set("X-CSRF-Token", verifierCsrf);
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
      .set("Cookie", verifierCookies)
      .set("X-CSRF-Token", verifierCsrf)
      .send({ reason: "Aadhaar image unreadable" });
    expect(rejectIdentity.status).toBe(200);

    const rejected = await prisma.registration.findUniqueOrThrow({ where: { id: registration.registrationId } });
    expect(rejected.status).toBe("IDENTITY_REJECTED");

    const rejectedPayment = await prisma.payment.findUniqueOrThrow({
      where: { registrationId: registration.registrationId }
    });
    expect(rejectedPayment.status).toBe("REJECTED");

    // Resubmission: a fresh registration reusing the SAME UTR — must succeed since the old
    // payment's UTR no longer counts as active once its registration was rejected.
    const resubmission = await createNonAcharyanRegistration("identity-reject-reuse-2");
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
