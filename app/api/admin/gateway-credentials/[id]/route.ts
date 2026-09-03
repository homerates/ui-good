// DELETE /api/admin/gateway-credentials/[id] — revoke a credential. Idempotent.
// Never returns key_hash or any plaintext -- revocation metadata only.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../../lib/adminAuth';
import { revokeCredential } from '../../../../../lib/gateway/credentials';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error: authErr } = await requireAdmin();
  if (authErr) return authErr;

  const { id } = await params;
  try {
    await revokeCredential(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
