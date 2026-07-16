// GET  /api/ami-qualifier/save     — list saved lookups for current user
// POST /api/ami-qualifier/save     — save a qualifier result
// DELETE /api/ami-qualifier/save?id=  — remove a saved entry

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { getSupabase } from '../../../../lib/supabaseServer';
import { emitPlatformEvent } from '../../../../lib/crm/platform-capture';
import type { CrmKeyFact } from '../../../../lib/crm/types';

async function getConsumerEmail(userId: string): Promise<string | null> {
    try {
        const client = await clerkClient();
        const user   = await client.users.getUser(userId);
        return user.emailAddresses[0]?.emailAddress ?? null;
    } catch {
        return null;
    }
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 503 });

  const { data, error } = await sb
    .from('portfolio_items')
    .select('id, title, address, data, created_at, updated_at')
    .eq('user_id', userId)
    .eq('type', 'ami_qualifier')
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 503 });

  const consumerEmail = await getConsumerEmail(userId);
  const body = await req.json();
  const { location, result } = body as { location: string; result: Record<string, unknown> };

  if (!location || !result) {
    return NextResponse.json({ ok: false, error: 'location and result required' }, { status: 400 });
  }

  const title = result.county && result.state
    ? `${result.county}, ${result.state}`
    : location;

  const now = new Date().toISOString();
  const address = location.trim();

  // Upsert by user + type + address — re-saving the same location updates the stored result.
  const { data: existing } = await sb
    .from('portfolio_items')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'ami_qualifier')
    .ilike('address', address)
    .maybeSingle();

  const programs = result.programs as { homeReady?: boolean; homePossible?: boolean; dpa?: boolean } | undefined;
  const amiResult: CrmKeyFact = {
    key:               'ami_result',
    county:            String(result.county ?? title),
    state:             String(result.state ?? ''),
    home_ready:        programs?.homeReady  === true,
    home_possible:     programs?.homePossible === true,
    dpa:               programs?.dpa === true,
    dpa_program_count: Number(result.dpaMatchCount ?? 0),
  };

  if (existing) {
    const { data: updated, error } = await sb
      .from('portfolio_items')
      .update({ title, data: result, updated_at: now, last_accessed_at: now })
      .eq('id', existing.id)
      .select('id, title, address, data, created_at, updated_at')
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    void emitPlatformEvent(sb, userId, consumerEmail,
      `AMI qualifier: ${amiResult.county}, ${amiResult.state}`,
      [amiResult],
    );
    return NextResponse.json({ ok: true, item: updated, saved: true });
  }

  const { data: inserted, error } = await sb
    .from('portfolio_items')
    .insert({
      user_id: userId,
      type: 'ami_qualifier',
      title,
      address,
      data: result,
      last_accessed_at: now,
      created_at: now,
      updated_at: now,
    })
    .select('id, title, address, data, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  void emitPlatformEvent(sb, userId, consumerEmail,
    `AMI qualifier: ${amiResult.county}, ${amiResult.state}`,
    [amiResult],
  );
  return NextResponse.json({ ok: true, item: inserted, saved: true });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 503 });

  const { error } = await sb
    .from('portfolio_items')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)   // ownership check
    .eq('type', 'ami_qualifier');

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
