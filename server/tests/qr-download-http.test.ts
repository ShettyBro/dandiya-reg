import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createApp } from "../src/app/create-app.js";
import { loadEnv, resetEnvCacheForTests } from "../src/app/config/env.js";
import { hashPassword } from "../src/lib/security/password.js";
import { getR2Client } from "../src/lib/r2/client.js";
import { submitPaymentProof } from "../src/modules/payments/payment.service.js";
import { getCurrentAccessCode } from "../src/lib/qr-download/access-code.js";

const prisma = new PrismaClient();

resetEnvCacheForTests();
const env = loadEnv(process.env);
const app = createApp(env, prisma);
const r2 = getR2Client(env);
const createdObjectKeys: string[] = [];

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

const FINANCE_EMAIL = `test-qrdl-finance-${Date.now()}@acharya.ac.in`;
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

async function createApprovedRegistration(suffix: string, phone: string) {
  const created = await request(app)
    .post("/api/v1/registrations")
    .set("Idempotency-Key", `qrdl-test-${suffix}-${Date.now()}`)
    .send({
      registrationType: "ACHARYA_STUDENT",
      name: "QR Download Test User",
      phone,
      email: `qrdl-test-${suffix}-${Date.now()}@acharya.ac.in`,
      auid: `qrdl-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      institution: "acharya institute of technology",
      year: 2
    });
  createdRegistrationIds.push(created.body.registrationId);

  const photoObjectKey = `test-photo/${created.body.registrationId}.jpg`;
  await uploadRealObject(photoObjectKey);
  await prisma.registration.update({
    where: { id: created.body.registrationId },
    data: { photoObjectKey }
  });

  const objectKey = `payments/${created.body.registrationId}/proof/qrdl-test.jpg`;
  await uploadRealObject(objectKey);
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
    transactionId: `TXN-QRDL-${suffix}-${Date.now()}`,
    proofObjectKey: objectKey
  });

  const payment = await prisma.payment.findUniqueOrThrow({
    where: { registrationId: created.body.registrationId }
  });
  await request(app)
    .post(`/api/v1/admin/payments/${payment.id}/approve`)
    .set("Cookie", financeCookies)
    .set("X-CSRF-Token", financeCsrfToken);

  return created.body as { registrationId: string; publicCode: string };
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
  for (const key of createdObjectKeys) {
    await r2.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key })).catch(() => undefined);
  }
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

describe("GET /api/v1/admin/qr-download/current-code", () => {
  it("requires authentication", async () => {
    const response = await request(app).get("/api/v1/admin/qr-download/current-code");
    expect(response.status).toBe(401);
  });

  it("returns a 6-digit code for an authenticated admin", async () => {
    const adminEmail = `test-qrdl-admin-${Date.now()}@acharya.ac.in`;
    const passwordHash = await hashPassword(PASSWORD);
    const admin = await prisma.user.create({
      data: { email: adminEmail, passwordHash, role: "ADMIN", status: "ACTIVE" }
    });
    const login = await request(app).post("/api/v1/auth/login").send({ email: adminEmail, password: PASSWORD });
    const cookies = login.headers["set-cookie"] as unknown as string[];

    const response = await request(app).get("/api/v1/admin/qr-download/current-code").set("Cookie", cookies);
    expect(response.status).toBe(200);
    expect(response.body.code).toMatch(/^\d{6}$/);
    expect(response.body.secondsRemaining).toBeGreaterThan(0);

    await prisma.refreshToken.deleteMany({ where: { userId: admin.id } });
    await prisma.user.delete({ where: { id: admin.id } });
  });

  it("returns a 6-digit code for an authenticated team leader", async () => {
    const teamLeaderEmail = `test-qrdl-teamleader-${Date.now()}@acharya.ac.in`;
    const passwordHash = await hashPassword(PASSWORD);
    const teamLeader = await prisma.user.create({
      data: { email: teamLeaderEmail, passwordHash, role: "TEAM_LEADER", status: "ACTIVE" }
    });
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: teamLeaderEmail, password: PASSWORD });
    const cookies = login.headers["set-cookie"] as unknown as string[];

    const response = await request(app).get("/api/v1/admin/qr-download/current-code").set("Cookie", cookies);
    expect(response.status).toBe(200);
    expect(response.body.code).toMatch(/^\d{6}$/);

    await prisma.refreshToken.deleteMany({ where: { userId: teamLeader.id } });
    await prisma.user.delete({ where: { id: teamLeader.id } });
  });

  it("forbids a plain volunteer (non-team-leader)", async () => {
    const volunteerEmail = `test-qrdl-volunteer-${Date.now()}@acharya.ac.in`;
    const passwordHash = await hashPassword(PASSWORD);
    const volunteer = await prisma.user.create({
      data: { email: volunteerEmail, passwordHash, role: "VOLUNTEER", status: "ACTIVE" }
    });
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: volunteerEmail, password: PASSWORD });
    const cookies = login.headers["set-cookie"] as unknown as string[];

    const response = await request(app).get("/api/v1/admin/qr-download/current-code").set("Cookie", cookies);
    expect(response.status).toBe(403);

    await prisma.refreshToken.deleteMany({ where: { userId: volunteer.id } });
    await prisma.user.delete({ where: { id: volunteer.id } });
  });
});

describe("POST /api/v1/qr-download/unlock", () => {
  it("rejects a wrong code", async () => {
    const response = await request(app).post("/api/v1/qr-download/unlock").send({ accessCode: "000000" });
    expect(response.status).toBe(401);
  });

  it("accepts the current valid code and issues a session token", async () => {
    const { code } = getCurrentAccessCode(env.QR_DOWNLOAD_SECRET);
    const response = await request(app).post("/api/v1/qr-download/unlock").send({ accessCode: code });
    expect(response.status).toBe(200);
    expect(typeof response.body.sessionToken).toBe("string");
    expect(response.body.expiresInSeconds).toBe(300);
  });
});

describe("POST /api/v1/qr-download/lookup", () => {
  it("rejects an invalid session token", async () => {
    const response = await request(app)
      .post("/api/v1/qr-download/lookup")
      .send({ sessionToken: "garbage", phone: "9999999999" });
    expect(response.status).toBe(401);
  });

  it("returns 404 for a phone number with no registration", async () => {
    const { code } = getCurrentAccessCode(env.QR_DOWNLOAD_SECRET);
    const unlock = await request(app).post("/api/v1/qr-download/unlock").send({ accessCode: code });

    const response = await request(app)
      .post("/api/v1/qr-download/lookup")
      .send({ sessionToken: unlock.body.sessionToken, phone: "9000000001" });
    expect(response.status).toBe(404);
  });

  it("reports not-ready for a registration that is not yet approved", async () => {
    const { code } = getCurrentAccessCode(env.QR_DOWNLOAD_SECRET);
    const unlock = await request(app).post("/api/v1/qr-download/unlock").send({ accessCode: code });
    const phone = randomPhone();
    const created = await request(app)
      .post("/api/v1/registrations")
      .set("Idempotency-Key", `qrdl-pending-${Date.now()}`)
      .send({
        registrationType: "NON_ACHARYAN_STUDENT",
        name: "Pending QR Download User",
        phone,
        email: `qrdl-pending-${Date.now()}@example.com`,
        collegeName: "Test College"
      });
    createdRegistrationIds.push(created.body.registrationId);

    const response = await request(app)
      .post("/api/v1/qr-download/lookup")
      .send({ sessionToken: unlock.body.sessionToken, phone });
    expect(response.status).toBe(200);
    expect(response.body.ready).toBe(false);
  });

  it("returns ready + name for an approved registration", async () => {
    const { code } = getCurrentAccessCode(env.QR_DOWNLOAD_SECRET);
    const unlock = await request(app).post("/api/v1/qr-download/unlock").send({ accessCode: code });
    const phone = randomPhone();
    const registration = await createApprovedRegistration("lookup-ready", phone);

    const response = await request(app)
      .post("/api/v1/qr-download/lookup")
      .send({ sessionToken: unlock.body.sessionToken, phone });
    expect(response.status).toBe(200);
    expect(response.body.ready).toBe(true);
    expect(response.body.name).toBe("qr download test user");
    expect(response.body.publicCode).toBe(registration.publicCode);
  });
});

describe("GET /api/v1/qr-download/pdf", () => {
  it("rejects an expired/invalid session token", async () => {
    const response = await request(app)
      .get("/api/v1/qr-download/pdf")
      .query({ sessionToken: "garbage", phone: "9999999999" });
    expect(response.status).toBe(401);
  });

  it("streams a real PDF for an approved registration", async () => {
    const { code } = getCurrentAccessCode(env.QR_DOWNLOAD_SECRET);
    const unlock = await request(app).post("/api/v1/qr-download/unlock").send({ accessCode: code });
    const phone = randomPhone();
    await createApprovedRegistration("pdf", phone);

    const response = await request(app)
      .get("/api/v1/qr-download/pdf")
      .query({ sessionToken: unlock.body.sessionToken, phone })
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("application/pdf");
    const body = response.body as Buffer;
    expect(body.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("returns 404 for a phone number with no approved registration", async () => {
    const { code } = getCurrentAccessCode(env.QR_DOWNLOAD_SECRET);
    const unlock = await request(app).post("/api/v1/qr-download/unlock").send({ accessCode: code });

    const response = await request(app)
      .get("/api/v1/qr-download/pdf")
      .query({ sessionToken: unlock.body.sessionToken, phone: "9000000002" });
    expect(response.status).toBe(404);
  });
});
