// PATCH /api/admin/gateway-partners/[id] — update status, rate_limit_tier, or quota_tier.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../../lib/adminAuth';
import { getSupabase } from '../../../../../lib/supabaseServer';

const ALLOWED_STATUSES = ['pending', 'active', 'suspended', 'cancelled'];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error: authErr } = await requireAdmin();
  if (authErr) return authErr;

  const { id } = await params;
  const body = await req.json().catch(() => null);

  const update: Record<string, string> = {};
  if (body?.status !== undefined) {
    if (!ALLOWED_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: `status must be one of: ${ALLOWED_STATUSES.join(', ')}` }, { status: 400 });
    }
    update.status = body.status;
  }
  if (typeof body?.rate_limit_tier === 'string' && body.rate_limit_tier.trim()) update.rate_limit_tier = body.rate_limit_tier.trim();
  if (typeof body?.quota_tier === 'string' && body.quota_tier.trim()) update.quota_tier = body.quota_tier.trim();

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update (status, rate_limit_tier, quota_tier).' }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'Supabase unavailable' }, { status: 500 });

  const { data, error } = await sb
    .from('gateway_partners')
    .update(update)
    .eq('id', id)
    .select('id, name, contact_email, status, rate_limit_tier, quota_tier, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ partner: data });
}
