import type { EmailJob, PrismaClient } from "@prisma/client";

const LEASE_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 30 * 1000;
const MAX_BACKOFF_MS = 15 * 60 * 1000;
// Google documents the daily sending cap as a rolling window with no fixed reset time (not
// "resets at midnight") -- so there's no reliable moment to schedule a single retry for. Instead,
// just keep checking back on a fixed cadence indefinitely.
const QUOTA_RETRY_MS = 12 * 60 * 60 * 1000;

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

// Deliberately does NOT take or increment `attempts` -- a quota-exceeded hit must never count
// toward MAX_ATTEMPTS and must never be able to land the job in FAILED. It just keeps getting
// re-queued 12 hours out, indefinitely, until a send actually succeeds (or some other, unrelated
// error eventually occurs and goes through the normal retry/fail path instead).
export async function markEmailJobQuotaRetry(prisma: PrismaClient, jobId: string, lastError: string): Promise<void> {
  await prisma.emailJob.update({
    where: { id: jobId },
    data: {
      status: "RETRY",
      nextAttemptAt: new Date(Date.now() + QUOTA_RETRY_MS),
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
