// app/api/deal-rooms/[id]/scenarios/route.ts
// GET  — list saved offer scenarios for a room
// POST — save a new scenario (any room member)

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSupabase } from '../../../../../lib/supabaseServer';

async function getMemberRole(sb: any, roomId: string, userId: string): Promise<string | null> {
  const { data: room } = await sb
    .from('deal_rooms')
    .select('id, created_by')
    .eq('id', roomId)
    .maybeSingle();
  if (!room) return null;

  const { data: m } = await sb
    .from('deal_room_members')
    .select('role')
    .eq('deal_room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle();

  if (m?.role) return m.role;
  if (room.created_by === userId) return 'lo';
  return null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const role = await getMemberRole(sb, id, userId);
  if (!role) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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

  const role = await getMemberRole(sb, id, userId);
  if (!role) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { label, offer_price, down_pct, loan_type, rate, piti, result_json } = body;

  const { data, error } = await sb
    .from('deal_room_scenarios')
    .insert({
      deal_room_id:    id,
      created_by:      userId,
      created_by_role: role,
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

  await sb
    .from('deal_rooms')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', id);

  return NextResponse.json({ scenario: data }, { status: 201 });
}
