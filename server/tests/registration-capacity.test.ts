import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  CapacityExceededError,
  createRegistration,
  RegistrationClosedError
} from "../src/modules/registration/registration.service.js";

const prisma = new PrismaClient();

let openEventId: string;
let closedEventId: string;
let raceEventId: string;
const CAPACITY = 3;

function makeInput(suffix: string) {
  return {
    name: `Test User ${suffix}`,
    phone: "9999999999",
    email: `race-${suffix}@acharya.ac.in`,
    college: "Acharya Institute",
    semester: "5",
    branch: "CSE",
    idempotencyKey: `race-key-${suffix}-${Date.now()}-${Math.random()}`
  };
}

beforeAll(async () => {
  const openEvent = await prisma.event.create({
    data: {
      name: "Capacity Test Event",
      eventDate: new Date("2026-11-01T18:00:00.000Z"),
      venue: "Test Venue",
      registrationOpen: true,
      capacity: CAPACITY,
      priceInPaise: 10000,
      erpPaymentUrl: "https://erp.example.edu/pay",
      paymentInstructions: "Test instructions"
    }
  });
  openEventId = openEvent.id;

  const closedEvent = await prisma.event.create({
    data: {
      name: "Closed Test Event",
      eventDate: new Date("2026-11-01T18:00:00.000Z"),
      venue: "Test Venue",
      registrationOpen: false,
      capacity: 100,
      priceInPaise: 10000,
      erpPaymentUrl: "https://erp.example.edu/pay",
      paymentInstructions: "Test instructions"
    }
  });
  closedEventId = closedEvent.id;

  const raceEvent = await prisma.event.create({
    data: {
      name: "Race Test Event",
      eventDate: new Date("2026-11-01T18:00:00.000Z"),
      venue: "Test Venue",
      registrationOpen: true,
      capacity: CAPACITY,
      priceInPaise: 10000,
      erpPaymentUrl: "https://erp.example.edu/pay",
      paymentInstructions: "Test instructions"
    }
  });
  raceEventId = raceEvent.id;
});

afterAll(async () => {
  for (const eventId of [openEventId, closedEventId, raceEventId]) {
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
    await expect(createRegistration(prisma, closedEventId, makeInput("closed"))).rejects.toBeInstanceOf(
      RegistrationClosedError
    );
  });
});

describe("idempotency", () => {
  it("returns the same registration for a repeated idempotency key", async () => {
    const input = makeInput("idem");
    const first = await createRegistration(prisma, openEventId, input);
    const second = await createRegistration(prisma, openEventId, input);

    expect(second.id).toBe(first.id);

    const count = await prisma.registration.count({
      where: { idempotencyKey: input.idempotencyKey }
    });
    expect(count).toBe(1);
  });
});

describe("capacity race", () => {
  it("never allows more successful registrations than capacity under concurrent requests", async () => {
    const attempts = CAPACITY + 7;
    const results = await Promise.allSettled(
      Array.from({ length: attempts }, (_, i) => createRegistration(prisma, raceEventId, makeInput(`cap-${i}`)))
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejectedWithCapacity = results.filter(
      (r) => r.status === "rejected" && r.reason instanceof CapacityExceededError
    );

    expect(fulfilled.length).toBe(CAPACITY);
    expect(rejectedWithCapacity.length).toBe(attempts - CAPACITY);

    const finalCount = await prisma.registration.count({ where: { eventId: raceEventId } });
    expect(finalCount).toBe(CAPACITY);
  }, 20000);
});
