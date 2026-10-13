// Provider-agnostic email-sending contract shared by every sender implementation (Gmail, Brevo,
// future providers). processEmailJob() only ever depends on this file, never on a specific
// provider's client module, so swapping providers never touches retry/backoff logic.

export class EmailNotConfiguredError extends Error {}
export class EmailPermanentError extends Error {}
export class EmailTransientError extends Error {}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export interface SendEmailResult {
  providerMessageId: string;
}

export type EmailSender = (input: SendEmailInput) => Promise<SendEmailResult>;
