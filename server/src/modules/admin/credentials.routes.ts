import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import QRCode from "qrcode";
import { z } from "zod";
import { sendError } from "../../app/middleware/errors.js";
import { stringParam } from "../../app/middleware/params.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { requireActiveUser } from "../auth/require-active-user.middleware.js";
import { deriveSignedCredentialToken, hashCredentialToken, newCredentialId } from "../../lib/qr/credential.js";
import { recordAuditLog } from "../audit/audit.service.js";
import type { Env } from "../../app/config/env.js";

const createSchema = z.object({
  label: z.string().trim().min(2).max(120)
});

export function createAdminCredentialsRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();

  router.get(
    "/admin/credentials",
    requireAuth(env),
    requireRole("ADMIN"),
    requireActiveUser(prisma),
    async (_req, res) => {
      const credentials = await prisma.passCredential.findMany({
        where: { credentialType: "STAFF_GUEST_ADMIN" },
        orderBy: { createdAt: "desc" }
      });
      res.status(200).json({ items: credentials });
    }
  );

  router.post(
    "/admin/credentials",
    requireAuth(env),
    requireRole("ADMIN"),
    requireActiveUser(prisma),
    async (req, res) => {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success || !req.authUser) {
        sendError(req, res, 400, "VALIDATION_ERROR", "Invalid credential payload", parsed.error?.flatten());
        return;
      }

      const credentialId = newCredentialId();
      const token = deriveSignedCredentialToken(env.QR_SECRET, credentialId);
      const credential = await prisma.passCredential.create({
        data: {
          id: credentialId,
          credentialType: "STAFF_GUEST_ADMIN",
          opaqueTokenHash: hashCredentialToken(token),
          active: true,
          label: parsed.data.label
        }
      });

      await recordAuditLog(prisma, {
        actorUserId: req.authUser.id,
        action: "STAFF_CREDENTIAL_CREATED",
        entityType: "PassCredential",
        entityId: credential.id,
        requestId: req.id !== undefined ? String(req.id) : null
      });

      const qrImageDataUrl = await QRCode.toDataURL(token, { errorCorrectionLevel: "M", margin: 1, width: 320 });
      res.status(201).json({ id: credential.id, label: credential.label, qrPayload: token, qrImageDataUrl });
    }
  );

  router.get(
    "/admin/credentials/:id/qr",
    requireAuth(env),
    requireRole("ADMIN"),
    requireActiveUser(prisma),
    async (req, res) => {
      const credentialId = stringParam(req.params.id);
      const credential = credentialId
        ? await prisma.passCredential.findUnique({ where: { id: credentialId } })
        : null;
      if (!credential || credential.credentialType !== "STAFF_GUEST_ADMIN") {
        sendError(req, res, 404, "NOT_FOUND", "Credential not found");
        return;
      }
      if (!credential.active || credential.revokedAt) {
        sendError(req, res, 409, "CREDENTIAL_REVOKED", "This credential has been revoked");
        return;
      }

      const token = deriveSignedCredentialToken(env.QR_SECRET, credential.id);
      const qrImageDataUrl = await QRCode.toDataURL(token, { errorCorrectionLevel: "M", margin: 1, width: 320 });
      res.status(200).json({ id: credential.id, label: credential.label, qrPayload: token, qrImageDataUrl });
    }
  );

  router.post(
    "/admin/credentials/:id/revoke",
    requireAuth(env),
    requireRole("ADMIN"),
    requireActiveUser(prisma),
    async (req, res) => {
      const credentialId = stringParam(req.params.id);
      if (!credentialId || !req.authUser) {
        sendError(req, res, 400, "VALIDATION_ERROR", "Missing credential id");
        return;
      }

      const result = await prisma.passCredential.updateMany({
        where: { id: credentialId, credentialType: "STAFF_GUEST_ADMIN", active: true },
        data: { active: false, revokedAt: new Date() }
      });

      if (result.count !== 1) {
        sendError(req, res, 404, "NOT_FOUND", "Credential not found or already revoked");
        return;
      }

      await recordAuditLog(prisma, {
        actorUserId: req.authUser.id,
        action: "STAFF_CREDENTIAL_REVOKED",
        entityType: "PassCredential",
        entityId: credentialId,
        requestId: req.id !== undefined ? String(req.id) : null
      });

      res.status(200).json({ revoked: true });
    }
  );

  return router;
}
