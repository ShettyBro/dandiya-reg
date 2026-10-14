// Provider-agnostic email-sending contract shared by every sender implementation (Gmail, Brevo,
// future providers). processEmailJob() only ever depends on this file, never on a specific
// provider's client module, so swapping providers never touches retry/backoff logic.

export class EmailNotConfiguredError extends Error {}
export class EmailPermanentError extends Error {}
export class EmailTransientError extends Error {}
// Distinct from EmailTransientError: the mailbox's daily SENDING cap (2000/day for Workspace),
// not a short-lived burst rate limit. Google documents this as a rolling window with no fixed
// reset time, not "resets at midnight" -- the normal short exponential backoff (maxes out in
// under an hour, then permanently fails the job) is the wrong response to this specific error.
// A job hitting this should wait much longer and keep retrying indefinitely instead of ever
// being marked permanently failed for this reason alone.
export class EmailQuotaExceededError extends Error {}

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
