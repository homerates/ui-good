// app/api/admin/loops-import/route.ts
// POST — admin tool to bulk-add contacts to Loops + fire outreach event

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/adminAuth";

type Contact = { name: string; email: string };

const LOOPS_API = "https://app.loops.so/api/v1";

async function loopsPost(path: string, body: object) {
  const res = await fetch(`${LOOPS_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LOOPS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return res;
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

  if (!process.env.LOOPS_API_KEY)
    return NextResponse.json({ error: "LOOPS_API_KEY not configured" }, { status: 500 });

  const eventName = audience === "lo" ? "outreach_123_lo" : "outreach_123_consumer";
  const userGroup = audience === "lo" ? "Loan Officer" : "Consumer";

  const errors: string[] = [];
  let added = 0;
  let failed = 0;

  for (const c of contacts) {
    const email = c.email.trim().toLowerCase();
    const nameParts = c.name.trim().split(" ");
    const firstName = nameParts[0] ?? "";
    const lastName = nameParts.slice(1).join(" ") || undefined;

    // 1. Create / update contact
    const createRes = await loopsPost("/contacts/create", {
      email,
      firstName,
      ...(lastName ? { lastName } : {}),
      userGroup,
      source: "admin-outreach-import",
    });

    if (!createRes.ok) {
      const body = await createRes.text().catch(() => "");
      errors.push(`${email}: contact create failed (${createRes.status}) ${body}`.slice(0, 120));
      failed++;
      continue;
    }

    // 2. Fire the outreach event — triggers Loops email template
    const eventRes = await loopsPost("/events/send", {
      email,
      eventName,
    });

    if (!eventRes.ok) {
      const body = await eventRes.text().catch(() => "");
      errors.push(`${email}: event send failed (${eventRes.status}) ${body}`.slice(0, 120));
      failed++;
      continue;
    }

    added++;

    // Small pause to stay within Loops rate limit (~10 req/s)
    await new Promise((r) => setTimeout(r, 120));
  }

  return NextResponse.json({ added, failed, errors });
}
