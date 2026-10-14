// Provider-agnostic email-sending contract shared by every sender implementation (Gmail, Brevo,
// future providers). processEmailJob() only ever depends on this file, never on a specific
// provider's client module, so swapping providers never touches retry/backoff logic.

export class EmailNotConfiguredError extends Error {}
export class EmailPermanentError extends Error {}
// `retryAfter`: when the provider tells us exactly when it'll accept mail again (Gmail's 429
// responses often include "Retry after <timestamp>"), that must win over the generic short
// exponential backoff -- retrying before the provider's own stated time just reproduces the
// same 429 immediately, turning a single rate-limit hit into a self-sustaining retry storm.
export class EmailTransientError extends Error {
  retryAfter?: Date | undefined;
  constructor(message: string, retryAfter?: Date) {
    super(message);
    this.retryAfter = retryAfter;
  }
}
// Distinct from EmailTransientError: the mailbox's daily SENDING cap (2000/day for Workspace),
// not a short-lived burst rate limit. Google documents this as a rolling window with no fixed
// reset time, not "resets at midnight" -- the normal short exponential backoff (maxes out in
// under an hour, then permanently fails the job) is the wrong response to this specific error.
// A job hitting this should wait much longer and keep retrying indefinitely instead of ever
// being marked permanently failed for this reason alone. `retryAfter`: when Gmail's response
// does include its own explicit retry instant, that's strictly more informative than the flat
// 12-hour fallback and should be honored instead.
export class EmailQuotaExceededError extends Error {
  retryAfter?: Date | undefined;
  constructor(message: string, retryAfter?: Date) {
    super(message);
    this.retryAfter = retryAfter;
  }
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

export interface SendEmailResult {
  providerMessageId: string;
}

export type EmailSender = (input: SendEmailInput) => Promise<SendEmailResult>;
