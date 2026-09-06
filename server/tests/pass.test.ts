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

const FINANCE_EMAIL = `test-pass-finance-${Date.now()}@acharya.ac.in`;
const PASSWORD = "correct horse battery staple";
const createdRegistrationIds: string[] = [];

function extractCookie(setCookieHeader: string[] | undefined, name: string): string | undefined {
  const line = setCookieHeader?.find((entry) => entry.startsWith(`${name}=`));
  return line?.split(";")[0]?.split("=")[1];
}

let financeCookies: string[];
let financeCsrfToken: string;

function randomPhone(): string {
  return `9${Math.floor(100000000 + Math.random() * 899999999)}`;
}

async function createApprovedRegistration(suffix: string) {
  const created = await request(app)
    .post("/api/v1/registrations")
    .set("Idempotency-Key", `pass-test-${suffix}-${Date.now()}`)
    .send({
      registrationType: "ACHARYA_STUDENT",
      name: "Pass Test User",
      phone: randomPhone(),
      email: `pass-test-${suffix}-${Date.now()}@acharya.ac.in`,
      auid: `pass-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      institution: "acharya institute of technology",
      year: 2
    });
  createdRegistrationIds.push(created.body.registrationId);

  const objectKey = `payments/${created.body.registrationId}/proof/pass-test.jpg`;
  await prisma.uploadIntent.create({
    data: {
      registrationId: created.body.registrationId,
      purpose: "PAYMENT_PROOF",
      objectKey,
      expectedMime: "image/jpeg",
      maxSizeBytes: 2 * 1024 * 1024,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    }
  });
  await submitPaymentProof(prisma, {
    registrationId: created.body.registrationId,
    transactionId: `TXN-PASS-${suffix}-${Date.now()}`,
    proofObjectKey: objectKey
  });

  const payment = await prisma.payment.findUniqueOrThrow({
    where: { registrationId: created.body.registrationId }
  });
  await request(app)
    .post(`/api/v1/admin/payments/${payment.id}/approve`)
    .set("Cookie", financeCookies)
    .set("X-CSRF-Token", financeCsrfToken);

  return created.body as { registrationId: string; publicCode: string; eightDigitCode?: string };
}

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD);
  await prisma.user.create({
    data: { email: FINANCE_EMAIL, passwordHash, role: "FINANCE", status: "ACTIVE" }
  });
  const login = await request(app).post("/api/v1/auth/login").send({ email: FINANCE_EMAIL, password: PASSWORD });
  financeCookies = login.headers["set-cookie"] as unknown as string[];
  financeCsrfToken = extractCookie(financeCookies, "csrf_token") ?? "";
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entityType: "Payment" } });
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

describe("POST /api/v1/pass/lookup", () => {
  it("returns 404 for an unknown code", async () => {
    const response = await request(app).post("/api/v1/pass/lookup").send({ code: "DN26-ZZZZZZ" });
    expect(response.status).toBe(404);
  });

  it("reports not eligible for a registration that is not yet approved", async () => {
    const created = await request(app)
      .post("/api/v1/registrations")
      .set("Idempotency-Key", `pass-lookup-${Date.now()}`)
      .send({
        registrationType: "ACHARYA_STUDENT",
        name: "Not Approved Yet",
        phone: randomPhone(),
        email: `pass-not-approved-${Date.now()}@acharya.ac.in`,
        auid: `pass-na-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        institution: "acharya institute of technology",
        year: 2
      });
    createdRegistrationIds.push(created.body.registrationId);

    const response = await request(app).post("/api/v1/pass/lookup").send({ code: created.body.publicCode });

    expect(response.status).toBe(200);
    expect(response.body.eligible).toBe(false);
  });
});

describe("GET /api/v1/pass/:registrationId", () => {
  it("rejects a mismatched code", async () => {
    const registration = await createApprovedRegistration("mismatch");
    const response = await request(app).get(
      `/api/v1/pass/${registration.registrationId}?code=DN26-WRONGX`
    );
    expect(response.status).toBe(404);
  });

  it("returns 409 for a registration that has not been approved", async () => {
    const created = await request(app)
      .post("/api/v1/registrations")
      .set("Idempotency-Key", `pass-notapproved-${Date.now()}`)
      .send({
        registrationType: "ACHARYA_STUDENT",
        name: "Still Pending",
        phone: randomPhone(),
        email: `pass-pending-${Date.now()}@acharya.ac.in`,
        auid: `pass-sp-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        institution: "acharya institute of technology",
        year: 2
      });
    createdRegistrationIds.push(created.body.registrationId);

    const response = await request(app).get(
      `/api/v1/pass/${created.body.registrationId}?code=${created.body.publicCode}`
    );

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("PASS_NOT_AVAILABLE");
  });

  it("returns full pass data for an approved registration, with a deterministic QR payload", async () => {
    const registration = await createApprovedRegistration("full");

    const first = await request(app).get(
      `/api/v1/pass/${registration.registrationId}?code=${registration.publicCode}`
    );
    expect(first.status).toBe(200);
    expect(first.body.name).toBe("pass test user");
    expect(first.body.publicCode).toBe(registration.publicCode);
    expect(typeof first.body.qrPayload).toBe("string");
    expect(first.body.qrImageDataUrl).toMatch(/^data:image\/png;base64,/);

    const second = await request(app).get(
      `/api/v1/pass/${registration.registrationId}?code=${registration.publicCode}`
    );
    expect(second.status).toBe(200);
    expect(second.body.qrPayload).toBe(first.body.qrPayload);
  });
});
