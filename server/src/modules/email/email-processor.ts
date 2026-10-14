import type { EmailJob, PrismaClient } from "@prisma/client";
import QRCode from "qrcode";
import {
  EmailPermanentError,
  EmailQuotaExceededError,
  EmailTransientError,
  type EmailAttachment,
  type EmailSender
} from "../../lib/email/errors.js";
import { renderEmailTemplate, type EmailAssets } from "./templates.js";
import { deriveSignedCredentialToken } from "../../lib/qr/credential.js";
import { buildQrDownloadPdf, getStaticAsset } from "../../lib/qr-download/pdf.js";
import {
  MAX_ATTEMPTS,
  markEmailJobFailed,
  markEmailJobQuotaRetry,
  markEmailJobRetry,
  markEmailJobSent
} from "./email-outbox.service.js";
import type { Env } from "../../app/config/env.js";

interface BuiltEmailContent {
  assets: EmailAssets;
  attachments: EmailAttachment[];
}

async function buildEmailContent(prisma: PrismaClient, env: Env, job: EmailJob): Promise<BuiltEmailContent> {
  const assets: EmailAssets = {
    logoUrl: `${env.FRONTEND_ORIGIN}/acharya-logo.png`,
    dancersUrl: `${env.FRONTEND_ORIGIN}/dandiya-dancers.png`
  };

  let credentialId: string | null = null;

  if (job.type === "PAYMENT_APPROVED" && job.registrationId) {
    const credential = await prisma.passCredential.findUnique({
      where: { registrationId: job.registrationId }
    });
    if (credential && credential.active && !credential.revokedAt) {
      credentialId = credential.id;
    }
  } else if (job.type === "VOLUNTEER_INVITE") {
    const payload = job.payloadJson as Record<string, unknown>;
    if (typeof payload.staffCredentialId === "string") {
      const credential = await prisma.passCredential.findUnique({
        where: { id: payload.staffCredentialId }
      });
      if (credential && credential.active && !credential.revokedAt) {
        credentialId = credential.id;
      }
    }
  }

  if (!credentialId) {
    return { assets, attachments: [] };
  }

  // The QR code is no longer rendered inline in the HTML body at all (see templates.ts) --
  // it's attached as a PDF instead, reusing the exact same template the /qr download page
  // already serves. An inline <img>, even hosted on our own domain, depends entirely on the
  // recipient's email client choosing to auto-load remote images; a PDF attachment has no such
  // dependency, it's downloaded with the message itself. Confirmed by direct testing that
  // people were receiving the rest of the email fine but never seeing the QR for exactly this
  // reason.
  const payload = job.payloadJson as Record<string, unknown>;
  const name = typeof payload.name === "string" ? payload.name : "Participant";
  const publicCode = typeof payload.publicCode === "string" ? payload.publicCode : "";

  const qrPayload = deriveSignedCredentialToken(env.QR_SECRET, credentialId);
  const [qrPngBuffer, logoImageBuffer, backgroundImageBuffer] = await Promise.all([
    QRCode.toBuffer(qrPayload, { errorCorrectionLevel: "M", margin: 1, width: 400 }),
    getStaticAsset(env, "/acharya-logo.png"),
    getStaticAsset(env, "/dandiya-dancers.png")
  ]);

  const pdfBuffer = await buildQrDownloadPdf({
    name,
    publicCode,
    qrPngBuffer,
    logoImageBuffer,
    backgroundImageBuffer
  });

  return {
    assets,
    attachments: [
      {
        filename: `dandiya-qr-${publicCode || "pass"}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf"
      }
    ]
  };
}

export async function processEmailJob(
  prisma: PrismaClient,
  env: Env,
  job: EmailJob,
  sender: EmailSender
): Promise<"sent" | "retry" | "quota-retry" | "failed"> {
  const { assets, attachments } = await buildEmailContent(prisma, env, job);
  const { subject, html } = renderEmailTemplate(job.type, job.payloadJson as Record<string, unknown>, assets);

  try {
    const result = await sender({ to: job.recipient, subject, html, attachments });
    await markEmailJobSent(prisma, job.id, result.providerMessageId);
    return "sent";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Checked before the normal retry/fail path entirely -- a quota hit must never count toward
    // MAX_ATTEMPTS or be able to land the job in FAILED, and uses its own much longer, indefinite
    // retry cadence (see markEmailJobQuotaRetry) instead of the short exponential backoff below.
    if (error instanceof EmailQuotaExceededError) {
      await markEmailJobQuotaRetry(prisma, job.id, message, error.retryAfter);
      return "quota-retry";
    }

    const attempts = job.attempts + 1;
    const isPermanent = error instanceof EmailPermanentError;

    if (isPermanent || attempts >= MAX_ATTEMPTS) {
      await markEmailJobFailed(prisma, job.id, attempts, message);
      return "failed";
    }

    const retryAfter = error instanceof EmailTransientError ? error.retryAfter : undefined;
    await markEmailJobRetry(prisma, job.id, attempts, message, retryAfter);
    return "retry";
  }
}
