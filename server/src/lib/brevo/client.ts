import type { Env } from "../../app/config/env.js";
import {
  EmailNotConfiguredError,
  EmailPermanentError,
  EmailTransientError,
  type EmailSender,
  type SendEmailInput,
  type SendEmailResult
} from "../email/errors.js";

export type { SendEmailInput, SendEmailResult, EmailSender };

const BREVO_REQUEST_TIMEOUT_MS = 20000;

export function createBrevoSender(env: Env): EmailSender {
  return async (input: SendEmailInput): Promise<SendEmailResult> => {
    if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) {
      throw new EmailNotConfiguredError("BREVO_API_KEY / BREVO_SENDER_EMAIL are not configured");
    }

    // Plain fetch() has no default timeout -- a stalled connection (no response, not even an
    // error) previously hung this call forever. Since the worker processes jobs one at a time in
    // a single loop, that permanently wedged the entire email loop on whatever job it happened to
    // be on, with every subsequent restart just re-claiming the same job and hanging again. A
    // stalled call must fail and go through the normal retry/backoff path instead.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BREVO_REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": env.BREVO_API_KEY,
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify({
          sender: { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME },
          to: [{ email: input.to }],
          subject: input.subject,
          htmlContent: input.html
        }),
        signal: controller.signal
      });
    } catch (error) {
      throw new EmailTransientError(error instanceof Error ? error.message : "Network error calling Brevo");
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.status === 429 || response.status >= 500) {
      throw new EmailTransientError(`Brevo transient error: HTTP ${response.status}`);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new EmailPermanentError(`Brevo rejected the request: HTTP ${response.status} ${body}`);
    }

    const data = (await response.json()) as { messageId?: string };
    return { providerMessageId: data.messageId ?? "unknown" };
  };
}
