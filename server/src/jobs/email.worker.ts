import { writeFile } from "node:fs/promises";
import { loadEnv } from "../app/config/env.js";
import { getPrismaClient } from "../db/client.js";
import { createBrevoSender } from "../lib/brevo/client.js";
import { claimDueEmailJobs } from "../modules/email/email-outbox.service.js";
import { processEmailJob } from "../modules/email/email-processor.js";
import { cleanupIncompleteRegistrations } from "../modules/registration/registration-cleanup.service.js";

const env = loadEnv();
const prisma = getPrismaClient();
const sender = createBrevoSender(env);

const HEARTBEAT_PATH = process.env.WORKER_HEARTBEAT_PATH ?? "/tmp/dandiya-worker-heartbeat";

let stopping = false;

async function writeHeartbeat(): Promise<void> {
  await writeFile(HEARTBEAT_PATH, String(Date.now())).catch(() => undefined);
}

async function runOnce(): Promise<void> {
  const jobs = await claimDueEmailJobs(prisma, env.EMAIL_WORKER_BATCH_SIZE);
  for (const job of jobs) {
    const outcome = await processEmailJob(prisma, env, job, sender);
    console.log(`email job ${job.id} (${job.type}) -> ${outcome}`);
  }

  const cleared = await cleanupIncompleteRegistrations(prisma, env);
  if (cleared > 0) {
    console.log(`cleared ${cleared} incomplete registration(s)`);
  }

  await writeHeartbeat();
}

async function loop(): Promise<void> {
  while (!stopping) {
    try {
      await runOnce();
    } catch (error) {
      console.error("email worker batch failed:", error instanceof Error ? error.message : "unknown error");
    }
    await new Promise((resolve) => setTimeout(resolve, env.EMAIL_WORKER_INTERVAL_MS));
  }
}

console.log(
  `dandiya-email-worker starting (batch=${env.EMAIL_WORKER_BATCH_SIZE}, interval=${env.EMAIL_WORKER_INTERVAL_MS}ms)`
);

writeHeartbeat();

loop().catch((error: unknown) => {
  console.error("email worker crashed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
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
