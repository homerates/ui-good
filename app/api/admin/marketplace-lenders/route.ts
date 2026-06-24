// app/api/admin/marketplace-lenders/route.ts
// GET  — list all marketplace lenders with stats
// POST — onboard a new lender
// PATCH — update status or pricing fields

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../lib/supabaseServer";

async function requireAdmin() {
  const { userId } = await auth();
  if (!userId) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from("users").select("role").eq("id", userId).maybeSingle();
  return data?.role === "admin" ? userId : null;
}

export async function GET() {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase()!;
  const { data, error } = await sb
    .from("marketplace_lenders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, lenders: data ?? [] });
}

export async function POST(req: NextRequest) {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    lender_name, nmls_number, contact_email, contact_name,
    margin_over_par, loan_types, eligible_states,
    min_loan_amount, max_loan_amount, min_credit_score, max_ltv,
    lock_15_adj, lock_45_adj, lock_60_adj,
  } = body;

  if (!lender_name?.trim() || !contact_email?.trim() || margin_over_par == null) {
    return NextResponse.json({ error: "lender_name, contact_email, and margin_over_par are required" }, { status: 400 });
  }

  const sb = getSupabase()!;
  const { data, error } = await sb
    .from("marketplace_lenders")
    .insert({
      lender_name: lender_name.trim(),
      nmls_number: nmls_number?.trim() || null,
      contact_email: contact_email.trim(),
      contact_name: contact_name?.trim() || null,
      margin_over_par: parseFloat(margin_over_par),
      loan_types: Array.isArray(loan_types) ? loan_types : ["conventional"],
      eligible_states: Array.isArray(eligible_states)
        ? eligible_states.map((s: string) => s.toUpperCase())
        : ["CA"],
      min_loan_amount: parseInt(min_loan_amount) || 100000,
      max_loan_amount: parseInt(max_loan_amount) || 3000000,
      min_credit_score: parseInt(min_credit_score) || 620,
      max_ltv: parseFloat(max_ltv) || 97.0,
      lock_15_adj: parseFloat(lock_15_adj) || -0.125,
      lock_45_adj: parseFloat(lock_45_adj) || 0.125,
      lock_60_adj: parseFloat(lock_60_adj) || 0.250,
      status: "pending",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, lender: data });
}

export async function PATCH(req: NextRequest) {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Whitelist updatable fields
  const allowed = [
    "status", "margin_over_par", "loan_types", "eligible_states",
    "min_loan_amount", "max_loan_amount", "min_credit_score", "max_ltv",
    "lock_15_adj", "lock_45_adj", "lock_60_adj",
    "contact_email", "contact_name", "nmls_number",
  ];
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in fields) update[key] = fields[key];
  }

  const sb = getSupabase()!;
  const { data, error } = await sb
    .from("marketplace_lenders")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, lender: data });
}
