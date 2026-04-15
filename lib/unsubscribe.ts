// lib/unsubscribe.ts
// CAN-SPAM unsubscribe helpers — token generation, suppression lookup, one-click handler.

import { createHmac } from "crypto";
import { getSupabase } from "./supabaseServer";

const BASE = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai";

// ── Token helpers ────────────────────────────────────────────────────────────
// HMAC-SHA256(email.toLowerCase(), UNSUBSCRIBE_SECRET)
// Deterministic — no extra DB row needed just to generate a link.

function secret(): string {
  return process.env.UNSUBSCRIBE_SECRET ?? process.env.RESEND_API_KEY ?? "fallback-secret";
}

export function unsubscribeToken(email: string): string {
  return createHmac("sha256", secret()).update(email.toLowerCase()).digest("hex");
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  return unsubscribeToken(email) === token;
}

export function unsubscribeUrl(email: string): string {
  const token = unsubscribeToken(email);
  const params = new URLSearchParams({ email: email.toLowerCase(), token });
  return `${BASE}/api/unsubscribe?${params.toString()}`;
}

// ── Suppression check ────────────────────────────────────────────────────────

export async function isEmailSuppressed(email: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { data } = await sb
    .from("email_suppression")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return !!data;
}

export async function suppressEmail(email: string, source: "unsubscribe" | "bounce" | "complaint" = "unsubscribe"): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb
    .from("email_suppression")
    .upsert({ email: email.toLowerCase(), source }, { onConflict: "email", ignoreDuplicates: true });
}
