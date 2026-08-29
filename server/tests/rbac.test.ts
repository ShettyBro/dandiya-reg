import { describe, expect, it } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { requireAuth, requireRole } from "../src/modules/auth/auth.middleware.js";
import { signAccessToken } from "../src/lib/security/tokens.js";
import { loadEnv, resetEnvCacheForTests } from "../src/app/config/env.js";
import { testEnv } from "./helpers/test-env.js";

resetEnvCacheForTests();
const env = loadEnv(testEnv());

function buildTestApp() {
  const app = express();
  app.use(cookieParser());
  app.get(
    "/finance-only",
    requireAuth(env),
    requireRole("FINANCE", "ADMIN"),
    (_req, res) => res.status(200).json({ ok: true })
  );
  return app;
}

describe("RBAC middleware", () => {
  it("blocks a role that is not in the allowed list", async () => {
    const app = buildTestApp();
    const token = signAccessToken({ sub: "user-1", role: "VOLUNTEER" }, env.SESSION_SECRET);

    const response = await request(app).get("/finance-only").set("Cookie", [`access_token=${token}`]);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN");
  });

  it("allows a role that is in the allowed list", async () => {
    const app = buildTestApp();
    const token = signAccessToken({ sub: "user-2", role: "FINANCE" }, env.SESSION_SECRET);

    const response = await request(app).get("/finance-only").set("Cookie", [`access_token=${token}`]);

    expect(response.status).toBe(200);
  });

  it("rejects a tampered access token", async () => {
    const app = buildTestApp();

    const response = await request(app)
      .get("/finance-only")
      .set("Cookie", ["access_token=not-a-real-token"]);

    expect(response.status).toBe(401);
  });
});
