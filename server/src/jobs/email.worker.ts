import { writeFile } from "node:fs/promises";
import { loadEnv } from "../app/config/env.js";
import { getPrismaClient } from "../db/client.js";
import { createBrevoSender } from "../lib/brevo/client.js";
import { createGmailSender } from "../lib/gmail/client.js";
import type { EmailSender } from "../lib/email/errors.js";
import { claimDueEmailJobs } from "../modules/email/email-outbox.service.js";
import { processEmailJob } from "../modules/email/email-processor.js";
import { cleanupIncompleteRegistrations } from "../modules/registration/registration-cleanup.service.js";

const env = loadEnv();
const prisma = getPrismaClient();

// Gmail is the primary provider now (Google Workspace, 2000/day) -- Brevo only stays as an
// automatic fallback for the window between deploying this code and actually adding the GMAIL_*
// variables to this service's environment, so the worker never goes fully silent mid-switch.
// Whichever is picked, the durable EmailJob queue in Neon is untouched by this choice -- nothing
// already queued is lost or needs replaying, it just gets picked up by whichever sender is live.
let sender: EmailSender;
let providerName: string;
if (env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN && env.GMAIL_SENDER) {
  sender = createGmailSender(env);
  providerName = "gmail";
} else {
  sender = createBrevoSender(env);
  providerName = "brevo (GMAIL_* not configured yet)";
}

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
