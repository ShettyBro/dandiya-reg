import type { EmailTemplateKey } from "@prisma/client";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

export interface EmailAssets {
  logoUrl: string;
  dancersUrl: string;
  qrImageDataUrl?: string;
}

const GOLD = "#e8b84b";
const BG = "#05060d";
const CARD_BG = "#11142a";
const TEXT = "#f4f4f8";
const MUTED = "#9a9db4";

function shell(assets: EmailAssets, bodyHtml: string): string {
  return `<div style="background:${BG};padding:32px 16px;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;">
    <div style="text-align:center;margin-bottom:20px;">
      <img src="${assets.logoUrl}" alt="Acharya" height="40" style="height:40px;width:auto;vertical-align:middle;" />
    </div>
    <div style="background:${CARD_BG};border:1px solid rgba(232,184,75,0.35);border-radius:20px;padding:28px 24px;color:${TEXT};position:relative;">
      <img src="${assets.dancersUrl}" alt="" height="56" style="position:absolute;top:-28px;right:20px;height:56px;width:auto;" />
      <p style="margin:0 0 4px;text-align:center;letter-spacing:2px;font-size:11px;text-transform:uppercase;color:${GOLD};">Dandiya Night</p>
      <h1 style="margin:0 0 20px;text-align:center;font-size:26px;font-weight:800;color:${TEXT};letter-spacing:1px;">2026</h1>
      ${bodyHtml}
    </div>
    <p style="text-align:center;color:${MUTED};font-size:11px;margin-top:18px;">Acharya Stadium &middot; 15 October 2026 &middot; Entry from 3:00 PM, gate closes 5:00 PM</p>
  </div>
</div>`;
}

function passCard(name: string, publicCode: string, qrImageDataUrl?: string): string {
  const qrBlock = qrImageDataUrl
    ? `<div style="background:#ffffff;border-radius:16px;padding:16px;display:inline-block;margin:16px 0;">
         <img src="${qrImageDataUrl}" alt="Entry QR code" width="200" height="200" style="display:block;width:200px;height:200px;" />
       </div>`
    : "";

  return `<div style="text-align:center;border-top:1px dashed rgba(232,184,75,0.4);border-bottom:1px dashed rgba(232,184,75,0.4);padding:20px 0;margin:20px 0;">
    <p style="margin:0;color:${MUTED};font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">Digital Entry Pass</p>
    <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:${TEXT};text-transform:capitalize;">${name}</p>
    ${qrBlock}
    <p style="margin:0;font-family:monospace;letter-spacing:3px;font-size:16px;color:${GOLD};">${publicCode}</p>
  </div>`;
}

function loginButton(url: string, label: string): string {
  return `<div style="text-align:center;margin:20px 0;">
    <a href="${url}" style="display:inline-block;background:${GOLD};color:${BG};font-weight:700;font-size:14px;padding:12px 32px;border-radius:999px;text-decoration:none;">${label}</a>
  </div>`;
}

function credentialsBlock(email: string, password: string): string {
  return `<div style="background:rgba(255,255,255,0.04);border-radius:14px;padding:16px 18px;margin:18px 0;">
    <p style="margin:0 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:${GOLD};">Your login</p>
    <p style="margin:0 0 6px;font-size:13px;color:${MUTED};">Login ID (email)</p>
    <p style="margin:0 0 12px;font-family:monospace;font-size:14px;color:${TEXT};word-break:break-all;">${email}</p>
    <p style="margin:0 0 6px;font-size:13px;color:${MUTED};">Temporary password</p>
    <p style="margin:0;font-family:monospace;font-size:16px;letter-spacing:1px;color:${TEXT};">${password}</p>
  </div>`;
}

function entryInfoBlock(): string {
  return `<div style="margin-top:16px;font-size:13px;color:${MUTED};line-height:1.7;">
    <p style="margin:0;"><strong style="color:${TEXT};">Venue:</strong> Acharya Stadium</p>
    <p style="margin:0;"><strong style="color:${TEXT};">Date:</strong> 15 October 2026</p>
    <p style="margin:0;"><strong style="color:${TEXT};">Entry:</strong> 3:00 PM &ndash; 5:00 PM (gate closes at 5:00 PM, no normal entry after)</p>
    <p style="margin:0;"><strong style="color:${TEXT};">Event:</strong> 4:00 PM &ndash; 9:00 PM</p>
    <p style="margin:8px 0 0;color:${GOLD};">Entry is one-time only — once you exit, you cannot re-enter.</p>
    <p style="margin:4px 0 0;color:${GOLD};">No-refund policy applies to all registrations.</p>
  </div>`;
}

