import type { EmailJob, PrismaClient } from "@prisma/client";
import type { EmailSender } from "../../lib/brevo/client.js";
import { BrevoPermanentError } from "../../lib/brevo/client.js";
import { renderEmailTemplate } from "./templates.js";
import {
  MAX_ATTEMPTS,
  markEmailJobFailed,
  markEmailJobRetry,
  markEmailJobSent
} from "./email-outbox.service.js";

export async function processEmailJob(
  prisma: PrismaClient,
  job: EmailJob,
  sender: EmailSender
): Promise<"sent" | "retry" | "failed"> {
  const { subject, html } = renderEmailTemplate(job.type, job.payloadJson as Record<string, unknown>);

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
