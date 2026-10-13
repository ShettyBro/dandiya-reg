import type { PrismaClient, Registration } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { generateEightDigitCode, generatePublicCode } from "../../lib/security/codes.js";
import type { RegistrationInput } from "./registration.schemas.js";

export class RegistrationClosedError extends Error {}
export class NonAcharyanRegistrationClosedError extends Error {}
export class DuplicateAuidError extends Error {}
export class DuplicateEmployeeIdError extends Error {}
export class DuplicateAadhaarError extends Error {}
export class DuplicatePhoneError extends Error {}
export class DuplicateEmailError extends Error {}

export interface CreateRegistrationInput {
  data: RegistrationInput;
  idempotencyKey: string;
}

const UNIQUE_CODE_MAX_ATTEMPTS = 5;
const REJECTED_STATUSES = ["PAYMENT_REJECTED", "IDENTITY_REJECTED"] as const;

async function findActiveDuplicate(
  tx: Prisma.TransactionClient,
  where: Prisma.RegistrationWhereInput
): Promise<Registration | null> {
  return tx.registration.findFirst({
    where: { ...where, status: { notIn: [...REJECTED_STATUSES] } }
  });
}

async function findMostRecentRejected(
  tx: Prisma.TransactionClient,
  where: Prisma.RegistrationWhereInput
): Promise<Registration | null> {
  return tx.registration.findFirst({
    where: { ...where, status: { in: [...REJECTED_STATUSES] } },
    orderBy: { createdAt: "desc" }
  });
}

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

  const { data } = input;

  for (let attempt = 0; attempt < UNIQUE_CODE_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const event = await tx.event.findUniqueOrThrow({ where: { id: eventId } });

        // Deliberately does NOT check the registrationDeadline here. The public landing page
        // closes visually (greyed-out CTA) on its own schedule, but the direct /reg1 link is
        // meant to keep accepting registrations regardless -- it exists specifically for people
        // who already paid in the ERP but never finished registering, who must still be able to
        // go through this link after the main page shows "closed". Actual system-down protection
        // still applies: maintenanceMode is a different, operational concept (the backend/storage
        // genuinely isn't safe to write to) and still blocks here.
        if (event.maintenanceMode) {
          throw new RegistrationClosedError();
        }

        if (data.registrationType === "NON_ACHARYAN_STUDENT" && !event.nonAcharyanRegistrationOpen) {
          throw new NonAcharyanRegistrationClosedError();
        }

        // Each of the four public categories has its own independent admin toggle -- none of them
        // depend on the other, and none depend on the top-level registrationOpen field (that one
        // is purely informational now: the landing page's overall "Registration OPEN/CLOSED"
        // headline and dashboard summary, with no link to /reg1 for it to actually gate anymore).
        if (data.registrationType === "ACHARYA_STUDENT" && !event.acharyaStudentRegistrationOpen) {
          throw new RegistrationClosedError();
        }
        if (data.registrationType === "ACHARYA_FACULTY" && !event.acharyaFacultyRegistrationOpen) {
          throw new RegistrationClosedError();
        }
        if (data.registrationType === "ACHARYA_ALUMNI" && !event.acharyaAlumniRegistrationOpen) {
          throw new RegistrationClosedError();
        }

        const phoneDuplicate = await findActiveDuplicate(tx, { phone: data.phone });
        if (phoneDuplicate) {
          throw new DuplicatePhoneError();
        }

        const emailDuplicate = await findActiveDuplicate(tx, { email: data.email });
        if (emailDuplicate) {
          throw new DuplicateEmailError();
        }

        if (data.registrationType === "ACHARYA_STUDENT" || data.registrationType === "ACHARYA_ALUMNI") {
          const dup = await findActiveDuplicate(tx, { auid: data.auid });
          if (dup) throw new DuplicateAuidError();
        } else if (data.registrationType === "ACHARYA_FACULTY") {
          const dup = await findActiveDuplicate(tx, { employeeId: data.employeeId });
          if (dup) throw new DuplicateEmployeeIdError();
        }

        const resubmissionOf =
          data.registrationType === "ACHARYA_STUDENT" || data.registrationType === "ACHARYA_ALUMNI"
            ? await findMostRecentRejected(tx, { auid: data.auid })
            : data.registrationType === "ACHARYA_FACULTY"
              ? await findMostRecentRejected(tx, { employeeId: data.employeeId })
              : null;

        const publicCode = generatePublicCode();
        const eightDigitCode = generateEightDigitCode();

        const registration = await tx.registration.create({
          data: {
            eventId,
            registrationType: data.registrationType,
            publicCode,
            eightDigitCode,
            name: data.name,
            email: data.email,
            phone: data.phone,
            idempotencyKey: input.idempotencyKey,
            status: "PAYMENT_PENDING",
            resubmissionOfId: resubmissionOf?.id ?? null,
            ...(data.registrationType === "ACHARYA_STUDENT"
              ? { auid: data.auid, institution: data.institution, year: data.year }
              : data.registrationType === "ACHARYA_FACULTY"
                ? { employeeId: data.employeeId, institution: data.institution }
                : data.registrationType === "ACHARYA_ALUMNI"
                  ? {
                      auid: data.auid,
                      identityDocumentType: "ACHARYAN_PROOF" as const,
                      identityStatus: "PENDING" as const
                    }
                  : data.registrationType === "NON_ACHARYAN_STUDENT"
                    ? {
                        collegeName: data.collegeName,
                        identityDocumentType: "COLLEGE_ID" as const,
                        identityStatus: "PENDING" as const
                      }
                    : {})
          }
        });

        // My People registrations are free (no ERP payment involved at all) -- no Payment row is
        // created, so they're automatically excluded from every payment-based admin view (the
        // Payments queue, dashboard payment counts) by construction, not by a filter that could
        // drift out of sync. Approval instead happens directly on the registration status via
        // my-people.service.ts.
        const isMyPeople = data.registrationType === "MY_PEOPLE_ADMIN" || data.registrationType === "MY_PEOPLE_REGULAR";
        if (!isMyPeople) {
          await tx.payment.create({
            data: {
              registrationId: registration.id,
              amountInPaise: event.priceInPaise,
              status: "PENDING"
            }
          });
        }

        await tx.attendance.create({
          data: {
            registrationId: registration.id,
            state: "NOT_ENTERED"
          }
        });

        return registration;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = error.meta?.target;
        const targetFields = Array.isArray(target) ? target : typeof target === "string" ? [target] : [];
        if (targetFields.includes("auid")) {
          throw new DuplicateAuidError();
        }
        if (targetFields.includes("employeeId")) {
          throw new DuplicateEmployeeIdError();
        }
        if (targetFields.includes("aadhaarNumber")) {
          throw new DuplicateAadhaarError();
        }
        if (targetFields.includes("phone")) {
          throw new DuplicatePhoneError();
        }
        if (targetFields.includes("email")) {
          throw new DuplicateEmailError();
        }

        if (attempt < UNIQUE_CODE_MAX_ATTEMPTS - 1) {
          continue;
        }
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
