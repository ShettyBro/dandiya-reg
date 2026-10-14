import type { PrismaClient } from "@prisma/client";

const MAX_ROWS = 500;
// Trim on roughly every Nth write rather than every single one -- a DELETE on every log line
// would be wasteful, and losing a short burst of overflow between trims is harmless for a log view.
const TRIM_EVERY = 20;
let writesSinceTrim = 0;

// Fire-and-forget by design: a logging failure must never interrupt the worker's actual job
// (sending emails, cleaning up registrations). Errors here are swallowed, not surfaced.
export function logToDb(prisma: PrismaClient, level: "info" | "error", message: string): void {
  prisma.workerLogEntry
    .create({ data: { level, message } })
    .then(async () => {
      writesSinceTrim += 1;
      if (writesSinceTrim < TRIM_EVERY) return;
      writesSinceTrim = 0;
      const rows = await prisma.workerLogEntry.findMany({
        orderBy: { createdAt: "desc" },
        skip: MAX_ROWS,
        select: { id: true },
        take: TRIM_EVERY * 2
      });
      if (rows.length > 0) {
        await prisma.workerLogEntry.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
      }
    })
    .catch(() => undefined);
}
