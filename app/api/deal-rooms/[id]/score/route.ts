// app/api/deal-rooms/[id]/score/route.ts
// Offer Confidence Score — pure math breakdown + GPT-4o 3-sentence narrative.
// Called on demand; no DB writes needed (cached in client state).

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

// ── Scoring ──────────────────────────────────────────────────────────────────

interface Signal {
  key: string;
  label: string;
  detail: string;
  points: number;
  max: number;
  status: 'good' | 'ok' | 'warn';
}

function scoreRoom(room: any, members: any[], scenarios: any[], liveRate: number | null): {
  total: number;
  signals: Signal[];
} {
  const pd      = room.property_data ?? {};
  const offerPx = room.offer_price ?? pd.price ?? null;
  const avm     = pd.estimatedValue ?? null;
  const dom     = pd.daysOnMarket ?? null;
  const signals: Signal[] = [];

  // 1. Price position vs AVM (25 pts)
  if (offerPx && avm) {
    const gapPct = ((offerPx - avm) / avm) * 100;
    let pts: number;
    let detail: string;
    let status: Signal['status'];
    if      (gapPct <= -5)   { pts = 25; detail = `${Math.abs(gapPct).toFixed(1)}% below AVM — strong position`;   status = 'good'; }
    else if (gapPct <= 0)    { pts = 20; detail = `${Math.abs(gapPct).toFixed(1)}% below AVM — fair value`;        status = 'good'; }
    else if (gapPct <= 3)    { pts = 14; detail = `${gapPct.toFixed(1)}% above AVM — slightly stretched`;          status = 'ok';   }
    else if (gapPct <= 7)    { pts = 8;  detail = `${gapPct.toFixed(1)}% above AVM — premium pricing`;             status = 'warn'; }
    else                      { pts = 3;  detail = `${gapPct.toFixed(1)}% above AVM — significantly overpriced`;   status = 'warn'; }
    signals.push({ key: 'price', label: 'Price vs AVM', detail, points: pts, max: 25, status });
  } else {
    signals.push({ key: 'price', label: 'Price vs AVM', detail: 'No AVM data available', points: 10, max: 25, status: 'ok' });
  }

  // 2. Market timing / DOM (20 pts)
  if (dom !== null) {
    let pts: number;
    let detail: string;
    let status: Signal['status'];
    if      (dom > 60)  { pts = 20; detail = `${dom} days listed — seller likely motivated`;  status = 'good'; }
    else if (dom > 30)  { pts = 15; detail = `${dom} days listed — moderate competition`;     status = 'good'; }
    else if (dom > 14)  { pts = 10; detail = `${dom} days listed — active market`;            status = 'ok';   }
    else if (dom > 7)   { pts = 5;  detail = `${dom} days listed — moving fast`;              status = 'warn'; }
    else                 { pts = 2;  detail = `${dom} days listed — very hot listing`;         status = 'warn'; }
    signals.push({ key: 'timing', label: 'Market Timing', detail, points: pts, max: 20, status });
  } else {
    signals.push({ key: 'timing', label: 'Market Timing', detail: 'DOM not available', points: 10, max: 20, status: 'ok' });
  }

  // 3. Financing readiness (25 pts)
  const loJoined  = members.some(m => m.role === 'lo'    && m.joined_at);
  const hasScenarios = scenarios.length > 0;
  const loPoints  = loJoined  ? 15 : 3;
  const scnPoints = hasScenarios ? 10 : 2;
  const finPts    = loPoints + scnPoints;
  const finDetail = loJoined && hasScenarios
    ? `LO confirmed · ${scenarios.length} scenario${scenarios.length > 1 ? 's' : ''} modeled`
    : loJoined
    ? 'LO joined — model a financing scenario'
    : hasScenarios
    ? `${scenarios.length} scenario${scenarios.length > 1 ? 's' : ''} saved — LO not yet joined`
    : 'LO and scenarios pending';
  signals.push({
    key: 'financing', label: 'Financing Readiness',
    detail: finDetail, points: finPts, max: 25,
    status: finPts >= 20 ? 'good' : finPts >= 10 ? 'ok' : 'warn',
  });

  // 4. Rate environment (15 pts)
  if (liveRate) {
    let pts: number;
    let detail: string;
    let status: Signal['status'];
    if      (liveRate < 6.0) { pts = 15; detail = `${liveRate.toFixed(2)}% — historically favorable`;  status = 'good'; }
    else if (liveRate < 6.75){ pts = 11; detail = `${liveRate.toFixed(2)}% — below recent highs`;      status = 'good'; }
    else if (liveRate < 7.5) { pts = 7;  detail = `${liveRate.toFixed(2)}% — elevated, monitor closely`; status = 'ok'; }
    else                      { pts = 3;  detail = `${liveRate.toFixed(2)}% — high rate environment`;   status = 'warn'; }
    signals.push({ key: 'rate', label: 'Rate Environment', detail, points: pts, max: 15, status });
  } else {
    signals.push({ key: 'rate', label: 'Rate Environment', detail: 'Rate data unavailable', points: 7, max: 15, status: 'ok' });
  }

  // 5. Deal readiness (15 pts)
  const hasClose   = !!room.target_close_date;
  const hasAgent   = members.some(m => m.role === 'agent' && m.joined_at);
  const hasBuyer   = members.some(m => m.role === 'buyer' && m.joined_at);
  const avmTight   = pd.estimatedValueLow && pd.estimatedValueHigh && avm
    ? ((pd.estimatedValueHigh - pd.estimatedValueLow) / avm) < 0.12
    : false;
  const readyPts   = (hasClose ? 5 : 0) + (hasAgent ? 4 : 0) + (hasBuyer ? 4 : 0) + (avmTight ? 2 : 0);
  const readyParts = [
    hasClose ? 'close date set' : null,
    hasBuyer ? 'buyer joined' : null,
    hasAgent ? 'agent joined' : null,
  ].filter(Boolean);
  signals.push({
    key: 'readiness', label: 'Deal Readiness',
    detail: readyParts.length ? readyParts.join(' · ') : 'Invite team to strengthen score',
    points: readyPts, max: 15,
    status: readyPts >= 10 ? 'good' : readyPts >= 5 ? 'ok' : 'warn',
  });

  const total = signals.reduce((s, x) => s + x.points, 0);
  return { total, signals };
}

