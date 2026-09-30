import type { PrismaClient, Registration } from "@prisma/client";
import QRCode from "qrcode";
import { deriveSignedCredentialToken } from "../../lib/qr/credential.js";
import type { Env } from "../../app/config/env.js";

export class PassNotAvailableError extends Error {}
export class RegistrationNotFoundError extends Error {}

export async function findRegistrationByAnyCode(
  prisma: PrismaClient,
  code: string
): Promise<Registration | null> {
  return prisma.registration.findFirst({
    where: { OR: [{ publicCode: code }, { eightDigitCode: code }] }
  });
}

export interface PassData {
  registrationId: string;
  name: string;
  publicCode: string;
  eightDigitCode: string;
  photoUrl: string | null;
  qrPayload: string;
  qrImageDataUrl: string;
}

// Brevo's transactional email API does not support CID-embedded/inline images (confirmed with
// their own support team, Oct 2025) -- images must be a normal externally-hosted HTTPS URL, not
// a data: URI, or many email clients (and Brevo's own recommendation) will fail to render it.
// The QR payload is fully deterministic from the credential id, so this can regenerate the exact
// same PNG on demand indefinitely without storing anything -- no R2 upload, no expiry to manage.
export async function renderCredentialQrPng(env: Env, credentialId: string): Promise<Buffer> {
  const qrPayload = deriveSignedCredentialToken(env.QR_SECRET, credentialId);
  return QRCode.toBuffer(qrPayload, { errorCorrectionLevel: "M", margin: 1, width: 400 });
}

export async function buildPassData(
  prisma: PrismaClient,
  env: Env,
  registrationId: string,
  presignPhotoUrl: (objectKey: string) => Promise<string | null>
): Promise<PassData> {
  const registration = await prisma.registration.findUnique({ where: { id: registrationId } });
  if (!registration) {
    throw new RegistrationNotFoundError();
  }
  if (registration.status !== "PAYMENT_APPROVED") {
    throw new PassNotAvailableError();
  }

  const credential = await prisma.passCredential.findUnique({ where: { registrationId } });
  if (!credential || !credential.active || credential.revokedAt) {
    throw new PassNotAvailableError();
  }

  const qrPayload = deriveSignedCredentialToken(env.QR_SECRET, credential.id);
  const qrImageDataUrl = await QRCode.toDataURL(qrPayload, { errorCorrectionLevel: "M", margin: 1, width: 320 });

  const photoUrl = registration.photoObjectKey ? await presignPhotoUrl(registration.photoObjectKey) : null;

  return {
    registrationId: registration.id,
    name: registration.name,
    publicCode: registration.publicCode,
    eightDigitCode: registration.eightDigitCode,
    photoUrl,
    qrPayload,
    qrImageDataUrl
  };
}
