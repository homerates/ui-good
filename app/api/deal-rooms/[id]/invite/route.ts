// app/api/deal-rooms/[id]/invite/route.ts
// GET  — return invite tokens/links for each role slot in the room
// POST — add or reset an invite slot for a given role

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSupabase } from '../../../../../lib/supabaseServer';

async function assertCreator(sb: any, roomId: string, userId: string) {
  const { data } = await sb.from('deal_rooms').select('created_by').eq('id', roomId).maybeSingle();
  return data?.created_by === userId;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  // Any member can view invite links (so they can share them)
  const { data: room } = await sb.from('deal_rooms').select('created_by').eq('id', id).maybeSingle();
  if (!room) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: members } = await sb
    .from('deal_room_members')
    .select('role, invite_token, user_id, joined_at, display_name, email')
    .eq('deal_room_id', id);

  return NextResponse.json({ members: members ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const isCreator = await assertCreator(sb, id, userId);
  if (!isCreator) return NextResponse.json({ error: 'Only the room creator can manage invites' }, { status: 403 });

  const { role } = await req.json();
  if (!['buyer', 'lo', 'agent'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  // Upsert member slot — if already joined, don't overwrite
  const { data: existing } = await sb
    .from('deal_room_members')
    .select('id, joined_at')
    .eq('deal_room_id', id)
    .eq('role', role)
    .maybeSingle();

  if (existing?.joined_at) {
    return NextResponse.json({ error: 'This role slot has already been accepted. Remove the member first to re-invite.' }, { status: 409 });
  }

  const { data: member, error } = existing
    ? await sb.from('deal_room_members').update({ invite_token: crypto.randomUUID() }).eq('id', existing.id).select().single()
    : await sb.from('deal_room_members').insert({ deal_room_id: id, role }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ member });
}
