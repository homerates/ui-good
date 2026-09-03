// POST /api/admin/gateway-credentials — issue a credential for a partner.
// Returns the plaintext key EXACTLY ONCE, in this response only. It is never
// persisted (only its hash is stored) and can never be retrieved again after
// this response — the admin UI must capture and display it now.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/adminAuth';
import { issueCredential, ALLOWED_GATEWAY_SCOPES } from '../../../../lib/gateway/credentials';

export async function POST(req: NextRequest) {
  const { error: authErr } = await requireAdmin();
  if (authErr) return authErr;

  const body = await req.json().catch(() => null);
  const partnerId = typeof body?.partner_id === 'string' ? body.partner_id : '';
  if (!partnerId) return NextResponse.json({ error: 'partner_id is required' }, { status: 400 });

  const scopes: string[] = Array.isArray(body?.scopes) && body.scopes.length > 0
    ? body.scopes
    : [...ALLOWED_GATEWAY_SCOPES];

  try {
    const { plaintextKey, prefix } = await issueCredential(partnerId, scopes);
    // Plaintext appears in this one response body only -- never logged, never
    // written to any table, never returned by any other route.
    return NextResponse.json({ plaintext_key: plaintextKey, prefix, scopes, warning: 'This key will not be shown again. Store it now.' });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
