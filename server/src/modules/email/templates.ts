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
}

const GOLD = "#e8b84b";
const BG = "#05060d";
const CARD_BG = "#11142a";
const TEXT = "#f4f4f8";
const MUTED = "#9a9db4";

// Table-based layout throughout (role="presentation" tables, no position:absolute/relative,
// no flexbox) -- Gmail and most other email clients strip unsupported CSS like absolute
// positioning entirely, which previously left the dancers image floating in normal document flow
// above the title instead of overlapping the card's top-right corner as intended. Tables are the
// one layout primitive that renders consistently across real email clients.
function shell(assets: EmailAssets, bodyHtml: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG};font-family:'Segoe UI',Arial,sans-serif;"><tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;">
    <tr><td align="center" style="padding-bottom:20px;">
      <img src="${assets.logoUrl}" alt="Acharya" height="40" style="height:40px;width:auto;display:inline-block;" />
    </td></tr>
    <tr><td style="background:${CARD_BG};border:1px solid rgba(232,184,75,0.35);border-radius:20px;color:${TEXT};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="padding:20px 0 0 24px;">
          <p style="margin:0 0 4px;text-align:left;letter-spacing:2px;font-size:11px;text-transform:uppercase;color:${GOLD};">Dandiya Night</p>
          <h1 style="margin:0;text-align:left;font-size:26px;font-weight:800;color:${TEXT};letter-spacing:1px;">2026</h1>
        </td>
        <td width="56" align="right" valign="top" style="padding:12px 20px 0 0;">
          <img src="${assets.dancersUrl}" alt="" height="56" style="height:56px;width:auto;display:block;" />
        </td>
      </tr></table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:20px 24px 28px;">
        ${bodyHtml}
      </td></tr></table>
    </td></tr>
    <tr><td align="center" style="padding-top:18px;">
      <p style="margin:0;color:${MUTED};font-size:11px;">Acharya Stadium &middot; 15 October 2026 &middot; Entry from 3:00 PM, gate closes 5:00 PM</p>
    </td></tr>
  </table>
</td></tr></table>`;
}

// The QR code itself is no longer rendered inline here -- it's attached to the email as a PDF
// instead (see buildQrDownloadPdf / email-processor.ts). An inline <img> pointing at any
// remote host, including our own, depends on the recipient's email client choosing to load
// remote images at all; a surprising number don't by default, and the QR silently never
// appears. A PDF attachment has no such dependency -- it's downloaded with the message itself.
function passCard(name: string, publicCode: string): string {
  return `<div style="text-align:center;border-top:1px dashed rgba(232,184,75,0.4);border-bottom:1px dashed rgba(232,184,75,0.4);padding:20px 0;margin:20px 0;">
    <p style="margin:0;color:${MUTED};font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">Dandiya Celebration Kit QR</p>
    <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:${TEXT};text-transform:capitalize;">${name}</p>
    <p style="margin:6px 0 0;font-family:monospace;letter-spacing:3px;font-size:16px;color:${GOLD};">${publicCode}</p>
    <div style="margin:16px auto 0;max-width:300px;background:rgba(232,184,75,0.08);border:1px solid rgba(232,184,75,0.3);border-radius:12px;padding:14px 16px;">
      <p style="margin:0;font-size:13px;font-weight:600;color:${TEXT};line-height:1.5;">Your QR code is attached to this email as a PDF.</p>
      <p style="margin:6px 0 0;font-size:12px;color:${MUTED};line-height:1.5;">Please download the attachment below and show the QR code at the entry.</p>
    </div>
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

function stepsBlock(steps: string[]): string {
  const item = (text: string, i: number) =>
    `<tr>
      <td width="26" valign="top" style="padding:0 10px 10px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="22" height="22" align="center" valign="middle" style="width:22px;height:22px;border-radius:50%;background:${GOLD};font-size:11px;font-weight:800;color:${BG};">${i + 1}</td></tr></table>
      </td>
      <td valign="top" style="padding:0 0 10px;font-size:13px;color:${TEXT};line-height:1.55;">${text}</td>
    </tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0;text-align:left;">
    ${steps.map(item).join("")}
  </table>`;
}

