export function testEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    PORT: "3000",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/dandiya_test",
    R2_ACCOUNT_ID: "test-account",
    R2_BUCKET_NAME: "test-bucket",
    R2_ENDPOINT: "https://test-account.r2.cloudflarestorage.com",
    EVENT_ID: "test-event",
    FRONTEND_ORIGIN: "https://dandiya.example.com",
    CORS_ORIGINS: "https://dandiya.example.com",
    SESSION_SECRET: "a".repeat(32),
    QR_SECRET: "b".repeat(32),
    ...overrides
  };
}
