import type { CredentialType, PrismaClient } from "@prisma/client";
import { hashCredentialToken } from "../../lib/qr/credential.js";
import { recordAuditLog } from "../audit/audit.service.js";

export class CredentialNotFoundError extends Error {}
export class AlreadyEnteredError extends Error {}
export class NotYetEnteredError extends Error {}

export interface ScanLookupResult {
  credentialType: CredentialType;
  registrationId: string | null;
  name: string | null;
  publicCode: string | null;
  photoObjectKey: string | null;
  attendanceState: "NOT_ENTERED" | "ENTERED" | "OVERRIDE_ENTRY" | null;
  eligibleForAllow: boolean;
  eligibleForOverride: boolean;
}

export async function lookupCredential(prisma: PrismaClient, rawToken: string): Promise<ScanLookupResult> {
  const tokenHash = hashCredentialToken(rawToken);
  const credential = await prisma.passCredential.findUnique({
    where: { opaqueTokenHash: tokenHash },
    include: { registration: { include: { attendance: true } } }
  });

  if (!credential || !credential.active || credential.revokedAt) {
    throw new CredentialNotFoundError();
  }

  if (credential.credentialType === "STAFF_GUEST_ADMIN") {
    return {
      credentialType: "STAFF_GUEST_ADMIN",
      registrationId: null,
      name: credential.label,
      publicCode: null,
      photoObjectKey: null,
      attendanceState: null,
      eligibleForAllow: true,
      eligibleForOverride: false
    };
  }

  const registration = credential.registration;
  const attendance = registration?.attendance;
  if (!registration || !attendance) {
    throw new CredentialNotFoundError();
  }

  return {
    credentialType: "PARTICIPANT",
    registrationId: registration.id,
    name: registration.name,
    publicCode: registration.publicCode,
    photoObjectKey: registration.photoObjectKey,
    attendanceState: attendance.state,
    eligibleForAllow: attendance.state === "NOT_ENTERED",
    eligibleForOverride: attendance.state === "ENTERED" || attendance.state === "OVERRIDE_ENTRY"
  };
}

export interface AllowEntryParams {
  rawToken: string;
  scannerUserId: string;
  gate?: string | undefined;
  requestId: string | null;
}

export type AllowEntryResult =
  | { type: "STAFF_GUEST_ADMIN"; label: string | null }
  | { type: "PARTICIPANT"; registrationId: string; name: string };

export async function allowEntry(prisma: PrismaClient, params: AllowEntryParams): Promise<AllowEntryResult> {
  const tokenHash = hashCredentialToken(params.rawToken);
  const credential = await prisma.passCredential.findUnique({
    where: { opaqueTokenHash: tokenHash },
    include: { registration: true }
  });

  if (!credential || !credential.active || credential.revokedAt) {
    throw new CredentialNotFoundError();
  }

  if (credential.credentialType === "STAFF_GUEST_ADMIN") {
    await recordAuditLog(prisma, {
      actorUserId: params.scannerUserId,
      action: "STAFF_ENTRY_ALLOWED",
      entityType: "PassCredential",
      entityId: credential.id,
      metadata: { gate: params.gate ?? null },
      requestId: params.requestId
    });
    return { type: "STAFF_GUEST_ADMIN", label: credential.label };
  }

  const registration = credential.registration;
  if (!registration) {
    throw new CredentialNotFoundError();
  }

  const result = await prisma.attendance.updateMany({
    where: { registrationId: registration.id, state: "NOT_ENTERED" },
    data: {
      state: "ENTERED",
      entryCount: { increment: 1 },
      firstEntryAt: new Date(),
      lastEntryAt: new Date(),
      lastScannerUserId: params.scannerUserId,
      lastGate: params.gate ?? null
    }
  });

  if (result.count !== 1) {
    throw new AlreadyEnteredError();
  }

  return { type: "PARTICIPANT", registrationId: registration.id, name: registration.name };
}

export interface OverrideEntryParams {
  rawToken: string;
  teamLeaderUserId: string;
  reasonText: string;
  gate?: string | undefined;
  requestId: string | null;
}

export async function overrideEntry(
  prisma: PrismaClient,
  params: OverrideEntryParams
): Promise<{ registrationId: string; name: string }> {
  const tokenHash = hashCredentialToken(params.rawToken);
  const credential = await prisma.passCredential.findUnique({
    where: { opaqueTokenHash: tokenHash },
    include: { registration: { include: { attendance: true } } }
  });

  if (!credential || !credential.active || credential.revokedAt || credential.credentialType !== "PARTICIPANT") {
    throw new CredentialNotFoundError();
  }

  const registration = credential.registration;
  const attendance = registration?.attendance;
  if (!registration || !attendance) {
    throw new CredentialNotFoundError();
  }

  if (attendance.state === "NOT_ENTERED") {
    throw new NotYetEnteredError();
  }

  const originalState = attendance.state;

  await prisma.$transaction(async (tx) => {
    const result = await tx.attendance.updateMany({
      where: { registrationId: registration.id, state: { in: ["ENTERED", "OVERRIDE_ENTRY"] } },
      data: {
        state: "OVERRIDE_ENTRY",
        entryCount: { increment: 1 },
        lastEntryAt: new Date(),
        lastScannerUserId: params.teamLeaderUserId,
        lastGate: params.gate ?? null
      }
    });

    if (result.count !== 1) {
      throw new NotYetEnteredError();
    }

    await tx.attendanceOverride.create({
      data: {
        registrationId: registration.id,
        teamLeaderUserId: params.teamLeaderUserId,
        reasonText: params.reasonText,
        originalState
      }
    });

    await recordAuditLog(tx, {
      actorUserId: params.teamLeaderUserId,
      action: "ATTENDANCE_OVERRIDE",
      entityType: "Registration",
      entityId: registration.id,
      metadata: { reason: params.reasonText, originalState, gate: params.gate ?? null },
      requestId: params.requestId
    });
  });

  return { registrationId: registration.id, name: registration.name };
}
