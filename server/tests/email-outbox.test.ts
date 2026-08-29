import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { BrevoPermanentError, BrevoTransientError } from "../src/lib/brevo/client.js";
import {
  claimDueEmailJobs,
  computeBackoffMs
} from "../src/modules/email/email-outbox.service.js";
import { processEmailJob } from "../src/modules/email/email-processor.js";

const prisma = new PrismaClient();
const createdJobIds: string[] = [];

async function createJob(overrides: Partial<Parameters<typeof prisma.emailJob.create>[0]["data"]> = {}) {
  const job = await prisma.emailJob.create({
    data: {
      type: "REGISTRATION_RECEIVED",
      recipient: `outbox-${Date.now()}-${Math.random()}@acharya.ac.in`,
      payloadJson: { name: "Test User", publicCode: "DN26-TEST00" },
      uniquenessKey: `outbox-test-${Date.now()}-${Math.random()}`,
      ...overrides
    }
  });
  createdJobIds.push(job.id);
  return job;
}

afterAll(async () => {
  await prisma.emailJob.deleteMany({ where: { id: { in: createdJobIds } } });
  await prisma.$disconnect();
});

describe("computeBackoffMs", () => {
  it("increases with attempts and is capped", () => {
    expect(computeBackoffMs(1)).toBeLessThan(computeBackoffMs(2));
    expect(computeBackoffMs(2)).toBeLessThan(computeBackoffMs(3));
    expect(computeBackoffMs(20)).toBeLessThanOrEqual(15 * 60 * 1000);
  });
});

describe("claimDueEmailJobs", () => {
  it("atomically claims pending jobs and locks them", async () => {
    const job = await createJob();

    const claimed = await claimDueEmailJobs(prisma, 10);
    const claimedIds = claimed.map((j) => j.id);
    expect(claimedIds).toContain(job.id);

    const dbJob = await prisma.emailJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(dbJob.status).toBe("PROCESSING");
    expect(dbJob.lockedUntil).not.toBeNull();
  });

  it("does not reclaim a job whose lease has not expired", async () => {
    const job = await createJob({
      status: "PROCESSING",
      lockedUntil: new Date(Date.now() + 60 * 1000)
    });

    const claimed = await claimDueEmailJobs(prisma, 10);
    expect(claimed.map((j) => j.id)).not.toContain(job.id);
  });

  it("reclaims a job whose lease already expired (crashed-worker recovery)", async () => {
    const job = await createJob({
      status: "PROCESSING",
      lockedUntil: new Date(Date.now() - 60 * 1000)
    });

    const claimed = await claimDueEmailJobs(prisma, 10);
    expect(claimed.map((j) => j.id)).toContain(job.id);
  });
});

describe("processEmailJob", () => {
  it("marks a job SENT when the sender succeeds", async () => {
    const job = await createJob();

    const outcome = await processEmailJob(prisma, job, async () => ({ providerMessageId: "msg-123" }));

    expect(outcome).toBe("sent");
    const dbJob = await prisma.emailJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(dbJob.status).toBe("SENT");
    expect(dbJob.providerMessageId).toBe("msg-123");
  });

  it("marks a job RETRY when Brevo is transiently unavailable", async () => {
    const job = await createJob();

    const outcome = await processEmailJob(prisma, job, async () => {
      throw new BrevoTransientError("Brevo transient error: HTTP 503");
    });

    expect(outcome).toBe("retry");
    const dbJob = await prisma.emailJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(dbJob.status).toBe("RETRY");
    expect(dbJob.attempts).toBe(1);
    expect(dbJob.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(dbJob.lastError).toContain("503");
  });

  it("marks a job FAILED immediately on a permanent Brevo error", async () => {
    const job = await createJob();

    const outcome = await processEmailJob(prisma, job, async () => {
      throw new BrevoPermanentError("Brevo rejected the request: HTTP 400 invalid recipient");
    });

    expect(outcome).toBe("failed");
    const dbJob = await prisma.emailJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(dbJob.status).toBe("FAILED");
  });

  it("marks a job FAILED after exhausting max attempts on repeated transient failures", async () => {
    let job = await createJob({ attempts: 7 });

    const outcome = await processEmailJob(prisma, job, async () => {
      throw new BrevoTransientError("still failing");
    });

    expect(outcome).toBe("failed");
    job = await prisma.emailJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(job.status).toBe("FAILED");
    expect(job.attempts).toBe(8);
  });
});
