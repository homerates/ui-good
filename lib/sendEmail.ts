// lib/sendEmail.ts
// Thin wrapper around Resend for transactional notifications.
// All functions are fire-and-forget safe — they log errors but never throw.

import { Resend } from "resend";
import { unsubscribeUrl, isEmailSuppressed } from "./unsubscribe";

const FROM = process.env.RESEND_FROM_EMAIL ?? "digest@mail.homerates.ai";
const BASE = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

// ─── Shared email shell ──────────────────────────────────────────────────────
// Dark design — matches digest email brand. Explicit dark background prevents
// Gmail Android dark-mode inversion (inversion only fires on unset/white backgrounds).

// Physical address required by CAN-SPAM §7(a)(5)
const PHYSICAL_ADDRESS = process.env.BUSINESS_MAILING_ADDRESS ?? "548 Market St PMB 12345, San Francisco, CA 94104";

const _BG     = '#0d1117';
const _CARD   = '#161b22';
const _BORDER = 'rgba(255,255,255,0.07)';
const _TXT    = '#e6edf3';
const _TXT2   = '#8b949e';

export function emailShell(
  bodyHtml: string,
  footerText = "HomeRates.ai · homerates.ai",
  unsubscribeUrl?: string,
): string {
  const unsubLine = unsubscribeUrl
    ? `<br><a href="${unsubscribeUrl}" style="color:${_TXT2};">Unsubscribe</a> · ${PHYSICAL_ADDRESS}`
    : `<br>${PHYSICAL_ADDRESS}`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${_BG};font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${_BG};padding:32px 16px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:${_CARD};border-radius:16px;overflow:hidden;border:1px solid ${_BORDER};">
<tr><td style="background:${_BG};padding:22px 32px;border-bottom:1px solid ${_BORDER};">
<img src="${BASE}/assets/homerates-email-logo.png" alt="HomeRates.ai" style="height:32px;display:block;" onerror="this.style.display='none'">
</td></tr>
<tr><td style="background:${_CARD};padding:32px;color:${_TXT};">
${bodyHtml}
</td></tr>
<tr><td style="background:${_BG};padding:20px 32px;border-top:1px solid ${_BORDER};border-radius:0 0 16px 16px;">
<p style="margin:0;font-size:11px;color:${_TXT2};line-height:1.6;">${footerText}${unsubLine}</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

// ─── New thread: notify the professional ────────────────────────────────────

export async function emailNewThread({
  toEmail,
  toName,
  fromName,
  threadId,
  loanType,
}: {
  toEmail: string;
  toName: string;
  fromName: string;
  threadId: string;
  loanType?: string;
}) {
  const resend = getResend();
  if (!resend || !toEmail) return;

  const loanNote = loanType ? ` regarding a ${loanType.toUpperCase()} scenario` : "";
  const link = `${BASE}/messages/${threadId}`;

  try {
    await resend.emails.send({
      from: `HomeRates.ai <${FROM}>`,
      to: toEmail,
      subject: `${fromName} wants to connect on HomeRates.ai`,
      html: emailShell(`
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00e87a;">New Message</p>
        <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#e6edf3;line-height:1.2;">You have a new connection request</p>
        <p style="margin:0 0 24px;font-size:15px;color:#8b949e;line-height:1.6;"><strong style="color:#e6edf3;">${fromName}</strong> has started a conversation with you${loanNote}.</p>
        <a href="${link}" style="display:inline-block;background:#00e87a;color:#07100f;font-weight:700;font-size:15px;padding:14px 28px;border-radius:999px;text-decoration:none;">View Message →</a>
      `, "HomeRates.ai · Confidential borrower connection"),
    });
  } catch (err) {
    console.error("[sendEmail] emailNewThread failed:", err);
  }
}

// ─── Reply: notify the other party ──────────────────────────────────────────

export async function emailNewReply({
  toEmail,
  toName,
  fromName,
  threadId,
  preview,
}: {
  toEmail: string;
  toName: string;
  fromName: string;
  threadId: string;
  preview?: string;
}) {
  const resend = getResend();
  if (!resend || !toEmail) return;

  const link = `${BASE}/messages/${threadId}`;
  const previewSnippet = preview
    ? `<blockquote style="border-left:3px solid #00c896;padding-left:12px;color:#8b949e;margin:12px 0;">${preview.slice(0, 200)}${preview.length > 200 ? "…" : ""}</blockquote>`
    : "";

  try {
    await resend.emails.send({
      from: `HomeRates.ai <${FROM}>`,
      to: toEmail,
      subject: `New message from ${fromName} on HomeRates.ai`,
      html: emailShell(`
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00e87a;">New Message</p>
        <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#e6edf3;line-height:1.2;">You have a reply</p>
        <p style="margin:0 0 16px;font-size:15px;color:#8b949e;"><strong style="color:#e6edf3;">${fromName}</strong> sent you a message:</p>
        ${preview ? `<div style="background:#1c2433;border-left:3px solid #00e87a;border-radius:0 8px 8px 0;padding:14px 16px;margin:0 0 24px;font-size:14px;color:#e6edf3;line-height:1.6;">${preview.slice(0, 200)}${preview.length > 200 ? "…" : ""}</div>` : `<div style="margin-bottom:24px;"></div>`}
        <a href="${link}" style="display:inline-block;background:#00e87a;color:#07100f;font-weight:700;font-size:15px;padding:14px 28px;border-radius:999px;text-decoration:none;">Reply →</a>
      `, "HomeRates.ai · Confidential borrower connection"),
    });
  } catch (err) {
    console.error("[sendEmail] emailNewReply failed:", err);
  }
}

// ─── Scenario response: notify the borrower ─────────────────────────────────

export async function emailScenarioResponse({
  toEmail,
  toName,
  loName,
  rateEstimate,
  scenarioId,
}: {
  toEmail: string;
  toName: string;
  loName: string;
  rateEstimate: string;
  scenarioId: string;
}) {
  const resend = getResend();
  if (!resend || !toEmail) return;

  const link = `${BASE}/connect/my-scenario`;

  try {
    await resend.emails.send({
      from: `HomeRates.ai <${FROM}>`,
      to: toEmail,
      subject: `${loName} responded to your scenario on HomeRates.ai`,
      html: emailShell(`
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00e87a;">Scenario Response</p>
        <p style="margin:0 0 4px;font-size:22px;font-weight:800;color:#e6edf3;line-height:1.2;">Hi ${toName},</p>
        <p style="margin:0 0 24px;font-size:15px;color:#8b949e;">A loan officer responded to your scenario.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#1c2433;border:1px solid rgba(255,255,255,0.07);border-radius:12px;margin-bottom:24px;">
          <tr><td style="padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Loan Officer</span>
            <span style="font-size:15px;font-weight:600;color:#e6edf3;">${loName}</span>
          </td></tr>
          <tr><td style="padding:14px 20px;">
            <span style="display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Rate Indication</span>
            <span style="font-size:15px;font-weight:600;color:#008a48;">${rateEstimate}</span>
          </td></tr>
        </table>
        <a href="${link}" style="display:block;text-align:center;background:#00e87a;color:#07100f;font-size:15px;font-weight:700;padding:14px 20px;border-radius:999px;text-decoration:none;">View Response &amp; Connect →</a>
      `, "HomeRates.ai · Rate indications are not a Loan Estimate or commitment to lend."),
    });
  } catch (err) {
    console.error("[sendEmail] emailScenarioResponse failed:", err);
  }
}

// ─── Contact share: email both parties ──────────────────────────────────────

export interface ProCard {
  name: string;
  email: string | null;
  phone?: string | null;
  photoUrl?: string | null;
  title?: string | null;
  company?: string | null;       // lender name or brokerage
  nmls?: string | null;          // individual NMLS or license#
  companyNmls?: string | null;
  licenseState?: string | null;
  website?: string | null;
  officeAddress?: string | null;
  bio?: string | null;
  role?: string;                 // 'lo' | 'agent'
}

function buildProCardHtml(pro: ProCard, link: string): string {
  const avatar = pro.photoUrl
    ? `<img src="${pro.photoUrl}" alt="${pro.name}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:2px solid #00e87a;display:block;">`
    : `<div style="width:64px;height:64px;border-radius:50%;background:#0d2018;border:2px solid #00e87a;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:#008a48;">${pro.name.charAt(0).toUpperCase()}</div>`;

  const licenseLabel = pro.role === "agent" ? "License #" : "NMLS #";
  const rows = [
    pro.phone       ? `<tr><td style="color:#9ca3af;font-size:12px;padding:4px 0;white-space:nowrap;padding-right:16px;">Phone</td><td style="font-size:14px;"><a href="tel:${pro.phone}" style="color:#008a48;text-decoration:none;">${pro.phone}</a></td></tr>` : "",
    pro.email       ? `<tr><td style="color:#9ca3af;font-size:12px;padding:4px 0;white-space:nowrap;padding-right:16px;">Email</td><td style="font-size:14px;"><a href="mailto:${pro.email}" style="color:#008a48;text-decoration:none;">${pro.email}</a></td></tr>` : "",
    pro.nmls        ? `<tr><td style="color:#9ca3af;font-size:12px;padding:4px 0;white-space:nowrap;padding-right:16px;">${licenseLabel}</td><td style="font-size:14px;color:#e6edf3;">${pro.nmls}</td></tr>` : "",
    pro.companyNmls ? `<tr><td style="color:#9ca3af;font-size:12px;padding:4px 0;white-space:nowrap;padding-right:16px;">Company NMLS</td><td style="font-size:14px;color:#e6edf3;">${pro.companyNmls}</td></tr>` : "",
    pro.licenseState ? `<tr><td style="color:#9ca3af;font-size:12px;padding:4px 0;white-space:nowrap;padding-right:16px;">Licensed in</td><td style="font-size:14px;color:#e6edf3;">${pro.licenseState}</td></tr>` : "",
    pro.officeAddress ? `<tr><td style="color:#9ca3af;font-size:12px;padding:4px 0;white-space:nowrap;padding-right:16px;">Office</td><td style="font-size:14px;color:#e6edf3;">${pro.officeAddress}</td></tr>` : "",
    pro.website     ? `<tr><td style="color:#9ca3af;font-size:12px;padding:4px 0;white-space:nowrap;padding-right:16px;">Web</td><td style="font-size:14px;"><a href="${pro.website}" style="color:#008a48;text-decoration:none;">${pro.website.replace(/^https?:\/\//, "")}</a></td></tr>` : "",
  ].filter(Boolean).join("");

  return emailShell(`
    <p style="margin:0 0 16px;font-size:14px;color:#8b949e;">You're connected — here are their full contact details:</p>

    <table cellpadding="0" cellspacing="0" width="100%" style="background:#1c2433;border:1px solid rgba(255,255,255,0.07);border-radius:14px;overflow:hidden;margin-bottom:24px;">
      <tr>
        <td style="padding:20px 16px 20px 20px;vertical-align:top;width:80px;">
          ${avatar}
        </td>
        <td style="padding:20px 20px 20px 0;vertical-align:top;">
          <div style="font-size:19px;font-weight:700;color:#e6edf3;margin-bottom:3px;">${pro.name}</div>
          ${pro.title   ? `<div style="font-size:13px;color:#008a48;font-weight:600;margin-bottom:2px;">${pro.title}</div>` : ""}
          ${pro.company ? `<div style="font-size:13px;color:#8b949e;margin-bottom:10px;">${pro.company}</div>` : `<div style="margin-bottom:10px;"></div>`}
          ${pro.bio     ? `<div style="font-size:13px;color:#e6edf3;line-height:1.55;border-left:3px solid #00e87a;padding-left:10px;font-style:italic;">${pro.bio}</div>` : ""}
        </td>
      </tr>
      <tr><td colspan="2" style="padding:0 20px;"><div style="height:1px;background:#2a3444;"></div></td></tr>
      <tr><td colspan="2" style="padding:14px 20px 18px;">
        <table cellpadding="0" cellspacing="0">${rows}</table>
      </td></tr>
    </table>

    <div style="text-align:center;">
      <a href="${link}" style="display:inline-block;background:#00e87a;color:#07100f;font-weight:700;font-size:15px;padding:14px 32px;border-radius:999px;text-decoration:none;">View Conversation →</a>
    </div>
  `, `HomeRates.ai · Contact shared with your consent.${pro.nmls ? " This professional is NMLS licensed. Always verify credentials at nmlsconsumeraccess.org" : ""}`);
}

export async function emailContactShare({
  borrowerEmail,
  borrowerName,
  borrowerPhone,
  pro,
  threadId,
}: {
  borrowerEmail: string | null;
  borrowerName: string;
  borrowerPhone?: string | null;
  pro: ProCard;
  threadId: string;
}) {
  const resend = getResend();
  if (!resend) return;

  const link = `${BASE}/messages/${threadId}`;

  // Email to professional — simple confirmation with borrower contact
  if (pro.email) {
    const borrowerContact = [borrowerEmail, borrowerPhone].filter(Boolean).join(" · ");
    try {
      await resend.emails.send({
        from: `HomeRates.ai <${FROM}>`,
        to: pro.email,
        subject: `${borrowerName} shared their contact info`,
        html: emailShell(`
          <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00e87a;">New Connection</p>
          <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#e6edf3;line-height:1.2;">Hi ${pro.name},</p>
          <p style="margin:0 0 20px;font-size:15px;color:#8b949e;"><strong style="color:#e6edf3;">${borrowerName}</strong> is ready to move forward and shared their contact details with you:</p>
          <div style="background:#1c2433;border:1px solid rgba(255,255,255,0.07);border-left:4px solid #00e87a;border-radius:8px;padding:16px 20px;margin:0 0 24px;font-size:17px;font-weight:700;color:#e6edf3;">${borrowerContact}</div>
          <a href="${link}" style="display:inline-block;background:#00e87a;color:#07100f;font-weight:700;font-size:15px;padding:14px 28px;border-radius:999px;text-decoration:none;">View Conversation →</a>
        `, "HomeRates.ai · This contact was shared with your consent."),
      });
    } catch (err) {
      console.error("[sendEmail] emailContactShare (pro) failed:", err);
    }
  }

  // Email to borrower — full professional card
  if (borrowerEmail) {
    try {
      await resend.emails.send({
        from: `HomeRates.ai <${FROM}>`,
        to: borrowerEmail,
        subject: `You're connected with ${pro.name} — contact details inside`,
        html: buildProCardHtml(pro, link),
      });
    } catch (err) {
      console.error("[sendEmail] emailContactShare (borrower) failed:", err);
    }
  }
}

// ─── Welcome email: new sign-up ─────────────────────────────────────────────

export async function emailWelcome({
  toEmail,
  firstName,
}: {
  toEmail: string;
  firstName?: string | null;
}) {
  const resend = getResend();
  if (!resend || !toEmail) return;

  const greeting = firstName ? `Hi ${firstName},` : "Welcome to HomeRates.ai,";
  const chatLink = `${BASE}/chat`;
  const pricingLink = `${BASE}/pricing`;

  try {
    await resend.emails.send({
      from: `HomeRates.ai <${FROM}>`,
      to: toEmail,
      subject: "Your HomeRates.ai account is ready",
      html: emailShell(`
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00e87a;">Welcome</p>
        <p style="margin:0 0 24px;font-size:24px;font-weight:800;color:#e6edf3;line-height:1.2;">${greeting}</p>
        <p style="margin:0 0 28px;font-size:15px;color:#8b949e;line-height:1.7;">HomeRates.ai gives you instant mortgage intelligence — real rates, real analysis, no loan officer gating. Ask anything about buying, refinancing, or investing in real estate.</p>

        <!-- Feature list -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
          <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-size:15px;color:#00e87a;font-weight:700;margin-right:10px;">→</span>
            <span style="font-size:14px;color:#e6edf3;font-weight:600;">Mortgage AI Chat</span>
            <span style="font-size:13px;color:#8b949e;"> — rates, affordability, DSCR, refi analysis</span>
          </td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-size:15px;color:#00e87a;font-weight:700;margin-right:10px;">→</span>
            <span style="font-size:14px;color:#e6edf3;font-weight:600;">Loan Limit Explorer</span>
            <span style="font-size:13px;color:#8b949e;"> — 2026 conforming limits by county and ZIP</span>
          </td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-size:15px;color:#00e87a;font-weight:700;margin-right:10px;">→</span>
            <span style="font-size:14px;color:#e6edf3;font-weight:600;">Rate Alerts</span>
            <span style="font-size:13px;color:#8b949e;"> — get notified when rates hit your target</span>
          </td></tr>
          <tr><td style="padding:10px 0;">
            <span style="font-size:15px;color:#00e87a;font-weight:700;margin-right:10px;">→</span>
            <span style="font-size:14px;color:#e6edf3;font-weight:600;">Connect with LOs</span>
            <span style="font-size:13px;color:#8b949e;"> — post a scenario, get competing responses</span>
          </td></tr>
        </table>

        <a href="${chatLink}" style="display:block;text-align:center;background:#00e87a;color:#07100f;font-weight:700;font-size:16px;padding:16px 20px;border-radius:999px;text-decoration:none;margin-bottom:16px;">Start your first conversation →</a>

        <p style="margin:0;text-align:center;font-size:13px;color:#8b949e;">Want rent AVM, cap rate, and investment cash flow? <a href="${pricingLink}" style="color:#008a48;text-decoration:none;">Upgrade to Pro →</a></p>
      `, "HomeRates.ai · You can reply to this email with any questions."),
    });
  } catch (err) {
    console.error("[sendEmail] emailWelcome failed:", err);
  }
}

// ─── Credit notification: admin grant or LO gift ────────────────────────────

export async function emailCreditGrant({
  toEmail,
  firstName,
  amount,
  newBalance,
  fromName,   // "HomeRates.ai" for admin grants, LO name for gifts
  note,
}: {
  toEmail:    string;
  firstName?: string | null;
  amount:     number;
  newBalance: number;
  fromName:   string;
  note?:      string | null;
}) {
  const resend = getResend();
  if (!resend || !toEmail) return;

  const greeting = firstName ? `Hi ${firstName},` : "Hi,";

  try {
    await resend.emails.send({
      from: `HomeRates.ai <${FROM}>`,
      to: toEmail,
      subject: `You've received ${amount.toLocaleString()} credits on HomeRates.ai`,
      html: emailShell(`
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00e87a;">Credits received</p>
        <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#e6edf3;line-height:1.2;">${greeting}</p>
        <p style="margin:0 0 24px;font-size:15px;color:#8b949e;line-height:1.7;">
          <strong style="color:#e6edf3">${fromName}</strong> has added
          <strong style="color:#008a48">${amount.toLocaleString()} credits</strong> to your HomeRates.ai account.
        </p>

        ${note ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
          <tr>
            <td style="background:#1c2433;border-left:3px solid #00e87a;border-radius:0 8px 8px 0;padding:12px 16px;">
              <p style="margin:0;font-size:14px;color:#8b949e;font-style:italic;">"${note}"</p>
            </td>
          </tr>
        </table>` : ""}

        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;background:#1c2433;border:1px solid rgba(255,255,255,0.07);border-radius:10px;">
          <tr>
            <td style="padding:16px 20px;border-right:1px solid rgba(255,255,255,0.06);" width="50%">
              <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">Credits added</p>
              <p style="margin:0;font-size:22px;font-weight:800;color:#008a48;">+${amount.toLocaleString()}</p>
            </td>
            <td style="padding:16px 20px;" width="50%">
              <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">New balance</p>
              <p style="margin:0;font-size:22px;font-weight:800;color:#e6edf3;">${newBalance.toLocaleString()}</p>
            </td>
          </tr>
        </table>

        <a href="${BASE}/chat"
           style="display:block;text-align:center;background:#00e87a;color:#07100f;font-size:15px;font-weight:700;padding:14px 20px;border-radius:10px;text-decoration:none;">
          Start a conversation →
        </a>
      `, "HomeRates.ai · Your credits never expire"),
    });
  } catch (err) {
    console.error("[sendEmail] emailCreditGrant failed:", err);
  }
}

// ─── Waitlist: position confirmation ────────────────────────────────────────

export async function emailWaitlistConfirm({
  toEmail,
  firstName,
  position,
  proType,
  state,
}: {
  toEmail:   string;
  firstName: string;
  position:  number;
  proType:   "lo" | "agent";
  state:     string;
}) {
  const resend = getResend();
  if (!resend || !toEmail) return;

  const roleLabel = proType === "lo" ? "Loan Officer" : "Real Estate Agent";
  const foundingLink = `${BASE}/founding`;

  try {
    await resend.emails.send({
      from: `HomeRates.ai <${FROM}>`,
      to:   toEmail,
      subject: `You're #${position} on the Founding 500 waitlist`,
      html: emailShell(`
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00e87a;">Founding 500 · Waitlist</p>
        <p style="margin:0 0 24px;font-size:22px;font-weight:800;color:#e6edf3;line-height:1.2;">You&apos;re on the list, ${firstName}.</p>

        <!-- Position number -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;background:#1c2433;border:1px solid rgba(255,255,255,0.07);border-radius:12px;">
          <tr>
            <td style="padding:24px;text-align:center;">
              <p style="margin:0 0 4px;font-size:48px;font-weight:800;color:#e6edf3;line-height:1;">#${position}</p>
              <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">Your waitlist position</p>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 20px;font-size:15px;color:#8b949e;line-height:1.7;">
          We received your application as a <strong style="color:#e6edf3">${roleLabel}</strong> in <strong style="color:#e6edf3">${state}</strong>.
          We open founding spots in waves as borrower demand grows in your market — we&apos;ll email you the moment your invite is ready.
        </p>

        <!-- What you get -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
          <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-size:15px;color:#00e87a;font-weight:700;margin-right:10px;">🏅</span>
            <span style="font-size:14px;color:#e6edf3;font-weight:600;">Founding Member badge</span>
            <span style="font-size:13px;color:#8b949e;"> — permanently on your profile</span>
          </td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-size:15px;color:#00e87a;font-weight:700;margin-right:10px;">🔒</span>
            <span style="font-size:14px;color:#e6edf3;font-weight:600;">Price locked forever</span>
            <span style="font-size:13px;color:#8b949e;"> — never pay more as we grow</span>
          </td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-size:15px;color:#00e87a;font-weight:700;margin-right:10px;">⚡</span>
            <span style="font-size:14px;color:#e6edf3;font-weight:600;">Priority scenario access</span>
            <span style="font-size:13px;color:#8b949e;"> — first-come-first-served notifications</span>
          </td></tr>
          <tr><td style="padding:10px 0;">
            <span style="font-size:15px;color:#00e87a;font-weight:700;margin-right:10px;">🗳️</span>
            <span style="font-size:14px;color:#e6edf3;font-weight:600;">Shape the product</span>
            <span style="font-size:13px;color:#8b949e;"> — vote on features, join beta tests</span>
          </td></tr>
        </table>

        <a href="${foundingLink}"
           style="display:block;text-align:center;background:#00e87a;color:#07100f;font-size:15px;font-weight:700;padding:14px 20px;border-radius:10px;text-decoration:none;margin-bottom:12px;">
          Try the platform while you wait →
        </a>
      `, "HomeRates.ai · You&apos;ll hear from us when your spot is ready. · homerates.ai"),
    });
  } catch (err) {
    console.error("[sendEmail] emailWaitlistConfirm failed:", err);
  }
}

// ─── Waitlist: invite — spot is ready, 72h to claim ─────────────────────────

export async function emailWaitlistInvite({
  toEmail,
  firstName,
  position,
  expiresAt,
}: {
  toEmail:   string;
  firstName: string;
  position:  number;
  expiresAt: Date;
}) {
  const resend = getResend();
  if (!resend || !toEmail) return;

  const expiryStr = expiresAt.toLocaleString("en-US", {
    weekday: "long", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
    timeZone: "America/Los_Angeles",
  });
  const welcomeLink = `${BASE}/welcome`;

  try {
    await resend.emails.send({
      from: `HomeRates.ai <${FROM}>`,
      to:   toEmail,
      subject: `Your Founding 500 spot is ready — claim it before it expires`,
      html: emailShell(`
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#d97706;">Founding 500 · Your Invite</p>
        <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#e6edf3;line-height:1.2;">Your spot is ready, ${firstName}.</p>

        <p style="margin:0 0 24px;font-size:15px;color:#8b949e;line-height:1.7;">
          You&apos;re waitlist position <strong style="color:#e6edf3">#${position}</strong> and a founding spot has opened in your market.
          Complete your profile to lock in your <strong style="color:#e6edf3">Founding Member badge and pricing</strong> — this invite expires in 72 hours.
        </p>

        <!-- Expiry warning -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;background:#1c2010;border:1px solid rgba(250,204,21,0.3);border-radius:10px;">
          <tr>
            <td style="padding:14px 18px;">
              <p style="margin:0 0 3px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#92400e;">⏰ Expires</p>
              <p style="margin:0;font-size:15px;font-weight:700;color:#e6edf3;">${expiryStr}</p>
              <p style="margin:4px 0 0;font-size:13px;color:#92400e;">After this, the spot moves to the next person on the waitlist.</p>
            </td>
          </tr>
        </table>

        <a href="${welcomeLink}"
           style="display:block;text-align:center;background:#d97706;color:#fff;font-size:15px;font-weight:700;padding:16px 20px;border-radius:10px;text-decoration:none;margin-bottom:12px;">
          Claim my Founding Member spot →
        </a>
        <p style="margin:0;text-align:center;font-size:13px;color:#9ca3af;">
          Questions? Reply to this email — we read every one.
        </p>
      `, "HomeRates.ai · Founding 500 · homerates.ai"),
    });
  } catch (err) {
    console.error("[sendEmail] emailWaitlistInvite failed:", err);
  }
}

// ─── Founding 500 urgency blast ──────────────────────────────────────────────
// Sent once when total pros hit ~450 — warns founding members only 50 spots remain.

export async function emailFoundingUrgency({
  toEmail,
  firstName,
  claimed,
  remaining,
}: {
  toEmail:   string;
  firstName: string | null;
  claimed:   number;
  remaining: number;
}) {
  const resend = getResend();
  if (!resend || !toEmail) return;

  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const foundingLink = `${BASE}/founding`;

  try {
    await resend.emails.send({
      from: `HomeRates.ai <${FROM}>`,
      to:   toEmail,
      subject: `Only ${remaining} Founding Member spots left — share before they're gone`,
      html: emailShell(`
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00e87a;">Founding 500 · Urgent</p>
        <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#e6edf3;line-height:1.2;">${greeting}</p>

        <p style="margin:0 0 20px;font-size:15px;color:#8b949e;line-height:1.7;">
          You're one of the <strong style="color:#e6edf3">${claimed} Founding Members</strong> on HomeRates.ai.
          There are only <strong style="color:#d97706">${remaining} spots remaining</strong> before Founding Member pricing closes forever.
        </p>

        <!-- Progress bar table -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#1c2433;border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:16px 20px;">
          <tr>
            <td>
              <p style="margin:0 0 10px;font-size:13px;color:#8b949e;">${claimed} of 500 spots claimed</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:999px;overflow:hidden;background:#2a3444;height:10px;">
                <tr>
                  <td width="${Math.round((claimed / 500) * 100)}%" style="background:#d97706;height:10px;border-radius:999px;"></td>
                  <td></td>
                </tr>
              </table>
              <p style="margin:8px 0 0;font-size:13px;font-weight:700;color:#d97706;">${remaining} spots left</p>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 24px;font-size:15px;color:#8b949e;line-height:1.7;">
          Know another mortgage professional who should be a Founding Member?
          Share your referral link now — once all 500 spots are gone, new members join at standard pricing.
        </p>

        <a href="${foundingLink}"
           style="display:block;text-align:center;background:#d97706;color:#fff;font-size:15px;font-weight:700;padding:14px 20px;border-radius:10px;text-decoration:none;margin-bottom:12px;">
          Share the Founding 500 page →
        </a>
        <a href="${BASE}/profile"
           style="display:block;text-align:center;background:#1c2433;border:1px solid rgba(255,255,255,0.07);color:#8b949e;font-size:14px;font-weight:600;padding:12px 20px;border-radius:10px;text-decoration:none;">
          Get your referral link →
        </a>
      `, "HomeRates.ai · You received this because you're a Founding Member. · homerates.ai"),
    });
  } catch (err) {
    console.error("[sendEmail] emailFoundingUrgency failed:", err);
  }
}

// ─── LO → Borrower welcome / teaser ─────────────────────────────────────────
// Sent when an LO adds a borrower by email (quick-add, no invite code needed).
// CAN-SPAM compliant: clear sender, unsubscribe link, physical address in footer.

export async function emailBorrowerWelcome({
  toEmail,
  firstName,
  loName,
  loLender,
  inviteUrl,
  liveRate,
  propertyAddress,
}: {
  toEmail:         string;
  firstName:       string | null;
  loName:          string;
  loLender:        string | null;
  inviteUrl:       string;
  liveRate:        number | null;
  propertyAddress: string | null;
}) {
  const resend = getResend();
  if (!resend || !toEmail) return;

  // Respect suppression list
  if (await isEmailSuppressed(toEmail)) return;

  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const lenderLine = loLender ? ` at ${loLender}` : "";
  const unsub = unsubscribeUrl(toEmail);

  const propertySection = propertyAddress ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#1c2433;border:1px solid rgba(255,255,255,0.07);border-radius:10px;">
      <tr><td style="padding:14px 20px;">
        <p style="margin:0 0 3px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;">Property on file</p>
        <p style="margin:0;font-size:14px;font-weight:600;color:#e6edf3;">${propertyAddress}</p>
      </td></tr>
    </table>` : "";

  try {
    await resend.emails.send({
      from: `${loName} via HomeRates.ai <${FROM}>`,
      to: toEmail,
      subject: `${loName} added you to HomeRates.ai`,
      headers: {
        "List-Unsubscribe": `<${unsub}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      html: emailShell(`
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00e87a;">Your loan officer added you</p>
        <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#e6edf3;line-height:1.2;">${greeting}</p>
        <p style="margin:0 0 24px;font-size:15px;color:#8b949e;line-height:1.7;">
          <strong style="color:#e6edf3;">${loName}</strong>${lenderLine} has added you to HomeRates.ai —
          a free AI mortgage assistant that keeps you current on rates, home values, and your financing options.
        </p>

        ${propertySection}

        <!-- Live rate teaser -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#1c2433;border:1px solid rgba(255,255,255,0.07);border-radius:10px;">
          <tr>
            <td style="padding:16px 20px;border-right:1px solid rgba(255,255,255,0.06);" width="50%">
              <p style="margin:0 0 3px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;">Today's 30Y Rate</p>
              <p style="margin:0;font-size:24px;font-weight:800;color:#008a48;">${liveRate != null ? liveRate.toFixed(2) + "%" : "—"}</p>
            </td>
            <td style="padding:16px 20px;" width="50%">
              <p style="margin:0 0 3px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;">What you get</p>
              <p style="margin:0;font-size:13px;color:#e6edf3;line-height:1.5;">Monthly home value report · Rate alerts · AI Q&amp;A</p>
            </td>
          </tr>
        </table>

        <!-- Value bullets -->
        <div style="background:#1c2433;border-left:3px solid #00e87a;border-radius:0 8px 8px 0;padding:14px 18px;margin:0 0 28px;">
          <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#e6edf3;">Your free account includes:</p>
          <p style="margin:0;font-size:13px;color:#e6edf3;line-height:1.8;">
            ✓ Monthly home equity &amp; value snapshot<br>
            ✓ Instant rate &amp; payment AI calculator<br>
            ✓ Private messaging with your loan officer<br>
            ✓ Refi opportunity alerts when rates drop
          </p>
        </div>

        <a href="${inviteUrl}"
           style="display:block;text-align:center;background:#00e87a;color:#07100f;font-size:15px;font-weight:700;padding:14px 20px;border-radius:999px;text-decoration:none;">
          Activate your free account →
        </a>
      `,
      `Sent by ${loName}${lenderLine} via HomeRates.ai. You received this because your loan officer added your email. This is not a solicitation to lend.`,
      unsub,
    ),
    });
  } catch (err) {
    console.error("[sendEmail] emailBorrowerWelcome failed:", err);
  }
}