function noteBlock(html: string): string {
  return `<div style="margin:16px 0 0;background:rgba(232,184,75,0.08);border:1px solid rgba(232,184,75,0.3);border-radius:12px;padding:14px 16px;text-align:left;">
    <p style="margin:0;font-size:12.5px;color:${TEXT};line-height:1.55;">${html}</p>
  </div>`;
}

// A bolder, more visually prominent timing callout than entryInfoBlock() -- used on rejection
// emails where the date/entry/close time is the single most important thing for someone to
// notice at a glance, since showing up at the help desk after the gate closes is the one mistake
// that can't be fixed there.
function eventTimingHighlight(): string {
  return `<div style="margin:16px 0 0;background:rgba(232,184,75,0.12);border:1px solid rgba(232,184,75,0.4);border-radius:12px;padding:16px 18px;text-align:center;">
    <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:${GOLD};">Event Date &amp; Entry Window</p>
    <p style="margin:0;font-size:16px;font-weight:800;color:${TEXT};">15 October 2026</p>
    <p style="margin:4px 0 0;font-size:14px;font-weight:700;color:${GOLD};">Entry: 3:00 PM &ndash; 5:00 PM</p>
    <p style="margin:2px 0 0;font-size:12px;color:${MUTED};">Gate closes at 5:00 PM sharp &mdash; no entry after that, so please arrive early.</p>
  </div>`;
}

function entryInfoBlock(): string {
  return `<div style="margin-top:16px;font-size:13px;color:${MUTED};line-height:1.7;">
    <p style="margin:0;"><strong style="color:${TEXT};">Venue:</strong> Acharya Stadium</p>
    <p style="margin:0;"><strong style="color:${TEXT};">Date:</strong> 15 October 2026</p>
    <p style="margin:0;"><strong style="color:${TEXT};">Entry:</strong> 3:00 PM &ndash; 5:00 PM (gate closes at 5:00 PM, no normal entry after)</p>
    <p style="margin:0;"><strong style="color:${TEXT};">Event:</strong> 4:00 PM &ndash; 9:00 PM</p>
    <p style="margin:8px 0 0;color:${GOLD};">Your QR code is strictly personal and non-transferable. Once you exit the venue, re-entry will not be permitted.</p>
    <p style="margin:4px 0 0;color:${GOLD};">No-refund policy applies to all registrations.</p>
  </div>`;
}

