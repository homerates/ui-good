// GET /api/lender-portal?token=xxx
// Public (no auth) — token is the secret. Returns lender + programs + match stats.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const sb = db();

  const { data: lender, error } = await sb
    .from("marketplace_lenders")
    .select("id, lender_name, nmls_number, contact_name, eligible_states, loan_types, status, total_views, total_opt_ins, invited_at")
    .eq("invite_token", token)
    .maybeSingle();

  if (error || !lender) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  // Fetch DPA programs for this lender
  const { data: programs } = await sb
    .from("dpa_programs")
    .select("id, program_name, program_type, max_assistance, income_limit, coverage_type, eligible_states, eligible_county_fips, min_credit_score, loan_types, notes, active")
    .eq("lender_id", lender.id as string)
    .order("created_at", { ascending: true });

  // Match count: how many active programs have matched (served as a proxy for leads)
  const activePrograms = (programs ?? []).filter((p: { active: boolean }) => p.active);

  return NextResponse.json({
    ok: true,
    lender: {
      name:        lender.lender_name,
      nmls:        lender.nmls_number,
      contactName: lender.contact_name,
      states:      lender.eligible_states,
      loanTypes:   lender.loan_types,
      status:      lender.status,
      views:       lender.total_views,
      optIns:      lender.total_opt_ins,
      invitedAt:   lender.invited_at,
    },
    programs:        programs ?? [],
    activePrograms:  activePrograms.length,
  });
}
