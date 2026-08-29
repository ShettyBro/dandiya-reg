import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app/create-app.js";
import { loadEnv, resetEnvCacheForTests } from "../src/app/config/env.js";
import { hashPassword } from "../src/lib/security/password.js";
import { deriveSignedCredentialToken, hashCredentialToken, newCredentialId } from "../src/lib/qr/credential.js";

const prisma = new PrismaClient();

resetEnvCacheForTests();
const env = loadEnv(process.env);
const app = createApp(env, prisma);

const PASSWORD = "correct horse battery staple";
const VOLUNTEER_EMAIL = `test-att-vol-${Date.now()}@acharya.ac.in`;
const TEAM_LEADER_EMAIL = `test-att-tl-${Date.now()}@acharya.ac.in`;
const DISABLED_VOLUNTEER_EMAIL = `test-att-disabled-${Date.now()}@acharya.ac.in`;

const createdRegistrationIds: string[] = [];
const createdCredentialIds: string[] = [];

let volunteerCookies: string[];
let volunteerCsrf: string;
let teamLeaderCookies: string[];
let teamLeaderCsrf: string;

function extractCookie(setCookieHeader: string[] | undefined, name: string): string | undefined {
  const line = setCookieHeader?.find((entry) => entry.startsWith(`${name}=`));
  return line?.split(";")[0]?.split("=")[1];
}

async function createParticipantWithCredential(suffix: string) {
  const created = await request(app)
    .post("/api/v1/registrations")
    .set("Idempotency-Key", `att-test-${suffix}-${Date.now()}`)
    .send({
      name: `Attendance Test ${suffix}`,
      phone: "9887766554",
      email: `att-test-${suffix}@acharya.ac.in`,
      college: "Acharya Institute",
      semester: "5",
      branch: "CSE"
    });
  const registrationId = created.body.registrationId as string;
  createdRegistrationIds.push(registrationId);

  const credentialId = newCredentialId();
  const token = deriveSignedCredentialToken(env.QR_SECRET, credentialId);
  await prisma.passCredential.create({
    data: {
      id: credentialId,
      registrationId,
      credentialType: "PARTICIPANT",
      opaqueTokenHash: hashCredentialToken(token),
      active: true
    }
  });
  createdCredentialIds.push(credentialId);

  return { registrationId, token, name: created.body.name as string | undefined };
}

async function createStaffCredential() {
  const credentialId = newCredentialId();
  const token = deriveSignedCredentialToken(env.QR_SECRET, credentialId);
  await prisma.passCredential.create({
    data: {
      id: credentialId,
      credentialType: "STAFF_GUEST_ADMIN",
      opaqueTokenHash: hashCredentialToken(token),
      active: true,
      label: "Gate Staff"
    }
  });
  createdCredentialIds.push(credentialId);
  return { credentialId, token };
}

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD);
  await prisma.user.create({
    data: { email: VOLUNTEER_EMAIL, passwordHash, role: "VOLUNTEER", status: "ACTIVE" }
  });
  await prisma.user.create({
    data: { email: TEAM_LEADER_EMAIL, passwordHash, role: "TEAM_LEADER", status: "ACTIVE" }
  });
  await prisma.user.create({
    data: { email: DISABLED_VOLUNTEER_EMAIL, passwordHash, role: "VOLUNTEER", status: "DISABLED" }
  });

  const volunteerLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: VOLUNTEER_EMAIL, password: PASSWORD });
  volunteerCookies = volunteerLogin.headers["set-cookie"] as unknown as string[];
  volunteerCsrf = extractCookie(volunteerCookies, "csrf_token") ?? "";

  const teamLeaderLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: TEAM_LEADER_EMAIL, password: PASSWORD });
  teamLeaderCookies = teamLeaderLogin.headers["set-cookie"] as unknown as string[];
  teamLeaderCsrf = extractCookie(teamLeaderCookies, "csrf_token") ?? "";
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { in: createdRegistrationIds } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: createdCredentialIds } } });
  await prisma.attendanceOverride.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.passCredential.deleteMany({ where: { id: { in: createdCredentialIds } } });
  await prisma.attendance.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.payment.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.registration.deleteMany({ where: { id: { in: createdRegistrationIds } } });
  await prisma.refreshToken.deleteMany({
    where: { user: { email: { in: [VOLUNTEER_EMAIL, TEAM_LEADER_EMAIL, DISABLED_VOLUNTEER_EMAIL] } } }
  });
  await prisma.auditLog.deleteMany({
    where: { actorUser: { email: { in: [VOLUNTEER_EMAIL, TEAM_LEADER_EMAIL, DISABLED_VOLUNTEER_EMAIL] } } }
  });
  await prisma.user.deleteMany({
    where: { email: { in: [VOLUNTEER_EMAIL, TEAM_LEADER_EMAIL, DISABLED_VOLUNTEER_EMAIL] } }
  });
  await prisma.$disconnect();
});

