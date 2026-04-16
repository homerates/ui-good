// app/api/homeowner/save/route.ts
// GET  — load current consumer_homeowner record for signed-in user
// POST — upsert address + digest preference

import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data } = await db()
    .from('consumer_homeowners')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  return NextResponse.json({ homeowner: data ?? null });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? null;
  const name  = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || null;

  const body = await req.json().catch(() => ({}));
  const address        = typeof body.address        === 'string' ? body.address.trim() || null : undefined;
  const digestEnabled  = typeof body.digest_enabled === 'boolean' ? body.digest_enabled : undefined;

  // Loan detail overrides — null clears a field, undefined = don't touch
  const actualBalance       = 'actual_balance'        in body ? (body.actual_balance       ?? null) : undefined;
  const actualRate          = 'actual_rate'           in body ? (body.actual_rate          ?? null) : undefined;
  const actualPurchasePrice = 'actual_purchase_price' in body ? (body.actual_purchase_price ?? null) : undefined;
  const actualPurchaseDate  = 'actual_purchase_date'  in body ? (body.actual_purchase_date  ?? null) : undefined;

  const payload: Record<string, any> = {
    user_id:    userId,
    email,
    name,
    updated_at: new Date().toISOString(),
  };
  if (address               !== undefined) payload.property_address    = address;
  if (digestEnabled         !== undefined) payload.digest_enabled       = digestEnabled;
  if (actualBalance         !== undefined) payload.actual_balance       = actualBalance       ? Number(actualBalance)       : null;
  if (actualRate            !== undefined) payload.actual_rate          = actualRate          ? Number(actualRate)          : null;
  if (actualPurchasePrice   !== undefined) payload.actual_purchase_price= actualPurchasePrice ? Number(actualPurchasePrice) : null;
  if (actualPurchaseDate    !== undefined) payload.actual_purchase_date = actualPurchaseDate;
  // Default digest to true on first save
  if (!('digest_enabled' in payload)) payload.digest_enabled = true;

  const { data, error } = await db()
    .from('consumer_homeowners')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    console.error('[homeowner/save]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, homeowner: data });
}
