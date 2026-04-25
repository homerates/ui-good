// GET — total unread deal room messages across all rooms the user is a member of

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSupabase } from '../../../../lib/supabaseServer';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ total: 0 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ total: 0 });

  // Find all rooms this user is a member of (by user_id or as creator)
  const [memberRows, creatorRooms] = await Promise.all([
    sb
      .from('deal_room_members')
      .select('deal_room_id, last_read_at')
      .eq('user_id', userId)
      .not('joined_at', 'is', null),
    sb
      .from('deal_rooms')
      .select('id')
      .eq('created_by', userId),
  ]);

  const roomIds = [
    ...new Set([
      ...(memberRows.data ?? []).map((r: any) => r.deal_room_id),
      ...(creatorRooms.data ?? []).map((r: any) => r.id),
    ]),
  ];

  if (!roomIds.length) return NextResponse.json({ total: 0 });

  // Build a map of roomId → last_read_at
  const readMap: Record<string, string | null> = {};
  for (const r of memberRows.data ?? []) {
    readMap[r.deal_room_id] = r.last_read_at ?? null;
  }

  // Count messages in those rooms not sent by this user, newer than last_read_at
  let total = 0;
  for (const roomId of roomIds) {
    const lastRead = readMap[roomId] ?? null;
    let query = sb
      .from('deal_room_messages')
      .select('id', { count: 'exact', head: true })
      .eq('deal_room_id', roomId)
      .neq('sender_id', userId)
      .neq('sender_role', 'system');

    if (lastRead) {
      query = query.gt('created_at', lastRead);
    } else {
      // Never read — count last 7 days to avoid ancient rooms flooding the badge
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      query = query.gt('created_at', cutoff);
    }

    const { count } = await query;
    total += count ?? 0;
  }

  return NextResponse.json({ total });
}