function rulesBlock(): string {
  const dos = [
    "Be on time and plan your day to avoid a last-minute rush.",
    "Carry your College ID Card and this confirmation email for entry checking.",
    "Wear ethnic/traditional attire compulsorily &mdash; kurta, lehenga, saree, chaniya choli, etc.",
    "Cooperate with security personnel, police officials, and event volunteers."
  ];
  const donts = [
    "No bags, cosmetics, keychains, sharp objects, watches, or metal accessories (bangles, rings, kadas).",
    "No water bottles, liquids, food, or edible items inside the venue.",
    "No cloakroom facility is provided &mdash; do not carry valuables.",
    "No entry under the influence of alcohol or intoxicating substances.",
    "Entry is one-time only &mdash; once you exit the venue, you cannot re-enter."
  ];
  const item = (text: string) =>
    `<li style="margin:0 0 6px;">${text}</li>`;

  return `<div style="margin-top:20px;border-top:1px solid rgba(255,255,255,0.08);padding-top:16px;">
    <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:${GOLD};">Do's</p>
    <ul style="margin:0 0 14px;padding-left:18px;font-size:12px;color:${MUTED};line-height:1.5;">
      ${dos.map(item).join("")}
    </ul>
    <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:${GOLD};">Don'ts</p>
    <ul style="margin:0;padding-left:18px;font-size:12px;color:${MUTED};line-height:1.5;">
      ${donts.map(item).join("")}
    </ul>
  </div>`;
}

export function renderEmailTemplate(
  type: EmailTemplateKey,
  payload: Record<string, unknown>,
  assets: EmailAssets
): RenderedEmail {
  const name = escapeHtml(typeof payload.name === "string" ? payload.name : "Participant");
  const publicCode = escapeHtml(typeof payload.publicCode === "string" ? payload.publicCode : "");
  const portalUrl = escapeHtml(typeof payload.portalUrl === "string" ? payload.portalUrl : "");
  const loginEmail = escapeHtml(typeof payload.email === "string" ? payload.email : "");
  const temporaryPassword = escapeHtml(typeof payload.temporaryPassword === "string" ? payload.temporaryPassword : "");

  switch (type) {
    case "REGISTRATION_RECEIVED":
      return {
        subject: "Dandiya Night 2026 — registration received",
        html: shell(
          assets,
          `<p style="text-align:center;font-size:15px;line-height:1.6;">Hi <strong style="text-transform:capitalize;">${name}</strong>, we've received your registration (code <strong style="color:${GOLD};">${publicCode}</strong>) and payment proof. Verification is pending — you'll get another email once it's approved.</p>`
        )
      };
    case "PAYMENT_APPROVED":
      return {
        subject: "Dandiya Night 2026 — your digital pass is ready",
        html: shell(
          assets,
          `<p style="text-align:center;font-size:15px;margin:0;">Here's your digital pass for Dandiya Night 2026.</p>
           ${passCard(name, publicCode, assets.qrImageDataUrl)}
           ${entryInfoBlock()}
           ${rulesBlock()}`
        )
      };
    case "PAYMENT_REJECTED":
      return {
        subject: "Dandiya Night 2026 — payment verification issue",
        html: shell(
          assets,
          `<p style="text-align:center;font-size:15px;line-height:1.6;">Hi <strong style="text-transform:capitalize;">${name}</strong>, we were unable to verify your payment.</p>
           <p style="text-align:center;font-size:14px;color:${MUTED};">Please register again using the same details with a valid payment reference and screenshot. Your code <strong>${publicCode}</strong> stays on record.</p>`
        )
      };
    case "IDENTITY_REJECTED":
      return {
        subject: "Dandiya Night 2026 — identity verification issue",
        html: shell(
          assets,
          `<p style="text-align:center;font-size:15px;line-height:1.6;">Hi <strong style="text-transform:capitalize;">${name}</strong>, we were unable to verify your identity.</p>
           <p style="text-align:center;font-size:14px;color:${MUTED};line-height:1.6;">Please register again with valid identity proof. Use your existing payment proof — <strong style="color:${TEXT};">do not make another payment.</strong></p>`
        )
      };
    case "VOLUNTEER_INVITE":
      return {
        subject: "Dandiya Night 2026 — volunteer account created",
        html: shell(
          assets,
          `<p style="text-align:center;font-size:15px;line-height:1.6;">Hi <strong style="text-transform:capitalize;">${name}</strong>, an account has been created for you on the volunteer team.</p>
           ${credentialsBlock(loginEmail, temporaryPassword)}
           ${loginButton(portalUrl, "Login to volunteer portal")}
           <p style="text-align:center;font-size:12px;color:${MUTED};margin:0 0 4px;">You'll be asked to set your own password on first login.</p>
           ${passCard(name, publicCode, assets.qrImageDataUrl)}
           <p style="text-align:center;font-size:12px;color:${MUTED};">This is also your own entry QR pass for the event.</p>`
        )
      };
    case "PASSWORD_RESET":
      return {
        subject: "Dandiya Night 2026 — your password was reset",
        html: shell(
          assets,
          `<p style="text-align:center;font-size:15px;line-height:1.6;">Hi <strong style="text-transform:capitalize;">${name}</strong>, an administrator has reset your volunteer account password.</p>
           ${credentialsBlock(loginEmail, temporaryPassword)}
           ${loginButton(portalUrl, "Login to volunteer portal")}
           <p style="text-align:center;font-size:12px;color:${MUTED};">You'll be asked to set your own password on next login.</p>`
        )
      };
    default:
      return {
        subject: "Dandiya Night 2026",
        html: shell(assets, `<p style="text-align:center;">You have a new notification.</p>`)
      };
  }
}
