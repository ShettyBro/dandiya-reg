import type { PrismaClient } from "@prisma/client";
import QRCode from "qrcode";
import { getR2Client, R2NotConfiguredError } from "../../lib/r2/client.js";
import { presignGetUrl } from "../../lib/r2/presign.js";
import { deriveSignedCredentialToken } from "../../lib/qr/credential.js";
import { normalizeIndianPhone } from "../../lib/security/phone.js";
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

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}
function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  return na.length > 2 && (na === nb || na.includes(nb) || nb.includes(na));
}

export interface ErpTransactionSearchResult {
  id: string;
  name: string;
  phone: string;
  email: string;
  paymentId: string;
  transactionDate: Date;
  amountInPaise: number;
  remarks: string | null;
  matchedRegistration: { name: string; status: string; publicCode: string } | null;
}

const ERP_SEARCH_LIMIT = 20;

// Finds confirmed ERP payments by transaction ID, phone, name, or email -- separate from the
// registration search above, for the case a Help Desk volunteer needs to verify a payment before
// deciding whether someone needs a walk-in registration (/emg) or is just not findable yet.
export async function searchErpTransactions(
  prisma: PrismaClient,
  query: string
): Promise<ErpTransactionSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  const normalizedPhone = normalizeIndianPhone(trimmed);

  const transactions = await prisma.erpTransaction.findMany({
    where: {
      OR: [
        { paymentId: { contains: trimmed, mode: "insensitive" } },
        { name: { contains: trimmed, mode: "insensitive" } },
        { email: { contains: trimmed, mode: "insensitive" } },
        { phone: { contains: normalizedPhone.length >= 4 ? normalizedPhone : trimmed } }
      ]
    },
    orderBy: { transactionDate: "desc" },
    take: ERP_SEARCH_LIMIT
  });

  if (transactions.length === 0) return [];

  // Reuses the same phone / transaction-ID / name matching the ERP reconciliation used, so the
  // "already registered" status shown here is consistent with that report.
  const candidatePhones = transactions.map((t) => t.phone);
  const candidateTxnIds = transactions.map((t) => t.paymentId);
  const relatedRegistrations = await prisma.registration.findMany({
    where: {
      OR: [
        { phone: { in: candidatePhones } },
        { payment: { transactionId: { in: candidateTxnIds } } }
      ]
    },
    include: { payment: true }
  });
  // Name-only fallback needs the broader pool, but only for transactions not already matched --
  // fetching all registrations here would be wasteful at full scale; fine at this dataset size.
  const allRegistrations = await prisma.registration.findMany({ include: { payment: true } });

  return transactions.map((t) => {
    const byPhone = relatedRegistrations.find((r) => normalizeIndianPhone(r.phone) === t.phone);
    const byTxnId = relatedRegistrations.find(
      (r) => r.payment?.transactionId?.trim().toLowerCase() === t.paymentId.toLowerCase()
    );
    const byName = byPhone || byTxnId ? undefined : allRegistrations.find((r) => namesMatch(r.name, t.name));
    const match = byPhone ?? byTxnId ?? byName;

    return {
      id: t.id,
      name: t.name,
      phone: t.phone,
      email: t.email,
      paymentId: t.paymentId,
      transactionDate: t.transactionDate,
      amountInPaise: t.amountInPaise,
      remarks: t.remarks,
      matchedRegistration: match ? { name: match.name, status: match.status, publicCode: match.publicCode } : null
    };
  });
}
