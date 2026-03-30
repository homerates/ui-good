// app/api/alerts/[id]/route.ts
// DELETE — deactivate (soft-delete) an alert

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../lib/supabaseServer";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const { error } = await sb
    .from("hr_alerts")
    .update({ active: false })
    .eq("id", id)
    .eq("user_id", userId); // ensures users can only delete their own

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