describe("scan lookup", () => {
  it("rejects an unknown token", async () => {
    const response = await request(app)
      .post("/api/v1/scan/lookup")
      .set("Cookie", volunteerCookies)
      .set("X-CSRF-Token", volunteerCsrf)
      .send({ token: "not-a-real-token" });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("CREDENTIAL_NOT_FOUND");
  });

  it("returns participant name and photo eligibility before entry", async () => {
    const participant = await createParticipantWithCredential("lookup");

    const response = await request(app)
      .post("/api/v1/scan/lookup")
      .set("Cookie", volunteerCookies)
      .set("X-CSRF-Token", volunteerCsrf)
      .send({ token: participant.token });

    expect(response.status).toBe(200);
    expect(response.body.credentialType).toBe("PARTICIPANT");
    expect(response.body.attendanceState).toBe("NOT_ENTERED");
    expect(response.body.eligibleForAllow).toBe(true);
  });
});

describe("scan allow — participant single entry", () => {
  it("allows first entry, then blocks a second normal scan", async () => {
    const participant = await createParticipantWithCredential("single-entry");

    const first = await request(app)
      .post("/api/v1/scan/allow")
      .set("Cookie", volunteerCookies)
      .set("X-CSRF-Token", volunteerCsrf)
      .send({ token: participant.token, gate: "Gate A" });

    expect(first.status).toBe(200);
    expect(first.body.allowed).toBe(true);

    const second = await request(app)
      .post("/api/v1/scan/allow")
      .set("Cookie", volunteerCookies)
      .set("X-CSRF-Token", volunteerCsrf)
      .send({ token: participant.token, gate: "Gate A" });

    expect(second.status).toBe(409);
    expect(second.body.code).toBe("ALREADY_ENTERED");

    const attendance = await prisma.attendance.findUniqueOrThrow({
      where: { registrationId: participant.registrationId }
    });
    expect(attendance.state).toBe("ENTERED");
    expect(attendance.entryCount).toBe(1);
  });

  it("resolves a concurrent duplicate-scan race to exactly one successful entry", async () => {
    const participant = await createParticipantWithCredential("race");

    const attempts = 8;
    const results = await Promise.allSettled(
      Array.from({ length: attempts }, () =>
        request(app)
          .post("/api/v1/scan/allow")
          .set("Cookie", volunteerCookies)
          .set("X-CSRF-Token", volunteerCsrf)
          .send({ token: participant.token, gate: "Gate B" })
      )
    );

    const successes = results.filter(
      (r) => r.status === "fulfilled" && r.value.status === 200
    );
    const blocked = results.filter(
      (r) => r.status === "fulfilled" && r.value.status === 409
    );

    expect(successes.length).toBe(1);
    expect(blocked.length).toBe(attempts - 1);

    const attendance = await prisma.attendance.findUniqueOrThrow({
      where: { registrationId: participant.registrationId }
    });
    expect(attendance.state).toBe("ENTERED");
    expect(attendance.entryCount).toBe(1);
  }, 20000);
});

