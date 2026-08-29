import { S3Client } from "@aws-sdk/client-s3";
import type { Env } from "../../app/config/env.js";

export class R2NotConfiguredError extends Error {
  constructor() {
    super("R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY are not configured");
    this.name = "R2NotConfiguredError";
  }
}

let cachedClient: S3Client | undefined;

export function getR2Client(env: Env): S3Client {
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new R2NotConfiguredError();
  }

  if (!cachedClient) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: env.R2_ENDPOINT,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY
      }
    });
  }

  return cachedClient;
}

export function resetR2ClientForTests(): void {
  cachedClient = undefined;
}
