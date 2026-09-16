// app/api/admin/property-publications/route.ts
//
// SHADOW MODE admin control path for the property_publications registry
// (supabase/migrations/088_property_publications.sql, lib/propertyPublication.ts).
// Not linked from any admin UI yet -- this is the reviewed, secure mutation
// path itself, built now so a future admin-panel page has something safe to
// call rather than a route improvising its own auth check. Every handler is
// gated by requireAdmin() (lib/adminAuth.ts), the same Clerk-based admin
// check every other /api/admin/* route in this repo uses -- no new admin
// secret, no client-side role check, no public mutation path of any kind.
//
// Publication invariants enforced here (see the migration file for the
// full rationale) in addition to the DB-level CHECK constraint:
//   - 'approve' requires a non-empty reason (provenance is not optional).
//   - 'feature' requires the record to already be 'published'.
//   - 'withdraw' always clears is_homepage_featured/featured_at -- a
//     withdrawn property can never remain featured.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '../../../../lib/adminAuth';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const SELECT_COLUMNS =
  'id, property_id, publication_status, approved_at, approved_by, approval_reason, withdrawn_at, withdrawal_reason, is_homepage_featured, featured_at, created_at, updated_at';

// GET /api/admin/property-publications            -> bounded list, most recently updated first
// GET /api/admin/property-publications?property_id=xxx -> single record (or { publication: null })
export async function GET(req: NextRequest) {
  const { error: authErr } = await requireAdmin();
  if (authErr) return authErr;

  const propertyId = req.nextUrl.searchParams.get('property_id');

  if (propertyId) {
    const { data, error } = await db()
      .from('property_publications')
      .select(SELECT_COLUMNS)
      .eq('property_id', propertyId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ publication: data ?? null });
  }

  const { data, error } = await db()
    .from('property_publications')
    .select(SELECT_COLUMNS)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ publications: data ?? [] });
}

type Action = 'approve' | 'withdraw' | 'feature' | 'unfeature';

// POST /api/admin/property-publications
// body: { property_id: string, action: 'approve'|'withdraw'|'feature'|'unfeature', reason?: string }
export async function POST(req: NextRequest) {
  const { userId, error: authErr } = await requireAdmin();
  if (authErr) return authErr;

  const body = await req.json();
  const propertyId = body.property_id as string | undefined;
  const action = body.action as Action | undefined;
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

  if (!propertyId) return NextResponse.json({ error: 'property_id required' }, { status: 400 });
  if (!action || !['approve', 'withdraw', 'feature', 'unfeature'].includes(action)) {
    return NextResponse.json({ error: "action must be one of 'approve', 'withdraw', 'feature', 'unfeature'" }, { status: 400 });
  }

  const sb = db();
  const now = new Date().toISOString();

  const { data: existing } = await sb
    .from('property_publications')
    .select(SELECT_COLUMNS)
    .eq('property_id', propertyId)
    .maybeSingle();

  if (action === 'approve') {
    if (!reason) return NextResponse.json({ error: 'reason required to approve — publication provenance must be recorded' }, { status: 400 });

    const payload = {
      property_id: propertyId,
      publication_status: 'published' as const,
      approved_at: now,
      approved_by: userId,
      approval_reason: reason,
      withdrawn_at: null,
      withdrawal_reason: null,
      updated_at: now,
    };

    const { data, error } = existing
      ? await sb.from('property_publications').update(payload).eq('id', existing.id).select(SELECT_COLUMNS).single()
      : await sb.from('property_publications').insert(payload).select(SELECT_COLUMNS).single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ publication: data });
  }

  // Every remaining action requires an existing record.
  if (!existing) return NextResponse.json({ error: 'no publication record exists for this property_id yet — approve it first' }, { status: 404 });

  if (action === 'withdraw') {
    const { data, error } = await sb
      .from('property_publications')
      .update({
        publication_status: 'withdrawn',
        withdrawn_at: now,
        withdrawal_reason: reason || null,
        is_homepage_featured: false,
        featured_at: null,
        updated_at: now,
      })
      .eq('id', existing.id)
      .select(SELECT_COLUMNS)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ publication: data });
  }

  if (action === 'feature') {
    if (existing.publication_status !== 'published') {
      return NextResponse.json({ error: 'cannot feature a property that is not published — approve it first' }, { status: 400 });
    }
    const { data, error } = await sb
      .from('property_publications')
      .update({ is_homepage_featured: true, featured_at: now, updated_at: now })
      .eq('id', existing.id)
      .select(SELECT_COLUMNS)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ publication: data });
  }

  // action === 'unfeature'
  const { data, error } = await sb
    .from('property_publications')
    .update({ is_homepage_featured: false, featured_at: null, updated_at: now })
    .eq('id', existing.id)
    .select(SELECT_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ publication: data });
}
