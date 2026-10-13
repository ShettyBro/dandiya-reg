import type { EmailJob, PrismaClient } from "@prisma/client";
import { EmailPermanentError, type EmailSender } from "../../lib/email/errors.js";
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
    return base;
  }

  // A plain externally-hosted URL, not a data: URI — Brevo does not support CID-embedded images
  // in transactional emails, and several real inboxes (confirmed: Gmail's mobile app) silently
  // strip embedded base64 images entirely, leaving a blank box where the QR should be.
  //
  // Rendered by OUR OWN /qr-image.png endpoint when API_ORIGIN is configured, not the third-party
  // api.qrserver.com service used previously — confirmed by direct A/B testing that a QR code
  // image hosted on an unfamiliar third-party domain gets the whole email silently dropped (no
  // bounce, not even spam) by at least one major recipient mail system, while the identical email
  // with the QR code removed delivers fine. Falls back to the third-party service if API_ORIGIN
  // isn't set yet, so deploying this ahead of setting that env var is a safe no-op.
  const qrPayload = deriveSignedCredentialToken(env.QR_SECRET, credentialId);
  const qrImageUrl = env.API_ORIGIN
    ? `${env.API_ORIGIN}/api/v1/qr-image.png?data=${encodeURIComponent(qrPayload)}`
    : `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=10&data=${encodeURIComponent(qrPayload)}`;

  return { ...base, qrImageUrl };
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
    const isPermanent = error instanceof EmailPermanentError;

    if (isPermanent || attempts >= MAX_ATTEMPTS) {
      await markEmailJobFailed(prisma, job.id, attempts, message);
      return "failed";
    }

    await markEmailJobRetry(prisma, job.id, attempts, message);
    return "retry";
  }
}
