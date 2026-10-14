import type { EmailJob, PrismaClient } from "@prisma/client";

const LEASE_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 30 * 1000;
const MAX_BACKOFF_MS = 15 * 60 * 1000;
// Google documents the daily sending cap as a rolling window with no fixed reset time (not
// "resets at midnight") -- so there's no reliable moment to schedule a single retry for. Instead,
// just keep checking back on a fixed cadence indefinitely.
const QUOTA_RETRY_MS = 12 * 60 * 60 * 1000;
// Observed in production: Gmail's "User-rate limit exceeded.  Retry after <timestamp> (Mail
// sending)" 429 sets that timestamp to essentially the instant of the request itself, not a real
// future cooldown -- honoring it literally caused an immediate-retry storm identical to the bug
// this was meant to fix, just inside the quota-retry path instead of the transient-retry path. A
// retryAfter closer than this to "now" is treated as Gmail giving no actionable hint at all.
const MIN_MEANINGFUL_RETRY_AFTER_MS = 2 * 60 * 1000;

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
  lastError: string,
  retryAfter?: Date
): Promise<void> {
  // When the provider tells us exactly when it'll accept mail again, that wins over the generic
  // backoff -- retrying sooner just reproduces the same rate-limit error immediately. A small
  // buffer avoids landing exactly on the boundary the provider gave us.
  const backoffNextAttemptAt = new Date(Date.now() + computeBackoffMs(attempts));
  const providerNextAttemptAt = retryAfter ? new Date(retryAfter.getTime() + 5000) : undefined;
  const nextAttemptAt =
    providerNextAttemptAt && providerNextAttemptAt > backoffNextAttemptAt
      ? providerNextAttemptAt
      : backoffNextAttemptAt;

  await prisma.emailJob.update({
    where: { id: jobId },
    data: {
      status: "RETRY",
      attempts,
      nextAttemptAt,
      lastError,
      lockedUntil: null
    }
  });
}

// Deliberately does NOT take or increment `attempts` -- a quota-exceeded hit must never count
// toward MAX_ATTEMPTS and must never be able to land the job in FAILED. It just keeps getting
// re-queued 12 hours out, indefinitely, until a send actually succeeds (or some other, unrelated
// error eventually occurs and goes through the normal retry/fail path instead).
export async function markEmailJobQuotaRetry(
  prisma: PrismaClient,
  jobId: string,
  lastError: string,
  retryAfter?: Date
): Promise<void> {
  // Only trust a provider-given retryAfter when it's meaningfully in the future -- see
  // MIN_MEANINGFUL_RETRY_AFTER_MS above for why a near-"now" value must NOT be honored literally.
  const nextAttemptAt =
    retryAfter && retryAfter.getTime() > Date.now() + MIN_MEANINGFUL_RETRY_AFTER_MS
      ? retryAfter
      : new Date(Date.now() + QUOTA_RETRY_MS);

  await prisma.emailJob.update({
    where: { id: jobId },
    data: {
      status: "RETRY",
      nextAttemptAt,
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
