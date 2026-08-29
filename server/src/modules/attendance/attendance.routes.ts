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
  lookupCredential,
  NotYetEnteredError,
  overrideEntry
} from "./attendance.service.js";
import type { Env } from "../../app/config/env.js";

const tokenSchema = z.object({
  token: z.string().min(1)
});

const allowSchema = z.object({
  token: z.string().min(1),
  gate: z.string().trim().max(60).optional()
});

const overrideSchema = z.object({
  token: z.string().min(1),
  reason: z.string().trim().min(5).max(300),
  gate: z.string().trim().max(60).optional()
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
      if (!parsed.success) {
        sendError(req, res, 400, "VALIDATION_ERROR", "Invalid scan payload", parsed.error.flatten());
        return;
      }

      try {
        const result = await lookupCredential(prisma, parsed.data.token);

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
        const result = await allowEntry(prisma, {
          rawToken: parsed.data.token,
          scannerUserId: req.authUser.id,
          gate: parsed.data.gate,
          requestId: req.id !== undefined ? String(req.id) : null
        });
        res.status(200).json({ allowed: true, ...result });
      } catch (error) {
        if (error instanceof CredentialNotFoundError) {
          sendError(req, res, 404, "CREDENTIAL_NOT_FOUND", "No active credential matches this code");
          return;
        }
        if (error instanceof AlreadyEnteredError) {
          sendError(req, res, 409, "ALREADY_ENTERED", "This participant has already entered");
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
        const result = await overrideEntry(prisma, {
          rawToken: parsed.data.token,
          teamLeaderUserId: req.authUser.id,
          reasonText: parsed.data.reason,
          gate: parsed.data.gate,
          requestId: req.id !== undefined ? String(req.id) : null
        });
        res.status(200).json({ allowed: true, overridden: true, ...result });
      } catch (error) {
        if (error instanceof CredentialNotFoundError) {
          sendError(req, res, 404, "CREDENTIAL_NOT_FOUND", "No active credential matches this code");
          return;
        }
        if (error instanceof NotYetEnteredError) {
          sendError(req, res, 409, "NOT_YET_ENTERED", "This participant has not entered yet; use normal allow-entry instead");
          return;
        }
        throw error;
      }
    }
  );

  return router;
}
