import { writeFile } from "node:fs/promises";
import { loadEnv } from "../app/config/env.js";
import { getPrismaClient } from "../db/client.js";
import { createGmailSender } from "../lib/gmail/client.js";
import { claimDueEmailJobs } from "../modules/email/email-outbox.service.js";
import { processEmailJob } from "../modules/email/email-processor.js";
import { cleanupIncompleteRegistrations } from "../modules/registration/registration-cleanup.service.js";

const env = loadEnv();
const prisma = getPrismaClient();

// Gmail (Google Workspace) is the sole email provider -- a deliberate decision, not a fallback
// arrangement. Previously this silently fell back to Brevo whenever GMAIL_* wasn't configured,
// which meant a misconfiguration could switch providers without anyone noticing. Fail loudly
// instead: a broken Gmail config should surface immediately, not quietly reroute through a
// different provider with its own separate deliverability history.
if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REFRESH_TOKEN || !env.GMAIL_SENDER) {
  throw new Error(
    "GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN / GMAIL_SENDER must all be configured -- Gmail is the only email provider now, there is no fallback."
  );
}
const sender = createGmailSender(env);
const providerName = "gmail";

const HEARTBEAT_PATH = process.env.WORKER_HEARTBEAT_PATH ?? "/tmp/dandiya-worker-heartbeat";

// Runs on its own fixed 15-minute cadence, independent of EMAIL_WORKER_INTERVAL_MS -- a phone/
// email/AUID lock on an incomplete registration is advertised to users as releasing "after 15
// minutes", so the check has to happen roughly that often regardless of how infrequently the
// email-send loop is tuned for DB-cost reasons (e.g. 45 minutes).
const REGISTRATION_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

let stopping = false;

async function writeHeartbeat(): Promise<void> {
  await writeFile(HEARTBEAT_PATH, String(Date.now())).catch(() => undefined);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runEmailBatch(): Promise<void> {
  const jobs = await claimDueEmailJobs(prisma, env.EMAIL_WORKER_BATCH_SIZE);
  for (const [i, job] of jobs.entries()) {
    const outcome = await processEmailJob(prisma, env, job, sender);
    console.log(`email job ${job.id} (${job.type}) -> ${outcome}`);

    // Deliberate pacing between individual sends, not just between batches -- a brand-new sending
    // identity (freshly created Workspace mailbox, no history) blasting hundreds of emails back to
    // back in a tight burst is exactly the pattern provider-side abuse detection watches for, and
    // risks a sending suspension right when it matters most (e.g. a large wave of approvals). A
    // steady drip is far safer than raw throughput -- skipped after the last job in a batch so it
    // doesn't needlessly delay the following EMAIL_WORKER_INTERVAL_MS sleep too.
    if (i < jobs.length - 1 && env.EMAIL_SEND_THROTTLE_MS > 0) {
      await sleep(env.EMAIL_SEND_THROTTLE_MS);
    }
  }

  await writeHeartbeat();
}

async function emailLoop(): Promise<void> {
  while (!stopping) {
    try {
      await runEmailBatch();
    } catch (error) {
      console.error("email worker batch failed:", error instanceof Error ? error.message : "unknown error");
    }
    await new Promise((resolve) => setTimeout(resolve, env.EMAIL_WORKER_INTERVAL_MS));
  }
}

async function registrationCleanupLoop(): Promise<void> {
  while (!stopping) {
    try {
      const cleared = await cleanupIncompleteRegistrations(prisma, env);
      if (cleared > 0) {
        console.log(`cleared ${cleared} incomplete registration(s)`);
      }
    } catch (error) {
      console.error(
        "registration cleanup batch failed:",
        error instanceof Error ? error.message : "unknown error"
      );
    }
    await new Promise((resolve) => setTimeout(resolve, REGISTRATION_CLEANUP_INTERVAL_MS));
  }
}

console.log(
  `dandiya-email-worker starting (provider=${providerName}, batch=${env.EMAIL_WORKER_BATCH_SIZE}, email-interval=${env.EMAIL_WORKER_INTERVAL_MS}ms, send-throttle=${env.EMAIL_SEND_THROTTLE_MS}ms, cleanup-interval=${REGISTRATION_CLEANUP_INTERVAL_MS}ms)`
);

writeHeartbeat();

emailLoop().catch((error: unknown) => {
  console.error("email worker crashed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});

registrationCleanupLoop().catch((error: unknown) => {
  console.error("registration cleanup loop crashed:", error instanceof Error ? error.message : "unknown error");
});

function shutdown(signal: string): void {
  console.log(`received ${signal}, shutting down worker`);
  stopping = true;
  prisma
    .$disconnect()
    .catch(() => undefined)
    .finally(() => process.exit(0));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