// ─── Corporate invite: admin → org contact ───────────────────────────────────

export async function emailCorporateInvite({
  toEmail,
  contactName,
  orgName,
  orgTypeLabel,
  claimUrl,
  invitedByName,
  notes,
}: {
  toEmail: string;
  contactName: string | null;
  orgName: string;
  orgTypeLabel: string;
  claimUrl: string;
  invitedByName: string;
  notes?: string | null;
}) {
  const resend = getResend();
  if (!resend || !toEmail) return;

  const greeting = contactName ? `Hi ${contactName},` : "Hello,";

  try {
    await resend.emails.send({
      from: `HomeRates.ai <${FROM}>`,
      to: toEmail,
      subject: `${orgName} has been invited to HomeRates.ai`,
      html: emailShell(`
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00e87a;">${orgTypeLabel} Invitation</p>
        <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#e6edf3;line-height:1.2;">${orgName} is invited to HomeRates.ai</p>
        <p style="margin:0 0 16px;font-size:15px;color:#e6edf3;line-height:1.6;">${greeting}</p>
        <p style="margin:0 0 16px;font-size:15px;color:#e6edf3;line-height:1.6;">
          ${invitedByName} from HomeRates.ai has personally invited your organization to join the platform.
          HomeRates.ai gives your licensed professionals AI-powered mortgage tools, live FRED rate data, borrower management, and a searchable professional directory — all on individual plans.
        </p>
        ${notes ? `<div style="background:#f8f9fb;border-left:3px solid #00e87a;padding:12px 16px;margin:0 0 20px;border-radius:4px;"><p style="margin:0;font-size:14px;color:#e6edf3;line-height:1.6;font-style:italic;">${notes}</p></div>` : ""}
        <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">What you get with a corporate account:</p>
        <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;color:#e6edf3;line-height:2;">
          <li>One organization dashboard to track your team's activity</li>
          <li>Compliance approval — authorize your professionals to use the platform</li>
          <li>Priority enterprise support and onboarding</li>
          <li>Individual subscription pricing (each professional manages their own plan)</li>
        </ul>
        <a href="${claimUrl}" style="display:inline-block;background:#00e87a;color:#e6edf3;text-decoration:none;font-size:15px;font-weight:700;padding:14px 32px;border-radius:999px;">
          Set up your organization →
        </a>
        <p style="margin:20px 0 0;font-size:12px;color:#9aa3af;">
          This invitation link is unique to your organization. Questions? Reply to this email or contact ${invitedByName} at HomeRates.ai.
        </p>
      `),
    });
  } catch (err) {
    console.error("[sendEmail] emailCorporateInvite failed:", err);
  }
}

