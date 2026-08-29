import type { PrismaClient, Registration } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { generateEightDigitCode, generatePublicCode } from "../../lib/security/codes.js";

export class RegistrationClosedError extends Error {}
export class CapacityExceededError extends Error {}

export interface CreateRegistrationInput {
  name: string;
  phone: string;
  email: string;
  college: string;
  semester: string;
  branch: string;
  idempotencyKey: string;
}

const UNIQUE_CODE_MAX_ATTEMPTS = 5;

export async function createRegistration(
  prisma: PrismaClient,
  eventId: string,
  input: CreateRegistrationInput
): Promise<Registration> {
  const existing = await prisma.registration.findUnique({
    where: { idempotencyKey: input.idempotencyKey }
  });
  if (existing) {
    return existing;
  }

  for (let attempt = 0; attempt < UNIQUE_CODE_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const eventRows = await tx.$queryRaw<
          { id: string; capacity: number; registrationOpen: boolean; registrationDeadline: Date | null; maintenanceMode: boolean; priceInPaise: number }[]
        >`SELECT id, capacity, "registrationOpen", "registrationDeadline", "maintenanceMode", "priceInPaise" FROM events WHERE id = ${eventId} FOR UPDATE`;

        const event = eventRows[0];
        if (!event) {
          throw new Error("Event not found");
        }

        const deadlinePassed = event.registrationDeadline
          ? event.registrationDeadline.getTime() < Date.now()
          : false;

        if (!event.registrationOpen || event.maintenanceMode || deadlinePassed) {
          throw new RegistrationClosedError();
        }

        const registeredCount = await tx.registration.count({ where: { eventId } });
        if (registeredCount >= event.capacity) {
          throw new CapacityExceededError();
        }

        const publicCode = generatePublicCode();
        const eightDigitCode = generateEightDigitCode();

        const registration = await tx.registration.create({
          data: {
            eventId,
            publicCode,
            eightDigitCode,
            name: input.name,
            email: input.email,
            phone: input.phone,
            college: input.college,
            semester: input.semester,
            branch: input.branch,
            idempotencyKey: input.idempotencyKey,
            status: "PAYMENT_PENDING"
          }
        });

        await tx.payment.create({
          data: {
            registrationId: registration.id,
            amountInPaise: event.priceInPaise,
            status: "PENDING"
          }
        });

        await tx.attendance.create({
          data: {
            registrationId: registration.id,
            state: "NOT_ENTERED"
          }
        });

        return registration;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        attempt < UNIQUE_CODE_MAX_ATTEMPTS - 1
      ) {
        continue;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existingByKey = await prisma.registration.findUnique({
          where: { idempotencyKey: input.idempotencyKey }
        });
        if (existingByKey) {
          return existingByKey;
        }
      }
      throw error;
    }
  }

  throw new Error("Failed to allocate a unique registration code");
}

export async function getRegistrationByPublicCode(
  prisma: PrismaClient,
  publicCode: string
): Promise<Registration | null> {
  return prisma.registration.findUnique({ where: { publicCode } });
}
