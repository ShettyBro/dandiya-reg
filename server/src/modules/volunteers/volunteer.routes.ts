import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { z } from "zod";
import { sendError } from "../../app/middleware/errors.js";
import { stringParam } from "../../app/middleware/params.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { requireActiveUser } from "../auth/require-active-user.middleware.js";
import { recordAuditLog } from "../audit/audit.service.js";
import { deriveSignedCredentialToken } from "../../lib/qr/credential.js";
import { createVolunteer, resetVolunteerPassword, updateVolunteer, VolunteerNotFoundError } from "./volunteer.service.js";
import type { Env } from "../../app/config/env.js";

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().regex(/^[0-9+\-\s]{7,15}$/),
  role: z.enum(["VOLUNTEER", "TEAM_LEADER"]),
  gate: z.string().trim().max(60).optional(),
  zone: z.string().trim().max(60).optional(),
  shiftStart: z.coerce.date().optional(),
  shiftEnd: z.coerce.date().optional()
});

const updateSchema = z.object({
  role: z.enum(["VOLUNTEER", "TEAM_LEADER"]).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  gate: z.string().trim().max(60).nullable().optional(),
  zone: z.string().trim().max(60).nullable().optional(),
  shiftStart: z.coerce.date().nullable().optional(),
  shiftEnd: z.coerce.date().nullable().optional()
});

export function createVolunteerRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();

  router.get(
    "/volunteers/me/pass",
    requireAuth(env),
    requireRole("VOLUNTEER", "TEAM_LEADER"),
    requireActiveUser(prisma),
    async (req, res) => {
      if (!req.authUser) {
        sendError(req, res, 401, "UNAUTHENTICATED", "Missing authenticated user");
        return;
      }

      const profile = await prisma.volunteerProfile.findUnique({ where: { userId: req.authUser.id } });
      const credential = profile?.staffCredentialId
        ? await prisma.passCredential.findUnique({ where: { id: profile.staffCredentialId } })
        : null;

      if (!credential || !credential.active || credential.revokedAt) {
        sendError(req, res, 404, "PASS_NOT_AVAILABLE", "No active staff pass for this account");
        return;
      }

      const qrPayload = deriveSignedCredentialToken(env.QR_SECRET, credential.id);
      const qrImageDataUrl = await QRCode.toDataURL(qrPayload, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 320
      });

      res.status(200).json({
        publicCode: credential.publicCode,
        label: credential.label,
        qrPayload,
        qrImageDataUrl
      });
    }
  );

  router.get(
    "/admin/volunteers",
    requireAuth(env),
    requireRole("ADMIN"),
    requireActiveUser(prisma),
    async (_req, res) => {
      const volunteers = await prisma.user.findMany({
        where: { role: { in: ["VOLUNTEER", "TEAM_LEADER"] } },
        orderBy: { createdAt: "desc" },
        include: { volunteerProfile: true }
      });
      res.status(200).json({ items: volunteers });
    }
  );

  router.post(
    "/admin/volunteers",
    requireAuth(env),
    requireRole("ADMIN"),
    requireActiveUser(prisma),
    async (req, res) => {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success || !req.authUser) {
        sendError(req, res, 400, "VALIDATION_ERROR", "Invalid volunteer payload", parsed.error?.flatten());
        return;
      }

      try {
        const created = await createVolunteer(prisma, env, parsed.data);

        await recordAuditLog(prisma, {
          actorUserId: req.authUser.id,
          action: "VOLUNTEER_CREATED",
          entityType: "User",
          entityId: created.userId,
          requestId: req.id !== undefined ? String(req.id) : null
        });

        res.status(201).json(created);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          sendError(req, res, 409, "EMAIL_ALREADY_EXISTS", "A user with this email already exists");
          return;
        }
        throw error;
      }
    }
  );

  router.patch(
    "/admin/volunteers/:id",
    requireAuth(env),
    requireRole("ADMIN"),
    requireActiveUser(prisma),
    async (req, res) => {
      const parsed = updateSchema.safeParse(req.body);
      const userId = stringParam(req.params.id);
      if (!parsed.success || !userId || !req.authUser) {
        sendError(req, res, 400, "VALIDATION_ERROR", "Invalid volunteer update payload", parsed.error?.flatten());
        return;
      }

      await updateVolunteer(prisma, userId, parsed.data);

      await recordAuditLog(prisma, {
        actorUserId: req.authUser.id,
        action: "VOLUNTEER_UPDATED",
        entityType: "User",
        entityId: userId,
        metadata: parsed.data,
        requestId: req.id !== undefined ? String(req.id) : null
      });

      res.status(200).json({ updated: true });
    }
  );

  router.post(
    "/admin/volunteers/:id/reset-password",
    requireAuth(env),
    requireRole("ADMIN"),
    requireActiveUser(prisma),
    async (req, res) => {
      const userId = stringParam(req.params.id);
      if (!userId || !req.authUser) {
        sendError(req, res, 400, "VALIDATION_ERROR", "Missing volunteer id");
        return;
      }

      try {
        const result = await resetVolunteerPassword(prisma, env, userId);

        await recordAuditLog(prisma, {
          actorUserId: req.authUser.id,
          action: "VOLUNTEER_PASSWORD_RESET",
          entityType: "User",
          entityId: userId,
          requestId: req.id !== undefined ? String(req.id) : null
        });

        res.status(200).json(result);
      } catch (error) {
        if (error instanceof VolunteerNotFoundError) {
          sendError(req, res, 404, "NOT_FOUND", "Volunteer not found");
          return;
        }
        throw error;
      }
    }
  );

  return router;
}
