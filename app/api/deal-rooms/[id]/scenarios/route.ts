// app/api/deal-rooms/[id]/scenarios/route.ts
// GET    — list saved offer scenarios for a room
// POST   — save a new scenario (any room member)
// DELETE — remove a scenario (creator only) · ?scenario_id=xxx

import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { getSupabase } from '../../../../../lib/supabaseServer';
import { emailDealRoomActivity } from '../../../../../lib/sendEmail';

const BASE = process.env.NEXT_PUBLIC_APP_BASE_URL ?? 'https://chat.homerates.ai';

async function getMemberRole(sb: any, roomId: string, userId: string): Promise<{ role: string; status: string } | null> {
  const { data: room } = await sb
    .from('deal_rooms')
    .select('id, created_by, status')
    .eq('id', roomId)
    .maybeSingle();
  if (!room) return null;

  const { data: m } = await sb
    .from('deal_room_members')
    .select('role')
    .eq('deal_room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle();

  const role = m?.role ?? (room.created_by === userId ? 'lo' : null);
  if (!role) return null;
  return { role, status: room.status };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const membership = await getMemberRole(sb, id, userId);
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data } = await sb
    .from('deal_room_scenarios')
    .select('*')
    .eq('deal_room_id', id)
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({ scenarios: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const membership = await getMemberRole(sb, id, userId);
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (membership.status === 'closed' || membership.status === 'cancelled') {
    return NextResponse.json({ error: 'This deal room is closed and read-only' }, { status: 423 });
  }

  const body = await req.json();
  const { label, offer_price, down_pct, loan_type, rate, piti, result_json } = body;

  const { data, error } = await sb
    .from('deal_room_scenarios')
    .insert({
      deal_room_id:    id,
      created_by:      userId,
      created_by_role: membership.role,
      label:           label ?? null,
      offer_price:     offer_price ?? null,
      down_pct:        down_pct ?? null,
      loan_type:       loan_type ?? 'conventional',
      rate:            rate ?? null,
      piti:            piti ?? null,
      result_json:     result_json ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: roomRow } = await sb
    .from('deal_rooms')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('property_address')
    .single();

  // Fire-and-forget: notify all other members with an email on file
  let saverName = 'Your Loan Officer';
  try {
    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(userId);
    saverName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || saverName;
  } catch { /* non-fatal */ }

  const { data: memberRows } = await sb
    .from('deal_room_members')
    .select('email, display_name')
    .eq('deal_room_id', id)
    .not('email', 'is', null)
    .or(`user_id.neq.${userId},user_id.is.null`);
  if (memberRows?.length) {
    const roomUrl = `${BASE}/deal-rooms/${id}`;
    for (const m of memberRows) {
      emailDealRoomActivity({
        toEmail: m.email!, toName: m.display_name ?? null,
        fromName: saverName, event: 'scenario',
        propertyAddress: roomRow?.property_address ?? null,
        roomUrl, preview: label ?? null,
      }).catch(() => {});
    }
  }

  return NextResponse.json({ scenario: data }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const url = new URL(req.url);
  const scenarioId = url.searchParams.get('scenario_id');
  if (!scenarioId) return NextResponse.json({ error: 'scenario_id required' }, { status: 400 });

  const membership = await getMemberRole(sb, id, userId);
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (membership.status === 'closed' || membership.status === 'cancelled') {
    return NextResponse.json({ error: 'This deal room is closed and read-only' }, { status: 423 });
  }

  const { data: scen } = await sb
    .from('deal_room_scenarios')
    .select('created_by')
    .eq('id', scenarioId)
    .eq('deal_room_id', id)
    .maybeSingle();

  if (!scen) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (scen.created_by !== userId) return NextResponse.json({ error: 'Only the scenario creator can delete it' }, { status: 403 });

  await sb.from('deal_room_scenarios').delete().eq('id', scenarioId);
  return new NextResponse(null, { status: 204 });
}
