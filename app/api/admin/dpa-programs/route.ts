import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/admin/dpa-programs?lender_id=xxx
export async function GET(req: NextRequest) {
  const lenderId = req.nextUrl.searchParams.get('lender_id');
  if (!lenderId) return NextResponse.json({ error: 'lender_id required' }, { status: 400 });

  const { data, error } = await db()
    .from('dpa_programs')
    .select('*')
    .eq('lender_id', lenderId)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ programs: data ?? [] });
}

// POST /api/admin/dpa-programs — create program
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.lender_id || !body.program_name?.trim()) {
    return NextResponse.json({ error: 'lender_id and program_name required' }, { status: 400 });
  }

  const states = typeof body.eligible_states === 'string'
    ? body.eligible_states.split(/[,\s]+/).map((s: string) => s.trim().toUpperCase()).filter(Boolean)
    : (body.eligible_states ?? []);

  const fips = typeof body.eligible_county_fips === 'string'
    ? body.eligible_county_fips.split(/[,\s]+/).map((s: string) => s.trim()).filter(Boolean)
    : (body.eligible_county_fips ?? []);

  const { data, error } = await db()
    .from('dpa_programs')
    .insert({
      lender_id:           body.lender_id,
      program_name:        body.program_name.trim(),
      program_type:        body.program_type ?? 'grant',
      max_assistance:      body.max_assistance ? Number(body.max_assistance) : null,
      income_limit:        body.income_limit   ? Number(body.income_limit)   : null,
      coverage_type:       body.coverage_type ?? 'state',
      eligible_states:     states,
      eligible_county_fips: fips,
      min_credit_score:    Number(body.min_credit_score ?? 620),
      loan_types:          body.loan_types ?? ['conventional', 'fha'],
      notes:               body.notes?.trim() || null,
      active:              true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ program: data });
}

// PATCH /api/admin/dpa-programs — update fields (active toggle, etc.)
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await db()
    .from('dpa_programs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/dpa-programs?id=xxx
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await db().from('dpa_programs').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
