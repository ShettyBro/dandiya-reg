import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app/create-app.js";
import { loadEnv, resetEnvCacheForTests } from "../src/app/config/env.js";

const prisma = new PrismaClient();

resetEnvCacheForTests();
const env = loadEnv(process.env);
const app = createApp(env, prisma);

const createdRegistrationIds: string[] = [];

afterAll(async () => {
  await prisma.attendance.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.uploadIntent.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.payment.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.registration.deleteMany({ where: { id: { in: createdRegistrationIds } } });
  await prisma.$disconnect();
});

function randomPhone(): string {
  return `9${Math.floor(100000000 + Math.random() * 899999999)}`;
}

function validPayload(suffix: string) {
  return {
    registrationType: "ACHARYA_STUDENT",
    name: "Http Test User",
    phone: randomPhone(),
    email: `http-test-${suffix}@acharya.ac.in`,
    auid: `http-auid-${suffix}-${Date.now()}`,
    institution: "acharya institute of technology",
    year: 2
  };
}

describe("GET /api/v1/event/config", () => {
  it("reports the event as open", async () => {
    const response = await request(app).get("/api/v1/event/config");

    expect(response.status).toBe(200);
    expect(typeof response.body.registrationOpen).toBe("boolean");
    expect(typeof response.body.priceInPaise).toBe("number");
  });
});

describe("POST /api/v1/registrations", () => {
  it("rejects a non-acharya.ac.in email domain for an Acharya Student", async () => {
    const response = await request(app)
      .post("/api/v1/registrations")
      .set("Idempotency-Key", `http-bad-email-${Date.now()}`)
      .send({ ...validPayload("bad"), email: "someone@gmail.com" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("accepts a Non-Acharyan Student with any email domain and no AUID/institution", async () => {
    const response = await request(app)
      .post("/api/v1/registrations")
      .set("Idempotency-Key", `http-non-acharyan-${Date.now()}`)
      .send({
        registrationType: "NON_ACHARYAN_STUDENT",
        name: "Outside Student",
        phone: randomPhone(),
        email: "someone@gmail.com",
        collegeName: "Some Other College",
        aadhaarNumber: `${Date.now()}`
      });

    expect(response.status).toBe(201);
    createdRegistrationIds.push(response.body.registrationId);
  });

  it("accepts a Title Case institution value from the frontend and stores it lowercase", async () => {
    const response = await request(app)
      .post("/api/v1/registrations")
      .set("Idempotency-Key", `http-titlecase-institution-${Date.now()}`)
      .send({ ...validPayload("titlecase"), institution: "Acharya Institute of Graduate Studies" });

    expect(response.status).toBe(201);
    createdRegistrationIds.push(response.body.registrationId);

    const stored = await prisma.registration.findUniqueOrThrow({ where: { id: response.body.registrationId } });
    expect(stored.institution).toBe("acharya institute of graduate studies");
  });

  it("rejects an invalid phone number", async () => {
    const response = await request(app)
      .post("/api/v1/registrations")
      .set("Idempotency-Key", `http-bad-phone-${Date.now()}`)
      .send({ ...validPayload("bad-phone"), phone: "12345" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a request missing the Idempotency-Key header", async () => {
    const response = await request(app).post("/api/v1/registrations").send(validPayload("no-idem"));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("MISSING_IDEMPOTENCY_KEY");
  });

  it("creates a registration for a valid acharya.ac.in submission", async () => {
    const response = await request(app)
      .post("/api/v1/registrations")
      .set("Idempotency-Key", `http-ok-${Date.now()}`)
      .send(validPayload("ok"));

    expect(response.status).toBe(201);
    expect(response.body.publicCode).toMatch(/^DN26-/);
    expect(response.body.eightDigitCode).toHaveLength(8);
    createdRegistrationIds.push(response.body.registrationId);
  });
});

describe("GET /api/v1/registrations/status/:code", () => {
  it("returns 404 for an unknown code", async () => {
    const response = await request(app).get("/api/v1/registrations/status/DN26-ZZZZZZ");
    expect(response.status).toBe(404);
  });

  it("returns status for a known code", async () => {
    const created = await request(app)
      .post("/api/v1/registrations")
      .set("Idempotency-Key", `http-status-${Date.now()}`)
      .send(validPayload("status"));
    createdRegistrationIds.push(created.body.registrationId);

    const response = await request(app).get(
      `/api/v1/registrations/status/${created.body.publicCode}`
    );

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("PAYMENT_PENDING");
    expect(response.body.paymentStatus).toBe("PENDING");
  });
});

describe("POST /api/v1/uploads/presign", () => {
  it("returns a real presigned R2 PUT URL and creates an upload intent", async () => {
    const created = await request(app)
      .post("/api/v1/registrations")
      .set("Idempotency-Key", `http-presign-${Date.now()}`)
      .send(validPayload("presign"));
    createdRegistrationIds.push(created.body.registrationId);

    const response = await request(app).post("/api/v1/uploads/presign").send({
      registrationId: created.body.registrationId,
      purpose: "PARTICIPANT_PHOTO",
      contentType: "image/jpeg"
    });

    expect(response.status).toBe(200);
    expect(response.body.uploadUrl).toContain("dandiya-reg");
    expect(response.body.objectKey).toContain(`participants/${created.body.registrationId}/photo/`);

    const intent = await prisma.uploadIntent.findUnique({
      where: { objectKey: response.body.objectKey }
    });
    expect(intent).not.toBeNull();
    expect(intent?.purpose).toBe("PARTICIPANT_PHOTO");
  });
});
