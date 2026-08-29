import { describe, expect, it } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app/create-app.js";
import { loadEnv, resetEnvCacheForTests } from "../src/app/config/env.js";

const prisma = new PrismaClient();

resetEnvCacheForTests();
const env = loadEnv(process.env);
const app = createApp(env, prisma);

describe("rate limiting", () => {
  it("blocks login attempts after exceeding the configured limit", async () => {
    let sawTooManyRequests = false;

    for (let i = 0; i < 15; i += 1) {
      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "rate-limit-probe@acharya.ac.in", password: "wrong-password" });

      if (response.status === 429) {
        sawTooManyRequests = true;
        break;
      }
    }

    expect(sawTooManyRequests).toBe(true);
  });
});
