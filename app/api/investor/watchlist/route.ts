// app/api/investor/watchlist/route.ts
// GET    → list watchlist for authed user
// POST   → add address to watchlist
// DELETE → remove by id
//
// Supabase table required:
// ─────────────────────────────────────────────────────────────────
// create table investor_watchlist (
//   id                 uuid default gen_random_uuid() primary key,
//   user_id            text not null,
//   address            text not null,
//   address_normalized text not null,
//   list_price         numeric,
//   beds               integer,
//   property_type      text,
//   notes              text,
//   added_at           timestamptz default now()
// );
// create index on investor_watchlist (user_id);
// alter table investor_watchlist enable row level security;
// create policy "users own their watchlist" on investor_watchlist
//   for all using (user_id = auth.uid()::text);
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSupabase } from '../../../../lib/supabaseServer';

function normalize(addr: string): string {
  return addr.trim().toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const { data, error } = await sb
    .from('investor_watchlist')
    .select('*')
    .eq('user_id', userId)
    .order('added_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const { address, list_price, beds, property_type, notes } = body;

  if (!address?.trim()) return NextResponse.json({ error: 'address required' }, { status: 400 });

  const addrNorm = normalize(address);

  // Upsert — one entry per user+address
  const { data, error } = await sb
    .from('investor_watchlist')
    .upsert({
      user_id:            userId,
      address:            address.trim(),
      address_normalized: addrNorm,
      list_price:         list_price ?? null,
      beds:               beds ?? null,
      property_type:      property_type ?? null,
      notes:              notes ?? null,
    }, { onConflict: 'user_id, address_normalized' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await sb
    .from('investor_watchlist')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
