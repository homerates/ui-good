// app/api/deal-rooms/[id]/invite/route.ts
// GET  — return invite tokens/links for each role slot in the room
// POST — add or reset an invite slot for a given role; optionally accept name+email and fire invite email

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSupabase } from '../../../../../lib/supabaseServer';
import { emailDealRoomInvite } from '../../../../../lib/sendEmail';

async function assertCreator(sb: any, roomId: string, userId: string) {
  const { data } = await sb.from('deal_rooms').select('created_by, status').eq('id', roomId).maybeSingle();
  if (!data) return { isCreator: false, status: null };
  return { isCreator: data.created_by === userId, status: data.status as string };
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

  const { isCreator, status: roomStatus } = await assertCreator(sb, id, userId);
  if (!isCreator) return NextResponse.json({ error: 'Only the room creator can manage invites' }, { status: 403 });
  if (roomStatus === 'closed' || roomStatus === 'cancelled') {
    return NextResponse.json({ error: 'This deal room is closed and read-only' }, { status: 423 });
  }

  const body = await req.json();
  const { role, display_name, email } = body as {
    role: string;
    display_name?: string;
    email?: string;
  };

  if (!['buyer', 'lo', 'agent'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  // Upsert member slot — if already joined, don't overwrite
  const { data: existing } = await sb
    .from('deal_room_members')
    .select('id, joined_at, invite_token')
    .eq('deal_room_id', id)
    .eq('role', role)
    .maybeSingle();

  if (existing?.joined_at) {
    return NextResponse.json({ error: 'This role slot has already been accepted. Remove the member first to re-invite.' }, { status: 409 });
  }

  const updates: Record<string, any> = { invite_token: crypto.randomUUID() };
  if (display_name?.trim()) updates.display_name = display_name.trim();
  if (email?.trim())        updates.email        = email.trim().toLowerCase();

  const { data: member, error } = existing
    ? await sb.from('deal_room_members').update(updates).eq('id', existing.id).select().single()
    : await sb.from('deal_room_members').insert({ deal_room_id: id, role, ...updates }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fire invite email if email provided
  const emailAddr = (updates.email ?? email)?.trim();
  if (emailAddr && member?.invite_token) {
    const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_BASE_URL ?? 'https://chat.homerates.ai';
    const joinUrl = `${origin}/deal-rooms/join?token=${member.invite_token}`;

    // Look up sender name: try loan_officers first, then agents
    const [loRow, roomRow] = await Promise.all([
      sb.from('loan_officers').select('display_name').eq('user_id', userId).maybeSingle(),
      sb.from('deal_rooms').select('property_address').eq('id', id).maybeSingle(),
    ]);

    let fromName = loRow.data?.display_name as string | null;
    if (!fromName) {
      // Fall back to agents table if they're an agent
      const { data: agentRow } = await sb
        .from('agents')
        .select('display_name')
        .eq('user_id', userId)
        .maybeSingle();
      fromName = agentRow?.display_name ?? null;
    }
    fromName = fromName ?? 'Your HomeRates Team';

    await emailDealRoomInvite({
      toEmail:         emailAddr,
      toName:          display_name?.trim() ?? null,
      fromName,
      role,
      propertyAddress: roomRow.data?.property_address ?? null,
      joinUrl,
    });
  }

  return NextResponse.json({ member, emailSent: !!emailAddr });
}
