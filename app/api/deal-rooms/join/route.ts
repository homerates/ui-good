// app/api/deal-rooms/join/route.ts
// POST — accept an invite token. Marks the member slot as joined.
// Body: { token: string }

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSupabase } from '../../../../lib/supabaseServer';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

  const { data: member } = await sb
    .from('deal_room_members')
    .select('id, deal_room_id, role, joined_at, user_id')
    .eq('invite_token', token)
    .maybeSingle();

  if (!member) return NextResponse.json({ error: 'Invalid or expired invite link' }, { status: 404 });
  if (member.joined_at) {
    // Already joined — just return the room id so the UI can redirect
    return NextResponse.json({ deal_room_id: member.deal_room_id, already_joined: true });
  }

  const { error } = await sb
    .from('deal_room_members')
    .update({ user_id: userId, joined_at: new Date().toISOString() })
    .eq('id', member.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Post a system message welcoming the new member
  const roleLabel = member.role === 'lo' ? 'Loan Officer' : member.role === 'agent' ? 'Agent' : 'Buyer';
  await sb.from('deal_room_messages').insert({
    deal_room_id: member.deal_room_id,
    sender_id:    'system',
    sender_role:  'system',
    sender_name:  'Deal Room',
    content:      `${roleLabel} joined the room.`,
  });

  return NextResponse.json({ deal_room_id: member.deal_room_id });
}