// ── Narrative ─────────────────────────────────────────────────────────────────

async function generateNarrative(room: any, score: number, signals: Signal[], liveRate: number | null): Promise<string> {
  const pd      = room.property_data ?? {};
  const offerPx = room.offer_price ?? pd.price ?? null;
  const avm     = pd.estimatedValue ?? null;
  const dom     = pd.daysOnMarket ?? null;
  const close   = room.target_close_date ?? null;

  const ctx = [
    offerPx && avm ? `List/offer price $${(offerPx/1000).toFixed(0)}k vs AVM $${(avm/1000).toFixed(0)}k (${(((offerPx-avm)/avm)*100).toFixed(1)}% gap)` : null,
    dom !== null ? `${dom} days on market` : null,
    liveRate ? `Current 30Y rate: ${liveRate.toFixed(2)}%` : null,
    close ? `Target close: ${close}` : null,
    `Offer Confidence Score: ${score}/100`,
    signals.map(s => `${s.label}: ${s.points}/${s.max} — ${s.detail}`).join('; '),
  ].filter(Boolean).join('. ');

  const key = process.env.OPENAI_API_KEY;
  if (!key) return fallbackNarrative(score, signals, offerPx, avm, dom, liveRate);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 160,
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content: 'You are a sharp real estate AI analyst. Write exactly 3 sentences about this deal: (1) price position and what it means for negotiating leverage, (2) market timing signal and urgency level, (3) one specific actionable recommendation. Use actual numbers from the data. Be direct, no fluff, no disclaimers.',
          },
          { role: 'user', content: ctx },
        ],
      }),
    });
    if (!res.ok) return fallbackNarrative(score, signals, offerPx, avm, dom, liveRate);
    const d = await res.json();
    return d.choices?.[0]?.message?.content?.trim() ?? fallbackNarrative(score, signals, offerPx, avm, dom, liveRate);
  } catch {
    return fallbackNarrative(score, signals, offerPx, avm, dom, liveRate);
  }
}

function fallbackNarrative(score: number, signals: Signal[], offerPx: number | null, avm: number | null, dom: number | null, rate: number | null): string {
  const priceSignal  = signals.find(s => s.key === 'price');
  const timingSignal = signals.find(s => s.key === 'timing');
  const rateSignal   = signals.find(s => s.key === 'rate');
  const p1 = priceSignal  ? `Price analysis: ${priceSignal.detail}.`   : 'Obtain an AVM to assess price positioning.';
  const p2 = timingSignal ? `Market timing: ${timingSignal.detail}.`   : 'DOM data unavailable — check listing history.';
  const p3 = rateSignal   ? `Rate context: ${rateSignal.detail}.`      : 'Confirm current rate with your loan officer.';
  return `${p1} ${p2} ${p3}`;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const ok = await assertMember(sb, id, userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [roomRes, membersRes, scenariosRes, fredSnap] = await Promise.all([
    sb.from('deal_rooms').select('*').eq('id', id).single(),
    sb.from('deal_room_members').select('role,joined_at').eq('deal_room_id', id),
    sb.from('deal_room_scenarios').select('id,piti').eq('deal_room_id', id).limit(20),
    getFredSnapshot({ timeoutMs: 4000 }),
  ]);

  const room      = roomRes.data;
  const members   = membersRes.data ?? [];
  const scenarios = scenariosRes.data ?? [];
  const liveRate  = fredSnap?.mort30Avg ?? null;

  const { total, signals } = scoreRoom(room, members, scenarios, liveRate);
  const narrative = await generateNarrative(room, total, signals, liveRate);

  return NextResponse.json({ score: total, signals, narrative, rate: liveRate, generatedAt: new Date().toISOString() });
}
