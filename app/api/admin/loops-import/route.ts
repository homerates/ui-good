// app/api/admin/loops-import/route.ts
// POST — admin tool: bulk-add contacts to Loops CRM + send outreach email via Resend

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requireAdmin } from "../../../../lib/adminAuth";
import { emailShell } from "../../../../lib/sendEmail";

type Contact = { name: string; email: string };

const BASE = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai";
const FROM = process.env.RESEND_FROM_EMAIL ?? "digest@mail.homerates.ai";
const LOOPS_API = "https://app.loops.so/api/v1";

const LO_QUESTIONS = [
  {
    label: "Purchase — $500k conventional, 10% down",
    sq: "Conventional loan on a $500,000 home with 10% down — show me the full payment breakdown including PMI.",
  },
  {
    label: "Jumbo — $1.5M, 20% down",
    sq: "Jumbo loan on a $1,500,000 home with 20% down — show me the full payment breakdown and reserve requirements.",
  },
  {
    label: "Affordability — $120k income, $42k saved",
    sq: "I make $120,000 a year and have $42,000 saved — how much house can I afford?",
  },
];

const CONSUMER_QUESTIONS = [
  {
    label: "What can I afford with my income?",
    sq: "Based on my income, what home price can I afford and what would my monthly payment look like?",
  },
  {
    label: "Should I buy now or wait for rates to drop?",
    sq: "Should I buy a home now or wait for mortgage rates to drop?",
  },
  {
    label: "What would my payment be on a $500k home?",
    sq: "What would my monthly payment be on a $500,000 home with 10% down?",
  },
];

function buildOutreachEmail(audience: "lo" | "consumer", firstName: string): string {
  const questions = audience === "lo" ? LO_QUESTIONS : CONSUMER_QUESTIONS;
  const subject =
    audience === "lo"
      ? "3 questions your borrowers are asking right now"
      : "3 things homebuyers are wondering right now";
  const intro =
    audience === "lo"
      ? "Here are 3 questions your borrowers are asking — click any to get an AI answer in seconds:"
      : "Here are 3 questions homebuyers like you are asking right now — click any for an instant answer:";

  const questionRows = questions
    .map(
      (q, i) => `
      <tr>
        <td style="padding:0 0 14px;">
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td width="28" style="vertical-align:top;padding-top:2px;">
                <span style="font-size:15px;font-weight:800;color:#00e87a;">${i + 1}.</span>
              </td>
              <td>
                <a href="${BASE}/chat?sq=${encodeURIComponent(q.sq)}"
                   style="font-size:14px;color:#e6edf3;text-decoration:underline;text-underline-offset:2px;line-height:1.5;">
                  ${q.label}
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    )
    .join("");

  const greeting = firstName ? `Hi ${firstName},` : "Hi,";

  const body = `
    <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#00e87a;">
      ${audience === "lo" ? "For Loan Officers & Brokers" : "Mortgage Intelligence"}
    </p>
    <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#e6edf3;line-height:1.2;">${greeting}</p>
    <p style="margin:0 0 24px;font-size:15px;color:#8b949e;line-height:1.6;">${intro}</p>

    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#1c2433;border:1px solid rgba(255,255,255,0.07);border-radius:12px;margin-bottom:28px;">
      <tr>
        <td style="padding:20px 24px;">
          ${questionRows}
        </td>
      </tr>
    </table>

    <a href="${BASE}/chat"
       style="display:block;text-align:center;background:#00e87a;color:#07100f;font-size:15px;font-weight:700;
              padding:14px 20px;border-radius:999px;text-decoration:none;margin-bottom:20px;">
      Try HomeRates.ai →
    </a>

    <p style="margin:0;text-align:center;font-size:13px;color:#8b949e;line-height:1.6;">
      ${
        audience === "lo"
          ? "AI mortgage intelligence for loan officers — real rates, real analysis, instant answers."
          : "Free AI mortgage assistant — ask anything about buying, rates, or affordability."
      }
    </p>
  `;

  return emailShell(body, "HomeRates.ai · homerates.ai");
}

async function addToLoops(email: string, firstName: string, lastName: string | undefined, userGroup: string) {
  if (!process.env.LOOPS_API_KEY) return; // silently skip if not configured
  await fetch(`${LOOPS_API}/contacts/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LOOPS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      firstName,
      ...(lastName ? { lastName } : {}),
      userGroup,
      source: "admin-outreach-import",
    }),
  }).catch(() => {}); // fire-and-forget, don't fail the whole send
}

export async function POST(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { contacts, audience } = (await req.json()) as {
    contacts: Contact[];
    audience: "lo" | "consumer";
  };

  if (!Array.isArray(contacts) || contacts.length === 0)
    return NextResponse.json({ error: "No contacts provided" }, { status: 400 });

  if (!process.env.RESEND_API_KEY)
    return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const userGroup = audience === "lo" ? "Loan Officer" : "Consumer";
  const subject =
    audience === "lo"
      ? "3 questions your borrowers are asking right now"
      : "3 things homebuyers are wondering right now";

  const errors: string[] = [];
  let added = 0;
  let failed = 0;

  for (const c of contacts) {
    const email = c.email.trim().toLowerCase();
    const nameParts = c.name.trim().split(" ");
    const firstName = nameParts[0] ?? "";
    const lastName = nameParts.slice(1).join(" ") || undefined;

    // Add to Loops CRM (best-effort, non-blocking)
    await addToLoops(email, firstName, lastName, userGroup);

    // Send outreach email via Resend
    const html = buildOutreachEmail(audience, firstName);
    const { error: sendErr } = await resend.emails.send({
      from: `HomeRates.ai <${FROM}>`,
      to: email,
      subject,
      html,
    });

    if (sendErr) {
      errors.push(`${email}: ${sendErr.message}`.slice(0, 120));
      failed++;
    } else {
      added++;
    }

    // Stay within Resend rate limits (~10 req/s)
    await new Promise((r) => setTimeout(r, 120));
  }

  return NextResponse.json({ added, failed, errors });
}
