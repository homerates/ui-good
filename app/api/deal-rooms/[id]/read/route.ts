// POST — mark messages as read for this room (updates last_read_at on member row)

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSupabase } from '../../../../../lib/supabaseServer';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false }, { status: 401 });

  const { id } = await params;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false }, { status: 503 });

  // Update last_read_at for this user in this room (creator row or member row)
  const now = new Date().toISOString();

  // Try member row first
  const { data: member } = await sb
    .from('deal_room_members')
    .select('id')
    .eq('deal_room_id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (member) {
    await sb
      .from('deal_room_members')
      .update({ last_read_at: now })
      .eq('id', member.id);
  } else {
    // Creator may not have a user_id set on their member row in older rooms — match by room creator
    const { data: room } = await sb
      .from('deal_rooms')
      .select('created_by')
      .eq('id', id)
      .maybeSingle();
    if (room?.created_by === userId) {
      await sb
        .from('deal_room_members')
        .update({ last_read_at: now })
        .eq('deal_room_id', id)
        .is('user_id', null);
    }
  }

  return NextResponse.json({ ok: true });
}
