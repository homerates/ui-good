// app/api/homeowner/save/route.ts
// GET    — list all tracked properties for the signed-in user
//          (auto-seeds from borrowers table if none on file)
// POST   — add a new property or update an existing one
// DELETE — remove a property (blocked if it's the user's only one)

import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

const SEL = 'id, user_id, property_address, is_primary, digest_enabled, actual_balance, actual_rate, actual_purchase_price, actual_purchase_date, actual_value, email, name, updated_at, created_at';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const supabase = db();

  // Ordered by recency, not is_primary — matches the approved My Home property-switcher
  // redesign (property-site pattern: most recently touched property leads the list).
  // is_primary is still tracked/displayed as a label (⭐ "My Home"), it just no longer
  // pins position. addProperty() on the client bumps updated_at whenever a property is
  // added or re-selected via the command bar, so this naturally puts it first next load.
  const { data: existing } = await supabase
    .from('consumer_homeowner_properties')
    .select(SEL)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  const list = existing ?? [];

  // If no properties yet, check the borrowers table — the LO may already have
  // the user's address(es) on file.  Seed all of them automatically.
  if (list.length === 0) {
    const { data: borrowerRows } = await supabase
      .from('borrowers')
      .select('property_address, name, email')
      .eq('user_id', userId)
      .not('property_address', 'is', null)
      .order('created_at', { ascending: true });

    if (borrowerRows?.length) {
      const clerkUser = await currentUser();
      const email = clerkUser?.emailAddresses?.[0]?.emailAddress ?? null;
      const name  = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ') || null;

      for (let i = 0; i < borrowerRows.length; i++) {
        await supabase
          .from('consumer_homeowner_properties')
          .upsert({
            user_id:         userId,
            property_address: borrowerRows[i].property_address,
            is_primary:      i === 0,
            digest_enabled:  true,
            email:           email ?? borrowerRows[i].email ?? null,
            name:            name  ?? borrowerRows[i].name  ?? null,
            updated_at:      new Date().toISOString(),
          }, { onConflict: 'user_id,property_address', ignoreDuplicates: true });
      }

      const { data: seeded } = await supabase
        .from('consumer_homeowner_properties')
        .select(SEL)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      return NextResponse.json({ properties: seeded ?? [] });
    }
  }

  return NextResponse.json({ properties: list });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress ?? null;
  const name  = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ') || null;

  const body = await req.json().catch(() => ({}));
  const supabase = db();

  const payload: Record<string, any> = {
    user_id:    userId,
    email,
    name,
    updated_at: new Date().toISOString(),
  };

  if (typeof body.address        === 'string') payload.property_address    = body.address.trim() || null;
  if (typeof body.digest_enabled === 'boolean') payload.digest_enabled      = body.digest_enabled;
  if (typeof body.is_primary     === 'boolean') payload.is_primary          = body.is_primary;
  if ('actual_balance'        in body) payload.actual_balance        = body.actual_balance        ? Number(body.actual_balance)        : null;
  if ('actual_rate'           in body) payload.actual_rate           = body.actual_rate           ? Number(body.actual_rate)           : null;
  if ('actual_purchase_price' in body) payload.actual_purchase_price = body.actual_purchase_price ? Number(body.actual_purchase_price) : null;
  if ('actual_purchase_date'  in body) payload.actual_purchase_date  = body.actual_purchase_date  ?? null;
  if ('actual_value'          in body) payload.actual_value          = body.actual_value          ? Number(body.actual_value)          : null;

  // When setting as primary, unset all others for this user first
  if (body.is_primary === true) {
    await supabase
      .from('consumer_homeowner_properties')
      .update({ is_primary: false })
      .eq('user_id', userId);
  }

  let data: any;
  let error: any;

  if (body.property_id) {
    // Update an existing property (ownership enforced via user_id)
    const res = await supabase
      .from('consumer_homeowner_properties')
      .update(payload)
      .eq('id', body.property_id)
      .eq('user_id', userId)
      .select(SEL)
      .single();
    data = res.data;
    error = res.error;
  } else {
    // New property — if first one, flag as primary automatically
    const { count } = await supabase
      .from('consumer_homeowner_properties')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    if ((count ?? 0) === 0) payload.is_primary = true;

    const res = await supabase
      .from('consumer_homeowner_properties')
      .upsert(payload, { onConflict: 'user_id,property_address' })
      .select(SEL)
      .single();
    data = res.data;
    error = res.error;
  }

  if (error) {
    console.error('[homeowner/save POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, property: data });
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const propertyId = new URL(req.url).searchParams.get('property_id');
  if (!propertyId) return NextResponse.json({ error: 'property_id required' }, { status: 400 });

  const supabase = db();

  // Block deletion of the last property
  const { count } = await supabase
    .from('consumer_homeowner_properties')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if ((count ?? 0) <= 1) {
    return NextResponse.json(
      { error: 'Cannot remove your only property — edit the address instead.' },
      { status: 409 },
    );
  }

  // Check if it was primary before deleting
  const { data: target } = await supabase
    .from('consumer_homeowner_properties')
    .select('is_primary')
    .eq('id', propertyId)
    .eq('user_id', userId)
    .maybeSingle();

  const { error } = await supabase
    .from('consumer_homeowner_properties')
    .delete()
    .eq('id', propertyId)
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If deleted property was primary, promote the oldest remaining one
  if (target?.is_primary) {
    const { data: next } = await supabase
      .from('consumer_homeowner_properties')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (next) {
      await supabase
        .from('consumer_homeowner_properties')
        .update({ is_primary: true })
        .eq('id', next.id);
    }
  }

  return NextResponse.json({ ok: true });
}
