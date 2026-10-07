import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import QRCode from "qrcode";
import { sendError } from "../../app/middleware/errors.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { requireActiveUser } from "../auth/require-active-user.middleware.js";
import { qrDownloadLookupRateLimiter, qrDownloadUnlockRateLimiter } from "../../lib/security/rate-limit.js";
import { getCurrentAccessCode, verifyAccessCode } from "../../lib/qr-download/access-code.js";
import {
  issueQrDownloadSessionToken,
  verifyQrDownloadSessionToken,
  QR_DOWNLOAD_SESSION_TTL_SECONDS
} from "../../lib/qr-download/session-token.js";
import { buildQrDownloadPdf } from "../../lib/qr-download/pdf.js";
import { deriveSignedCredentialToken } from "../../lib/qr/credential.js";
import { normalizeIndianPhone, INDIAN_PHONE_REGEX } from "../../lib/security/phone.js";
import type { Env } from "../../app/config/env.js";

async function findApprovedRegistrationByPhone(prisma: PrismaClient, phone: string) {
  return prisma.registration.findFirst({
    where: { phone },
    orderBy: { createdAt: "desc" }
  });
}

// Static assets served by the frontend (same URLs the confirmation email embeds) — each fetched
// once per process and cached in memory rather than re-fetched on every PDF request.
const assetCache = new Map<string, Buffer | null>();

async function getStaticAsset(env: Env, path: string): Promise<Buffer | null> {
  if (assetCache.has(path)) return assetCache.get(path) ?? null;
  let buffer: Buffer | null = null;
  try {
    const response = await fetch(`${env.FRONTEND_ORIGIN}${path}`);
    if (response.ok) {
      buffer = Buffer.from(await response.arrayBuffer());
    }
  } catch {
    buffer = null;
  }
  assetCache.set(path, buffer);
  return buffer;
}

export function createQrDownloadRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();

  router.get(
    "/admin/qr-download/current-code",
    requireAuth(env),
    requireRole("ADMIN", "TEAM_LEADER"),
    requireActiveUser(prisma),
    (_req, res) => {
      const { code, secondsRemaining } = getCurrentAccessCode(env.QR_DOWNLOAD_SECRET);
      res.status(200).json({ code, secondsRemaining });
    }
  );

  const unlockSchema = z.object({ accessCode: z.string().trim().min(1).max(12) });

  router.post("/qr-download/unlock", qrDownloadUnlockRateLimiter, (req, res) => {
    const parsed = unlockSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(req, res, 400, "VALIDATION_ERROR", "Invalid access code payload", parsed.error.flatten());
      return;
    }

    if (!verifyAccessCode(env.QR_DOWNLOAD_SECRET, parsed.data.accessCode)) {
      sendError(req, res, 401, "INVALID_ACCESS_CODE", "That code is incorrect or has expired");
      return;
    }

    const sessionToken = issueQrDownloadSessionToken(env.QR_DOWNLOAD_SECRET);
    res.status(200).json({ sessionToken, expiresInSeconds: QR_DOWNLOAD_SESSION_TTL_SECONDS });
  });

  const lookupSchema = z.object({
    sessionToken: z.string().trim().min(1),
    phone: z.string().trim().min(1).max(20)
  });

  router.post("/qr-download/lookup", qrDownloadLookupRateLimiter, async (req, res) => {
    const parsed = lookupSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(req, res, 400, "VALIDATION_ERROR", "Invalid lookup payload", parsed.error.flatten());
      return;
    }

    if (!verifyQrDownloadSessionToken(parsed.data.sessionToken, env.QR_DOWNLOAD_SECRET)) {
      sendError(req, res, 401, "SESSION_EXPIRED", "Your session has expired. Enter the current code again.");
      return;
    }

    const normalized = normalizeIndianPhone(parsed.data.phone);
    if (!INDIAN_PHONE_REGEX.test(normalized)) {
      sendError(req, res, 400, "INVALID_PHONE", "Enter a valid 10-digit Indian mobile number");
      return;
    }

    const registration = await findApprovedRegistrationByPhone(prisma, normalized);
    if (!registration) {
      sendError(req, res, 404, "NOT_FOUND", "No registration found for that phone number");
      return;
    }

    if (registration.status !== "PAYMENT_APPROVED") {
      res.status(200).json({ found: true, ready: false, status: registration.status, name: null, publicCode: null });
      return;
    }

    const credential = await prisma.passCredential.findUnique({ where: { registrationId: registration.id } });
    if (!credential || !credential.active || credential.revokedAt) {
      res.status(200).json({ found: true, ready: false, status: registration.status, name: null, publicCode: null });
      return;
    }

    res.status(200).json({
      found: true,
      ready: true,
      status: registration.status,
      name: registration.name,
      publicCode: registration.publicCode
    });
  });

  const pdfQuerySchema = z.object({
    sessionToken: z.string().trim().min(1),
    phone: z.string().trim().min(1).max(20)
  });

  router.get("/qr-download/pdf", qrDownloadLookupRateLimiter, async (req, res) => {
    const parsed = pdfQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(req, res, 400, "VALIDATION_ERROR", "Invalid request", parsed.error.flatten());
      return;
    }

    if (!verifyQrDownloadSessionToken(parsed.data.sessionToken, env.QR_DOWNLOAD_SECRET)) {
      sendError(req, res, 401, "SESSION_EXPIRED", "Your session has expired. Enter the current code again.");
      return;
    }

    const normalized = normalizeIndianPhone(parsed.data.phone);
    if (!INDIAN_PHONE_REGEX.test(normalized)) {
      sendError(req, res, 400, "INVALID_PHONE", "Enter a valid 10-digit Indian mobile number");
      return;
    }

    const registration = await findApprovedRegistrationByPhone(prisma, normalized);
    if (!registration || registration.status !== "PAYMENT_APPROVED") {
      sendError(req, res, 404, "NOT_FOUND", "No registration found for that phone number");
      return;
    }

    const credential = await prisma.passCredential.findUnique({ where: { registrationId: registration.id } });
    if (!credential || !credential.active || credential.revokedAt) {
      sendError(req, res, 409, "NOT_AVAILABLE", "This registration's QR code is not currently available");
      return;
    }

    const qrPayload = deriveSignedCredentialToken(env.QR_SECRET, credential.id);
    const qrPngBuffer = await QRCode.toBuffer(qrPayload, { errorCorrectionLevel: "M", margin: 1, width: 400 });
    const [logoImageBuffer, backgroundImageBuffer] = await Promise.all([
      getStaticAsset(env, "/acharya-logo.png"),
      getStaticAsset(env, "/dandiya-dancers.png")
    ]);

    const pdfBuffer = await buildQrDownloadPdf({
      name: registration.name,
      publicCode: registration.publicCode,
      qrPngBuffer,
      logoImageBuffer,
      backgroundImageBuffer
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="dandiya-qr-${registration.publicCode}.pdf"`);
    res.status(200).send(pdfBuffer);
  });

  return router;
}
