import type { EmailJob, PrismaClient } from "@prisma/client";

const LEASE_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 30 * 1000;
const MAX_BACKOFF_MS = 15 * 60 * 1000;

export async function claimDueEmailJobs(prisma: PrismaClient, batchSize: number): Promise<EmailJob[]> {
  return prisma.$queryRaw<EmailJob[]>`
    UPDATE email_jobs
    SET status = 'PROCESSING', "lockedUntil" = now() + (${LEASE_MS}::text || ' milliseconds')::interval
    WHERE id IN (
      SELECT id FROM email_jobs
      WHERE status IN ('PENDING', 'RETRY', 'PROCESSING')
        AND "nextAttemptAt" <= now()
        AND ("lockedUntil" IS NULL OR "lockedUntil" < now())
      ORDER BY "nextAttemptAt" ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `;
}

export function computeBackoffMs(attempts: number): number {
  const exponential = BASE_BACKOFF_MS * 2 ** Math.max(attempts - 1, 0);
  return Math.min(exponential, MAX_BACKOFF_MS);
}

export async function markEmailJobSent(
  prisma: PrismaClient,
  jobId: string,
  providerMessageId: string
): Promise<void> {
  await prisma.emailJob.update({
    where: { id: jobId },
    data: { status: "SENT", sentAt: new Date(), providerMessageId, lockedUntil: null }
  });
}

export async function markEmailJobRetry(
  prisma: PrismaClient,
  jobId: string,
  attempts: number,
  lastError: string
): Promise<void> {
  await prisma.emailJob.update({
    where: { id: jobId },
    data: {
      status: "RETRY",
      attempts,
      nextAttemptAt: new Date(Date.now() + computeBackoffMs(attempts)),
      lastError,
      lockedUntil: null
    }
  });
}

export async function markEmailJobFailed(
  prisma: PrismaClient,
  jobId: string,
  attempts: number,
  lastError: string
): Promise<void> {
  await prisma.emailJob.update({
    where: { id: jobId },
    data: { status: "FAILED", attempts, lastError, lockedUntil: null }
  });
}

export { MAX_ATTEMPTS };
