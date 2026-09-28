import type { PrismaClient } from "@prisma/client";
import { getR2Client, R2NotConfiguredError } from "../../lib/r2/client.js";
import { deleteObject } from "../../lib/r2/presign.js";
import type { Env } from "../../app/config/env.js";

export const INCOMPLETE_REGISTRATION_EXPIRY_MS = 15 * 60 * 1000;

export class RegistrationNotFoundError extends Error {}

export async function deleteR2ObjectsForRegistration(env: Env, objectKeys: Array<string | null>): Promise<void> {
  let client;
  try {
    client = getR2Client(env);
  } catch (error) {
    if (error instanceof R2NotConfiguredError) {
      return;
    }
    throw error;
  }

  for (const key of objectKeys) {
    if (!key) continue;
    try {
      await deleteObject(client, env.R2_BUCKET_NAME, key);
    } catch (error) {
      console.error(`failed to delete R2 object ${key}:`, error instanceof Error ? error.message : "unknown error");
    }
  }
}

export async function deleteRegistrationAndAssets(
  prisma: PrismaClient,
  env: Env,
  registrationId: string
): Promise<{ name: string; email: string; phone: string; registrationType: string; status: string }> {
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { payment: true }
  });
  if (!registration) {
    throw new RegistrationNotFoundError();
  }

  await deleteR2ObjectsForRegistration(env, [
    registration.photoObjectKey,
    registration.aadhaarImageObjectKey,
    registration.collegeIdImageObjectKey,
    registration.acharyanProofObjectKey,
    registration.payment?.proofObjectKey ?? null
  ]);

  await prisma.registration.delete({ where: { id: registrationId } });

  return {
    name: registration.name,
    email: registration.email,
    phone: registration.phone,
    registrationType: registration.registrationType,
    status: registration.status
  };
}

// Only the specific document that was actually rejected gets purged from R2 -- not the whole
// registration's files. A rejected PAYMENT can legitimately be resubmitted in place on the same
// registration (just a corrected transaction ID/screenshot; the participant photo is unrelated
// and stays valid), so wiping the photo there would break that path. The rejection reason, status,
// and audit log entries are always kept intact as the record of what happened; only the specific
// rejected file and its DB pointer are cleared.
export async function purgeRejectedPaymentProof(prisma: PrismaClient, env: Env, paymentId: string): Promise<void> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment?.proofObjectKey) return;

  await deleteR2ObjectsForRegistration(env, [payment.proofObjectKey]);
  await prisma.payment.update({ where: { id: paymentId }, data: { proofObjectKey: null } });
}

// Identity rejection also cascades the payment to REJECTED (see rejectIdentity) and the tested/
// supported recovery path is a brand new registration, not an in-place resubmission -- so both
// the identity document and the payment proof are cleared here. The photo is left alone since
// it was never the reason for rejection and costs nothing to keep.
export async function purgeRejectedIdentityDocuments(
  prisma: PrismaClient,
  env: Env,
  registrationId: string
): Promise<void> {
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { payment: true }
  });
  if (!registration) return;

  await deleteR2ObjectsForRegistration(env, [
    registration.aadhaarImageObjectKey,
    registration.collegeIdImageObjectKey,
    registration.acharyanProofObjectKey,
    registration.payment?.proofObjectKey ?? null
  ]);

  await prisma.registration.update({
    where: { id: registrationId },
    data: { aadhaarImageObjectKey: null, collegeIdImageObjectKey: null, acharyanProofObjectKey: null }
  });

  if (registration.payment?.proofObjectKey) {
    await prisma.payment.update({ where: { id: registration.payment.id }, data: { proofObjectKey: null } });
  }
}

export async function cleanupIncompleteRegistrations(prisma: PrismaClient, env: Env): Promise<number> {
  const cutoff = new Date(Date.now() - INCOMPLETE_REGISTRATION_EXPIRY_MS);
  const stale = await prisma.registration.findMany({
    where: { status: "PAYMENT_PENDING", updatedAt: { lt: cutoff } },
    select: { id: true }
  });

  for (const { id } of stale) {
    try {
      await deleteRegistrationAndAssets(prisma, env, id);
    } catch (error) {
      console.error(
        `failed to clean up incomplete registration ${id}:`,
        error instanceof Error ? error.message : "unknown error"
      );
    }
  }

  return stale.length;
}
