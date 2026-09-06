import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { pinoHttp } from "pino-http";
import pino from "pino";
import type { PrismaClient } from "@prisma/client";
import { logRingBufferStream } from "../lib/log-stream.js";
import { healthRouter } from "../modules/health/health.routes.js";
import { createAuthRouter } from "../modules/auth/auth.routes.js";
import { createEventRouter } from "../modules/event/event.routes.js";
import { createRegistrationRouter } from "../modules/registration/registration.routes.js";
import { createIdentityRouter } from "../modules/registration/identity.routes.js";
import { createUploadsRouter } from "../modules/uploads/uploads.routes.js";
import { createPaymentRouter } from "../modules/payments/payment.routes.js";
import { createPassRouter } from "../modules/pass/pass.routes.js";
import { createAttendanceRouter } from "../modules/attendance/attendance.routes.js";
import { createDashboardRouter } from "../modules/admin/dashboard.routes.js";
import { createAdminRegistrationsRouter } from "../modules/admin/registrations.routes.js";
import { createAdminSettingsRouter } from "../modules/admin/settings.routes.js";
import { createAdminCredentialsRouter } from "../modules/admin/credentials.routes.js";
import { createAdminLogsRouter } from "../modules/admin/logs.routes.js";
import { createAdminSystemRouter } from "../modules/admin/system.routes.js";
import { createVolunteerRouter } from "../modules/volunteers/volunteer.routes.js";
import { createExportsRouter } from "../modules/exports/exports.routes.js";
import { createAuditLogRouter } from "../modules/audit/audit.routes.js";
import type { Env } from "./config/env.js";

export function createApp(env: Env, prisma: PrismaClient): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS.split(",").map((origin) => origin.trim()),
      credentials: true
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use(
    pinoHttp({
      genReqId: (req) => req.headers["x-request-id"]?.toString() ?? randomUUID(),
      redact: ["req.headers.authorization", "req.headers.cookie"],
      level: env.NODE_ENV === "test" ? "silent" : "info",
      stream: pino.multistream([{ stream: process.stdout }, { stream: logRingBufferStream }])
    })
  );

  app.use("/api/v1", healthRouter);
  app.use("/api/v1", createAuthRouter(prisma, env));
  app.use("/api/v1", createEventRouter(prisma, env));
  app.use("/api/v1", createRegistrationRouter(prisma, env));
  app.use("/api/v1", createIdentityRouter(prisma, env));
  app.use("/api/v1", createUploadsRouter(prisma, env));
  app.use("/api/v1", createPaymentRouter(prisma, env));
  app.use("/api/v1", createPassRouter(prisma, env));
  app.use("/api/v1", createAttendanceRouter(prisma, env));
  app.use("/api/v1", createDashboardRouter(prisma, env));
  app.use("/api/v1", createAdminRegistrationsRouter(prisma, env));
  app.use("/api/v1", createAdminSettingsRouter(prisma, env));
  app.use("/api/v1", createAdminCredentialsRouter(prisma, env));
  app.use("/api/v1", createAdminLogsRouter(prisma, env));
  app.use("/api/v1", createAdminSystemRouter(prisma, env));
  app.use("/api/v1", createVolunteerRouter(prisma, env));
  app.use("/api/v1", createExportsRouter(prisma, env));
  app.use("/api/v1", createAuditLogRouter(prisma, env));

  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      code: "NOT_FOUND",
      message: "Route not found",
      details: null,
      requestId: res.getHeader("x-request-id") ?? null
    });
  });

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    req.log?.error({ err }, "unhandled error");
    res.status(500).json({
      code: "INTERNAL_ERROR",
      message: "Unexpected server error",
      details: null,
      requestId: req.id ?? null
    });
  });

  return app;
}
