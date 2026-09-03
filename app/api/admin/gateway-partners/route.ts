// GET  /api/admin/gateway-partners — list partners, each with its credentials
//      (key_hash never selected, plaintext keys never stored to select).
// POST /api/admin/gateway-partners — create a new partner.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/adminAuth';
import { getSupabase } from '../../../../lib/supabaseServer';

export async function GET() {
  const { error: authErr } = await requireAdmin();
  if (authErr) return authErr;

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'Supabase unavailable' }, { status: 500 });

  const [{ data: partners, error: partnersErr }, { data: credentials, error: credsErr }] = await Promise.all([
    sb.from('gateway_partners').select('id, name, contact_email, status, rate_limit_tier, quota_tier, created_at, updated_at').order('created_at', { ascending: false }),
    // Never selects key_hash -- there is no plaintext key column to select.
    sb.from('gateway_credentials').select('id, partner_id, key_prefix, scopes, status, expires_at, created_at, last_used_at, revoked_at').order('created_at', { ascending: false }),
  ]);

  if (partnersErr) return NextResponse.json({ error: partnersErr.message }, { status: 500 });
  if (credsErr) return NextResponse.json({ error: credsErr.message }, { status: 500 });

  const credsByPartner = new Map<string, typeof credentials>();
  for (const c of credentials ?? []) {
    const list = credsByPartner.get(c.partner_id) ?? [];
    list.push(c);
    credsByPartner.set(c.partner_id, list);
  }

  const result = (partners ?? []).map((p) => ({ ...p, credentials: credsByPartner.get(p.id) ?? [] }));
  return NextResponse.json({ partners: result });
}

export async function POST(req: NextRequest) {
  const { error: authErr } = await requireAdmin();
  if (authErr) return authErr;

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const contactEmail = typeof body?.contact_email === 'string' ? body.contact_email.trim() : '';
  if (!name || !contactEmail) {
    return NextResponse.json({ error: 'name and contact_email are required' }, { status: 400 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'Supabase unavailable' }, { status: 500 });

  const { data, error } = await sb
    .from('gateway_partners')
    .insert({ name, contact_email: contactEmail })
    .select('id, name, contact_email, status, rate_limit_tier, quota_tier, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ partner: data });
}
