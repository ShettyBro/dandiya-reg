import type { Prisma, PrismaClient } from "@prisma/client";

export type AuditCapablePrisma = PrismaClient | Prisma.TransactionClient;

export interface AuditEntry {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
}

export async function recordAuditLog(prisma: AuditCapablePrisma, entry: AuditEntry): Promise<void> {
  const data: Parameters<PrismaClient["auditLog"]["create"]>[0]["data"] = {
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    requestId: entry.requestId ?? null
  };

  if (entry.metadata) {
    data.metadataJson = entry.metadata as Prisma.InputJsonValue;
  }

  await prisma.auditLog.create({ data });
}
