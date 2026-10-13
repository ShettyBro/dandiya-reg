import { describe, expect, it } from "vitest";
import { DAILY_SEND_QUOTA_PATTERN } from "../src/lib/gmail/client.js";

describe("DAILY_SEND_QUOTA_PATTERN", () => {
  it("matches Gmail's documented daily-sending-cap error signatures", () => {
    const shouldMatch = [
      "550 5.4.5 Daily user sending limit exceeded",
      "550-5.4.5 Daily user sending limit exceeded",
      "429 User-rate limit exceeded (Mail sending)",
      "Gmail transient error (HTTP 429): Daily user sending quota exceeded for this user."
    ];
    for (const message of shouldMatch) {
      expect(message, message).toMatch(DAILY_SEND_QUOTA_PATTERN);
    }
  });

  it("does NOT match unrelated/short-lived errors that should use normal backoff instead", () => {
    const shouldNotMatch = [
      "403 userRateLimitExceeded", // short per-minute burst limit, not the daily cap
      "403 dailyLimitExceeded", // GCP project API-quota concept, unrelated to mailbox send cap
      "401 invalid_grant: Token has been expired or revoked",
      "500 Internal error encountered",
      "400 Invalid To header"
    ];
    for (const message of shouldNotMatch) {
      expect(message, message).not.toMatch(DAILY_SEND_QUOTA_PATTERN);
    }
  });
});
