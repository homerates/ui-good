// app/api/deal-rooms/[id]/messages/route.ts
// GET  — messages (last 200, newest-first for pagination)
// POST — send a message

import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { getSupabase } from '../../../../../lib/supabaseServer';
import { emailDealRoomActivity } from '../../../../../lib/sendEmail';

const BASE = process.env.NEXT_PUBLIC_APP_BASE_URL ?? 'https://chat.homerates.ai';

async function getRoomMembership(sb: any, roomId: string, userId: string) {
  const { data: room } = await sb
    .from('deal_rooms')
    .select('id, created_by, status')
    .eq('id', roomId)
    .maybeSingle();
  if (!room) return null;

  if (room.created_by === userId) {
    const [loRes, agentRes] = await Promise.all([
      sb.from('loan_officers').select('id').eq('user_id', userId).maybeSingle(),
      sb.from('agents').select('id').eq('user_id', userId).maybeSingle(),
    ]);
    return { role: loRes.data ? 'lo' : agentRes.data ? 'agent' : 'lo', status: room.status };
  }

  const { data: member } = await sb
    .from('deal_room_members')
    .select('role')
    .eq('deal_room_id', roomId)
    .eq('user_id', userId)
    .not('joined_at', 'is', null)
    .maybeSingle();
  if (!member) return null;
  return { ...member, status: room.status };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const membership = await getRoomMembership(sb, id, userId);
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const before = searchParams.get('before'); // ISO timestamp for pagination

  let query = sb
    .from('deal_room_messages')
    .select('*')
    .eq('deal_room_id', id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (before) query = query.lt('created_at', before);

  const { data } = await query;
  return NextResponse.json({ messages: (data ?? []).reverse() });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const membership = await getRoomMembership(sb, id, userId);
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (membership.status === 'closed' || membership.status === 'cancelled') {
    return NextResponse.json({ error: 'This deal room is closed and read-only' }, { status: 423 });
  }

  const { content } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: 'content required' }, { status: 400 });

  // Get sender display name from Clerk
  let senderName = 'Team Member';
  try {
    const clerk = await clerkClient();
    const user = await clerk.users.getUser(userId);
    senderName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.emailAddresses[0]?.emailAddress || 'Team Member';
  } catch { /* non-fatal */ }

  const { data: msg, error } = await sb
    .from('deal_room_messages')
    .insert({
      deal_room_id: id,
      sender_id:    userId,
      sender_role:  membership.role,
      sender_name:  senderName,
      content:      content.trim(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Touch room updated_at so it floats to top of list
  const { data: roomRow } = await sb.from('deal_rooms').update({ updated_at: new Date().toISOString() }).eq('id', id).select('property_address').single();

  // Fire-and-forget: notify all other members who have an email on file
  const { data: memberRows } = await sb
    .from('deal_room_members')
    .select('email, display_name')
    .eq('deal_room_id', id)
    .not('email', 'is', null)
    .neq('user_id', userId);
  if (memberRows?.length) {
    const roomUrl = `${BASE}/deal-rooms/${id}`;
    const propertyAddress = roomRow?.property_address ?? null;
    for (const m of memberRows) {
      emailDealRoomActivity({
        toEmail: m.email!, toName: m.display_name ?? null,
        fromName: senderName, event: 'message',
        propertyAddress, roomUrl, preview: content.trim(),
      }).catch(() => {});
    }
  }

  return NextResponse.json({ message: msg });
}
