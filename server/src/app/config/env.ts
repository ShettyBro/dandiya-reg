import { z } from "zod";

function optionalNonEmpty() {
  return z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    z.string().min(1).optional()
  );
}

function optionalEmail() {
  return z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    z.string().email().optional()
  );
}

function optionalUrl() {
  return z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    z.string().url().optional()
  );
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),

  R2_ACCOUNT_ID: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),
  R2_ENDPOINT: z.string().url(),
  R2_ACCESS_KEY_ID: optionalNonEmpty(),
  R2_SECRET_ACCESS_KEY: optionalNonEmpty(),
  R2_PRESIGN_UPLOAD_TTL: z.coerce.number().int().positive().default(300),
  R2_PRESIGN_READ_TTL: z.coerce.number().int().positive().default(900),

  BREVO_API_KEY: optionalNonEmpty(),
  BREVO_SENDER_EMAIL: optionalEmail(),
  BREVO_SENDER_NAME: z.string().min(1).default("Dandiya Night"),

  GMAIL_CLIENT_ID: optionalNonEmpty(),
  GMAIL_CLIENT_SECRET: optionalNonEmpty(),
  GMAIL_REFRESH_TOKEN: optionalNonEmpty(),
  GMAIL_SENDER: optionalEmail(),
  GMAIL_SENDER_NAME: z.string().min(1).default("Dandiya Night"),

  EVENT_ID: z.string().min(1),
  ERP_PAYMENT_URL: optionalUrl(),

  FRONTEND_ORIGIN: z.string().url(),
  // This backend's own public origin (e.g. https://dandiya-api1.sudeepbro.in), used to build a
  // first-party QR code image URL for outgoing email. Optional and falls back to the previous
  // third-party QR renderer when unset, so deploying this before the env var is actually set in
  // Railway is a safe no-op, not a regression.
  API_ORIGIN: optionalUrl(),
  CORS_ORIGINS: z.string().min(1),

  SESSION_SECRET: z.string().min(32),
  QR_SECRET: z.string().min(32),

  // Lowered from 10/15s/1500ms after a large resend wave tripped Gmail's "User-rate limit
  // exceeded (Mail sending)" 429 repeatedly -- that burst limit is about sustained send rate, not
  // just daily volume, and ~20/min was enough to trigger it. These are conservative defaults for
  // a backlog-draining scenario; can be raised again once sustained sending proves stable.
  EMAIL_WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(5),
  EMAIL_WORKER_INTERVAL_MS: z.coerce.number().int().positive().default(15000),
  // Deliberate pacing between individual sends within a batch -- protects a freshly created
  // sending identity (no history) from looking like a spam burst during a large wave of approvals.
  // 0 disables pacing entirely (e.g. for an established provider where this doesn't matter).
  EMAIL_SEND_THROTTLE_MS: z.coerce.number().int().nonnegative().default(3000)
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function resetEnvCacheForTests(): void {
  cachedEnv = undefined;
}
