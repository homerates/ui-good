// app/api/portfolio/route.ts
// GET  /api/portfolio          — fetch all items for the current user
// POST /api/portfolio          — upsert an item (create or update by user+type+address)

export const runtime = 'nodejs';

import { NextResponse }  from 'next/server';
import { auth }          from '@clerk/nextjs/server';
import { getSupabase }   from '../../../lib/supabaseServer';

export interface PortfolioItem {
  id:               string;
  user_id:          string;
  type:             'buyer_journey' | 'snapshot' | 'lo_scenario' | 'comparison';
  title:            string | null;
  address:          string | null;
  photo_url:        string | null;
  data:             Record<string, unknown>;
  last_accessed_at: string;
  created_at:       string;
  updated_at:       string;
}

// GET — return all items for the authenticated user, newest first
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 503 });

  const { data, error } = await sb
    .from('portfolio_items')
    .select('*')
    .eq('user_id', userId)
    .order('last_accessed_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}

// POST — upsert a portfolio item
// Body: { type, title?, address?, photo_url?, data }
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 503 });

  const body = await req.json();
  const { type, title, address, photo_url, data } = body as Partial<PortfolioItem>;

  if (!type || !data) return NextResponse.json({ ok: false, error: 'type and data required' }, { status: 400 });

  const now = new Date().toISOString();

  // If address is provided: upsert by (user_id, type, lower(address)) — one item per property
  // If no address: always insert a new item (non-property snapshots)
  if (address) {
    const { data: existing } = await sb
      .from('portfolio_items')
      .select('id, data')
      .eq('user_id', userId)
      .eq('type', type)
      .ilike('address', address.trim())
      .maybeSingle();

    if (existing) {
      // Merge data — new fields win, existing fields kept if not overwritten
      const merged = { ...existing.data, ...data };
      const { data: updated, error } = await sb
        .from('portfolio_items')
        .update({ title, photo_url, data: merged, last_accessed_at: now, updated_at: now })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, item: updated });
    }
  }

  // Insert new
  const { data: inserted, error } = await sb
    .from('portfolio_items')
    .insert({ user_id: userId, type, title, address: address?.trim() ?? null, photo_url: photo_url ?? null, data, last_accessed_at: now, created_at: now, updated_at: now })
    .select()
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: inserted });
}
