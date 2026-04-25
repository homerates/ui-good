// app/api/deal-rooms/route.ts
// GET  — list deal rooms for the authenticated pro (LO or agent)
// POST — create a new deal room

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSupabase } from '../../../lib/supabaseServer';

const DEFAULT_MILESTONES = [
  { key: 'preapproval',       label: 'Pre-approval confirmed',      stage: 'shopping',    sort: 1 },
  { key: 'offer_strategy',    label: 'Offer strategy reviewed',     stage: 'shopping',    sort: 2 },
  { key: 'offer_submitted',   label: 'Offer submitted',             stage: 'offer',       sort: 3 },
  { key: 'offer_accepted',    label: 'Offer accepted',              stage: 'offer',       sort: 4 },
  { key: 'inspection_ordered',label: 'Inspection ordered',          stage: 'contract',    sort: 5 },
  { key: 'inspection_done',   label: 'Inspection complete',         stage: 'contract',    sort: 6 },
  { key: 'appraisal_ordered', label: 'Appraisal ordered',           stage: 'contract',    sort: 7 },
  { key: 'appraisal_done',    label: 'Appraisal complete',          stage: 'contract',    sort: 8 },
  { key: 'loan_submitted',    label: 'Loan application submitted',  stage: 'processing',  sort: 9 },
  { key: 'rate_locked',       label: 'Rate locked',                 stage: 'processing',  sort: 10 },
  { key: 'clear_to_close',    label: 'Clear to close issued',       stage: 'processing',  sort: 11 },
  { key: 'closing_disclosure',label: 'Closing disclosure received', stage: 'closed',      sort: 12 },
  { key: 'closed',            label: 'Transaction closed',          stage: 'closed',      sort: 13 },
];

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  // Rooms created by this user
  const { data: created } = await sb
    .from('deal_rooms')
    .select('id, property_address, status, offer_price, target_close_date, created_at, updated_at, property_data')
    .eq('created_by', userId)
    .order('updated_at', { ascending: false });

  // Rooms this user was invited into (joined as buyer/lo/agent)
  const { data: memberRows } = await sb
    .from('deal_room_members')
    .select('deal_room_id')
    .eq('user_id', userId)
    .not('joined_at', 'is', null);

  const memberRoomIds = (memberRows ?? []).map((r: any) => r.deal_room_id);
  const { data: joined } = memberRoomIds.length
    ? await sb
        .from('deal_rooms')
        .select('id, property_address, status, offer_price, target_close_date, created_at, updated_at, property_data')
        .in('id', memberRoomIds)
        .not('created_by', 'eq', userId)
        .order('updated_at', { ascending: false })
    : { data: [] };

  // Merge + dedupe by id
  const seen = new Set<string>();
  const rooms: any[] = [];
  for (const r of [...(created ?? []), ...(joined ?? [])]) {
    if (!seen.has(r.id)) { seen.add(r.id); rooms.push(r); }
  }

  // Attach member counts
  const ids = rooms.map((r) => r.id);
  const { data: members } = ids.length
    ? await sb.from('deal_room_members').select('deal_room_id, role, joined_at').in('deal_room_id', ids)
    : { data: [] };

  const memberMap: Record<string, any[]> = {};
  for (const m of members ?? []) {
    (memberMap[m.deal_room_id] ??= []).push(m);
  }

  return NextResponse.json({
    rooms: rooms.map((r) => ({
      ...r,
      members: memberMap[r.id] ?? [],
    })),
  });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  // Hard gate: only Pro or Founding plan users can create Deal Rooms
  const { data: userRow } = await sb.from('users').select('plan').eq('id', userId).maybeSingle();
  const plan = userRow?.plan ?? 'free';
  if (!['pro', 'founding'].includes(plan)) {
    return NextResponse.json({ error: 'Pro or Founding plan required to create Deal Rooms' }, { status: 403 });
  }

  const body = await req.json();
  const { property_address, property_data, target_close_date } = body;
  if (!property_address) return NextResponse.json({ error: 'property_address required' }, { status: 400 });

  // Create the room
  const { data: room, error } = await sb
    .from('deal_rooms')
    .insert({
      created_by: userId,
      property_address,
      property_data: property_data ?? null,
      target_close_date: target_close_date ?? null,
    })
    .select()
    .single();

  if (error || !room) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create room' }, { status: 500 });
  }

  // Seed milestone timeline
  await sb.from('deal_room_milestones').insert(
    DEFAULT_MILESTONES.map((m) => ({
      deal_room_id: room.id,
      milestone_key: m.key,
      label: m.label,
      stage: m.stage,
      sort_order: m.sort,
    }))
  );

  // Add creator as a member slot (role determined by their pro type)
  const [loRes, agentRes] = await Promise.all([
    sb.from('loan_officers').select('id').eq('user_id', userId).maybeSingle(),
    sb.from('agents').select('id').eq('user_id', userId).maybeSingle(),
  ]);
  const creatorRole = loRes.data ? 'lo' : agentRes.data ? 'agent' : 'lo';

  await sb.from('deal_room_members').insert({
    deal_room_id: room.id,
    user_id: userId,
    role: creatorRole,
    joined_at: new Date().toISOString(),
  });

  return NextResponse.json({ room }, { status: 201 });
}
