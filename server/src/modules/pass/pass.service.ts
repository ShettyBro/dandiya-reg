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
