// lib/adminAuth.ts
// Single source of truth for admin access checks.
//
// Primary source: admin_users table in Supabase (managed via /admin panel).
// Bootstrap fallback: BOOTSTRAP_ADMIN_ID below — always has access even if
// the table is empty or the DB is unavailable. Do not remove this.
//
// To add admins without code changes: use /admin → Manage Admins.

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabase } from "./supabaseServer";

// ── Bootstrap fallback — never remove this ID ────────────────────────────────
const BOOTSTRAP_ADMIN_IDS = new Set([
  "user_35xDE51bR0NTaKEpwZMbHtn752O", // Rayaan — bootstrap admin
]);

// ── In-memory cache (server process lifetime, refreshed every 5 min) ─────────
let cachedAdminIds: Set<string> | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchAdminIdsFromDB(): Promise<Set<string>> {
  const sb = getSupabase();
  if (!sb) return new Set();
  try {
    const { data, error } = await sb
      .from("admin_users")
      .select("clerk_user_id");
    if (error || !data) return new Set();
    return new Set(data.map((r: { clerk_user_id: string }) => r.clerk_user_id));
  } catch {
    return new Set();
  }
}

async function getAdminIds(): Promise<Set<string>> {
  const now = Date.now();
  if (cachedAdminIds && now < cacheExpiresAt) return cachedAdminIds;
  const dbIds = await fetchAdminIdsFromDB();
  // Merge DB ids with bootstrap ids
  const merged = new Set([...BOOTSTRAP_ADMIN_IDS, ...dbIds]);
  cachedAdminIds = merged;
  cacheExpiresAt = now + CACHE_TTL_MS;
  return merged;
}

/** Invalidates the cache so the next check re-fetches from DB */
export function invalidateAdminCache() {
  cachedAdminIds = null;
  cacheExpiresAt = 0;
}

/** Check if a Clerk user ID is an admin (async — checks DB + bootstrap) */
export async function isAdminId(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  if (BOOTSTRAP_ADMIN_IDS.has(userId)) return true; // fast path
  const ids = await getAdminIds();
  return ids.has(userId);
}

/** Use in API routes — returns { userId } or a 403 NextResponse */
export async function requireAdmin(): Promise<
  { userId: string; error: null } | { userId: null; error: NextResponse }
> {
  const { userId } = await auth();
  const ok = await isAdminId(userId);
  if (!ok) {
    return {
      userId: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { userId: userId!, error: null };
}
