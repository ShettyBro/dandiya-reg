import type { EmailTemplateKey } from "@prisma/client";

export interface RenderedEmail {
  subject: string;
  html: string;
}

function baseLayout(title: string, bodyHtml: string): string {
  return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0a0c18;color:#f4f4f8">
<h1 style="color:#e8b84b;font-size:20px">${title}</h1>
${bodyHtml}
</div>`;
}

export function renderEmailTemplate(
  type: EmailTemplateKey,
  payload: Record<string, unknown>
): RenderedEmail {
  const name = typeof payload.name === "string" ? payload.name : "Participant";
  const publicCode = typeof payload.publicCode === "string" ? payload.publicCode : "";
  const reason = typeof payload.reason === "string" ? payload.reason : "";
  const portalUrl = typeof payload.portalUrl === "string" ? payload.portalUrl : "";

  switch (type) {
    case "REGISTRATION_RECEIVED":
      return {
        subject: "Dandiya Night 2026 — registration received",
        html: baseLayout(
          "Registration received",
          `<p>Hi ${name}, we've received your registration (code ${publicCode}) and payment proof. Verification is pending — you'll get another email once it's approved.</p>`
        )
      };
    case "PAYMENT_APPROVED":
      return {
        subject: "Dandiya Night 2026 — your pass is ready",
        html: baseLayout(
          "You're in!",
          `<p>Hi ${name}, your payment has been verified. Retrieve your digital pass any time using your registration code <strong>${publicCode}</strong> on the pass retrieval page.</p>`
        )
      };
    case "PAYMENT_REJECTED":
      return {
        subject: "Dandiya Night 2026 — payment verification issue",
        html: baseLayout(
          "Payment needs another look",
          `<p>Hi ${name}, your payment proof could not be verified: <strong>${reason}</strong>. Please resubmit using your registration code ${publicCode}.</p>`
        )
      };
    case "VOLUNTEER_INVITE":
      return {
        subject: "Dandiya Night 2026 — volunteer account created",
        html: baseLayout(
          "Welcome to the volunteer team",
          `<p>Hi ${name}, an account has been created for you. Visit ${portalUrl} to set your password and get started.</p>`
        )
      };
    case "PASSWORD_RESET":
      return {
        subject: "Dandiya Night 2026 — your password was reset",
        html: baseLayout(
          "Password reset",
          `<p>Hi ${name}, an administrator has reset your volunteer account password. Visit ${portalUrl} and sign in with the new temporary password you were given to continue.</p>`
        )
      };
    default:
      return {
        subject: "Dandiya Night 2026",
        html: baseLayout("Notification", "<p>You have a new notification.</p>")
      };
  }
}
