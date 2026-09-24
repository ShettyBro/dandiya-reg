import type { CredentialType, Gate, PrismaClient, UserRole } from "@prisma/client";
import { hashCredentialToken } from "../../lib/qr/credential.js";
import { recordAuditLog } from "../audit/audit.service.js";
import type { Env } from "../../app/config/env.js";

export class CredentialNotFoundError extends Error {}
export class AlreadyEnteredError extends Error {}
export class NotYetEnteredError extends Error {}
export class OutsideEntryWindowError extends Error {}
export class GateNotAssignedError extends Error {}

type SingleGateState = "NOT_ENTERED" | "ENTERED" | "OVERRIDE_ENTRY";

/**
 * Resolves which gate a scan/allow/override request applies to. Server-authoritative: a normal
 * VOLUNTEER can only ever act on their own admin-assigned gate — any client-supplied gate is
 * ignored for that role. A TEAM_LEADER may explicitly act on either gate (override authority is
 * required to exist at both gates regardless of the TL's own assignment), falling back to their
 * own assignment when no gate is explicitly requested.
 */
export async function resolveEffectiveGate(
  prisma: PrismaClient,
  scannerUserId: string,
  scannerRole: UserRole,
  requestedGate: Gate | undefined
): Promise<Gate> {
  if (scannerRole === "TEAM_LEADER" && requestedGate) {
    return requestedGate;
  }

  const profile = await prisma.volunteerProfile.findUnique({ where: { userId: scannerUserId } });
  if (!profile?.assignedGate) {
    throw new GateNotAssignedError();
  }
  return profile.assignedGate;
}

export interface ScanLookupResult {
  credentialType: CredentialType;
  registrationId: string | null;
  name: string | null;
  publicCode: string | null;
  photoObjectKey: string | null;
  gate: Gate | null;
  attendanceState: SingleGateState | null;
  eligibleForAllow: boolean;
  eligibleForOverride: boolean;
}

export async function lookupCredential(
  prisma: PrismaClient,
  rawToken: string,
  gate: Gate | null
): Promise<ScanLookupResult> {
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
      publicCode: credential.publicCode,
      photoObjectKey: null,
      gate,
      attendanceState: null,
      eligibleForAllow: true,
      eligibleForOverride: false
    };
  }

  const registration = credential.registration;
  const attendance = registration?.attendance;
  if (!registration || !attendance || !gate) {
    throw new CredentialNotFoundError();
  }

  const state: SingleGateState = gate === "COLLEGE_GATE" ? attendance.collegeGateState : attendance.eventGateState;

  return {
    credentialType: "PARTICIPANT",
    registrationId: registration.id,
    name: registration.name,
    publicCode: registration.publicCode,
    photoObjectKey: registration.photoObjectKey,
    gate,
    attendanceState: state,
    eligibleForAllow: state === "NOT_ENTERED",
    eligibleForOverride: state === "ENTERED" || state === "OVERRIDE_ENTRY"
  };
}

export interface AllowEntryParams {
  rawToken: string;
  scannerUserId: string;
  gate: Gate;
  requestId: string | null;
}

export type AllowEntryResult =
  | { type: "STAFF_GUEST_ADMIN"; label: string | null }
  | { type: "PARTICIPANT"; registrationId: string; name: string };

export async function allowEntry(
  prisma: PrismaClient,
  env: Env,
  params: AllowEntryParams
): Promise<AllowEntryResult> {
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
      metadata: { gate: params.gate },
      requestId: params.requestId
    });
    return { type: "STAFF_GUEST_ADMIN", label: credential.label };
  }

  const registration = credential.registration;
  if (!registration) {
    throw new CredentialNotFoundError();
  }

  const event = await prisma.event.findUniqueOrThrow({ where: { id: env.EVENT_ID } });
  const now = Date.now();
  const entryStarted = now >= event.eventDate.getTime();
  const gateStillOpen = !event.gateClosesAt || now <= event.gateClosesAt.getTime();
  if (!entryStarted || !gateStillOpen) {
    throw new OutsideEntryWindowError();
  }

  const now2 = new Date();
  const result =
    params.gate === "COLLEGE_GATE"
      ? await prisma.attendance.updateMany({
          where: { registrationId: registration.id, collegeGateState: "NOT_ENTERED" },
          data: {
            collegeGateState: "ENTERED",
            collegeGateEntryCount: { increment: 1 },
            collegeGateFirstEntryAt: now2,
            collegeGateLastEntryAt: now2,
            collegeGateLastScannerUserId: params.scannerUserId
          }
        })
      : await prisma.attendance.updateMany({
          where: { registrationId: registration.id, eventGateState: "NOT_ENTERED" },
          data: {
            eventGateState: "ENTERED",
            eventGateEntryCount: { increment: 1 },
            eventGateFirstEntryAt: now2,
            eventGateLastEntryAt: now2,
            eventGateLastScannerUserId: params.scannerUserId
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
  gate: Gate;
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

  const currentState: SingleGateState =
    params.gate === "COLLEGE_GATE" ? attendance.collegeGateState : attendance.eventGateState;

  if (currentState === "NOT_ENTERED") {
    throw new NotYetEnteredError();
  }

  const originalState = currentState;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const result =
      params.gate === "COLLEGE_GATE"
        ? await tx.attendance.updateMany({
            where: { registrationId: registration.id, collegeGateState: { in: ["ENTERED", "OVERRIDE_ENTRY"] } },
            data: {
              collegeGateState: "OVERRIDE_ENTRY",
              collegeGateEntryCount: { increment: 1 },
              collegeGateLastEntryAt: now,
              collegeGateLastScannerUserId: params.teamLeaderUserId
            }
          })
        : await tx.attendance.updateMany({
            where: { registrationId: registration.id, eventGateState: { in: ["ENTERED", "OVERRIDE_ENTRY"] } },
            data: {
              eventGateState: "OVERRIDE_ENTRY",
              eventGateEntryCount: { increment: 1 },
              eventGateLastEntryAt: now,
              eventGateLastScannerUserId: params.teamLeaderUserId
            }
          });

    if (result.count !== 1) {
      throw new NotYetEnteredError();
    }

    await tx.attendanceOverride.create({
      data: {
        registrationId: registration.id,
        teamLeaderUserId: params.teamLeaderUserId,
        gate: params.gate,
        reasonText: params.reasonText,
        originalState
      }
    });

    await recordAuditLog(tx, {
      actorUserId: params.teamLeaderUserId,
      action: "ATTENDANCE_OVERRIDE",
      entityType: "Registration",
      entityId: registration.id,
      metadata: { reason: params.reasonText, originalState, gate: params.gate },
      requestId: params.requestId
    });
  });

  return { registrationId: registration.id, name: registration.name };
}
