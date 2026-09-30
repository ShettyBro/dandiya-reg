import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { sendError } from "../../app/middleware/errors.js";
import { stringParam } from "../../app/middleware/params.js";
import { getR2Client, R2NotConfiguredError } from "../../lib/r2/client.js";
import { presignGetUrl } from "../../lib/r2/presign.js";
import { publicLookupRateLimiter } from "../../lib/security/rate-limit.js";
import {
  buildPassData,
  findRegistrationByAnyCode,
  PassNotAvailableError,
  RegistrationNotFoundError
} from "./pass.service.js";
import type { Env } from "../../app/config/env.js";

const lookupSchema = z.object({
  code: z.string().trim().min(4).max(20)
});

export function createPassRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();

  router.post("/pass/lookup", publicLookupRateLimiter, async (req, res) => {
    const parsed = lookupSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(req, res, 400, "VALIDATION_ERROR", "Invalid lookup payload", parsed.error.flatten());
      return;
    }

    const registration = await findRegistrationByAnyCode(prisma, parsed.data.code);
    if (!registration) {
      sendError(req, res, 404, "NOT_FOUND", "No registration found for that code");
      return;
    }

    res.status(200).json({
      registrationId: registration.id,
      eligible: registration.status === "PAYMENT_APPROVED",
      status: registration.status
    });
  });

  router.get("/pass/:registrationId", publicLookupRateLimiter, async (req, res) => {
    const registrationId = stringParam(req.params.registrationId);
    const code = stringParam(req.query.code as string | string[] | undefined);

    if (!registrationId || !code) {
      sendError(req, res, 400, "VALIDATION_ERROR", "registrationId and code are both required");
      return;
    }

    try {
      const registration = await prisma.registration.findUnique({ where: { id: registrationId } });
      if (!registration || (registration.publicCode !== code && registration.eightDigitCode !== code)) {
        sendError(req, res, 404, "NOT_FOUND", "No matching registration for that code");
        return;
      }

      const pass = await buildPassData(prisma, env, registrationId, async (objectKey) => {
        try {
          const client = getR2Client(env);
          return await presignGetUrl(client, env.R2_BUCKET_NAME, objectKey, env.R2_PRESIGN_READ_TTL);
        } catch (error) {
          if (error instanceof R2NotConfiguredError) {
            return null;
          }
          throw error;
        }
      });

      res.status(200).json(pass);
    } catch (error) {
      if (error instanceof RegistrationNotFoundError) {
        sendError(req, res, 404, "NOT_FOUND", "Registration not found");
        return;
      }
      if (error instanceof PassNotAvailableError) {
        sendError(req, res, 409, "PASS_NOT_AVAILABLE", "Pass is not available until payment is approved");
        return;
      }
      throw error;
    }
  });

  return router;
}
