import type { PrismaClient, Registration, RegistrationType } from "@prisma/client";
import { getR2Client, R2NotConfiguredError } from "../../lib/r2/client.js";
import { headObject, ObjectNotFoundError } from "../../lib/r2/presign.js";
import { deriveSignedCredentialToken, hashCredentialToken, newCredentialId } from "../../lib/qr/credential.js";
import { recordAuditLog } from "../audit/audit.service.js";
import type { Env } from "../../app/config/env.js";

export const MY_PEOPLE_TYPES: RegistrationType[] = ["MY_PEOPLE_ADMIN", "MY_PEOPLE_REGULAR"];

export class MyPeopleRegistrationNotFoundError extends Error {}
export class MyPeopleNotPendingError extends Error {}
export class MyPeoplePhotoMissingError extends Error {}
export class MyPeopleNotApprovedError extends Error {}

export async function listMyPeopleRegistrations(prisma: PrismaClient): Promise<Registration[]> {
  return prisma.registration.findMany({
    where: { registrationType: { in: MY_PEOPLE_TYPES } },
    orderBy: { createdAt: "desc" }
  });
}

export async function approveMyPeopleRegistration(
  prisma: PrismaClient,
  env: Env,
  registrationId: string,
  approvedByUserId: string,
  requestId: string | null
): Promise<void> {
  const preCheck = await prisma.registration.findUnique({ where: { id: registrationId } });
  if (!preCheck || !MY_PEOPLE_TYPES.includes(preCheck.registrationType)) {
    throw new MyPeopleRegistrationNotFoundError();
  }
  if (preCheck.status !== "PAYMENT_PENDING") {
    throw new MyPeopleNotPendingError();
  }

  // Same safeguard as payment approval: never approve as if the photo had been reviewed when the
  // underlying R2 object is actually missing.
  if (!preCheck.photoObjectKey) {
    throw new MyPeoplePhotoMissingError();
  }
  try {
    const client = getR2Client(env);
    await headObject(client, env.R2_BUCKET_NAME, preCheck.photoObjectKey);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      throw new MyPeoplePhotoMissingError();
    }
    if (!(error instanceof R2NotConfiguredError)) {
      throw error;
    }
  }

  await prisma.$transaction(async (tx) => {
    const result = await tx.registration.updateMany({
      where: { id: registrationId, status: "PAYMENT_PENDING" },
      data: { status: "PAYMENT_APPROVED" }
    });
    if (result.count !== 1) {
      throw new MyPeopleNotPendingError();
    }

    const registration = await tx.registration.findUniqueOrThrow({ where: { id: registrationId } });

    // ADMIN gets the same credential type as an unrestricted staff/volunteer pass -- it's never
    // checked against the Attendance table at all (no NOT_ENTERED/ENTERED state to violate), so
    // entry and kit collection are both naturally unlimited, every scan still goes through the
    // audit log, and the dashboard's gate-entry/kit counts (which only ever count Attendance rows)
    // never see it. REGULAR gets a normal PARTICIPANT credential -- single entry per gate, same as
    // every paid registration, via the Attendance row already created at registration time.
    const credentialId = newCredentialId();
    const signedToken = deriveSignedCredentialToken(env.QR_SECRET, credentialId);
    await tx.passCredential.upsert({
      where: { registrationId: registration.id },
      update: {},
      create: {
        id: credentialId,
        registrationId: registration.id,
        credentialType: registration.registrationType === "MY_PEOPLE_ADMIN" ? "STAFF_GUEST_ADMIN" : "PARTICIPANT",
        opaqueTokenHash: hashCredentialToken(signedToken),
        active: true,
        label: registration.registrationType === "MY_PEOPLE_ADMIN" ? registration.name : null
      }
    });

    await tx.emailJob.upsert({
      where: { uniquenessKey: `payment-approved-${registration.id}` },
      update: {},
      create: {
        type: "PAYMENT_APPROVED",
        recipient: registration.email,
        registrationId: registration.id,
        payloadJson: { publicCode: registration.publicCode, name: registration.name },
        uniquenessKey: `payment-approved-${registration.id}`
      }
    });

    await recordAuditLog(tx, {
      actorUserId: approvedByUserId,
      action: "MY_PEOPLE_APPROVED",
      entityType: "Registration",
      entityId: registration.id,
      requestId
    });
  });
}

export async function resendMyPeopleApprovalEmail(
  prisma: PrismaClient,
  registrationId: string,
  resentByUserId: string,
  requestId: string | null
): Promise<void> {
  const registration = await prisma.registration.findUnique({ where: { id: registrationId } });
  if (!registration || !MY_PEOPLE_TYPES.includes(registration.registrationType)) {
    throw new MyPeopleRegistrationNotFoundError();
  }
  if (registration.status !== "PAYMENT_APPROVED") {
    throw new MyPeopleNotApprovedError();
  }

  // The original job's uniquenessKey (payment-approved-<id>) is already taken by the first send,
  // so a resend always queues a fresh job under its own key -- it still reuses the exact same
  // PAYMENT_APPROVED template/QR, it just isn't deduplicated against the original.
  await prisma.emailJob.create({
    data: {
      type: "PAYMENT_APPROVED",
      recipient: registration.email,
      registrationId: registration.id,
      payloadJson: { publicCode: registration.publicCode, name: registration.name },
      uniquenessKey: `payment-approved-resend-${registration.id}-${Date.now()}`
    }
  });

  await recordAuditLog(prisma, {
    actorUserId: resentByUserId,
    action: "MY_PEOPLE_EMAIL_RESENT",
    entityType: "Registration",
    entityId: registration.id,
    requestId
  });
}
