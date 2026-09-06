import { describe, expect, it } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app/create-app.js";
import { loadEnv, resetEnvCacheForTests } from "../src/app/config/env.js";

const prisma = new PrismaClient();

resetEnvCacheForTests();
const env = loadEnv(process.env);
const app = createApp(env, prisma);

describe("trust proxy configuration", () => {
  it("does not crash a rate-limited route when X-Forwarded-For is present, as it would through Caddy in production", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", "203.0.113.5")
      .send({ email: "nonexistent@test.com", password: "wrong" });

    // Must be a real auth response (401 invalid credentials / 429 rate-limited), never a 500 —
    // express-rate-limit v7 throws a hard ValidationError here if `trust proxy` isn't configured,
    // which every route behind Caddy hits in production (Caddy always adds X-Forwarded-For).
    expect(response.status).not.toBe(500);
  });
});
