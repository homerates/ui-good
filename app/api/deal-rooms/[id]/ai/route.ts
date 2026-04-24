// app/api/deal-rooms/[id]/ai/route.ts
// Streaming AI assistant with full deal room context.
// POST { messages: [{role, content}] } → streams plain-text response.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSupabase } from '../../../../../lib/supabaseServer';
import { getFredSnapshot } from '@/lib/fred';

async function assertMember(sb: any, roomId: string, userId: string) {
  const { data: room } = await sb.from('deal_rooms').select('id,created_by').eq('id', roomId).maybeSingle();
  if (!room) return false;
  if (room.created_by === userId) return true;
  const { data: m } = await sb.from('deal_room_members').select('id').eq('deal_room_id', roomId).eq('user_id', userId).not('joined_at', 'is', null).maybeSingle();
  return !!m;
}

function buildSystemPrompt(room: any, members: any[], scenarios: any[], liveRate: number | null): string {
  const pd      = room?.property_data ?? {};
  const offerPx = room?.offer_price ?? pd.price ?? null;
  const avm     = pd.estimatedValue ?? null;
  const gapPct  = offerPx && avm ? (((offerPx - avm) / avm) * 100).toFixed(1) : null;

  const lines: (string | null)[] = [
    'You are an AI deal room assistant inside HomeRates.ai, an AI-native real estate finance platform.',
    'You have full context of this real estate transaction. Be concise, direct, and use actual numbers.',
    'You can calculate mortgage payments, analyze pricing, and give deal strategy advice.',
    'Avoid legal advice. You are an educational tool. Keep answers under 4 sentences unless math is needed.',
    '',
    `PROPERTY: ${room?.property_address ?? 'Unknown'}`,
    pd.price           ? `List Price: $${Number(pd.price).toLocaleString()}`              : null,
    avm                ? `AVM: $${Number(avm).toLocaleString()}${gapPct ? ` (${gapPct}% ${parseFloat(gapPct) >= 0 ? 'above' : 'below'} AVM)` : ''}` : null,
    pd.estimatedValueLow && pd.estimatedValueHigh
                       ? `AVM Range: $${Number(pd.estimatedValueLow).toLocaleString()}–$${Number(pd.estimatedValueHigh).toLocaleString()}` : null,
    pd.beds            ? `Beds/Baths: ${pd.beds} bd / ${pd.baths} ba`                     : null,
    pd.sqft            ? `Size: ${Number(pd.sqft).toLocaleString()} sqft`                 : null,
    pd.daysOnMarket != null ? `Days on Market: ${pd.daysOnMarket}`                       : null,
    pd.annualTaxes     ? `Annual Taxes: $${Number(pd.annualTaxes).toLocaleString()}`      : null,
    pd.hoaMonthly      ? `HOA: $${pd.hoaMonthly}/mo`                                      : null,
    pd.lastSalePrice   ? `Last Sale: $${Number(pd.lastSalePrice).toLocaleString()} (${pd.lastSaleDate ?? 'date unknown'})` : null,
    '',
    `DEAL STAGE: ${room?.status ?? 'unknown'}`,
    room?.offer_price  ? `Current Offer Price: $${Number(room.offer_price).toLocaleString()}` : 'No offer price set yet',
    room?.target_close_date ? `Target Close Date: ${room.target_close_date}` : 'No target close date set',
    '',
    'TEAM STATUS:',
    ...(['buyer', 'lo', 'agent'] as const).map(role => {
      const m = members.find((x: any) => x.role === role);
      return `- ${role === 'lo' ? 'Loan Officer' : role.charAt(0).toUpperCase() + role.slice(1)}: ${m?.joined_at ? 'Joined' : 'Not yet joined'}`;
    }),
    '',
    liveRate ? `CURRENT 30Y FIXED RATE: ${liveRate.toFixed(2)}% (FRED live data)` : null,
    '',
    scenarios.length > 0 ? `SAVED FINANCING SCENARIOS (${scenarios.length}):` : 'No financing scenarios saved yet.',
    ...scenarios.map((s: any) =>
      `- "${s.label ?? 'Scenario'}": $${Number(s.offer_price ?? 0).toLocaleString()} at ${s.down_pct ?? '?'}% down, ${s.rate ?? '?'}% rate → $${Number(s.piti ?? 0).toLocaleString()}/mo PITI`
    ),
  ];

  return lines.filter(l => l !== null).join('\n');
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const ok = await assertMember(sb, id, userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { messages } = body as { messages: { role: string; content: string }[] };
  if (!messages?.length) return NextResponse.json({ error: 'messages required' }, { status: 400 });

  const [roomRes, membersRes, scenariosRes, fredSnap] = await Promise.all([
    sb.from('deal_rooms').select('*').eq('id', id).single(),
    sb.from('deal_room_members').select('role,joined_at').eq('deal_room_id', id),
    sb.from('deal_room_scenarios').select('label,offer_price,down_pct,rate,piti').eq('deal_room_id', id).order('created_at', { ascending: false }).limit(10),
    getFredSnapshot({ timeoutMs: 3000 }),
  ]);

  const systemPrompt = buildSystemPrompt(
    roomRes.data,
    membersRes.data ?? [],
    scenariosRes.data ?? [],
    fredSnap?.mort30Avg ?? null
  );

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    const encoder = new TextEncoder();
    return new Response(encoder.encode("AI is not configured for this environment."), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      stream: true,
      max_tokens: 450,
      temperature: 0.5,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-12),
      ],
    }),
  });

  if (!openaiRes.ok || !openaiRes.body) {
    return NextResponse.json({ error: 'AI call failed' }, { status: 502 });
  }

  // Stream OpenAI SSE → plain text chunks
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  (async () => {
    const reader = openaiRes.body!.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;
          try {
            const delta = JSON.parse(data).choices?.[0]?.delta?.content ?? '';
            if (delta) await writer.write(encoder.encode(delta));
          } catch { /* malformed SSE line, skip */ }
        }
      }
    } finally {
      await writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Accel-Buffering': 'no',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
