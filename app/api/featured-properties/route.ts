// app/api/featured-properties/route.ts
// GET  /api/featured-properties?address=...&inc=1
//      Returns { hit: true, rawData, l2Score, l3Score, l4Score, compositeScore }
//      or      { hit: false }
//      inc=1 increments search_count (pass on cache-hit reads, omit on admin checks)
//
// POST /api/featured-properties
//      Upsert from completed DSC — saves computed scores + raw Grok fields.
//      Called after every Decision Score completion (fire-and-forget).
//
// GET  /api/featured-properties?discover=1&city=...&zip=...&limit=10
//      Discovery feed — top N properties for an area ordered by search_count.

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabase }               from '../../../lib/supabaseServer';

function normAddr(a: string) {
  return a.trim().toLowerCase();
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const address  = searchParams.get('address') ?? '';
  const discover = searchParams.get('discover') === '1';
  const inc      = searchParams.get('inc') === '1';

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 503 });

  // ── Discovery feed mode ──
  if (discover) {
    const city   = searchParams.get('city')  ?? '';
    const zip    = searchParams.get('zip')   ?? '';
    const limit  = Math.min(parseInt(searchParams.get('limit') ?? '10', 10), 50);

    let q = sb
      .from('featured_properties')
      .select('id,address,city,zip,photo_url,price,beds,baths,sqft,l2_score,l3_score,l4_score,composite_score,verdict,search_count,is_featured')
      .not('composite_score', 'is', null)
      .order('search_count', { ascending: false })
      .limit(limit);

    if (zip)  q = q.eq('zip', zip.trim());
    else if (city) q = q.ilike('city', city.trim());

    const { data, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, properties: data ?? [] });
  }

  // ── Cache check mode ──
  if (!address.trim()) return NextResponse.json({ hit: false });

  const norm = normAddr(address);

  const { data, error } = await sb
    .from('featured_properties')
    .select('id,raw_data,l2_score,l2_summary,l3_score,l3_summary,l4_score,l4_summary,composite_score')
    .eq('address_norm', norm)
    .not('raw_data', 'is', null)
    .maybeSingle();

  if (error || !data) return NextResponse.json({ hit: false });

  // Increment search_count (fire-and-forget — atomic RPC avoids race condition)
  if (inc) {
    void (async () => {
      try { await sb.rpc('increment_search_count', { row_id: (data as any).id }); } catch { /* non-critical */ }
    })();
  }

  return NextResponse.json({
    hit:            true,
    rawData:        data.raw_data,
    l2Score:        data.l2_score,
    l2Summary:      data.l2_summary,
    l3Score:        data.l3_score,
    l3Summary:      data.l3_summary,
    l4Score:        data.l4_score,
    l4Summary:      data.l4_summary,
    compositeScore: data.composite_score,
  });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const {
    address, city, state_code, zip,
    photo_url, price, beds, baths, sqft, year_built, property_type,
    l2_score, l2_summary, l3_score, l3_summary, l4_score, l4_summary,
    raw_data, source,
  } = body;

  if (!address?.trim()) return NextResponse.json({ ok: false, error: 'address required' }, { status: 400 });

  const norm = normAddr(address);
  const now  = new Date().toISOString();

  // L2/L3/L4 composite (no L1 — L1 is user-specific)
  const scores = [
    { s: l2_score as number | null, w: 0.40 },
    { s: l3_score as number | null, w: 0.35 },
    { s: l4_score as number | null, w: 0.25 },
  ].filter(e => e.s != null) as { s: number; w: number }[];
  const composite = scores.length >= 2
    ? Math.round(scores.reduce((a, e) => a + e.s * e.w, 0) / scores.reduce((a, e) => a + e.w, 0))
    : null;

  const upsertData: Record<string, unknown> = {
    address:           address.trim(),
    address_norm:      norm,
    city:              city              ?? null,
    state_code:        state_code        ?? null,
    zip:               zip               ?? null,
    photo_url:         photo_url         ?? null,
    price:             price             ?? null,
    beds:              beds              ?? null,
    baths:             baths             ?? null,
    sqft:              sqft              ?? null,
    year_built:        year_built        ?? null,
    property_type:     property_type     ?? null,
    l2_score:          l2_score          ?? null,
    l2_summary:        l2_summary        ?? null,
    l3_score:          l3_score          ?? null,
    l3_summary:        l3_summary        ?? null,
    l4_score:          l4_score          ?? null,
    l4_summary:        l4_summary        ?? null,
    composite_score:   composite,
    raw_data:          raw_data          ?? null,
    source:            source            ?? 'user_generated',
    score_computed_at: now,
    updated_at:        now,
  };

  // Upsert — existing rows keep their search_count and created_at
  const { data: existing } = await sb
    .from('featured_properties')
    .select('id, search_count, created_at')
    .eq('address_norm', norm)
    .maybeSingle();

  if (existing) {
    const { error } = await sb
      .from('featured_properties')
      .update(upsertData)
      .eq('id', existing.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  } else {
    const { error } = await sb
      .from('featured_properties')
      .insert({ ...upsertData, search_count: 1, created_at: now });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
