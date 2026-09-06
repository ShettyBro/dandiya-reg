import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { sendError } from "../../app/middleware/errors.js";
import { uploadPresignRateLimiter } from "../../lib/security/rate-limit.js";
import { getR2Client, R2NotConfiguredError } from "../../lib/r2/client.js";
import { presignPutUrl } from "../../lib/r2/presign.js";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  extensionForMime,
  maxSizeForPurpose,
  objectKeyForPurpose
} from "../../lib/r2/object-keys.js";
import type { Env } from "../../app/config/env.js";

const presignSchema = z.object({
  registrationId: z.string().uuid(),
  purpose: z.enum(["PARTICIPANT_PHOTO", "PAYMENT_PROOF", "AADHAAR_IMAGE", "COLLEGE_ID_IMAGE"]),
  contentType: z.enum(ALLOWED_IMAGE_MIME_TYPES as [string, ...string[]])
});

export function createUploadsRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();

  router.post("/uploads/presign", uploadPresignRateLimiter, async (req, res) => {
    const parsed = presignSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(req, res, 400, "VALIDATION_ERROR", "Invalid presign request", parsed.error.flatten());
      return;
    }

    const registration = await prisma.registration.findUnique({
      where: { id: parsed.data.registrationId }
    });
    if (!registration) {
      sendError(req, res, 404, "NOT_FOUND", "Registration not found");
      return;
    }

    const extension = extensionForMime(parsed.data.contentType);
    if (!extension) {
      sendError(req, res, 400, "VALIDATION_ERROR", "Unsupported content type");
      return;
    }

    const objectKey = objectKeyForPurpose(parsed.data.purpose, registration.id, extension);
    const maxSizeBytes = maxSizeForPurpose(parsed.data.purpose);
    const expiresAt = new Date(Date.now() + env.R2_PRESIGN_UPLOAD_TTL * 1000);

    try {
      const client = getR2Client(env);
      const uploadUrl = await presignPutUrl(
        client,
        env.R2_BUCKET_NAME,
        objectKey,
        parsed.data.contentType,
        env.R2_PRESIGN_UPLOAD_TTL
      );

      await prisma.uploadIntent.create({
        data: {
          registrationId: registration.id,
          purpose: parsed.data.purpose,
          objectKey,
          expectedMime: parsed.data.contentType,
          maxSizeBytes,
          expiresAt
        }
      });

      res.status(200).json({ uploadUrl, objectKey, expiresAt });
    } catch (error) {
      if (error instanceof R2NotConfiguredError) {
        sendError(req, res, 503, "R2_NOT_CONFIGURED", "Object storage is not configured yet");
        return;
      }
      throw error;
    }
  });

  return router;
}