describe("staff/guest/admin unrestricted credential", () => {
  it("allows repeated entries without any single-entry restriction", async () => {
    const staff = await createStaffCredential();

    for (let i = 0; i < 3; i += 1) {
      const response = await request(app)
        .post("/api/v1/scan/allow")
        .set("Cookie", volunteerCookies)
        .set("X-CSRF-Token", volunteerCsrf)
        .send({ token: staff.token });

      expect(response.status).toBe(200);
      expect(response.body.type).toBe("STAFF_GUEST_ADMIN");
    }
  });
});

describe("Team Leader override", () => {
  it("does not let a normal Volunteer call the override endpoint", async () => {
    const participant = await createParticipantWithCredential("vol-override-blocked");
    await request(app)
      .post("/api/v1/scan/allow")
      .set("Cookie", volunteerCookies)
      .set("X-CSRF-Token", volunteerCsrf)
      .send({ token: participant.token });

    const response = await request(app)
      .post("/api/v1/scan/override")
      .set("Cookie", volunteerCookies)
      .set("X-CSRF-Token", volunteerCsrf)
      .send({ token: participant.token, reason: "trying to bypass as a normal volunteer" });

    expect(response.status).toBe(403);
  });

  it("requires a reason of at least 5 characters", async () => {
    const participant = await createParticipantWithCredential("reason-required");
    await request(app)
      .post("/api/v1/scan/allow")
      .set("Cookie", volunteerCookies)
      .set("X-CSRF-Token", volunteerCsrf)
      .send({ token: participant.token });

    const response = await request(app)
      .post("/api/v1/scan/override")
      .set("Cookie", teamLeaderCookies)
      .set("X-CSRF-Token", teamLeaderCsrf)
      .send({ token: participant.token, reason: "hi" });

    expect(response.status).toBe(400);
  });

  it("refuses to override a participant who has not entered yet", async () => {
    const participant = await createParticipantWithCredential("not-entered-yet");

    const response = await request(app)
      .post("/api/v1/scan/override")
      .set("Cookie", teamLeaderCookies)
      .set("X-CSRF-Token", teamLeaderCsrf)
      .send({ token: participant.token, reason: "should not work, not entered yet" });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("NOT_YET_ENTERED");
  });

  it("overrides an already-entered participant with a reason and writes a full audit trail", async () => {
    const participant = await createParticipantWithCredential("override-flow");
    await request(app)
      .post("/api/v1/scan/allow")
      .set("Cookie", volunteerCookies)
      .set("X-CSRF-Token", volunteerCsrf)
      .send({ token: participant.token });

    const response = await request(app)
      .post("/api/v1/scan/override")
      .set("Cookie", teamLeaderCookies)
      .set("X-CSRF-Token", teamLeaderCsrf)
      .send({ token: participant.token, reason: "Lost original device, verified identity manually" });

    expect(response.status).toBe(200);
    expect(response.body.overridden).toBe(true);

    const attendance = await prisma.attendance.findUniqueOrThrow({
      where: { registrationId: participant.registrationId }
    });
    expect(attendance.state).toBe("OVERRIDE_ENTRY");
    expect(attendance.entryCount).toBe(2);

    const overrideRow = await prisma.attendanceOverride.findFirst({
      where: { registrationId: participant.registrationId }
    });
    expect(overrideRow).not.toBeNull();
    expect(overrideRow?.reasonText).toContain("Lost original device");
    expect(overrideRow?.originalState).toBe("ENTERED");

    const auditRow = await prisma.auditLog.findFirst({
      where: { action: "ATTENDANCE_OVERRIDE", entityId: participant.registrationId }
    });
    expect(auditRow).not.toBeNull();
  });
});

describe("disabled volunteer", () => {
  it("cannot authenticate to obtain a scanning session", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: DISABLED_VOLUNTEER_EMAIL, password: PASSWORD });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("ACCOUNT_DISABLED");
  });
});
