import type { EmailJob, PrismaClient } from "@prisma/client";
import QRCode from "qrcode";
import type { EmailSender } from "../../lib/brevo/client.js";
import { BrevoPermanentError } from "../../lib/brevo/client.js";
import { renderEmailTemplate, type EmailAssets } from "./templates.js";
import { deriveSignedCredentialToken } from "../../lib/qr/credential.js";
import {
  MAX_ATTEMPTS,
  markEmailJobFailed,
  markEmailJobRetry,
  markEmailJobSent
} from "./email-outbox.service.js";
import type { Env } from "../../app/config/env.js";

async function buildAssets(prisma: PrismaClient, env: Env, job: EmailJob): Promise<EmailAssets> {
  const base: EmailAssets = {
    logoUrl: `${env.FRONTEND_ORIGIN}/acharya-logo.png`,
    dancersUrl: `${env.FRONTEND_ORIGIN}/dandiya-dancers.png`
  };

  if (job.type !== "PAYMENT_APPROVED" || !job.registrationId) {
    return base;
  }

  const credential = await prisma.passCredential.findUnique({
    where: { registrationId: job.registrationId }
  });
  if (!credential || !credential.active || credential.revokedAt) {
    return base;
  }

  const qrPayload = deriveSignedCredentialToken(env.QR_SECRET, credential.id);
  const qrImageDataUrl = await QRCode.toDataURL(qrPayload, { errorCorrectionLevel: "M", margin: 1, width: 400 });

  return { ...base, qrImageDataUrl };
}

export async function processEmailJob(
  prisma: PrismaClient,
  env: Env,
  job: EmailJob,
  sender: EmailSender
): Promise<"sent" | "retry" | "failed"> {
  const assets = await buildAssets(prisma, env, job);
  const { subject, html } = renderEmailTemplate(job.type, job.payloadJson as Record<string, unknown>, assets);

  try {
    const result = await sender({ to: job.recipient, subject, html });
    await markEmailJobSent(prisma, job.id, result.providerMessageId);
    return "sent";
  } catch (error) {
    const attempts = job.attempts + 1;
    const message = error instanceof Error ? error.message : String(error);
    const isPermanent = error instanceof BrevoPermanentError;

    if (isPermanent || attempts >= MAX_ATTEMPTS) {
      await markEmailJobFailed(prisma, job.id, attempts, message);
      return "failed";
    }

    await markEmailJobRetry(prisma, job.id, attempts, message);
    return "retry";
  }
}
