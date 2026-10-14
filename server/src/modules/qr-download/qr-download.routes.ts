import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import QRCode from "qrcode";
import { sendError } from "../../app/middleware/errors.js";
import { qrDownloadLookupRateLimiter } from "../../lib/security/rate-limit.js";
import { buildQrDownloadPdf, getStaticAsset } from "../../lib/qr-download/pdf.js";
import { deriveSignedCredentialToken } from "../../lib/qr/credential.js";
import { normalizeIndianPhone, INDIAN_PHONE_REGEX } from "../../lib/security/phone.js";
import type { Env } from "../../app/config/env.js";

// No access code, no session — this page exists to be scanned at the entry gate and used
// immediately by anyone who already knows one piece of their own registration info. The lookup
// itself is the only gate: you need to already know your phone, email, registration code, or AUID.
async function findApprovedRegistrationByIdentifier(prisma: PrismaClient, identifier: string) {
  const trimmed = identifier.trim();
  const normalizedPhone = normalizeIndianPhone(trimmed);
  const isValidPhone = INDIAN_PHONE_REGEX.test(normalizedPhone);

  return prisma.registration.findFirst({
    where: {
      OR: [
        ...(isValidPhone ? [{ phone: normalizedPhone }] : []),
        { email: { equals: trimmed, mode: "insensitive" as const } },
        { publicCode: { equals: trimmed, mode: "insensitive" as const } },
        { auid: { equals: trimmed, mode: "insensitive" as const } }
      ]
    },
    orderBy: { createdAt: "desc" }
  });
}

export function createQrDownloadRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();

  const lookupSchema = z.object({ identifier: z.string().trim().min(3).max(200) });

  router.post("/qr-download/lookup", qrDownloadLookupRateLimiter, async (req, res) => {
    const parsed = lookupSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(req, res, 400, "VALIDATION_ERROR", "Enter your phone, email, registration code, or AUID", parsed.error.flatten());
      return;
    }

    const registration = await findApprovedRegistrationByIdentifier(prisma, parsed.data.identifier);
    if (!registration) {
      sendError(req, res, 404, "NOT_FOUND", "No registration found for that phone, email, registration code, or AUID");
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

  const pdfQuerySchema = z.object({ identifier: z.string().trim().min(3).max(200) });

  router.get("/qr-download/pdf", qrDownloadLookupRateLimiter, async (req, res) => {
    const parsed = pdfQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(req, res, 400, "VALIDATION_ERROR", "Invalid request", parsed.error.flatten());
      return;
    }

    const registration = await findApprovedRegistrationByIdentifier(prisma, parsed.data.identifier);
    if (!registration || registration.status !== "PAYMENT_APPROVED") {
      sendError(req, res, 404, "NOT_FOUND", "No registration found for that phone, email, registration code, or AUID");
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
