// lib/sendEmail.ts
// Thin wrapper around Resend for transactional notifications.
// All functions are fire-and-forget safe — they log errors but never throw.

import { Resend } from "resend";

const FROM = process.env.RESEND_FROM_EMAIL ?? "digest@homerates.ai";
const BASE = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

// ─── Shared email shell ──────────────────────────────────────────────────────
// Light design — white card, green accent bar, logo on white.
// Light emails are never inverted by Gmail Android dark mode.

export function emailShell(bodyHtml: string, footerText = "HomeRates.ai · homerates.ai"): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 16px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
<tr><td style="background:#ffffff;padding:28px 32px 20px;border-bottom:3px solid #00e87a;">
<img src="${BASE}/assets/homerates-email-logo.png" alt="HomeRates.ai" style="height:22px;display:block;" onerror="this.style.display='none'">
</td></tr>
<tr><td style="background:#ffffff;padding:32px;">
${bodyHtml}
</td></tr>
<tr><td style="background:#f8f9fb;padding:20px 32px;border-top:1px solid #e8ecf0;border-radius:0 0 16px 16px;">
<p style="margin:0;font-size:11px;color:#9aa3af;line-height:1.6;">${footerText}</p>
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
        <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#080c12;line-height:1.2;">You have a new connection request</p>
        <p style="margin:0 0 24px;font-size:15px;color:#6b7a8d;line-height:1.6;"><strong style="color:#1a2530;">${fromName}</strong> has started a conversation with you${loanNote}.</p>
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
    ? `<blockquote style="border-left:3px solid #00c896;padding-left:12px;color:#555;margin:12px 0;">${preview.slice(0, 200)}${preview.length > 200 ? "…" : ""}</blockquote>`
    : "";

  try {
    await resend.emails.send({
      from: `HomeRates.ai <${FROM}>`,
      to: toEmail,
      subject: `New message from ${fromName} on HomeRates.ai`,
      html: emailShell(`
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00e87a;">New Message</p>
        <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#080c12;line-height:1.2;">You have a reply</p>
        <p style="margin:0 0 16px;font-size:15px;color:#6b7a8d;"><strong style="color:#1a2530;">${fromName}</strong> sent you a message:</p>
        ${preview ? `<div style="background:#f4f6f9;border-left:3px solid #00e87a;border-radius:0 8px 8px 0;padding:14px 16px;margin:0 0 24px;font-size:14px;color:#374151;line-height:1.6;">${preview.slice(0, 200)}${preview.length > 200 ? "…" : ""}</div>` : `<div style="margin-bottom:24px;"></div>`}
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
        <p style="margin:0 0 4px;font-size:22px;font-weight:800;color:#080c12;line-height:1.2;">Hi ${toName},</p>
        <p style="margin:0 0 24px;font-size:15px;color:#6b7a8d;">A loan officer responded to your scenario.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:24px;">
          <tr><td style="padding:14px 20px;border-bottom:1px solid #e8ecf0;">
            <span style="display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Loan Officer</span>
            <span style="font-size:15px;font-weight:600;color:#1a2530;">${loName}</span>
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
    : `<div style="width:64px;height:64px;border-radius:50%;background:#e8f5ef;border:2px solid #00e87a;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:#008a48;">${pro.name.charAt(0).toUpperCase()}</div>`;

  const licenseLabel = pro.role === "agent" ? "License #" : "NMLS #";
  const rows = [
    pro.phone       ? `<tr><td style="color:#9ca3af;font-size:12px;padding:4px 0;white-space:nowrap;padding-right:16px;">Phone</td><td style="font-size:14px;"><a href="tel:${pro.phone}" style="color:#008a48;text-decoration:none;">${pro.phone}</a></td></tr>` : "",
    pro.email       ? `<tr><td style="color:#9ca3af;font-size:12px;padding:4px 0;white-space:nowrap;padding-right:16px;">Email</td><td style="font-size:14px;"><a href="mailto:${pro.email}" style="color:#008a48;text-decoration:none;">${pro.email}</a></td></tr>` : "",
    pro.nmls        ? `<tr><td style="color:#9ca3af;font-size:12px;padding:4px 0;white-space:nowrap;padding-right:16px;">${licenseLabel}</td><td style="font-size:14px;color:#1a2530;">${pro.nmls}</td></tr>` : "",
    pro.companyNmls ? `<tr><td style="color:#9ca3af;font-size:12px;padding:4px 0;white-space:nowrap;padding-right:16px;">Company NMLS</td><td style="font-size:14px;color:#1a2530;">${pro.companyNmls}</td></tr>` : "",
    pro.licenseState ? `<tr><td style="color:#9ca3af;font-size:12px;padding:4px 0;white-space:nowrap;padding-right:16px;">Licensed in</td><td style="font-size:14px;color:#1a2530;">${pro.licenseState}</td></tr>` : "",
    pro.officeAddress ? `<tr><td style="color:#9ca3af;font-size:12px;padding:4px 0;white-space:nowrap;padding-right:16px;">Office</td><td style="font-size:14px;color:#1a2530;">${pro.officeAddress}</td></tr>` : "",
    pro.website     ? `<tr><td style="color:#9ca3af;font-size:12px;padding:4px 0;white-space:nowrap;padding-right:16px;">Web</td><td style="font-size:14px;"><a href="${pro.website}" style="color:#008a48;text-decoration:none;">${pro.website.replace(/^https?:\/\//, "")}</a></td></tr>` : "",
  ].filter(Boolean).join("");

  return emailShell(`
    <p style="margin:0 0 16px;font-size:14px;color:#6b7a8d;">You're connected — here are their full contact details:</p>

    <table cellpadding="0" cellspacing="0" width="100%" style="background:#f4f6f9;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;margin-bottom:24px;">
      <tr>
        <td style="padding:20px 16px 20px 20px;vertical-align:top;width:80px;">
          ${avatar}
        </td>
        <td style="padding:20px 20px 20px 0;vertical-align:top;">
          <div style="font-size:19px;font-weight:700;color:#080c12;margin-bottom:3px;">${pro.name}</div>
          ${pro.title   ? `<div style="font-size:13px;color:#008a48;font-weight:600;margin-bottom:2px;">${pro.title}</div>` : ""}
          ${pro.company ? `<div style="font-size:13px;color:#6b7a8d;margin-bottom:10px;">${pro.company}</div>` : `<div style="margin-bottom:10px;"></div>`}
          ${pro.bio     ? `<div style="font-size:13px;color:#374151;line-height:1.55;border-left:3px solid #00e87a;padding-left:10px;font-style:italic;">${pro.bio}</div>` : ""}
        </td>
      </tr>
      <tr><td colspan="2" style="padding:0 20px;"><div style="height:1px;background:#e2e8f0;"></div></td></tr>
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
          <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#080c12;line-height:1.2;">Hi ${pro.name},</p>
          <p style="margin:0 0 20px;font-size:15px;color:#6b7a8d;"><strong style="color:#1a2530;">${borrowerName}</strong> is ready to move forward and shared their contact details with you:</p>
          <div style="background:#f4f6f9;border:1px solid #e2e8f0;border-left:4px solid #00e87a;border-radius:8px;padding:16px 20px;margin:0 0 24px;font-size:17px;font-weight:700;color:#080c12;">${borrowerContact}</div>
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
        <p style="margin:0 0 24px;font-size:24px;font-weight:800;color:#080c12;line-height:1.2;">${greeting}</p>
        <p style="margin:0 0 28px;font-size:15px;color:#6b7a8d;line-height:1.7;">HomeRates.ai gives you instant mortgage intelligence — real rates, real analysis, no loan officer gating. Ask anything about buying, refinancing, or investing in real estate.</p>

        <!-- Feature list -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
          <tr><td style="padding:10px 0;border-bottom:1px solid #e8ecf0;">
            <span style="font-size:15px;color:#00e87a;font-weight:700;margin-right:10px;">→</span>
            <span style="font-size:14px;color:#1a2530;font-weight:600;">Mortgage AI Chat</span>
            <span style="font-size:13px;color:#6b7a8d;"> — rates, affordability, DSCR, refi analysis</span>
          </td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #e8ecf0;">
            <span style="font-size:15px;color:#00e87a;font-weight:700;margin-right:10px;">→</span>
            <span style="font-size:14px;color:#1a2530;font-weight:600;">Loan Limit Explorer</span>
            <span style="font-size:13px;color:#6b7a8d;"> — 2026 conforming limits by county and ZIP</span>
          </td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #e8ecf0;">
            <span style="font-size:15px;color:#00e87a;font-weight:700;margin-right:10px;">→</span>
            <span style="font-size:14px;color:#1a2530;font-weight:600;">Rate Alerts</span>
            <span style="font-size:13px;color:#6b7a8d;"> — get notified when rates hit your target</span>
          </td></tr>
          <tr><td style="padding:10px 0;">
            <span style="font-size:15px;color:#00e87a;font-weight:700;margin-right:10px;">→</span>
            <span style="font-size:14px;color:#1a2530;font-weight:600;">Connect with LOs</span>
            <span style="font-size:13px;color:#6b7a8d;"> — post a scenario, get competing responses</span>
          </td></tr>
        </table>

        <a href="${chatLink}" style="display:block;text-align:center;background:#00e87a;color:#07100f;font-weight:700;font-size:16px;padding:16px 20px;border-radius:999px;text-decoration:none;margin-bottom:16px;">Start your first conversation →</a>

        <p style="margin:0;text-align:center;font-size:13px;color:#6b7a8d;">Want rent AVM, cap rate, and investment cash flow? <a href="${pricingLink}" style="color:#008a48;text-decoration:none;">Upgrade to Pro →</a></p>
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
        <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#080c12;line-height:1.2;">${greeting}</p>
        <p style="margin:0 0 24px;font-size:15px;color:#6b7a8d;line-height:1.7;">
          <strong style="color:#1a2530">${fromName}</strong> has added
          <strong style="color:#008a48">${amount.toLocaleString()} credits</strong> to your HomeRates.ai account.
        </p>

        ${note ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
          <tr>
            <td style="background:#f4f6f9;border-left:3px solid #00e87a;border-radius:0 8px 8px 0;padding:12px 16px;">
              <p style="margin:0;font-size:14px;color:#6b7a8d;font-style:italic;">"${note}"</p>
            </td>
          </tr>
        </table>` : ""}

        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;background:#f4f6f9;border:1px solid #e2e8f0;border-radius:10px;">
          <tr>
            <td style="padding:16px 20px;border-right:1px solid #e2e8f0;" width="50%">
              <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">Credits added</p>
              <p style="margin:0;font-size:22px;font-weight:800;color:#008a48;">+${amount.toLocaleString()}</p>
            </td>
            <td style="padding:16px 20px;" width="50%">
              <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">New balance</p>
              <p style="margin:0;font-size:22px;font-weight:800;color:#080c12;">${newBalance.toLocaleString()}</p>
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