function rulesBlock(): string {
  const dos = [
    "Carry your valid college ID and registration confirmation.",
    "Arrive on time and follow entry instructions.",
    "Wear traditional or festive attire.",
    "Cooperate with security, faculty and volunteers.",
    "Dance responsibly and maintain a safe distance.",
    "Use Dandiya sticks carefully and follow volunteer instructions.",
    "Keep the venue clean and use designated bins.",
    "Follow event announcements, emergency exits and other safety instructions."
  ];
  const donts = [
    "Do not carry bags, backpacks or handbags into the venue.",
    "Consumption or possession of intoxicants is strictly prohibited. Anyone under the influence will be removed from the premises.",
    "Do not bring sharp objects, weapons, fireworks or prohibited items.",
    "Do not harass anyone or take photos/videos without consent.",
    "Do not push, shove, fight, threaten others or engage in ragging.",
    "Do not climb barricades, stage structures or enter restricted areas.",
    "Do not litter, smoke or vape in the event area.",
    "Do not leave expecting re-entry unless explicitly permitted."
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
          `<p style="text-align:center;font-size:15px;line-height:1.6;">Hi <strong style="text-transform:capitalize;">${name}</strong>, we've received your registration (code <strong style="color:${GOLD};">${publicCode}</strong>) and payment proof. Verification is pending — you'll get another email once it's approved.</p>
           <p style="text-align:center;font-size:13px;color:${MUTED};margin:8px 0 2px;">Dandiya Celebration Kit &mdash; &#8377;151</p>
           <p style="text-align:center;font-size:13px;color:${MUTED};margin:0 0 0;">Your Dandiya Celebration Kit will be provided at the event venue.</p>`
        )
      };
    case "PAYMENT_APPROVED":
      return {
        subject: "Your Dandiya Celebration Kit \u2014 Dandiya Night 2026",
        html: shell(
          assets,
          `<p style="text-align:center;font-size:15px;margin:0 0 4px;"><strong style="text-transform:capitalize;">${name}</strong>, your participation for Dandiya Night 2026 has been successfully confirmed.</p>
           <p style="text-align:center;font-size:13px;color:${MUTED};margin:0 0 4px;">Dandiya Celebration Kit &mdash; &#8377;151</p>
           <p style="text-align:center;font-size:13px;color:${MUTED};margin:0 0 16px;">Your Dandiya Celebration Kit will be provided at the event venue.</p>
           ${passCard(name, publicCode)}
           <p style="text-align:center;font-size:12px;color:${MUTED};margin:8px 0 0;">Please present the attached QR code at the event venue to collect your Dandiya Celebration Kit.</p>
           <p style="text-align:center;font-size:12px;color:${MUTED};margin:4px 0 16px;">The same QR code will be verified by the event team during venue entry.</p>
           ${entryInfoBlock()}
           ${rulesBlock()}`
        )
      };
    case "PAYMENT_REJECTED":
      return {
        subject: "Dandiya Night 2026 \u2014 payment verification issue",
        html: shell(
          assets,
          `<p style="text-align:center;font-size:15px;line-height:1.6;margin:0 0 4px;">Hi <strong style="text-transform:capitalize;">${name}</strong>,</p>
           <p style="text-align:center;font-size:14px;color:${TEXT};line-height:1.6;margin:0 0 14px;">We were unable to verify your payment proof, so your application has been rejected.</p>
           <p style="text-align:center;font-size:13px;color:${GOLD};font-weight:700;line-height:1.5;margin:0 0 4px;">Don't worry! If you already paid through the Acharya ERP portal, you can still get your registration verified.</p>
           <p style="text-align:left;font-size:12px;color:${MUTED};margin:14px 0 2px;">Please follow these steps on the event day:</p>
           ${stepsBlock([
             "Check the inbox of the email address you used while making the payment at the Acharya ERP portal — your payment receipt will be there.",
             "Visit the help desk located at the event entrance / Gate 3 of Acharya College.",
             "Show your payment receipt or transaction proof to the volunteers.",
             "The volunteers will verify your payment and complete your on-spot registration.",
             "You will receive a QR code that you can use to enter the event and collect your Dandiya Celebration Kit."
           ])}
           ${noteBlock(`<strong style="color:${GOLD};">Important:</strong> Please bring your payment proof for verification.`)}
           ${eventTimingHighlight()}
           <p style="text-align:center;font-size:12.5px;color:${MUTED};margin:16px 0 0;">Thank you for your cooperation. We look forward to seeing you at the event!</p>`
        )
      };
    case "IDENTITY_REJECTED":
      return {
        subject: "Dandiya Night 2026 — identity verification issue",
        html: shell(
          assets,
          `<p style="text-align:center;font-size:15px;line-height:1.6;margin:0 0 4px;">Hi <strong style="text-transform:capitalize;">${name}</strong>,</p>
           <p style="text-align:center;font-size:14px;color:${TEXT};line-height:1.6;margin:0 0 14px;">We are unable to verify your identity with the details provided.</p>
           <p style="text-align:center;font-size:13px;color:${GOLD};font-weight:700;line-height:1.5;margin:0 0 4px;">What should you do next?</p>
           <p style="text-align:center;font-size:12.5px;color:${MUTED};line-height:1.6;margin:4px 0 0;">If you have already paid through the Acharya ERP portal, check the inbox of the email address you used while making that payment for your receipt.</p>
           <p style="text-align:left;font-size:12px;color:${MUTED};margin:14px 0 2px;">On the event day, please follow these steps:</p>
           ${stepsBlock([
             "Visit the help desk located at the event entrance / Gate 3 of Acharya College.",
             "Show your payment receipt or transaction proof to the volunteers.",
             "The volunteers will verify your details and complete your on-spot registration.",
             "You will receive a QR code that you can use to enter the event and collect your Dandiya Celebration Kit."
           ])}
           ${noteBlock(`<strong style="color:${GOLD};">Important:</strong> Please bring your original college ID card for verification.`)}
           ${eventTimingHighlight()}
           <p style="text-align:center;font-size:12.5px;color:${MUTED};margin:16px 0 0;">Thank you for your cooperation. We look forward to seeing you at the event!</p>`
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
           ${passCard(name, publicCode)}
           <p style="text-align:center;font-size:12px;color:${MUTED};">This is also your Dandiya Celebration Kit QR for the event.</p>`
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
