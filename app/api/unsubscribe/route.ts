// app/api/unsubscribe/route.ts
// CAN-SPAM one-click unsubscribe — no login required.
// GET /api/unsubscribe?email=...&token=HMAC
// Also handles POST for List-Unsubscribe-Post header (RFC 8058).

import { NextRequest, NextResponse } from "next/server";
import { verifyUnsubscribeToken, suppressEmail } from "../../../lib/unsubscribe";

const BASE = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai";

async function handleUnsubscribe(email: string | null, token: string | null) {
  if (!email || !token) {
    return new NextResponse(confirmationPage("Invalid link", "This unsubscribe link is missing required parameters. Contact support@homerates.ai if you need help."), {
      status: 400, headers: { "Content-Type": "text/html" },
    });
  }

  if (!verifyUnsubscribeToken(email, token)) {
    return new NextResponse(confirmationPage("Invalid link", "This unsubscribe link is invalid or has expired. Contact support@homerates.ai if you need help."), {
      status: 400, headers: { "Content-Type": "text/html" },
    });
  }

  await suppressEmail(email, "unsubscribe");

  return new NextResponse(confirmationPage("You've been unsubscribed", `<strong>${email}</strong> has been removed from all HomeRates marketing emails. You may still receive transactional emails (account security, messages from your loan officer).`), {
    status: 200, headers: { "Content-Type": "text/html" },
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return handleUnsubscribe(searchParams.get("email"), searchParams.get("token"));
}

// RFC 8058 — List-Unsubscribe-Post header support
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return handleUnsubscribe(searchParams.get("email"), searchParams.get("token"));
}

// ── Confirmation page ────────────────────────────────────────────────────────

function confirmationPage(title: string, message: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — HomeRates.ai</title>
<style>
  body { margin:0; font-family:'Helvetica Neue',Arial,sans-serif; background:#f0f2f5; display:flex; align-items:center; justify-content:center; min-height:100vh; }
  .card { background:#fff; border-radius:16px; box-shadow:0 2px 12px rgba(0,0,0,.08); max-width:480px; width:90%; overflow:hidden; }
  .hdr { background:#e8ecf0; padding:24px 32px; border-bottom:3px solid #00e87a; }
  .hdr img { height:30px; display:block; }
  .body { padding:32px; }
  h1 { margin:0 0 12px; font-size:1.3rem; color:#080c12; }
  p { margin:0 0 24px; font-size:0.9rem; color:#6b7a8d; line-height:1.6; }
  a { color:#008a48; }
  .home { display:inline-block; background:#00e87a; color:#07100f; font-weight:700; padding:11px 24px; border-radius:999px; text-decoration:none; font-size:0.9rem; }
</style>
</head><body>
<div class="card">
  <div class="hdr"><img src="${BASE}/assets/homerates-email-logo.png" alt="HomeRates.ai" onerror="this.style.display='none'"></div>
  <div class="body">
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="${BASE}" class="home">Back to HomeRates.ai →</a>
  </div>
</div>
</body></html>`;
}
