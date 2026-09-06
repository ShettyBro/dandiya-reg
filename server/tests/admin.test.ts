import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app/create-app.js";
import { loadEnv, resetEnvCacheForTests } from "../src/app/config/env.js";
import { hashPassword } from "../src/lib/security/password.js";

const prisma = new PrismaClient();

resetEnvCacheForTests();
const env = loadEnv(process.env);
const app = createApp(env, prisma);

const PASSWORD = "correct horse battery staple";
const ADMIN_EMAIL = `test-admin-${Date.now()}@acharya.ac.in`;
const VOLUNTEER_EMAIL = `test-admin-vol-${Date.now()}@acharya.ac.in`;

const createdRegistrationIds: string[] = [];
const createdUserIds: string[] = [];
const createdCredentialIds: string[] = [];

let adminCookies: string[];
let adminCsrf: string;
let volunteerCookies: string[];
let originalPaymentInstructions: string;

function extractCookie(setCookieHeader: string[] | undefined, name: string): string | undefined {
  const line = setCookieHeader?.find((entry) => entry.startsWith(`${name}=`));
  return line?.split(";")[0]?.split("=")[1];
}

beforeAll(async () => {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: env.EVENT_ID } });
  originalPaymentInstructions = event.paymentInstructions;

  const passwordHash = await hashPassword(PASSWORD);
  const admin = await prisma.user.create({
    data: { email: ADMIN_EMAIL, passwordHash, role: "ADMIN", status: "ACTIVE" }
  });
  createdUserIds.push(admin.id);
  const volunteer = await prisma.user.create({
    data: { email: VOLUNTEER_EMAIL, passwordHash, role: "VOLUNTEER", status: "ACTIVE" }
  });
  createdUserIds.push(volunteer.id);

  const adminLogin = await request(app).post("/api/v1/auth/login").send({ email: ADMIN_EMAIL, password: PASSWORD });
  adminCookies = adminLogin.headers["set-cookie"] as unknown as string[];
  adminCsrf = extractCookie(adminCookies, "csrf_token") ?? "";

  const volunteerLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: VOLUNTEER_EMAIL, password: PASSWORD });
  volunteerCookies = volunteerLogin.headers["set-cookie"] as unknown as string[];

  const registration = await request(app)
    .post("/api/v1/registrations")
    .set("Idempotency-Key", `admin-test-${Date.now()}`)
    .send({
      registrationType: "ACHARYA_STUDENT",
      name: "Admin Test Participant",
      phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
      email: `admin-participant-${Date.now()}@acharya.ac.in`,
      auid: `admin-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      institution: "acharya institute of technology",
      year: 3
    });
  createdRegistrationIds.push(registration.body.registrationId);
});

afterAll(async () => {
  await prisma.event.update({
    where: { id: env.EVENT_ID },
    data: { paymentInstructions: originalPaymentInstructions }
  });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...createdRegistrationIds, ...createdUserIds, ...createdCredentialIds] } } });
  await prisma.passCredential.deleteMany({ where: { id: { in: createdCredentialIds } } });
  await prisma.attendance.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.payment.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.registration.deleteMany({ where: { id: { in: createdRegistrationIds } } });
  await prisma.volunteerProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.emailJob.deleteMany({ where: { recipient: { in: [ADMIN_EMAIL, VOLUNTEER_EMAIL] } } });
  await prisma.emailJob.deleteMany({ where: { recipient: { contains: "@acharya.ac.in" }, uniquenessKey: { contains: "volunteer-invite" } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

describe("admin dashboard", () => {
  it("requires ADMIN role", async () => {
    const response = await request(app).get("/api/v1/admin/dashboard").set("Cookie", volunteerCookies);
    expect(response.status).toBe(403);
  });

  it("returns metrics for ADMIN", async () => {
    const response = await request(app).get("/api/v1/admin/dashboard").set("Cookie", adminCookies);
    expect(response.status).toBe(200);
    expect(typeof response.body.totalRegistrations).toBe("number");
    expect(typeof response.body.totalCollectionInPaise).toBe("number");
  });
});

describe("admin registrations search", () => {
  it("finds a registration by partial name search", async () => {
    const response = await request(app)
      .get("/api/v1/admin/registrations?search=Admin Test Participant")
      .set("Cookie", adminCookies);

    expect(response.status).toBe(200);
    expect(response.body.total).toBeGreaterThanOrEqual(1);
  });
});

describe("admin event settings", () => {
  it("updates event settings and records an audit entry", async () => {
    const response = await request(app)
      .post("/api/v1/admin/settings")
      .set("Cookie", adminCookies)
      .set("X-CSRF-Token", adminCsrf)
      .send({ paymentInstructions: "Updated payment instructions for testing" });

    expect(response.status).toBe(200);
    expect(response.body.paymentInstructions).toBe("Updated payment instructions for testing");

    const auditRow = await prisma.auditLog.findFirst({
      where: { action: "EVENT_SETTINGS_UPDATED" },
      orderBy: { createdAt: "desc" }
    });
    expect(auditRow).not.toBeNull();
  });
});

describe("volunteer management", () => {
  it("creates a volunteer, invite email is queued, and it can be disabled", async () => {
    const email = `new-volunteer-${Date.now()}@acharya.ac.in`;
    const createResponse = await request(app)
      .post("/api/v1/admin/volunteers")
      .set("Cookie", adminCookies)
      .set("X-CSRF-Token", adminCsrf)
      .send({ name: "New Volunteer", email, phone: "9001122334", role: "VOLUNTEER", gate: "Gate A" });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.temporaryPassword).toBeTruthy();
    createdUserIds.push(createResponse.body.userId);

    const emailJob = await prisma.emailJob.findUnique({
      where: { uniquenessKey: `volunteer-invite-${createResponse.body.userId}` }
    });
    expect(emailJob).not.toBeNull();
    expect(emailJob?.type).toBe("VOLUNTEER_INVITE");

    const disableResponse = await request(app)
      .patch(`/api/v1/admin/volunteers/${createResponse.body.userId}`)
      .set("Cookie", adminCookies)
      .set("X-CSRF-Token", adminCsrf)
      .send({ status: "DISABLED" });

    expect(disableResponse.status).toBe(200);

    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: createResponse.body.userId } });
    expect(dbUser.status).toBe("DISABLED");
  });

  it("lets the new volunteer log in with the temporary password and change it", async () => {
    const email = `login-volunteer-${Date.now()}@acharya.ac.in`;
    const createResponse = await request(app)
      .post("/api/v1/admin/volunteers")
      .set("Cookie", adminCookies)
      .set("X-CSRF-Token", adminCsrf)
      .send({ name: "Login Volunteer", email, phone: "9001122335", role: "VOLUNTEER" });
    createdUserIds.push(createResponse.body.userId);

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: createResponse.body.temporaryPassword });

    expect(login.status).toBe(200);
    expect(login.body.mustChangePassword).toBe(true);

    const cookies = login.headers["set-cookie"] as unknown as string[];
    const csrf = extractCookie(cookies, "csrf_token") ?? "";

    const changeResponse = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Cookie", cookies)
      .set("X-CSRF-Token", csrf)
      .send({ currentPassword: createResponse.body.temporaryPassword, newPassword: "a-new-strong-password" });

    expect(changeResponse.status).toBe(200);

    const secondLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "a-new-strong-password" });
    expect(secondLogin.status).toBe(200);
    expect(secondLogin.body.mustChangePassword).toBe(false);
  });

  it("exposes the volunteer's own profile (name/gate/zone) via /auth/me", async () => {
    const email = `me-volunteer-${Date.now()}@acharya.ac.in`;
    const createResponse = await request(app)
      .post("/api/v1/admin/volunteers")
      .set("Cookie", adminCookies)
      .set("X-CSRF-Token", adminCsrf)
      .send({
        name: "Me Volunteer",
        email,
        phone: "9001122336",
        role: "TEAM_LEADER",
        gate: "Gate B",
        zone: "North"
      });
    createdUserIds.push(createResponse.body.userId);

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: createResponse.body.temporaryPassword });
    const cookies = login.headers["set-cookie"] as unknown as string[];

    const me = await request(app).get("/api/v1/auth/me").set("Cookie", cookies);

    expect(me.status).toBe(200);
    expect(me.body.role).toBe("TEAM_LEADER");
    expect(me.body.profile.name).toBe("Me Volunteer");
    expect(me.body.profile.gate).toBe("Gate B");
    expect(me.body.profile.zone).toBe("North");
  });
});

describe("staff/guest/admin credential management", () => {
  it("creates a credential, retrieves its QR deterministically, then revokes it", async () => {
    const createResponse = await request(app)
      .post("/api/v1/admin/credentials")
      .set("Cookie", adminCookies)
      .set("X-CSRF-Token", adminCsrf)
      .send({ label: "Test Gate Staff" });

    expect(createResponse.status).toBe(201);
    createdCredentialIds.push(createResponse.body.id);

    const qrResponse = await request(app)
      .get(`/api/v1/admin/credentials/${createResponse.body.id}/qr`)
      .set("Cookie", adminCookies);
    expect(qrResponse.status).toBe(200);
    expect(qrResponse.body.qrPayload).toBe(createResponse.body.qrPayload);

    const revokeResponse = await request(app)
      .post(`/api/v1/admin/credentials/${createResponse.body.id}/revoke`)
      .set("Cookie", adminCookies)
      .set("X-CSRF-Token", adminCsrf);
    expect(revokeResponse.status).toBe(200);

    const secondRevoke = await request(app)
      .post(`/api/v1/admin/credentials/${createResponse.body.id}/revoke`)
      .set("Cookie", adminCookies)
      .set("X-CSRF-Token", adminCsrf);
    expect(secondRevoke.status).toBe(404);
  });
});

describe("exports", () => {
  it("streams a CSV export of registrations", async () => {
    const response = await request(app)
      .get("/api/v1/admin/exports/registrations")
      .set("Cookie", adminCookies);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.text).toContain("registrationId");
    expect(response.text).toContain("admin test participant");
  });

  it("rejects an unsupported export type", async () => {
    const response = await request(app)
      .get("/api/v1/admin/exports/not-a-type")
      .set("Cookie", adminCookies);
    expect(response.status).toBe(400);
  });
});

describe("audit log visibility", () => {
  it("lists audit log entries for ADMIN", async () => {
    const response = await request(app).get("/api/v1/admin/audit-logs").set("Cookie", adminCookies);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.items)).toBe(true);
    expect(response.body.total).toBeGreaterThan(0);
  });

  it("is not visible to a normal Volunteer", async () => {
    const response = await request(app).get("/api/v1/admin/audit-logs").set("Cookie", volunteerCookies);
    expect(response.status).toBe(403);
  });
});
