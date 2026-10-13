import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { sendError } from "../../app/middleware/errors.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { requireActiveUser } from "../auth/require-active-user.middleware.js";
import { stringParam } from "../../app/middleware/params.js";
import { getR2Client, R2NotConfiguredError } from "../../lib/r2/client.js";
import { presignGetUrl } from "../../lib/r2/presign.js";
import {
  approveMyPeopleRegistration,
  listMyPeopleRegistrations,
  MyPeopleNotApprovedError,
  MyPeopleNotPendingError,
  MyPeoplePhotoMissingError,
  MyPeopleRegistrationNotFoundError,
  resendMyPeopleApprovalEmail
} from "./my-people.service.js";
import type { Env } from "../../app/config/env.js";

export function createMyPeopleRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();

  router.get(
    "/admin/my-people",
    requireAuth(env),
    requireRole("ADMIN"),
    requireActiveUser(prisma),
    async (_req, res) => {
      const registrations = await listMyPeopleRegistrations(prisma);

      const items = await Promise.all(
        registrations.map(async (registration) => {
          let photoUrl: string | null = null;
          if (registration.photoObjectKey) {
            try {
              const client = getR2Client(env);
              photoUrl = await presignGetUrl(client, env.R2_BUCKET_NAME, registration.photoObjectKey, env.R2_PRESIGN_READ_TTL);
            } catch (error) {
              if (!(error instanceof R2NotConfiguredError)) {
                throw error;
              }
            }
          }

          return {
            id: registration.id,
            name: registration.name,
            phone: registration.phone,
            email: registration.email,
            registrationType: registration.registrationType,
            status: registration.status,
            publicCode: registration.publicCode,
            createdAt: registration.createdAt,
            photoUrl
          };
        })
      );

      res.status(200).json({ items });
    }
  );

  router.post(
    "/admin/my-people/:id/approve",
    requireAuth(env),
    requireRole("ADMIN"),
    requireActiveUser(prisma),
    async (req, res) => {
      const registrationId = stringParam(req.params.id);
      if (!registrationId || !req.authUser) {
        sendError(req, res, 400, "VALIDATION_ERROR", "Missing registration id");
        return;
      }

      try {
        await approveMyPeopleRegistration(
          prisma,
          env,
          registrationId,
          req.authUser.id,
          req.id !== undefined ? String(req.id) : null
        );
        res.status(200).json({ approved: true });
      } catch (error) {
        if (error instanceof MyPeopleRegistrationNotFoundError) {
          sendError(req, res, 404, "NOT_FOUND", "My People registration not found");
          return;
        }
        if (error instanceof MyPeopleNotPendingError) {
          sendError(req, res, 409, "NOT_PENDING", "This registration has already been decided");
          return;
        }
        if (error instanceof MyPeoplePhotoMissingError) {
          sendError(req, res, 409, "PHOTO_MISSING", "This registration's photo is missing or unavailable");
          return;
        }
        throw error;
      }
    }
  );

  router.post(
    "/admin/my-people/:id/resend-email",
    requireAuth(env),
    requireRole("ADMIN"),
    requireActiveUser(prisma),
    async (req, res) => {
      const registrationId = stringParam(req.params.id);
      if (!registrationId || !req.authUser) {
        sendError(req, res, 400, "VALIDATION_ERROR", "Missing registration id");
        return;
      }

      try {
        await resendMyPeopleApprovalEmail(
          prisma,
          registrationId,
          req.authUser.id,
          req.id !== undefined ? String(req.id) : null
        );
        res.status(200).json({ resent: true });
      } catch (error) {
        if (error instanceof MyPeopleRegistrationNotFoundError) {
          sendError(req, res, 404, "NOT_FOUND", "My People registration not found");
          return;
        }
        if (error instanceof MyPeopleNotApprovedError) {
          sendError(req, res, 409, "NOT_APPROVED", "This registration has not been approved yet");
          return;
        }
        throw error;
      }
    }
  );

  return router;
}
