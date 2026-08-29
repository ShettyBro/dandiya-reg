import { describe, expect, it } from "vitest";
import { loadEnv, resetEnvCacheForTests } from "../src/app/config/env.js";
import { testEnv } from "./helpers/test-env.js";

describe("loadEnv", () => {
  it("throws when required variables are missing", () => {
    resetEnvCacheForTests();
    expect(() => loadEnv({})).toThrow(/Invalid environment configuration/);
  });

  it("parses and applies defaults when required variables are present", () => {
    resetEnvCacheForTests();
    const env = loadEnv(testEnv());

    expect(env.PORT).toBe(3000);
    expect(env.R2_PRESIGN_UPLOAD_TTL).toBe(300);
    expect(env.R2_PRESIGN_READ_TTL).toBe(900);
    expect(env.EMAIL_WORKER_BATCH_SIZE).toBe(10);
  });

  it("succeeds even when R2/Brevo/ERP secrets are not yet configured", () => {
    resetEnvCacheForTests();
    const env = loadEnv(testEnv());

    expect(env.R2_ACCESS_KEY_ID).toBeUndefined();
    expect(env.BREVO_API_KEY).toBeUndefined();
    expect(env.ERP_PAYMENT_URL).toBeUndefined();
  });

  it("rejects an invalid BREVO_SENDER_EMAIL when one is actually provided", () => {
    resetEnvCacheForTests();
    expect(() => loadEnv(testEnv({ BREVO_SENDER_EMAIL: "not-an-email" }))).toThrow(
      /Invalid environment configuration/
    );
  });
});
