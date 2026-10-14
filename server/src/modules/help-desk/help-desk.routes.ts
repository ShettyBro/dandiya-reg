import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { sendError } from "../../app/middleware/errors.js";
import { stringParam } from "../../app/middleware/params.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { requireActiveUser } from "../auth/require-active-user.middleware.js";
import { publicLookupRateLimiter } from "../../lib/security/rate-limit.js";
import {
  getHelpDeskRegistrationDetail,
  HelpDeskRegistrationNotFoundError,
  searchErpTransactions,
  searchRegistrationsForHelpDesk
} from "./help-desk.service.js";
import type { Env } from "../../app/config/env.js";

const searchQuerySchema = z.object({ q: z.string().trim().min(1).max(200) });

export function createHelpDeskRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();

  router.get(
    "/help-desk/search",
    requireAuth(env),
    requireRole("HELP_DESK", "ADMIN"),
    requireActiveUser(prisma),
    publicLookupRateLimiter,
    async (req, res) => {
      const parsed = searchQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        sendError(req, res, 400, "VALIDATION_ERROR", "Enter a name, phone, email, AUID, or registration code");
        return;
      }

      const items = await searchRegistrationsForHelpDesk(prisma, parsed.data.q);
      res.status(200).json({ items });
    }
  );

  router.get(
    "/help-desk/erp-search",
    requireAuth(env),
    requireRole("HELP_DESK", "ADMIN"),
    requireActiveUser(prisma),
    publicLookupRateLimiter,
    async (req, res) => {
      const parsed = searchQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        sendError(req, res, 400, "VALIDATION_ERROR", "Enter a transaction ID, phone, name, or email");
        return;
      }

      const items = await searchErpTransactions(prisma, parsed.data.q);
      res.status(200).json({ items });
    }
  );

  router.get(
    "/help-desk/registrations/:id",
    requireAuth(env),
    requireRole("HELP_DESK", "ADMIN"),
    requireActiveUser(prisma),
    async (req, res) => {
      const registrationId = stringParam(req.params.id);
      if (!registrationId) {
        sendError(req, res, 400, "VALIDATION_ERROR", "Missing registration id");
        return;
      }

      try {
        const detail = await getHelpDeskRegistrationDetail(prisma, env, registrationId);
        res.status(200).json(detail);
      } catch (error) {
        if (error instanceof HelpDeskRegistrationNotFoundError) {
          sendError(req, res, 404, "NOT_FOUND", "Registration not found");
          return;
        }
        throw error;
      }
    }
  );

  return router;
}
