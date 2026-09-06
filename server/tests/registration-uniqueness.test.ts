import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  createRegistration,
  DuplicateAadhaarError,
  DuplicateAuidError,
  DuplicateEmployeeIdError,
  DuplicatePhoneError,
  RegistrationClosedError
} from "../src/modules/registration/registration.service.js";
import type { RegistrationInput } from "../src/modules/registration/registration.schemas.js";

const prisma = new PrismaClient();

let openEventId: string;
let closedEventId: string;

function randomPhone(): string {
  return `9${Math.floor(100000000 + Math.random() * 899999999)}`;
}

function studentInput(overrides: Partial<RegistrationInput & { auid: string; phone: string }> = {}) {
  return {
    registrationType: "ACHARYA_STUDENT" as const,
    name: "test student",
    phone: randomPhone(),
    email: `student-${Date.now()}-${Math.random()}@acharya.ac.in`,
    auid: `auid-${Date.now()}-${Math.random()}`,
    institution: "acharya institute of technology" as const,
    year: 2,
    ...overrides
  };
}

async function register(eventId: string, data: ReturnType<typeof studentInput>) {
  return createRegistration(prisma, eventId, {
    data,
    idempotencyKey: `uniq-key-${Date.now()}-${Math.random()}`
  });
}

beforeAll(async () => {
  const openEvent = await prisma.event.create({
    data: {
      name: "Uniqueness Test Event",
      eventDate: new Date("2026-11-01T18:00:00.000Z"),
      venue: "Test Venue",
      registrationOpen: true,
      capacity: 1,
      priceInPaise: 15100,
      erpPaymentUrl: "https://erp.example.edu/pay",
      paymentInstructions: "Test instructions"
    }
  });
  openEventId = openEvent.id;

  const closedEvent = await prisma.event.create({
    data: {
      name: "Closed Uniqueness Test Event",
      eventDate: new Date("2026-11-01T18:00:00.000Z"),
      venue: "Test Venue",
      registrationOpen: false,
      capacity: 100,
      priceInPaise: 15100,
      erpPaymentUrl: "https://erp.example.edu/pay",
      paymentInstructions: "Test instructions"
    }
  });
  closedEventId = closedEvent.id;
});

afterAll(async () => {
  for (const eventId of [openEventId, closedEventId]) {
    const registrations = await prisma.registration.findMany({ where: { eventId } });
    const ids = registrations.map((r) => r.id);
    await prisma.attendance.deleteMany({ where: { registrationId: { in: ids } } });
    await prisma.payment.deleteMany({ where: { registrationId: { in: ids } } });
    await prisma.registration.deleteMany({ where: { eventId } });
    await prisma.event.delete({ where: { id: eventId } });
  }
  await prisma.$disconnect();
});

describe("registration closed", () => {
  it("rejects registration when the event is closed", async () => {
    await expect(register(closedEventId, studentInput())).rejects.toBeInstanceOf(RegistrationClosedError);
  });
});

describe("unlimited capacity", () => {
  it("allows registrations to exceed the configured capacity field (advisory only, never enforced)", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => register(openEventId, studentInput()))
    );
    expect(results).toHaveLength(5);
  });
});

describe("idempotency", () => {
  it("returns the same registration for a repeated idempotency key", async () => {
    const data = studentInput();
    const idempotencyKey = `uniq-idem-${Date.now()}`;
    const first = await createRegistration(prisma, openEventId, { data, idempotencyKey });
    const second = await createRegistration(prisma, openEventId, { data, idempotencyKey });

    expect(second.id).toBe(first.id);
    const count = await prisma.registration.count({ where: { idempotencyKey } });
    expect(count).toBe(1);
  });
});

describe("lifecycle-aware uniqueness", () => {
  it("rejects a second active registration with the same AUID", async () => {
    const auid = `auid-dup-${Date.now()}`;
    await register(openEventId, studentInput({ auid }));
    await expect(register(openEventId, studentInput({ auid }))).rejects.toBeInstanceOf(DuplicateAuidError);
  });

  it("rejects a second active registration with the same Employee ID", async () => {
    const employeeId = `emp-dup-${Date.now()}`;
    const faculty = (overrides: Record<string, unknown> = {}) => ({
      registrationType: "ACHARYA_FACULTY" as const,
      name: "test faculty",
      phone: randomPhone(),
      email: `faculty-${Date.now()}-${Math.random()}@acharya.ac.in`,
      employeeId,
      institution: "acharya institute of technology" as const,
      ...overrides
    });
    await register(openEventId, faculty());
    await expect(register(openEventId, faculty())).rejects.toBeInstanceOf(DuplicateEmployeeIdError);
  });

  it("rejects a second active registration with the same Aadhaar number", async () => {
    const aadhaarNumber = `${Date.now()}`.padStart(12, "1");
    const nonAcharyan = (overrides: Record<string, unknown> = {}) => ({
      registrationType: "NON_ACHARYAN_STUDENT" as const,
      name: "test outsider",
      phone: randomPhone(),
      email: `outsider-${Date.now()}-${Math.random()}@example.com`,
      collegeName: "some other college",
      aadhaarNumber,
      ...overrides
    });
    await register(openEventId, nonAcharyan());
    await expect(register(openEventId, nonAcharyan())).rejects.toBeInstanceOf(DuplicateAadhaarError);
  });

  it("rejects a second active registration with the same phone within the same type", async () => {
    const phone = `9${String(Date.now()).slice(-9)}`;
    await register(openEventId, studentInput({ phone }));
    await expect(register(openEventId, studentInput({ phone }))).rejects.toBeInstanceOf(DuplicatePhoneError);
  });

  it("resolves a concurrent duplicate-AUID race to exactly one success, correctly typed", async () => {
    const auid = `auid-race-${Date.now()}`;
    const attempts = 5;
    const results = await Promise.allSettled(
      Array.from({ length: attempts }, () => register(openEventId, studentInput({ auid })))
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(attempts - 1);
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(DuplicateAuidError);
    }
  }, 20000);

  it("releases the AUID and links a resubmission once the original registration is rejected", async () => {
    const auid = `auid-resub-${Date.now()}`;
    const original = await register(openEventId, studentInput({ auid }));

    await prisma.registration.update({ where: { id: original.id }, data: { status: "PAYMENT_REJECTED" } });

    const resubmission = await register(openEventId, studentInput({ auid }));

    expect(resubmission.id).not.toBe(original.id);
    expect(resubmission.resubmissionOfId).toBe(original.id);
  });
});
