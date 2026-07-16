// app/api/webhooks/clerk/route.ts
// Syncs Clerk user lifecycle events → Supabase users table
// Configure in Clerk Dashboard → Webhooks → Add endpoint:
//   URL: https://chat.homerates.ai/api/webhooks/clerk
//   Events: user.created, user.updated, user.deleted

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "../../../../lib/supabaseServer";
import { emailWelcome } from "../../../../lib/sendEmail";
import { linkBorrowerAccount } from "../../../../lib/crm/link-borrower-account";

const CLERK_WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET ?? "";

// Verify Svix signature (Clerk uses Svix for webhook delivery)
async function verifyClerkWebhook(req: NextRequest): Promise<{ valid: boolean; payload: unknown }> {
  const svixId        = req.headers.get("svix-id") ?? "";
  const svixTimestamp = req.headers.get("svix-timestamp") ?? "";
  const svixSignature = req.headers.get("svix-signature") ?? "";

  if (!svixId || !svixTimestamp || !svixSignature) {
    return { valid: false, payload: null };
  }

  const body = await req.text();

  try {
    // Dynamic import to avoid build-time issues if svix not installed
    const { Webhook } = await import("svix");
    const wh = new Webhook(CLERK_WEBHOOK_SECRET!);
    const payload = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
    return { valid: true, payload };
  } catch {
    return { valid: false, payload: null };
  }
}

export async function POST(req: NextRequest) {
  if (!CLERK_WEBHOOK_SECRET) {
    console.error("[clerk/webhook] CLERK_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const { valid, payload } = await verifyClerkWebhook(req);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = payload as { type: string; data: Record<string, unknown> };
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const { type, data } = event;

  if (type === "user.created" || type === "user.updated") {
    const userId = data.id as string;
    const emails = (data.email_addresses as Array<{ email_address: string; id: string }>) ?? [];
    const primaryEmailId = data.primary_email_address_id as string | null;
    const primaryEmail = emails.find((e) => e.id === primaryEmailId)?.email_address
      ?? emails[0]?.email_address
      ?? "";
    const firstName = (data.first_name as string) ?? "";
    const lastName  = (data.last_name as string)  ?? "";
    const fullName  = [firstName, lastName].filter(Boolean).join(" ") || null;

    const { error } = await sb.from("users").upsert(
      {
        id: userId,
        email: primaryEmail,
        full_name: fullName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id", ignoreDuplicates: false }
    );

    if (error) {
      console.error("[clerk/webhook] upsert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[clerk/webhook] ${type} — synced user ${userId}`);

    // Link borrower rows created by LOs/agents to this account (verified
    // primary email → borrowers.user_id where null). Identity link only —
    // see lib/crm/link-borrower-account.ts and Decision 10.
    if (primaryEmail) {
      await linkBorrowerAccount(sb, userId, primaryEmail);
    }

    // Send welcome email on first sign-up only
    if (type === "user.created" && primaryEmail) {
      emailWelcome({ toEmail: primaryEmail, firstName: firstName || null }).catch(
        (e) => console.error("[clerk/webhook] welcome email failed:", e)
      );
    }
  }

  if (type === "user.deleted") {
    const userId = data.id as string;
    // Soft approach: mark as deleted rather than CASCADE (preserves sub history)
    await sb.from("users").update({ updated_at: new Date().toISOString() }).eq("id", userId);
    console.log(`[clerk/webhook] user.deleted — ${userId}`);
  }

  return NextResponse.json({ ok: true });
}
