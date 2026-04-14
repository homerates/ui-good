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
// All transactional emails must use this shell so header/footer are always
// #080c12 dark with the logo image — never plain text "HomeRates.ai".

export function emailShell(bodyHtml: string, footerText = "HomeRates.ai · homerates.ai"): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 0;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
      <tr><td style="background:#080c12;border-radius:16px 16px 0 0;padding:24px 32px;text-align:center;">
        <img src="${BASE}/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" style="height:24px;" onerror="this.style.display='none'">
      </td></tr>
      <tr><td style="background:#0d1a12;padding:32px;">
        ${bodyHtml}
      </td></tr>
      <tr><td style="background:#080c12;border-radius:0 0 16px 16px;padding:16px 32px;text-align:center;">
        <p style="margin:0;font-size:11px;color:#3a4560;">${footerText}</p>
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
      html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f6f9;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 0;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
      <tr><td style="background:#080c12;border-radius:16px 16px 0 0;padding:24px 32px;text-align:center;">
        <img src="${BASE}/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" style="height:24px;" onerror="this.style.display='none'">
      </td></tr>
      <tr><td style="background:#0d1a12;padding:32px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00e87a;">New Message</p>
        <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#f0f4ff;line-height:1.2;">You have a new connection request</p>
        <p style="margin:0 0 24px;font-size:15px;color:#7a9e8a;line-height:1.6;"><strong style="color:#e8f5ee;">${fromName}</strong> has started a conversation with you${loanNote}.</p>
        <a href="${link}" style="display:inline-block;background:#00e87a;color:#07100f;font-weight:700;font-size:15px;padding:14px 28px;border-radius:999px;text-decoration:none;">View Message →</a>
      </td></tr>
      <tr><td style="background:#080c12;border-radius:0 0 16px 16px;padding:16px 32px;text-align:center;">
        <p style="margin:0;font-size:11px;color:#3a4560;">HomeRates.ai · Confidential borrower connection</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
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
      html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f6f9;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 0;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
      <tr><td style="background:#080c12;border-radius:16px 16px 0 0;padding:24px 32px;text-align:center;">
        <img src="${BASE}/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" style="height:24px;" onerror="this.style.display='none'">
      </td></tr>
      <tr><td style="background:#0d1a12;padding:32px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00e87a;">New Message</p>
        <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#f0f4ff;line-height:1.2;">You have a reply</p>
        <p style="margin:0 0 16px;font-size:15px;color:#7a9e8a;"><strong style="color:#e8f5ee;">${fromName}</strong> sent you a message:</p>
        ${preview ? `<div style="background:#141b28;border-left:3px solid #00e87a;border-radius:0 8px 8px 0;padding:14px 16px;margin:0 0 24px;font-size:14px;color:#b0c4b8;line-height:1.6;">${preview.slice(0, 200)}${preview.length > 200 ? "…" : ""}</div>` : `<div style="margin-bottom:24px;"></div>`}
        <a href="${link}" style="display:inline-block;background:#00e87a;color:#07100f;font-weight:700;font-size:15px;padding:14px 28px;border-radius:999px;text-decoration:none;">Reply →</a>
      </td></tr>
      <tr><td style="background:#080c12;border-radius:0 0 16px 16px;padding:16px 32px;text-align:center;">
        <p style="margin:0;font-size:11px;color:#3a4560;">HomeRates.ai · Confidential borrower connection</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
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
        <p style="margin:0 0 4px;font-size:22px;font-weight:800;color:#f0f4ff;line-height:1.2;">Hi ${toName},</p>
        <p style="margin:0 0 24px;font-size:15px;color:#7a9e8a;">A loan officer responded to your scenario.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#141b28;border:1px solid #1a2e20;border-radius:12px;margin-bottom:24px;">
          <tr><td style="padding:14px 20px;border-bottom:1px solid #1a2e20;">
            <span style="display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#4a6e58;margin-bottom:3px;">Loan Officer</span>
            <span style="font-size:15px;font-weight:600;color:#e8f5ee;">${loName}</span>
          </td></tr>
          <tr><td style="padding:14px 20px;">
            <span style="display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#4a6e58;margin-bottom:3px;">Rate Indication</span>
            <span style="font-size:15px;font-weight:600;color:#00e87a;">${rateEstimate}</span>
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
    ? `<img src="${pro.photoUrl}" alt="${pro.name}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:2px solid #00c896;display:block;">`
    : `<div style="width:72px;height:72px;border-radius:50%;background:#0e3a28;border:2px solid #00c896;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:#00c896;">${pro.name.charAt(0).toUpperCase()}</div>`;

  const licenseLabel = pro.role === "agent" ? "License #" : "NMLS #";
  const rows = [
    pro.phone       ? `<tr><td style="color:#888;font-size:12px;padding:3px 0;white-space:nowrap;padding-right:16px;">📞 Phone</td><td style="font-size:14px;"><a href="tel:${pro.phone}" style="color:#00c896;text-decoration:none;">${pro.phone}</a></td></tr>` : "",
    pro.email       ? `<tr><td style="color:#888;font-size:12px;padding:3px 0;white-space:nowrap;padding-right:16px;">✉️ Email</td><td style="font-size:14px;"><a href="mailto:${pro.email}" style="color:#00c896;text-decoration:none;">${pro.email}</a></td></tr>` : "",
    pro.nmls        ? `<tr><td style="color:#888;font-size:12px;padding:3px 0;white-space:nowrap;padding-right:16px;">${licenseLabel}</td><td style="font-size:14px;color:#f0f4ff;">${pro.nmls}</td></tr>` : "",
    pro.companyNmls ? `<tr><td style="color:#888;font-size:12px;padding:3px 0;white-space:nowrap;padding-right:16px;">Company NMLS</td><td style="font-size:14px;color:#f0f4ff;">${pro.companyNmls}</td></tr>` : "",
    pro.licenseState ? `<tr><td style="color:#888;font-size:12px;padding:3px 0;white-space:nowrap;padding-right:16px;">Licensed in</td><td style="font-size:14px;color:#f0f4ff;">${pro.licenseState}</td></tr>` : "",
    pro.officeAddress ? `<tr><td style="color:#888;font-size:12px;padding:3px 0;white-space:nowrap;padding-right:16px;">📍 Office</td><td style="font-size:14px;color:#f0f4ff;">${pro.officeAddress}</td></tr>` : "",
    pro.website     ? `<tr><td style="color:#888;font-size:12px;padding:3px 0;white-space:nowrap;padding-right:16px;">🔗 Web</td><td style="font-size:14px;"><a href="${pro.website}" style="color:#00c896;text-decoration:none;">${pro.website.replace(/^https?:\/\//, "")}</a></td></tr>` : "",
  ].filter(Boolean).join("");

  return `
<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#080c12;border-radius:16px 16px 0 0;padding:24px 32px;text-align:center;">
          <img src="${BASE}/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" style="height:24px;" onerror="this.style.display='none'">
        </td></tr>

        <!-- Pro card -->
        <tr><td style="background:#0e1420;padding:32px;">
          <p style="margin:0 0 24px;font-size:14px;color:#8fa3b8;">You're connected — here are their full contact details:</p>

          <!-- Card -->
          <table cellpadding="0" cellspacing="0" width="100%" style="background:#141b28;border:1px solid rgba(0,200,150,0.2);border-radius:14px;overflow:hidden;">
            <tr>
              <!-- Avatar col -->
              <td style="padding:24px 20px;vertical-align:top;width:92px;">
                ${avatar}
              </td>
              <!-- Name + title col -->
              <td style="padding:24px 24px 24px 0;vertical-align:top;">
                <div style="font-size:20px;font-weight:700;color:#f0f4ff;margin-bottom:3px;">${pro.name}</div>
                ${pro.title   ? `<div style="font-size:13px;color:#00c896;font-weight:600;margin-bottom:2px;">${pro.title}</div>` : ""}
                ${pro.company ? `<div style="font-size:13px;color:#8fa3b8;margin-bottom:12px;">${pro.company}</div>` : `<div style="margin-bottom:12px;"></div>`}
                ${pro.bio     ? `<div style="font-size:13px;color:#a0b4c8;line-height:1.55;border-left:3px solid #00c896;padding-left:10px;font-style:italic;">${pro.bio}</div>` : ""}
              </td>
            </tr>

            <!-- Divider -->
            <tr><td colspan="2" style="padding:0 24px;"><div style="height:1px;background:rgba(255,255,255,0.07);"></div></td></tr>

            <!-- Contact rows -->
            <tr><td colspan="2" style="padding:16px 24px 20px;">
              <table cellpadding="0" cellspacing="0">${rows}</table>
            </td></tr>
          </table>

          <!-- CTA -->
          <div style="text-align:center;margin-top:28px;">
            <a href="${link}" style="display:inline-block;background:#00c896;color:#000;font-weight:700;font-size:15px;padding:14px 32px;border-radius:999px;text-decoration:none;">
              View Conversation →
            </a>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#080c12;border-radius:0 0 16px 16px;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#3a4560;line-height:1.6;">
            HomeRates.ai · Contact shared with your consent.<br>
            ${pro.nmls ? `This professional is NMLS licensed. Always verify credentials at <a href="https://nmlsconsumeraccess.org" style="color:#3a4560;">nmlsconsumeraccess.org</a>` : ""}
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
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
          <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#f0f4ff;line-height:1.2;">Hi ${pro.name},</p>
          <p style="margin:0 0 20px;font-size:15px;color:#7a9e8a;"><strong style="color:#e8f5ee;">${borrowerName}</strong> is ready to move forward and shared their contact details with you:</p>
          <div style="background:#141b28;border:1px solid #1a2e20;border-left:4px solid #00e87a;border-radius:8px;padding:16px 20px;margin:0 0 24px;font-size:17px;font-weight:700;color:#e8f5ee;">${borrowerContact}</div>
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
