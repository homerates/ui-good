// app/api/deal-rooms/[id]/milestones/route.ts
// PATCH — mark a milestone complete or incomplete

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSupabase } from '../../../../../lib/supabaseServer';

async function assertMember(sb: any, roomId: string, userId: string) {
  const { data: room } = await sb.from('deal_rooms').select('created_by').eq('id', roomId).maybeSingle();
  if (!room) return false;
  if (room.created_by === userId) return true;
  const { data: m } = await sb
    .from('deal_room_members')
    .select('id')
    .eq('deal_room_id', roomId)
    .eq('user_id', userId)
    .not('joined_at', 'is', null)
    .maybeSingle();
  return !!m;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const ok = await assertMember(sb, id, userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { milestone_key, completed, target_date, ai_note } = await req.json();
  if (!milestone_key) return NextResponse.json({ error: 'milestone_key required' }, { status: 400 });

  const patch: Record<string, any> = {};
  if (typeof completed === 'boolean') {
    patch.completed_at  = completed ? new Date().toISOString() : null;
    patch.completed_by  = completed ? userId : null;
  }
  if (target_date !== undefined) patch.target_date = target_date;
  if (ai_note !== undefined) patch.ai_note = ai_note;

  const { data, error } = await sb
    .from('deal_room_milestones')
    .update(patch)
    .eq('deal_room_id', id)
    .eq('milestone_key', milestone_key)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.from('deal_rooms').update({ updated_at: new Date().toISOString() }).eq('id', id);

  return NextResponse.json({ milestone: data });
}
