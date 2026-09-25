import { Prisma, PrismaClient } from "@prisma/client";

let prisma: PrismaClient | undefined;

// Neon's serverless Postgres can auto-suspend its compute when idle and take a couple of seconds
// to wake back up on the next connection — during that window Prisma surfaces P1001 ("Can't reach
// database server") or P1017 ("Server has closed the connection"), which would otherwise become a
// 500 a real user sees as "server not reachable" for what's actually a transient few-second blip,
// not an outage. Retrying the connection attempt a couple of times rides through that window
// transparently. Safe to retry for both reads and writes: these codes mean the connection itself
// could not be established/was lost, so nothing executed server-side to duplicate.
const RETRYABLE_ERROR_CODES = new Set(["P1001", "P1017"]);
const RETRY_DELAYS_MS = [300, 900];

function isRetryableError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && RETRYABLE_ERROR_CODES.has(error.code);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createPrismaClientWithRetries(): PrismaClient {
  const client = new PrismaClient();
  return client.$extends({
    query: {
      async $allOperations({ args, query }) {
        for (let attempt = 0; ; attempt += 1) {
          try {
            return await query(args);
          } catch (error) {
            const delayMs = RETRY_DELAYS_MS[attempt];
            if (delayMs === undefined || !isRetryableError(error)) {
              throw error;
            }
            await delay(delayMs);
          }
        }
      }
    }
  }) as unknown as PrismaClient;
}

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = createPrismaClientWithRetries();
  }
  return prisma;
}
