import type { PrismaClient } from "@prisma/client";
import { getR2Client, R2NotConfiguredError } from "../../lib/r2/client.js";
import { deleteObject } from "../../lib/r2/presign.js";
import type { Env } from "../../app/config/env.js";

export const INCOMPLETE_REGISTRATION_EXPIRY_MS = 5 * 60 * 1000;

export class RegistrationNotFoundError extends Error {}

async function deleteR2ObjectsForRegistration(env: Env, objectKeys: Array<string | null>): Promise<void> {
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
