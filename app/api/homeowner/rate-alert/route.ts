// app/api/homeowner/rate-alert/route.ts
// POST { property_id, property_address, threshold_rate } — save/update consumer rate alert
// DELETE { property_id } — deactivate alert

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? null;
  if (!email) return NextResponse.json({ error: 'No email on account' }, { status: 400 });

  const body = await req.json().catch(() => null);
  const { property_id, property_address, threshold_rate } = body ?? {};
  if (!threshold_rate || threshold_rate < 3 || threshold_rate > 12) {
    return NextResponse.json({ error: 'threshold_rate must be between 3 and 12' }, { status: 400 });
  }

  const { error } = await db()
    .from('homeowner_rate_alerts')
    .upsert({
      user_id: userId,
      property_id: property_id ?? null,
      property_address: property_address ?? null,
      email,
      threshold_rate: parseFloat(threshold_rate),
      active: true,
      triggered_at: null,
    }, { onConflict: 'user_id,property_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const property_id = searchParams.get('property_id');

  const query = db().from('homeowner_rate_alerts').update({ active: false }).eq('user_id', userId);
  if (property_id) query.eq('property_id', property_id);
  await query;

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const property_id = searchParams.get('property_id');

  let query = db()
    .from('homeowner_rate_alerts')
    .select('id, property_id, threshold_rate, active, created_at')
    .eq('user_id', userId)
    .eq('active', true);
  if (property_id) query = query.eq('property_id', property_id);

  const { data } = await query;
  return NextResponse.json({ ok: true, alerts: data ?? [] });
}
