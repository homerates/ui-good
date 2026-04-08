// lib/adminAuth.ts
// Single source of truth for admin access checks.
// Uses hardcoded Clerk user IDs (same pattern as ADMIN_USER_IDS in chat/page.tsx).
// Extend this set as you add team members.

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const ADMIN_IDS = new Set([
  "user_35xDE51bR0NTaKEpwZMbHtn752O", // Rayaan
]);

export function isAdminId(userId: string | null | undefined): boolean {
  return !!userId && ADMIN_IDS.has(userId);
}

/** Use in API routes — returns { userId } or a 403 NextResponse */
export async function requireAdmin(): Promise<
  { userId: string; error: null } | { userId: null; error: NextResponse }
> {
  const { userId } = await auth();
  if (!isAdminId(userId)) {
    return {
      userId: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { userId: userId!, error: null };
}
