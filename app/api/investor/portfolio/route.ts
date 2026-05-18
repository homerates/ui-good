// app/api/investor/portfolio/route.ts
// GET    → list all portfolio items for authed user
// POST   → save a deal to portfolio (snapshot of key metrics)
// DELETE → remove a deal by id
//
// Supabase table required:
// ─────────────────────────────────────────────────────────────────
// create table investor_portfolio (
//   id                uuid default gen_random_uuid() primary key,
//   user_id           text not null,
//   address           text not null,
//   address_normalized text not null,
//   avm               numeric,
//   beds              integer,
//   baths             numeric,
//   sqft              integer,
//   year_built        integer,
//   dscr              numeric,
//   cap_rate          numeric,
//   gross_yield       numeric,
//   cash_flow         numeric,
//   down_pct          numeric default 25,
//   rate              numeric,
//   rent              numeric,
//   status            text,   -- 'qualifying' | 'watch' | 'nogo'
//   notes             text,
//   added_at          timestamptz default now(),
//   updated_at        timestamptz default now()
// );
// create index on investor_portfolio (user_id);
// alter table investor_portfolio enable row level security;
// create policy "users own their portfolio" on investor_portfolio
//   for all using (user_id = auth.uid()::text);
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSupabase } from '../../../../lib/supabaseServer';
import { getUserPlan } from '../../../../lib/subscription';

function normalize(addr: string): string {
  return addr.trim().toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function dscrStatus(dscr: number | null): 'qualifying' | 'watch' | 'nogo' | 'pending' {
  if (dscr == null) return 'pending';
  if (dscr >= 1.0)  return 'qualifying';
  if (dscr >= 0.75) return 'watch';
  return 'nogo';
}

// ── GET — list portfolio ──────────────────────────────────────────────────────

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const { data, error } = await sb
    .from('investor_portfolio')
    .select('*')
    .eq('user_id', userId)
    .order('added_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}

// ── POST — save deal ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const plan = await getUserPlan(userId);
  if (plan.plan !== 'pro') return NextResponse.json({ error: 'Pro required', pro_required: true }, { status: 403 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const { address, avm, beds, baths, sqft, year_built, dscr, cap_rate, gross_yield, cash_flow, down_pct, rate, rent, notes } = body;

  if (!address?.trim()) return NextResponse.json({ error: 'address required' }, { status: 400 });

  const addrNorm = normalize(address);

  // Upsert — one entry per user+address, update metrics if already saved
  const { data, error } = await sb
    .from('investor_portfolio')
    .upsert({
      user_id:            userId,
      address:            address.trim(),
      address_normalized: addrNorm,
      avm:                avm ?? null,
      beds:               beds ?? null,
      baths:              baths ?? null,
      sqft:               sqft ?? null,
      year_built:         year_built ?? null,
      dscr:               dscr ?? null,
      cap_rate:           cap_rate ?? null,
      gross_yield:        gross_yield ?? null,
      cash_flow:          cash_flow ?? null,
      down_pct:           down_pct ?? 25,
      rate:               rate ?? null,
      rent:               rent ?? null,
      status:             dscrStatus(dscr ?? null),
      notes:              notes ?? null,
      updated_at:         new Date().toISOString(),
    }, { onConflict: 'user_id, address_normalized' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}

// ── DELETE — remove deal ──────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const plan = await getUserPlan(userId);
  if (plan.plan !== 'pro') return NextResponse.json({ error: 'Pro required', pro_required: true }, { status: 403 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await sb
    .from('investor_portfolio')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
