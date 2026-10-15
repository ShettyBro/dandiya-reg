import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

let volunteerAccessToken: string;
let teamLeaderAccessToken: string;

async function createParticipantWithCredential(suffix: string) {
  const created = await request(app)
    .post("/api/v1/registrations")
    .set("Idempotency-Key", `att-test-${suffix}-${Date.now()}`)
    .send({
      // Acharya Faculty is exempt from the registrationOpen gate -- this is a generic fixture,
      // not testing Student-specific behavior.
      registrationType: "ACHARYA_FACULTY",
      name: `Attendance Test ${suffix}`,
      phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
      email: `att-test-${suffix}-${Date.now()}@acharya.ac.in`,
      employeeId: `att-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      institution: "acharya institute of technology"
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

// The one genuinely unrestricted STAFF_GUEST_ADMIN case: a My People Admin registration. Created
// directly via Prisma (not the public /registrations route, which doesn't accept this type) --
// same shape my-people.service.ts produces.
async function createMyPeopleAdminCredential(suffix: string) {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
  const registration = await prisma.registration.create({
    data: {
      eventId: env.EVENT_ID,
      registrationType: "MY_PEOPLE_ADMIN",
      publicCode: `TESTMPA${unique}`.slice(0, 20),
      eightDigitCode: unique.replace(/\D/g, "").slice(0, 8).padStart(8, "0"),
      name: `My People Admin ${suffix}`,
      phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
      email: `mpa-test-${suffix}-${unique}@acharya.ac.in`,
      status: "PAYMENT_APPROVED",
      idempotencyKey: `mpa-test-${suffix}-${unique}`
    }
  });
  createdRegistrationIds.push(registration.id);

  const credentialId = newCredentialId();
  const token = deriveSignedCredentialToken(env.QR_SECRET, credentialId);
  await prisma.passCredential.create({
    data: {
      id: credentialId,
      registrationId: registration.id,
      credentialType: "STAFF_GUEST_ADMIN",
      opaqueTokenHash: hashCredentialToken(token),
      active: true,
      label: registration.name
    }
  });
  createdCredentialIds.push(credentialId);

  return { registrationId: registration.id, token };
}

// Normal /scan/allow entry is time-gated to the event's real entry window (Phase U9), which is
// in the future relative to whenever these tests actually run — fake only Date (not timers used
// by Prisma's async I/O) so entry-window checks (and everything issued afterward, like login JWTs)
// see a time inside the window consistently.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T10:00:00.000Z"));
});

afterAll(() => {
  vi.useRealTimers();
});

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD);
  await prisma.user.create({
    data: {
      email: VOLUNTEER_EMAIL,
      passwordHash,
      role: "VOLUNTEER",
      status: "ACTIVE",
      volunteerProfile: { create: { name: "Test Volunteer", phone: "9000000001", assignedGate: "COLLEGE_GATE" } }
    }
  });
  await prisma.user.create({
    data: {
      email: TEAM_LEADER_EMAIL,
      passwordHash,
      role: "TEAM_LEADER",
      status: "ACTIVE",
      volunteerProfile: { create: { name: "Test Team Leader", phone: "9000000002", assignedGate: "COLLEGE_GATE" } }
    }
  });
  await prisma.user.create({
    data: { email: DISABLED_VOLUNTEER_EMAIL, passwordHash, role: "VOLUNTEER", status: "DISABLED" }
  });

  const volunteerLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: VOLUNTEER_EMAIL, password: PASSWORD });
  volunteerAccessToken = volunteerLogin.body.accessToken;

  const teamLeaderLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: TEAM_LEADER_EMAIL, password: PASSWORD });
  teamLeaderAccessToken = teamLeaderLogin.body.accessToken;
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
      .set("Authorization", `Bearer ${volunteerAccessToken}`)
      .send({ token: "not-a-real-token" });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("CREDENTIAL_NOT_FOUND");
  });

  it("returns participant name and photo eligibility before entry", async () => {
    const participant = await createParticipantWithCredential("lookup");

    const response = await request(app)
      .post("/api/v1/scan/lookup")
      .set("Authorization", `Bearer ${volunteerAccessToken}`)
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
      .set("Authorization", `Bearer ${volunteerAccessToken}`)
      .send({ token: participant.token });

    expect(first.status).toBe(200);
    expect(first.body.allowed).toBe(true);
    expect(first.body.gate).toBe("COLLEGE_GATE");

    const second = await request(app)
      .post("/api/v1/scan/allow")
      .set("Authorization", `Bearer ${volunteerAccessToken}`)
      .send({ token: participant.token });

    expect(second.status).toBe(409);
    expect(second.body.code).toBe("ALREADY_ENTERED");

    const attendance = await prisma.attendance.findUniqueOrThrow({
      where: { registrationId: participant.registrationId }
    });
    expect(attendance.collegeGateState).toBe("ENTERED");
    expect(attendance.collegeGateEntryCount).toBe(1);
    // The other gate is untouched — the second gate must still work independently later.
    expect(attendance.eventGateState).toBe("NOT_ENTERED");
  });

  it("the same QR still works at the Event Gate after College Gate entry (gates are independent)", async () => {
    const participant = await createParticipantWithCredential("cross-gate");

    const collegeGateEntry = await request(app)
      .post("/api/v1/scan/allow")
      .set("Authorization", `Bearer ${volunteerAccessToken}`)
      .send({ token: participant.token, gate: "COLLEGE_GATE" });
    expect(collegeGateEntry.status).toBe(200);

    const eventGateEntry = await request(app)
      .post("/api/v1/scan/allow")
      .set("Authorization", `Bearer ${teamLeaderAccessToken}`)
      .send({ token: participant.token, gate: "EVENT_GATE" });
    expect(eventGateEntry.status).toBe(200);
    expect(eventGateEntry.body.gate).toBe("EVENT_GATE");

    const secondEventGateAttempt = await request(app)
      .post("/api/v1/scan/allow")
      .set("Authorization", `Bearer ${teamLeaderAccessToken}`)
      .send({ token: participant.token, gate: "EVENT_GATE" });
    expect(secondEventGateAttempt.status).toBe(409);
    expect(secondEventGateAttempt.body.code).toBe("ALREADY_ENTERED");

    const attendance = await prisma.attendance.findUniqueOrThrow({
      where: { registrationId: participant.registrationId }
    });
    expect(attendance.collegeGateState).toBe("ENTERED");
    expect(attendance.eventGateState).toBe("ENTERED");
  });

  it("resolves a concurrent duplicate-scan race to exactly one successful entry", async () => {
    const participant = await createParticipantWithCredential("race");

    const attempts = 8;
    const results = await Promise.allSettled(
      Array.from({ length: attempts }, () =>
        request(app)
          .post("/api/v1/scan/allow")
          .set("Authorization", `Bearer ${volunteerAccessToken}`)
          .send({ token: participant.token })
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
    expect(attendance.collegeGateState).toBe("ENTERED");
    expect(attendance.collegeGateEntryCount).toBe(1);
  }, 20000);
});

describe("staff/guest credential (not My People Admin) -- single-use, same as a participant", () => {
  it("allows the first scan then blocks a repeat at the same gate", async () => {
    const staff = await createStaffCredential();

    const first = await request(app)
      .post("/api/v1/scan/allow")
      .set("Authorization", `Bearer ${volunteerAccessToken}`)
      .send({ token: staff.token });

    expect(first.status).toBe(200);
    expect(first.body.type).toBe("STAFF_GUEST_ADMIN");

    const second = await request(app)
      .post("/api/v1/scan/allow")
      .set("Authorization", `Bearer ${volunteerAccessToken}`)
      .send({ token: staff.token });

    expect(second.status).toBe(409);

    const lookup = await request(app)
      .post("/api/v1/scan/lookup")
      .set("Authorization", `Bearer ${volunteerAccessToken}`)
      .send({ token: staff.token });

    expect(lookup.status).toBe(200);
    expect(lookup.body.eligibleForAllow).toBe(false);
  });

  it("tracks Event Entry and Kit Distribution independently", async () => {
    const staff = await createStaffCredential();

    const kit = await request(app)
      .post("/api/v1/scan/allow")
      .set("Authorization", `Bearer ${volunteerAccessToken}`) // assigned COLLEGE_GATE
      .send({ token: staff.token });
    expect(kit.status).toBe(200);

    const entry = await request(app)
      .post("/api/v1/scan/allow")
      .set("Authorization", `Bearer ${teamLeaderAccessToken}`)
      .send({ token: staff.token, gate: "EVENT_GATE" });
    expect(entry.status).toBe(200);
  });
});

describe("My People Admin credential -- genuinely unrestricted", () => {
  it("allows repeated entries and repeated kit collection without any limit", async () => {
    const admin = await createMyPeopleAdminCredential("unrestricted");

    for (let i = 0; i < 3; i += 1) {
      const kit = await request(app)
        .post("/api/v1/scan/allow")
        .set("Authorization", `Bearer ${volunteerAccessToken}`)
        .send({ token: admin.token });
      expect(kit.status).toBe(200);
      expect(kit.body.type).toBe("STAFF_GUEST_ADMIN");

      const entry = await request(app)
        .post("/api/v1/scan/allow")
        .set("Authorization", `Bearer ${teamLeaderAccessToken}`)
        .send({ token: admin.token, gate: "EVENT_GATE" });
      expect(entry.status).toBe(200);
    }
  });
});

describe("Team Leader override", () => {
  it("does not let a normal Volunteer call the override endpoint", async () => {
    const participant = await createParticipantWithCredential("vol-override-blocked");
    await request(app)
      .post("/api/v1/scan/allow")
      .set("Authorization", `Bearer ${volunteerAccessToken}`)
      .send({ token: participant.token });

    const response = await request(app)
      .post("/api/v1/scan/override")
      .set("Authorization", `Bearer ${volunteerAccessToken}`)
      .send({ token: participant.token, reason: "trying to bypass as a normal volunteer" });

    expect(response.status).toBe(403);
  });

  it("requires a reason of at least 5 characters", async () => {
    const participant = await createParticipantWithCredential("reason-required");
    await request(app)
      .post("/api/v1/scan/allow")
      .set("Authorization", `Bearer ${volunteerAccessToken}`)
      .send({ token: participant.token });

    const response = await request(app)
      .post("/api/v1/scan/override")
      .set("Authorization", `Bearer ${teamLeaderAccessToken}`)
      .send({ token: participant.token, reason: "hi" });

    expect(response.status).toBe(400);
  });

  it("refuses to override a participant who has not entered yet", async () => {
    const participant = await createParticipantWithCredential("not-entered-yet");

    const response = await request(app)
      .post("/api/v1/scan/override")
      .set("Authorization", `Bearer ${teamLeaderAccessToken}`)
      .send({ token: participant.token, reason: "should not work, not entered yet" });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("NOT_YET_ENTERED");
  });

  it("overrides an already-entered participant with a reason and writes a full audit trail", async () => {
    const participant = await createParticipantWithCredential("override-flow");
    await request(app)
      .post("/api/v1/scan/allow")
      .set("Authorization", `Bearer ${volunteerAccessToken}`)
      .send({ token: participant.token });

    const response = await request(app)
      .post("/api/v1/scan/override")
      .set("Authorization", `Bearer ${teamLeaderAccessToken}`)
      .send({ token: participant.token, reason: "Lost original device, verified identity manually" });

    expect(response.status).toBe(200);
    expect(response.body.overridden).toBe(true);

    const attendance = await prisma.attendance.findUniqueOrThrow({
      where: { registrationId: participant.registrationId }
    });
    expect(attendance.collegeGateState).toBe("OVERRIDE_ENTRY");
    expect(attendance.collegeGateEntryCount).toBe(2);

    const overrideRow = await prisma.attendanceOverride.findFirst({
      where: { registrationId: participant.registrationId }
    });
    expect(overrideRow).not.toBeNull();
    expect(overrideRow?.reasonText).toContain("Lost original device");
    expect(overrideRow?.originalState).toBe("ENTERED");
    expect(overrideRow?.gate).toBe("COLLEGE_GATE");

    const auditRow = await prisma.auditLog.findFirst({
      where: { action: "ATTENDANCE_OVERRIDE", entityId: participant.registrationId }
    });
    expect(auditRow).not.toBeNull();
  });

  it("overrides the Event Gate independently of the College Gate's state", async () => {
    const participant = await createParticipantWithCredential("override-event-gate");
    // A plain VOLUNTEER's gate is always server-resolved from their own assignment — any
    // client-supplied gate is ignored for that role — so use the Team Leader (who may act at
    // either gate explicitly) to enter the Event Gate here.
    await request(app)
      .post("/api/v1/scan/allow")
      .set("Authorization", `Bearer ${teamLeaderAccessToken}`)
      .send({ token: participant.token, gate: "EVENT_GATE" });

    const response = await request(app)
      .post("/api/v1/scan/override")
      .set("Authorization", `Bearer ${teamLeaderAccessToken}`)
      .send({ token: participant.token, reason: "Event Gate override test", gate: "EVENT_GATE" });

    expect(response.status).toBe(200);
    expect(response.body.gate).toBe("EVENT_GATE");

    const attendance = await prisma.attendance.findUniqueOrThrow({
      where: { registrationId: participant.registrationId }
    });
    expect(attendance.eventGateState).toBe("OVERRIDE_ENTRY");
    expect(attendance.collegeGateState).toBe("NOT_ENTERED");

    const overrideRow = await prisma.attendanceOverride.findFirst({
      where: { registrationId: participant.registrationId, gate: "EVENT_GATE" }
    });
    expect(overrideRow).not.toBeNull();
  });
});

describe("gate assignment enforcement", () => {
  it("blocks a volunteer with no assigned gate from scanning", async () => {
    const passwordHash = await hashPassword(PASSWORD);
    const email = `test-att-unassigned-${Date.now()}@acharya.ac.in`;
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: "VOLUNTEER",
        status: "ACTIVE",
        volunteerProfile: { create: { name: "Unassigned Volunteer", phone: "9000000003" } }
      }
    });
    try {
      const login = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });

      const participant = await createParticipantWithCredential("unassigned-gate");
      const response = await request(app)
        .post("/api/v1/scan/lookup")
        .set("Authorization", `Bearer ${login.body.accessToken}`)
        .send({ token: participant.token });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("GATE_NOT_ASSIGNED");
    } finally {
      await prisma.refreshToken.deleteMany({ where: { user: { email } } });
      await prisma.auditLog.deleteMany({ where: { actorUser: { email } } });
      await prisma.user.delete({ where: { email } });
    }
  });
});

describe("no fixed entry window", () => {
  it("allows normal entry regardless of system time relative to the event date (no time gating)", async () => {
    const participant = await createParticipantWithCredential("far-before-event");
    // Deliberately a date long before the configured event date -- entry must still work, since
    // early/late arrivals are expected and entry is no longer bound to any clock window.
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    try {
      const response = await request(app)
        .post("/api/v1/scan/allow")
        .set("Authorization", `Bearer ${volunteerAccessToken}`)
        .send({ token: participant.token });

      expect(response.status).toBe(200);
    } finally {
      vi.setSystemTime(new Date("2026-10-15T10:00:00.000Z"));
    }
  });
});

describe("attendanceEnabled toggle", () => {
  async function withAttendanceDisabled<T>(run: () => Promise<T>): Promise<T> {
    const event = await prisma.event.findUniqueOrThrow({ where: { id: env.EVENT_ID } });
    const original = event.attendanceEnabled;
    await prisma.event.update({ where: { id: env.EVENT_ID }, data: { attendanceEnabled: false } });
    try {
      return await run();
    } finally {
      await prisma.event.update({ where: { id: env.EVENT_ID }, data: { attendanceEnabled: original } });
    }
  }

  it("blocks normal entry when attendance scanning is disabled", async () => {
    const participant = await createParticipantWithCredential("attendance-disabled");
    await withAttendanceDisabled(async () => {
      const response = await request(app)
        .post("/api/v1/scan/allow")
        .set("Authorization", `Bearer ${volunteerAccessToken}`)
        .send({ token: participant.token });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("ATTENDANCE_DISABLED");
    });
  });

  it("blocks override when attendance scanning is disabled", async () => {
    const participant = await createParticipantWithCredential("attendance-disabled-override");
    await withAttendanceDisabled(async () => {
      const response = await request(app)
        .post("/api/v1/scan/override")
        .set("Authorization", `Bearer ${teamLeaderAccessToken}`)
        .send({ token: participant.token, reason: "testing disabled attendance" });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("ATTENDANCE_DISABLED");
    });
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
