// GET   /api/admin/gateway-config — read current kill_switch + circuit_state.
// PATCH /api/admin/gateway-config — toggle kill_switch only.
//
// circuit_state is shown for read-only operational context but is NOT
// writable through this route. Phase E1 instruction section 15: only add a
// circuit-state admin control if the locked plan explicitly calls for it.
// docs/HOMERATES_INTELLIGENCE_GATEWAY_V1_IMPLEMENTATION_PLAN.md's Phase E
// section only specifies "the kill-switch toggle" -- it does not call for a
// circuit-state control, so none is added here. Something else, later,
// decides when the circuit opens (per circuitBreaker.ts's own header); this
// route does not become that mechanism by accident.
//
// Writes the EXISTING gateway_config.kill_switch row from Phase D (migration
// 083) -- this is not a second kill-switch mechanism.

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

  const { data, error } = await sb.from('gateway_config').select('key, value');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byKey = new Map((data ?? []).map((r) => [r.key, r.value]));
  return NextResponse.json({
    killSwitchEnabled: (byKey.get('kill_switch') as { enabled?: boolean } | undefined)?.enabled === true,
    circuitOpen: (byKey.get('circuit_state') as { open?: boolean } | undefined)?.open === true,
  });
}

export async function PATCH(req: NextRequest) {
  const { error: authErr } = await requireAdmin();
  if (authErr) return authErr;

  const body = await req.json().catch(() => null);
  if (typeof body?.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled (boolean) is required' }, { status: 400 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'Supabase unavailable' }, { status: 500 });

  const { data, error } = await sb
    .from('gateway_config')
    .update({ value: { enabled: body.enabled } })
    .eq('key', 'kill_switch')
    .select('key, value')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ killSwitchEnabled: (data.value as { enabled?: boolean }).enabled === true });
}
