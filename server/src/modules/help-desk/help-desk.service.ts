import type { PrismaClient } from "@prisma/client";
import QRCode from "qrcode";
import { getR2Client, R2NotConfiguredError } from "../../lib/r2/client.js";
import { presignGetUrl } from "../../lib/r2/presign.js";
import { deriveSignedCredentialToken } from "../../lib/qr/credential.js";
import type { Env } from "../../app/config/env.js";

export class HelpDeskRegistrationNotFoundError extends Error {}

export interface HelpDeskSearchResult {
  id: string;
  name: string;
  phone: string;
  email: string;
  registrationType: string;
  status: string;
  publicCode: string;
  createdAt: Date;
}

const SEARCH_LIMIT = 20;

// Deliberately never selects payment/proof/transaction fields -- Help Desk staff can look up a
// participant's identity and QR, not review their payment, by design (that stays Finance-only).
export async function searchRegistrationsForHelpDesk(
  prisma: PrismaClient,
  query: string
): Promise<HelpDeskSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const registrations = await prisma.registration.findMany({
    where: {
      OR: [
        { name: { contains: trimmed, mode: "insensitive" } },
        { email: { contains: trimmed, mode: "insensitive" } },
        { phone: { contains: trimmed } },
        { publicCode: { contains: trimmed, mode: "insensitive" } },
        { auid: { contains: trimmed, mode: "insensitive" } }
      ]
    },
    orderBy: { createdAt: "desc" },
    take: SEARCH_LIMIT,
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      registrationType: true,
      status: true,
      publicCode: true,
      createdAt: true
    }
  });

  return registrations;
}

export interface HelpDeskRegistrationDetail {
  id: string;
  name: string;
  phone: string;
  email: string;
  registrationType: string;
  status: string;
  publicCode: string;
  photoUrl: string | null;
  qrDataUrl: string | null;
}

export async function getHelpDeskRegistrationDetail(
  prisma: PrismaClient,
  env: Env,
  registrationId: string
): Promise<HelpDeskRegistrationDetail> {
  const registration = await prisma.registration.findUnique({ where: { id: registrationId } });
  if (!registration) {
    throw new HelpDeskRegistrationNotFoundError();
  }

  let photoUrl: string | null = null;
  if (registration.photoObjectKey) {
    try {
      const client = getR2Client(env);
      photoUrl = await presignGetUrl(client, env.R2_BUCKET_NAME, registration.photoObjectKey, env.R2_PRESIGN_READ_TTL);
    } catch (error) {
      if (!(error instanceof R2NotConfiguredError)) {
        throw error;
      }
    }
  }

  let qrDataUrl: string | null = null;
  if (registration.status === "PAYMENT_APPROVED") {
    const credential = await prisma.passCredential.findUnique({ where: { registrationId: registration.id } });
    if (credential && credential.active && !credential.revokedAt) {
      const qrPayload = deriveSignedCredentialToken(env.QR_SECRET, credential.id);
      qrDataUrl = await QRCode.toDataURL(qrPayload, { errorCorrectionLevel: "M", margin: 1, width: 400 });
    }
  }

  return {
    id: registration.id,
    name: registration.name,
    phone: registration.phone,
    email: registration.email,
    registrationType: registration.registrationType,
    status: registration.status,
    publicCode: registration.publicCode,
    photoUrl,
    qrDataUrl
  };
}
