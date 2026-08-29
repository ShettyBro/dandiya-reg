import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app/create-app.js";
import { loadEnv, resetEnvCacheForTests } from "../src/app/config/env.js";
import { hashPassword } from "../src/lib/security/password.js";

const prisma = new PrismaClient();

const TEST_EMAIL = `test-auth-${Date.now()}@acharya.ac.in`;
const TEST_PASSWORD = "correct horse battery staple";
const DISABLED_EMAIL = `test-disabled-${Date.now()}@acharya.ac.in`;

resetEnvCacheForTests();
const env = loadEnv(process.env);
const app = createApp(env, prisma);

function extractCookie(setCookieHeader: string[] | undefined, name: string): string | undefined {
  const line = setCookieHeader?.find((entry) => entry.startsWith(`${name}=`));
  return line?.split(";")[0]?.split("=")[1];
}

beforeAll(async () => {
  const passwordHash = await hashPassword(TEST_PASSWORD);

  await prisma.user.create({
    data: { email: TEST_EMAIL, passwordHash, role: "VOLUNTEER", status: "ACTIVE" }
  });

  await prisma.user.create({
    data: { email: DISABLED_EMAIL, passwordHash, role: "VOLUNTEER", status: "DISABLED" }
  });
});

afterAll(async () => {
  await prisma.refreshToken.deleteMany({
    where: { user: { email: { in: [TEST_EMAIL, DISABLED_EMAIL] } } }
  });
  await prisma.auditLog.deleteMany({
    where: { actorUser: { email: { in: [TEST_EMAIL, DISABLED_EMAIL] } } }
  });
  await prisma.user.deleteMany({ where: { email: { in: [TEST_EMAIL, DISABLED_EMAIL] } } });
  await prisma.$disconnect();
});

describe("auth flow", () => {
  it("rejects an unknown email", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@acharya.ac.in", password: "whatever" });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects a disabled account even with the correct password", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: DISABLED_EMAIL, password: TEST_PASSWORD });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("ACCOUNT_DISABLED");
  });

  it("logs in with correct credentials and sets auth cookies", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.role).toBe("VOLUNTEER");

    const setCookie = response.headers["set-cookie"] as unknown as string[];
    expect(extractCookie(setCookie, "access_token")).toBeTruthy();
    expect(extractCookie(setCookie, "refresh_token")).toBeTruthy();
    expect(extractCookie(setCookie, "csrf_token")).toBeTruthy();
  });

  it("rejects access to a protected route without a session", async () => {
    const response = await request(app).get("/api/v1/auth/me");
    expect(response.status).toBe(401);
  });

  it("allows access to a protected route with a valid session", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    const setCookie = login.headers["set-cookie"] as unknown as string[];

    const response = await request(app).get("/api/v1/auth/me").set("Cookie", setCookie);

    expect(response.status).toBe(200);
    expect(response.body.role).toBe("VOLUNTEER");
  });

  it("rejects a state-changing request with a missing CSRF header", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    const setCookie = login.headers["set-cookie"] as unknown as string[];

    const response = await request(app).post("/api/v1/auth/logout").set("Cookie", setCookie);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("CSRF_REJECTED");
  });

  it("logs out successfully with a matching CSRF header and revokes the refresh token", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    const setCookie = login.headers["set-cookie"] as unknown as string[];
    const csrfToken = extractCookie(setCookie, "csrf_token");
    const refreshToken = extractCookie(setCookie, "refresh_token");

    const logoutResponse = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", setCookie)
      .set("X-CSRF-Token", csrfToken ?? "");

    expect(logoutResponse.status).toBe(204);

    const refreshResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", [`refresh_token=${refreshToken}`]);

    expect(refreshResponse.status).toBe(401);
  });

  it("rotates the refresh token on /auth/refresh", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    const setCookie = login.headers["set-cookie"] as unknown as string[];

    const refreshResponse = await request(app).post("/api/v1/auth/refresh").set("Cookie", setCookie);

    expect(refreshResponse.status).toBe(200);
    const newSetCookie = refreshResponse.headers["set-cookie"] as unknown as string[];
    expect(extractCookie(newSetCookie, "access_token")).toBeTruthy();
    expect(extractCookie(newSetCookie, "refresh_token")).toBeTruthy();
  });
});
