// app/api/admin/check/route.ts
// Returns { isAdmin: true/false } for the currently-signed-in Clerk user.
// Used by client-side hooks — no sensitive data exposed.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isAdminId } from "../../../../lib/adminAuth";
import { auth } from "@clerk/nextjs/server";

export async function GET() {
  const { userId } = await auth();
  const isAdmin = await isAdminId(userId);
  return NextResponse.json({ isAdmin });
}
