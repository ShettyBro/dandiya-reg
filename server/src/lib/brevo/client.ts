import type { Env } from "../../app/config/env.js";

export class BrevoNotConfiguredError extends Error {
  constructor() {
    super("BREVO_API_KEY / BREVO_SENDER_EMAIL are not configured");
    this.name = "BrevoNotConfiguredError";
  }
}

export class BrevoPermanentError extends Error {}
export class BrevoTransientError extends Error {}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export interface SendEmailResult {
  providerMessageId: string;
}

export type EmailSender = (input: SendEmailInput) => Promise<SendEmailResult>;

export function createBrevoSender(env: Env): EmailSender {
  return async (input: SendEmailInput): Promise<SendEmailResult> => {
    if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) {
      throw new BrevoNotConfiguredError();
    }

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
        })
      });
    } catch (error) {
      throw new BrevoTransientError(error instanceof Error ? error.message : "Network error calling Brevo");
    }

    if (response.status === 429 || response.status >= 500) {
      throw new BrevoTransientError(`Brevo transient error: HTTP ${response.status}`);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new BrevoPermanentError(`Brevo rejected the request: HTTP ${response.status} ${body}`);
    }

    const data = (await response.json()) as { messageId?: string };
    return { providerMessageId: data.messageId ?? "unknown" };
  };
}
