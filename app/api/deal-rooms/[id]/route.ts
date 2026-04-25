// app/api/deal-rooms/[id]/route.ts
// GET  — full room detail (room + members + milestones + recent messages + scenarios)
// PATCH — update status / offer_price / target_close_date

import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { getSupabase } from '../../../../lib/supabaseServer';
import { emailDealRoomActivity } from '../../../../lib/sendEmail';

const BASE = process.env.NEXT_PUBLIC_APP_BASE_URL ?? 'https://chat.homerates.ai';

const STATUS_LABELS: Record<string, string> = {
  shopping: 'Shopping', offer: 'Offer', contract: 'In Contract',
  processing: 'Processing', closed: 'Closed', cancelled: 'Cancelled',
};

async function assertMember(sb: any, roomId: string, userId: string) {
  const { data: room } = await sb
    .from('deal_rooms')
    .select('id, created_by')
    .eq('id', roomId)
    .maybeSingle();
  if (!room) return false;
  if (room.created_by === userId) return true;

  const { data: member } = await sb
    .from('deal_room_members')
    .select('id')
    .eq('deal_room_id', roomId)
    .eq('user_id', userId)
    .not('joined_at', 'is', null)
    .maybeSingle();
  return !!member;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const ok = await assertMember(sb, id, userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [roomRes, membersRes, milestonesRes, messagesRes, scenariosRes] = await Promise.all([
    sb.from('deal_rooms').select('*').eq('id', id).single(),
    sb.from('deal_room_members').select('*').eq('deal_room_id', id),
    sb.from('deal_room_milestones').select('*').eq('deal_room_id', id).order('sort_order'),
    sb.from('deal_room_messages').select('*').eq('deal_room_id', id).order('created_at').limit(200),
    sb.from('deal_room_scenarios').select('*').eq('deal_room_id', id).order('created_at', { ascending: false }).limit(20),
  ]);

  // Fetch LO's NMLS + display name for compliance disclosure on estimates
  const loMember  = (membersRes.data ?? []).find((m: any) => m.role === 'lo');
  const loUserId  = loMember?.user_id ?? roomRes.data?.created_by ?? null;
  let loNmls: string | null = null;
  let loDisplayName: string | null = loMember?.display_name ?? null;
  if (loUserId) {
    const { data: loRow } = await sb
      .from('loan_officers')
      .select('nmls, display_name')
      .eq('user_id', loUserId)
      .maybeSingle();
    if (loRow?.nmls)        loNmls = loRow.nmls;
    if (loRow?.display_name && !loDisplayName) loDisplayName = loRow.display_name;
  }

  return NextResponse.json({
    room:         roomRes.data,
    members:      membersRes.data ?? [],
    milestones:   milestonesRes.data ?? [],
    messages:     messagesRes.data ?? [],
    scenarios:    scenariosRes.data ?? [],
    viewerUserId: userId,
    loNmls,
    loDisplayName,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const ok = await assertMember(sb, id, userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: roomMeta } = await sb.from('deal_rooms').select('status').eq('id', id).maybeSingle();
  if (roomMeta?.status === 'closed' || roomMeta?.status === 'cancelled') {
    return NextResponse.json({ error: 'This deal room is closed and read-only' }, { status: 423 });
  }

  const body = await req.json();

  // share_financials is buyer-only — verify role before allowing
  if ('share_financials' in body) {
    const { data: memberRow } = await sb
      .from('deal_room_members')
      .select('role')
      .eq('deal_room_id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (memberRow?.role !== 'buyer') {
      return NextResponse.json({ error: 'Only the buyer can update financial sharing permission' }, { status: 403 });
    }
    const { data, error } = await sb
      .from('deal_rooms')
      .update({ share_financials: !!body.share_financials, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ room: data });
  }

  const allowed = ['status', 'offer_price', 'target_close_date', 'property_data'];
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const k of allowed) {
    if (k in body) patch[k] = body[k];
  }

  const { data, error } = await sb.from('deal_rooms').update(patch).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify on stage advance
  if ('status' in body && data?.status && data?.property_address) {
    let actorName = 'Your Loan Officer';
    try {
      const clerk = await clerkClient();
      const clerkUser = await clerk.users.getUser(userId);
      actorName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || actorName;
    } catch { /* non-fatal */ }

    const { data: memberRows } = await sb
      .from('deal_room_members')
      .select('email, display_name')
      .eq('deal_room_id', id)
      .not('email', 'is', null)
      .or(`user_id.neq.${userId},user_id.is.null`);
    if (memberRows?.length) {
      const roomUrl = `${BASE}/deal-rooms/${id}`;
      const stageLabel = STATUS_LABELS[data.status] ?? data.status;
      for (const m of memberRows) {
        emailDealRoomActivity({
          toEmail: m.email!, toName: m.display_name ?? null,
          fromName: actorName, event: 'stage',
          propertyAddress: data.property_address,
          roomUrl, preview: stageLabel,
        }).catch(() => {});
      }
    }
  }

  return NextResponse.json({ room: data });
}
