// lib/sendEmail.ts
// Thin wrapper around Resend for transactional notifications.
// All functions are fire-and-forget safe — they log errors but never throw.

import { Resend } from "resend";

const FROM = process.env.RESEND_FROM_EMAIL ?? "notifications@homerates.ai";
const BASE = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
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
      html: `
        <p>Hi ${toName},</p>
        <p><strong>${fromName}</strong> has initiated a conversation with you${loanNote}.</p>
        <p><a href="${link}" style="background:#00c896;color:#000;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600;">View Message →</a></p>
        <p style="color:#888;font-size:12px;">HomeRates.ai · Confidential borrower connection</p>
      `,
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
      html: `
        <p>Hi ${toName},</p>
        <p><strong>${fromName}</strong> sent you a message.</p>
        ${previewSnippet}
        <p><a href="${link}" style="background:#00c896;color:#000;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600;">Reply →</a></p>
        <p style="color:#888;font-size:12px;">HomeRates.ai · Confidential borrower connection</p>
      `,
    });
  } catch (err) {
    console.error("[sendEmail] emailNewReply failed:", err);
  }
}

// ─── Contact share: email both parties ──────────────────────────────────────

export async function emailContactShare({
  borrowerEmail,
  borrowerName,
  borrowerPhone,
  proEmail,
  proName,
  proPhone,
  threadId,
}: {
  borrowerEmail: string | null;
  borrowerName: string;
  borrowerPhone?: string | null;
  proEmail: string | null;
  proName: string;
  proPhone?: string | null;
  threadId: string;
}) {
  const resend = getResend();
  if (!resend) return;

  const link = `${BASE}/messages/${threadId}`;

  // Email to professional — gets borrower's contact
  if (proEmail) {
    const borrowerContact = [borrowerEmail, borrowerPhone].filter(Boolean).join(" · ");
    try {
      await resend.emails.send({
        from: `HomeRates.ai <${FROM}>`,
        to: proEmail,
        subject: `${borrowerName} shared their contact info`,
        html: `
          <p>Hi ${proName},</p>
          <p><strong>${borrowerName}</strong> is ready to move forward and shared their contact details with you:</p>
          <p style="font-size:16px;font-weight:600;">${borrowerContact}</p>
          <p><a href="${link}" style="background:#00c896;color:#000;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600;">View Conversation →</a></p>
          <p style="color:#888;font-size:12px;">HomeRates.ai · This contact was shared with your consent.</p>
        `,
      });
    } catch (err) {
      console.error("[sendEmail] emailContactShare (pro) failed:", err);
    }
  }

  // Email to borrower — gets professional's contact
  if (borrowerEmail) {
    const proContact = [proEmail, proPhone].filter(Boolean).join(" · ");
    try {
      await resend.emails.send({
        from: `HomeRates.ai <${FROM}>`,
        to: borrowerEmail,
        subject: `You're connected with ${proName}`,
        html: `
          <p>Hi ${borrowerName},</p>
          <p>Great news — you're connected with <strong>${proName}</strong>. Here are their contact details:</p>
          <p style="font-size:16px;font-weight:600;">${proContact}</p>
          <p><a href="${link}" style="background:#00c896;color:#000;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600;">View Conversation →</a></p>
          <p style="color:#888;font-size:12px;">HomeRates.ai · Next step: reach out directly to start your application.</p>
        `,
      });
    } catch (err) {
      console.error("[sendEmail] emailContactShare (borrower) failed:", err);
    }
  }
}
