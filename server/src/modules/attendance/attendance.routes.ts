import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { sendError } from "../../app/middleware/errors.js";
import { scanRateLimiter } from "../../lib/security/rate-limit.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { requireActiveUser } from "../auth/require-active-user.middleware.js";
import { getR2Client, R2NotConfiguredError } from "../../lib/r2/client.js";
import { presignGetUrl } from "../../lib/r2/presign.js";
import {
  AlreadyEnteredError,
  allowEntry,
  CredentialNotFoundError,
  GateNotAssignedError,
  lookupCredential,
  NotYetEnteredError,
  OutsideEntryWindowError,
  overrideEntry,
  resolveEffectiveGate
} from "./attendance.service.js";
import type { Env } from "../../app/config/env.js";

const gateSchema = z.enum(["COLLEGE_GATE", "EVENT_GATE"]);

function formatIstTime(date: Date): string {
  return date.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
}

function outsideEntryWindowMessage(error: OutsideEntryWindowError): string {
  const now = Date.now();
  if (now < error.entryOpensAt.getTime()) {
    const opensAt = formatIstTime(error.entryOpensAt);
    const closesText = error.entryClosesAt ? ` and closes at ${formatIstTime(error.entryClosesAt)}` : "";
    return `Entry hasn't opened yet. Normal entry opens at ${opensAt}${closesText} — please scan again during that window.`;
  }
  if (error.entryClosesAt && now > error.entryClosesAt.getTime()) {
    return `The entry window has closed (it ended at ${formatIstTime(error.entryClosesAt)}). Normal entry is no longer allowed.`;
  }
  return "Normal entry is only allowed during the event's entry window.";
}

const tokenSchema = z.object({
  token: z.string().min(1),
  gate: gateSchema.optional()
});

const allowSchema = z.object({
  token: z.string().min(1),
  gate: gateSchema.optional()
});

const overrideSchema = z.object({
  token: z.string().min(1),
  reason: z.string().trim().min(5).max(300),
  gate: gateSchema.optional()
});

export function createAttendanceRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();

  router.post(
    "/scan/lookup",
    scanRateLimiter,
    requireAuth(env),
    requireRole("VOLUNTEER", "TEAM_LEADER"),
    requireActiveUser(prisma),
    async (req, res) => {
      const parsed = tokenSchema.safeParse(req.body);
      if (!parsed.success || !req.authUser) {
        sendError(req, res, 400, "VALIDATION_ERROR", "Invalid scan payload", parsed.error?.flatten());
        return;
      }

      try {
        const gate = await resolveEffectiveGate(prisma, req.authUser.id, req.authUser.role, parsed.data.gate);
        const result = await lookupCredential(prisma, parsed.data.token, gate);

        let photoUrl: string | null = null;
        if (result.photoObjectKey) {
          try {
            const client = getR2Client(env);
            photoUrl = await presignGetUrl(client, env.R2_BUCKET_NAME, result.photoObjectKey, env.R2_PRESIGN_READ_TTL);
          } catch (error) {
            if (!(error instanceof R2NotConfiguredError)) {
              throw error;
            }
          }
        }

        res.status(200).json({ ...result, photoUrl, photoObjectKey: undefined });
      } catch (error) {
        if (error instanceof CredentialNotFoundError) {
          sendError(req, res, 404, "CREDENTIAL_NOT_FOUND", "No active credential matches this code");
          return;
        }
        if (error instanceof GateNotAssignedError) {
          sendError(req, res, 409, "GATE_NOT_ASSIGNED", "No gate has been assigned to your account yet. Contact the admin.");
          return;
        }
        throw error;
      }
    }
  );

  router.post(
    "/scan/allow",
    scanRateLimiter,
    requireAuth(env),
    requireRole("VOLUNTEER", "TEAM_LEADER"),
    requireActiveUser(prisma),
    async (req, res) => {
      const parsed = allowSchema.safeParse(req.body);
      if (!parsed.success || !req.authUser) {
        sendError(req, res, 400, "VALIDATION_ERROR", "Invalid allow-entry payload", parsed.error?.flatten());
        return;
      }

      try {
        const gate = await resolveEffectiveGate(prisma, req.authUser.id, req.authUser.role, parsed.data.gate);
        const result = await allowEntry(prisma, env, {
          rawToken: parsed.data.token,
          scannerUserId: req.authUser.id,
          gate,
          requestId: req.id !== undefined ? String(req.id) : null
        });
        res.status(200).json({ allowed: true, gate, ...result });
      } catch (error) {
        if (error instanceof CredentialNotFoundError) {
          sendError(req, res, 404, "CREDENTIAL_NOT_FOUND", "No active credential matches this code");
          return;
        }
        if (error instanceof AlreadyEnteredError) {
          sendError(req, res, 409, "ALREADY_ENTERED", "This participant has already entered through this gate");
          return;
        }
        if (error instanceof OutsideEntryWindowError) {
          sendError(req, res, 409, "OUTSIDE_ENTRY_WINDOW", outsideEntryWindowMessage(error));
          return;
        }
        if (error instanceof GateNotAssignedError) {
          sendError(req, res, 409, "GATE_NOT_ASSIGNED", "No gate has been assigned to your account yet. Contact the admin.");
          return;
        }
        throw error;
      }
    }
  );

  router.post(
    "/scan/override",
    scanRateLimiter,
    requireAuth(env),
    requireRole("TEAM_LEADER"),
    requireActiveUser(prisma),
    async (req, res) => {
      const parsed = overrideSchema.safeParse(req.body);
      if (!parsed.success || !req.authUser) {
        sendError(req, res, 400, "VALIDATION_ERROR", "A reason of at least 5 characters is required", parsed.error?.flatten());
        return;
      }

      try {
        const gate = await resolveEffectiveGate(prisma, req.authUser.id, req.authUser.role, parsed.data.gate);
        const result = await overrideEntry(prisma, {
          rawToken: parsed.data.token,
          teamLeaderUserId: req.authUser.id,
          reasonText: parsed.data.reason,
          gate,
          requestId: req.id !== undefined ? String(req.id) : null
        });
        res.status(200).json({ allowed: true, overridden: true, gate, ...result });
      } catch (error) {
        if (error instanceof CredentialNotFoundError) {
          sendError(req, res, 404, "CREDENTIAL_NOT_FOUND", "No active credential matches this code");
          return;
        }
        if (error instanceof NotYetEnteredError) {
          sendError(req, res, 409, "NOT_YET_ENTERED", "This participant has not entered through this gate yet; use normal allow-entry instead");
          return;
        }
        if (error instanceof GateNotAssignedError) {
          sendError(req, res, 409, "GATE_NOT_ASSIGNED", "No gate has been assigned to your account yet. Contact the admin.");
          return;
        }
        throw error;
      }
    }
  );

  return router;
}
