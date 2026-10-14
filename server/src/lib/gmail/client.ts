import { randomBytes } from "node:crypto";
import { google } from "googleapis";
import type { Env } from "../../app/config/env.js";
import { htmlToPlainText } from "../email/html-to-text.js";
import {
  EmailNotConfiguredError,
  EmailPermanentError,
  EmailQuotaExceededError,
  EmailTransientError,
  type EmailSender,
  type SendEmailInput,
  type SendEmailResult
} from "../email/errors.js";

// Gmail's own documented signatures for "the mailbox's daily sending cap is exhausted" --
// distinct from userRateLimitExceeded/rateLimitExceeded (a short per-minute burst limit that
// resolves on its own within seconds to minutes) and from dailyLimitExceeded (a GCP *project*
// API-quota concept, unrelated to the mailbox's send cap). Matched case-insensitively against
// the raw error message since the googleapis client doesn't expose a stable machine-readable
// reason code for this specific condition.
export const DAILY_SEND_QUOTA_PATTERN =
  /daily user sending (limit|quota)|user-rate limit exceeded \(mail sending\)|550[ -]5\.4\.5/i;

const GMAIL_REQUEST_TIMEOUT_MS = 20000;

function encodeRfc2047(text: string): string {
  // Subject lines go through the raw RFC822 message, not a JSON field like Brevo's API body --
  // non-ASCII characters (the ₹ symbol, names with diacritics) must be MIME-encoded or Gmail's
  // API will reject or mangle the raw message.
  return `=?UTF-8?B?${Buffer.from(text, "utf-8").toString("base64")}?=`;
}

// RFC 2045 recommends wrapping base64 body content at 76 chars/line -- most parsers tolerate
// unwrapped base64, but there's no reason to rely on that tolerance for attachment data.
function wrapBase64(base64: string): string {
  return base64.replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

function buildRawMessage(from: string, input: SendEmailInput): string {
  // A text/plain alternative alongside the HTML is a well-known deliverability signal -- an
  // HTML-only message (no multipart/alternative at all) is a pattern spam filters specifically
  // weight against, and it matters more for a newer sending domain with no reputation yet.
  const altBoundary = `dandiya-alt-${randomBytes(16).toString("hex")}`;
  const text = htmlToPlainText(input.html);

  const alternativePart = [
    `--${altBoundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    // 8bit, not 7bit: the plain-text part can contain real multi-byte UTF-8 (decoded em-dashes,
    // the rupee sign) and names aren't restricted to ASCII -- declaring 7bit while the body
    // isn't is an encoding mismatch that's itself a spam signal. Gmail's API handles 8bit bodies
    // natively, no further encoding needed.
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    "",
    `--${altBoundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.html,
    "",
    `--${altBoundary}--`
  ].join("\r\n");

  const headers = [`From: ${from}`, `To: ${input.to}`, `Subject: ${encodeRfc2047(input.subject)}`, "MIME-Version: 1.0"];

  let message: string;
  if (input.attachments && input.attachments.length > 0) {
    // multipart/mixed wraps the multipart/alternative body as its first part, with each
    // attachment as a sibling part -- the standard structure for "HTML email with attachments".
    const mixedBoundary = `dandiya-mixed-${randomBytes(16).toString("hex")}`;
    const attachmentParts = input.attachments.map((attachment) =>
      [
        `--${mixedBoundary}`,
        `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
        `Content-Disposition: attachment; filename="${attachment.filename}"`,
        "Content-Transfer-Encoding: base64",
        "",
        wrapBase64(attachment.content.toString("base64"))
      ].join("\r\n")
    );

    message = [
      ...headers,
      `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
      "",
      `--${mixedBoundary}`,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      "",
      alternativePart,
      "",
      ...attachmentParts,
      `--${mixedBoundary}--`
    ].join("\r\n");
  } else {
    message = [
      ...headers,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      "",
      alternativePart
    ].join("\r\n");
  }

  return Buffer.from(message, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function createGmailSender(env: Env): EmailSender {
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REFRESH_TOKEN || !env.GMAIL_SENDER) {
    return async () => {
      throw new EmailNotConfiguredError(
        "GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN / GMAIL_SENDER are not configured"
      );
    };
  }

  const oAuth2Client = new google.auth.OAuth2(env.GMAIL_CLIENT_ID, env.GMAIL_CLIENT_SECRET);
  oAuth2Client.setCredentials({ refresh_token: env.GMAIL_REFRESH_TOKEN });
  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

  const from = env.GMAIL_SENDER_NAME ? `${env.GMAIL_SENDER_NAME} <${env.GMAIL_SENDER}>` : env.GMAIL_SENDER;

  return async (input: SendEmailInput): Promise<SendEmailResult> => {
    const raw = buildRawMessage(from, input);

    try {
      const response = await gmail.users.messages.send(
        { userId: "me", requestBody: { raw } },
        { timeout: GMAIL_REQUEST_TIMEOUT_MS }
      );
      return { providerMessageId: response.data.id ?? "unknown" };
    } catch (error) {
      const status = (error as { code?: number; response?: { status?: number } })?.code
        ?? (error as { response?: { status?: number } })?.response?.status;
      const message = error instanceof Error ? error.message : "Unknown Gmail API error";

      if (DAILY_SEND_QUOTA_PATTERN.test(message)) {
        throw new EmailQuotaExceededError(`Gmail daily sending quota exceeded: ${message}`);
      }

      // Gmail API auth failures (expired/revoked refresh token, misconfigured OAuth client) and
      // rate limiting both deserve a retry rather than instantly failing the job -- a token can be
      // re-authorized without losing queued mail, and quota resets on its own. Only a clear
      // client-side rejection (invalid recipient, malformed message) is permanent.
      if (status === 429 || status === 401 || status === 403 || (status !== undefined && status >= 500)) {
        throw new EmailTransientError(`Gmail transient error${status ? ` (HTTP ${status})` : ""}: ${message}`);
      }
      if (status !== undefined && status >= 400) {
        throw new EmailPermanentError(`Gmail rejected the request (HTTP ${status}): ${message}`);
      }
      throw new EmailTransientError(`Gmail API error: ${message}`);
    }
  };
}
