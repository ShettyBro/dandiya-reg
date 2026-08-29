import { describe, expect, it } from "vitest";
import request from "supertest";
import type { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app/create-app.js";
import { loadEnv, resetEnvCacheForTests } from "../src/app/config/env.js";
import { testEnv } from "./helpers/test-env.js";

const fakePrisma = {} as PrismaClient;

describe("GET /api/v1/health", () => {
  it("returns 200 ok", async () => {
    resetEnvCacheForTests();
    const env = loadEnv(testEnv());
    const app = createApp(env, fakePrisma);

    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});

describe("GET /api/v1/unknown-route", () => {
  it("returns 404 with standard error envelope", async () => {
    resetEnvCacheForTests();
    const env = loadEnv(testEnv());
    const app = createApp(env, fakePrisma);

    const response = await request(app).get("/api/v1/unknown-route");

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("NOT_FOUND");
  });
});
