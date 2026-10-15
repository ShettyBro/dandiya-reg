import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app/create-app.js";
import { loadEnv, resetEnvCacheForTests } from "../src/app/config/env.js";

const prisma = new PrismaClient();

resetEnvCacheForTests();
const env = loadEnv(process.env);
const app = createApp(env, prisma);

const createdRegistrationIds: string[] = [];

let originalAcharyaFacultyRegistrationOpen: boolean | undefined;
let originalAcharyaStudentRegistrationOpen: boolean | undefined;

beforeAll(async () => {
  const event = await prisma.event.findUnique({ where: { id: env.EVENT_ID } });
  if (event) {
    originalAcharyaFacultyRegistrationOpen = event.acharyaFacultyRegistrationOpen;
    originalAcharyaStudentRegistrationOpen = event.acharyaStudentRegistrationOpen;
    const data: { acharyaFacultyRegistrationOpen?: true; acharyaStudentRegistrationOpen?: true } = {};
    if (!event.acharyaFacultyRegistrationOpen) data.acharyaFacultyRegistrationOpen = true;
    if (!event.acharyaStudentRegistrationOpen) data.acharyaStudentRegistrationOpen = true;
    if (Object.keys(data).length > 0) {
      await prisma.event.update({ where: { id: env.EVENT_ID }, data });
    }
  }
});

afterAll(async () => {
  if (originalAcharyaFacultyRegistrationOpen !== undefined) {
    await prisma.event.update({
      where: { id: env.EVENT_ID },
      data: {
        acharyaFacultyRegistrationOpen: originalAcharyaFacultyRegistrationOpen,
        acharyaStudentRegistrationOpen: originalAcharyaStudentRegistrationOpen
      }
    });
  }
  await prisma.emailJob.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.passCredential.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: createdRegistrationIds } } });
  await prisma.attendance.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.uploadIntent.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.payment.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.registration.deleteMany({ where: { id: { in: createdRegistrationIds } } });
  await prisma.$disconnect();
});

function randomPhone(): string {
  return `9${Math.floor(100000000 + Math.random() * 899999999)}`;
}

async function createFacultyRegistration(suffix: string) {
  const response = await request(app)
    .post("/api/v1/registrations")
    .set("Idempotency-Key", `walk-in-test-${suffix}-${Date.now()}`)
    .send({
      registrationType: "ACHARYA_FACULTY",
      name: "Walk In Faculty",
      phone: randomPhone(),
      email: `walk-in-faculty-${suffix}-${Date.now()}@acharya.ac.in`,
      employeeId: `walk-in-emp-${suffix}-${Date.now()}`,
      institution: "Acharya Institute of Technology"
    });
  expect(response.status).toBe(201);
  createdRegistrationIds.push(response.body.registrationId);
  return response.body as { registrationId: string; publicCode: string };
}

describe("POST /registrations/:id/complete-walk-in", () => {
  it("approves a walk-in registration with no photo requirement (faculty), issues a credential and an email job", async () => {
    const { registrationId, publicCode } = await createFacultyRegistration("ok");

    const response = await request(app).post(`/api/v1/registrations/${registrationId}/complete-walk-in`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ approved: true, publicCode });

    const registration = await prisma.registration.findUniqueOrThrow({ where: { id: registrationId } });
    expect(registration.status).toBe("PAYMENT_APPROVED");
    expect(registration.walkIn).toBe(true);
    expect(registration.walkInApprovedAt).not.toBeNull();

    const payment = await prisma.payment.findUnique({ where: { registrationId } });
    expect(payment?.status).toBe("APPROVED");

    const credential = await prisma.passCredential.findUnique({ where: { registrationId } });
    expect(credential?.active).toBe(true);

    const emailJob = await prisma.emailJob.findUnique({
      where: { uniquenessKey: `payment-approved-${registrationId}` }
    });
    expect(emailJob?.type).toBe("PAYMENT_APPROVED");
  });

  it("rejects completing the same registration twice", async () => {
    const { registrationId } = await createFacultyRegistration("twice");

    const first = await request(app).post(`/api/v1/registrations/${registrationId}/complete-walk-in`);
    expect(first.status).toBe(200);

    const second = await request(app).post(`/api/v1/registrations/${registrationId}/complete-walk-in`);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("ALREADY_DECIDED");
  });

  it("completes a walk-in registration with no photo at all, for a type that normally needs one", async () => {
    const createResponse = await request(app)
      .post("/api/v1/registrations")
      .set("Idempotency-Key", `walk-in-test-nophoto-${Date.now()}`)
      .send({
        registrationType: "ACHARYA_STUDENT",
        name: "Walk In Student",
        phone: randomPhone(),
        email: `walk-in-student-nophoto-${Date.now()}@acharya.ac.in`,
        auid: `walk-in-auid-nophoto-${Date.now()}`,
        institution: "Acharya Institute of Technology",
        year: 2
      });
    expect(createResponse.status).toBe(201);
    createdRegistrationIds.push(createResponse.body.registrationId);

    const response = await request(app).post(
      `/api/v1/registrations/${createResponse.body.registrationId}/complete-walk-in`
    );
    expect(response.status).toBe(200);

    const registration = await prisma.registration.findUniqueOrThrow({
      where: { id: createResponse.body.registrationId }
    });
    expect(registration.status).toBe("PAYMENT_APPROVED");
    expect(registration.photoObjectKey).toBeNull();
  });

  it("returns 404 for a non-existent registration", async () => {
    const response = await request(app).post(
      "/api/v1/registrations/00000000-0000-0000-0000-000000000000/complete-walk-in"
    );
    expect(response.status).toBe(404);
  });
});