// ─── Deal Room activity notification ────────────────────────────────────────

export async function emailDealRoomActivity({
  toEmail,
  toName,
  fromName,
  event,
  propertyAddress,
  roomUrl,
  preview,
}: {
  toEmail:         string;
  toName:          string | null;
  fromName:        string;
  event:           'message' | 'scenario' | 'stage';
  propertyAddress: string | null;
  roomUrl:         string;
  preview?:        string | null;
}) {
  const resend = getResend();
  if (!resend || !toEmail) return;

  const greeting  = toName ? `Hi ${toName},` : 'Hi,';
  const shortAddr = propertyAddress ? propertyAddress.split(',')[0] : 'your deal';
  const addrLine  = propertyAddress
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#1c2433;border:1px solid rgba(255,255,255,0.07);border-radius:10px;">
        <tr><td style="padding:12px 18px;">
          <p style="margin:0 0 2px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;">Deal Room</p>
          <p style="margin:0;font-size:14px;font-weight:600;color:#e6edf3;">${propertyAddress}</p>
        </td></tr>
      </table>`
    : '';

  let subject = '';
  let badge   = '';
  let headline = '';
  let body    = '';

  if (event === 'message') {
    subject  = `New message in your Deal Room — ${shortAddr}`;
    badge    = 'New Message';
    headline = `${fromName} sent a message`;
    body     = preview
      ? `<div style="background:#1c2433;border-left:3px solid #00e87a;border-radius:0 8px 8px 0;padding:12px 16px;margin:0 0 24px;font-size:14px;color:#e6edf3;line-height:1.6;">${preview.slice(0,200)}${preview.length>200?'…':''}</div>`
      : '';
  } else if (event === 'scenario') {
    subject  = `New financing scenario saved — ${shortAddr}`;
    badge    = 'New Scenario';
    headline = `${fromName} saved a financing scenario`;
    body     = preview
      ? `<p style="margin:0 0 20px;font-size:14px;color:#8b949e;">Scenario: <strong style="color:#e6edf3;">${preview}</strong></p>`
      : '<p style="margin:0 0 20px;font-size:14px;color:#8b949e;">A new financing scenario has been shared with the team.</p>';
  } else {
    subject  = `Deal Room advanced to ${preview} — ${shortAddr}`;
    badge    = 'Stage Update';
    headline = `${fromName} advanced the deal to ${preview}`;
    body     = `<p style="margin:0 0 20px;font-size:14px;color:#8b949e;">The deal stage has been updated. Log in to review the latest status and next steps.</p>`;
  }

  try {
    await resend.emails.send({
      from:    `HomeRates Deal Rooms <${FROM}>`,
      to:      toEmail,
      subject,
      html: emailShell(`
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00e87a;">${badge}</p>
        <p style="margin:0 0 20px;font-size:20px;font-weight:800;color:#e6edf3;line-height:1.2;">${greeting}</p>
        <p style="margin:0 0 20px;font-size:15px;color:#8b949e;">${headline}</p>
        ${addrLine}
        ${body}
        <a href="${roomUrl}" style="display:block;text-align:center;background:#00e87a;color:#07100f;font-weight:700;font-size:15px;padding:14px 20px;border-radius:999px;text-decoration:none;">
          Open Deal Room →
        </a>
        <p style="margin:14px 0 0;text-align:center;font-size:12px;color:#8b949e;">
          You received this because you're a member of this deal room on HomeRates.ai.
        </p>
      `, 'HomeRates.ai · Deal Room notifications are transactional and cannot be unsubscribed per-room.'),
    });
  } catch (err) {
    console.error('[sendEmail] emailDealRoomActivity failed:', err);
  }
}

// ─── Deal Room invite: LO/Agent → Buyer/Team member ─────────────────────────

export async function emailDealRoomInvite({
  toEmail,
  toName,
  fromName,
  role,
  propertyAddress,
  joinUrl,
}: {
  toEmail: string;
  toName: string | null;
  fromName: string;
  role: string;
  propertyAddress: string | null;
  joinUrl: string;
}) {
  const resend = getResend();
  if (!resend || !toEmail) return;

  const roleLabel = role === 'lo' ? 'Loan Officer' : role === 'agent' ? 'Agent' : 'Buyer';
  const greeting = toName ? `Hi ${toName},` : 'Hi,';

  const propertyLine = propertyAddress
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#1c2433;border:1px solid rgba(255,255,255,0.07);border-radius:10px;">
        <tr><td style="padding:14px 20px;">
          <p style="margin:0 0 3px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;">Property</p>
          <p style="margin:0;font-size:14px;font-weight:600;color:#e6edf3;">${propertyAddress}</p>
        </td></tr>
      </table>`
    : '';

  try {
    await resend.emails.send({
      from: `${fromName} via HomeRates Deal Rooms <${FROM}>`,
      to: toEmail,
      subject: `${fromName} invited you to a Deal Room on HomeRates.ai`,
      html: emailShell(`
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00e87a;">Deal Room Invite</p>
        <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#e6edf3;line-height:1.2;">${greeting}</p>
        <p style="margin:0 0 24px;font-size:15px;color:#8b949e;line-height:1.7;">
          <strong style="color:#e6edf3;">${fromName}</strong> has invited you to join a Deal Room on HomeRates.ai as the
          <strong style="color:#e6edf3;">${roleLabel}</strong>.
          Deal Rooms are a private workspace for your real estate transaction — financing scenarios, messaging, and deal tracking in one place.
        </p>
        ${propertyLine}
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#1c2433;border:1px solid rgba(255,255,255,0.07);border-radius:10px;">
          <tr>
            <td style="padding:12px 20px;border-right:1px solid rgba(255,255,255,0.06);" width="50%">
              <p style="margin:0 0 3px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;">Your role</p>
              <p style="margin:0;font-size:15px;font-weight:700;color:#e6edf3;">${roleLabel}</p>
            </td>
            <td style="padding:12px 20px;" width="50%">
              <p style="margin:0 0 3px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;">Invited by</p>
              <p style="margin:0;font-size:15px;font-weight:700;color:#e6edf3;">${fromName}</p>
            </td>
          </tr>
        </table>
        <a href="${joinUrl}" style="display:block;text-align:center;background:#00e87a;color:#07100f;font-weight:700;font-size:15px;padding:14px 20px;border-radius:999px;text-decoration:none;">
          Join Deal Room →
        </a>
        <p style="margin:16px 0 0;text-align:center;font-size:12px;color:#8b949e;">This invite link is single-use and tied to your role in this transaction.</p>
      `, `Sent by ${fromName} via HomeRates.ai Deal Rooms. Financing scenarios shown are illustrations only — not a Loan Estimate or commitment to lend.`),
    });
  } catch (err) {
    console.error("[sendEmail] emailDealRoomInvite failed:", err);
  }
}
