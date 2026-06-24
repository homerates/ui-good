// app/api/track5/match/route.ts
// POST — Create an anonymous Track5 match request from a buyer evaluation session.
//
// Privacy model (tiered reveal):
//   share_level = 'zip_only'     → LO sees ZIP + score + scenario, NOT name/address
//   share_level = 'full_address' → unlocked only when borrower accepts a pro response
//
// Auth: required (Clerk). Borrower must be signed in.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse }   from 'next/server';
import { auth }                        from '@clerk/nextjs/server';
import { createClient }                from '@supabase/supabase-js';
import { sendTrack5Alerts }            from '../../../../lib/sendScenarioAlerts';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractZip(address: string): string | null {
  const m = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : null;
}

function extractState(address: string): string | null {
  // Matches ", CA 92130" or ", CA" at end
  const m = address.match(/,\s*([A-Z]{2})(?:\s+\d{5})?(?:\s*$|,)/);
  return m ? m[1] : null;
}

function priceToRange(price: number): string {
  if (price < 300_000)   return 'Under $300k';
  if (price < 400_000)   return '$300k–$400k';
  if (price < 500_000)   return '$400k–$500k';
  if (price < 750_000)   return '$500k–$750k';
  if (price < 1_000_000) return '$750k–$1M';
  if (price < 1_500_000) return '$1M–$1.5M';
  return '$1.5M+';
}

function verdictLabel(score: number): string {
  if (score >= 85) return 'Strong Buy';
  if (score >= 70) return 'Ready to Offer';
  if (score >= 55) return 'Buy with Caution';
  if (score >= 40) return 'Watch the Market';
  return 'Hold Off';
}

function loanTypeLabel(lt: string | undefined | null): string {
  if (lt === 'fha')   return 'FHA';
  if (lt === 'va')    return 'VA';
  if (lt === 'jumbo') return 'Jumbo';
  return 'Conventional';
}

// ── POST ───────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const sessionId      = typeof body.sessionId   === 'string' ? body.sessionId.trim() : null;
  // Accept composite from frontend as fallback when DB session hasn't been updated yet
  const bodyComposite  = typeof body.composite   === 'number' ? body.composite   : null;
  // L5 Rate Intelligence — optional, set when borrower decoded their rate before matching
  const fairParRate    = typeof body.fairParRate  === 'number' ? body.fairParRate  : null;
  const fairParCounty  = typeof body.fairParCounty === 'string' ? body.fairParCounty : null;

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  const supabase = db();

  // ── 1. Load the evaluation session ────────────────────────────────────────
  const { data: session, error: sesErr } = await supabase
    .from('buyer_evaluation_sessions')
    .select('id, user_id, property_address, composite_score, scenario_json, l1_score, l2_score, l3_score, l4_score')
    .eq('id', sessionId)
    .eq('user_id', userId)   // ownership check
    .single();

  if (sesErr || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // ── 2. Extract ZIP + state from property address ───────────────────────────
  const address = (session.property_address as string | null) ?? '';
  const zip     = extractZip(address);   // nullable — property_zip column allows null
  const state   = extractState(address) ?? 'CA';

  // ── 3. Build scenario context from session ─────────────────────────────────
  const sj        = (session.scenario_json ?? {}) as Record<string, unknown>;
  const price     = typeof sj.price === 'number' ? sj.price : null;
  const dpPct     = typeof sj.dp_pct === 'number' ? sj.dp_pct : null;
  const lt        = typeof sj.lt === 'string' ? sj.lt : 'conventional';
  const rate      = typeof sj.rate === 'number' ? sj.rate : null;
  const term      = typeof sj.term === 'number' ? sj.term : 30;

  // Use DB score; fall back to value sent from frontend (handles race where UI has score but DB save is in-flight)
  const composite  = (session.composite_score ?? bodyComposite ?? 0) as number;
  const verdict    = verdictLabel(composite);
  const loanType   = loanTypeLabel(lt);
  const priceRange = price ? priceToRange(price) : 'Not specified';

  // ── 4. Check for existing Track5 brief for this session (prevent duplicates) ──
  const { data: existing } = await supabase
    .from('scenario_briefs')
    .select('id')
    .eq('session_id', sessionId)
    .eq('from_track5', true)
    .maybeSingle();

  if (existing?.id) {
    // Already matched — return existing brief ID (idempotent)
    return NextResponse.json({ ok: true, scenarioId: existing.id, alreadyMatched: true });
  }

  // ── 4b. Cross-session spam guard — 1 active brief per user per property ZIP ──
  // Prevents a user from bypassing the session-level check by starting a new chat
  // for the same property (which creates a fresh session_id).
  // Only blocks if an active brief exists — closed/expired briefs don't permanently lock the user.
  if (zip) {
    const { data: zipDup } = await supabase
      .from('scenario_briefs')
      .select('id')
      .eq('borrower_id', userId)
      .eq('property_zip', zip)
      .eq('from_track5', true)
      .eq('status', 'active')
      .maybeSingle();

    if (zipDup?.id) {
      return NextResponse.json(
        { error: 'active_match_exists', message: 'You already have an active match request for a property in this ZIP code. Check your inbox for responses from loan officers.' },
        { status: 409 }
      );
    }
  }

  // ── 5. Create anonymous scenario brief (ZIP only, identity hidden) ─────────
  const brief = {
    borrower_id:     userId,
    // Standard scenario_briefs fields (anonymized at match time)
    loan_type:       loanType,
    state,
    price_range:     priceRange,
    // NOT NULL columns not collected by Track5 — use safe defaults
    income_range:       'Not disclosed',
    credit_tier:        'Not disclosed',
    timeline:           'ASAP (under 30 days)',
    visibility:         'public',
    status:             'active',           // must be 'active' — board query filters on this
    needs_professional: 'lender',           // Track5 always targets lenders
    down_payment_pct:   dpPct ?? 0,
    // Track5-specific
    session_id:      sessionId,
    property_zip:    zip,
    share_level:     'zip_only',
    composite_score: composite,
    verdict_label:   verdict,
    from_track5:     true,
    // Card data (exact scenario numbers)
    has_card_data:       price != null,
    card_price:          price,
    card_dp_pct:         dpPct,
    card_rate:           rate,
    card_term:           term,
    // L5 Rate Intelligence decoded rate (nullable — set only when borrower ran RIE before matching)
    card_fair_par_rate:  fairParRate,
    // posted_by_role added in migration 045
    posted_by_role:      'borrower',
  };
  void fairParCounty; // stored in message metadata via fire-to-pe; not needed in scenario_briefs

  const { data: newBrief, error: insertErr } = await supabase
    .from('scenario_briefs')
    .insert(brief)
    .select('id')
    .single();

  if (insertErr || !newBrief) {
    console.error('[track5/match] insert error:', insertErr);
    return NextResponse.json({ error: 'Failed to create match request' }, { status: 500 });
  }

  // ── 6. Alert LOs — awaited so Vercel doesn't kill the function before emails send ──
  await sendTrack5Alerts({ loanType, composite, verdict, zip, state, priceRange, dpPct });

  return NextResponse.json({ ok: true, scenarioId: newBrief.id });
}
