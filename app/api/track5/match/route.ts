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

import { NextRequest, NextResponse } from 'next/server';
import { auth }                      from '@clerk/nextjs/server';
import { createClient }              from '@supabase/supabase-js';
import { Resend }                    from 'resend';
import { emailShell }                from '../../../../lib/sendEmail';

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

// ── Track5 LO alert email ──────────────────────────────────────────────────────

function track5AlertHtml(opts: {
  loName: string;
  composite: number;
  verdict: string;
  zip: string;
  state: string;
  loanType: string;
  priceRange: string;
  dpPct: number | null;
  boardUrl: string;
}): string {
  const CARD = '#1c2433';
  const SEP  = '#2a3444';
  const row  = (label: string, value: string) =>
    `<tr>
      <td bgcolor="${CARD}" style="background-color:${CARD};padding:10px 0;border-bottom:1px solid ${SEP}">
        <span style="display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#8b949e;margin-bottom:3px">${label}</span>
        <span style="font-size:15px;font-weight:600;color:#e6edf3">${value}</span>
      </td>
    </tr>`;

  return emailShell(`
    <span style="display:inline-block;background-color:#091a10;color:#00e87a;font-size:11px;font-weight:700;padding:4px 10px;border-radius:4px;letter-spacing:.08em">TRACK 5 MATCH</span>
    <div style="font-size:22px;font-weight:700;color:#e6edf3;margin-top:14px">Hi ${opts.loName},</div>
    <div style="font-size:14px;color:#8b949e;margin-top:6px;margin-bottom:24px;line-height:1.5">
      A buyer with a completed Track 5 Decision Score is looking for a loan officer in their area. Their score and scenario are below — identity is anonymous until they accept your response.
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" bgcolor="${CARD}" style="background-color:${CARD};border:1px solid #2a3444;border-radius:12px;margin-bottom:24px">
      <tr><td bgcolor="${CARD}" style="background-color:${CARD};padding:4px 20px 0">
        <table width="100%" cellpadding="0" cellspacing="0" bgcolor="${CARD}" style="background-color:${CARD};">
          ${row('Decision Score', `${opts.composite} · ${opts.verdict}`)}
          ${row('ZIP Code',       opts.zip)}
          ${row('State',          opts.state)}
          ${row('Loan type',      opts.loanType)}
          ${row('Price range',    opts.priceRange)}
          ${opts.dpPct != null ? row('Down payment', `${opts.dpPct}%`) : ''}
          <tr>
            <td bgcolor="${CARD}" style="background-color:${CARD};padding:10px 0">
              <span style="display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#8b949e;margin-bottom:3px">Identity</span>
              <span style="font-size:15px;font-weight:600;color:#8b949e">🔒 Anonymous — revealed when buyer accepts</span>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>

    <a href="${opts.boardUrl}" style="display:block;text-align:center;background:#00e87a;color:#07100f;font-size:15px;font-weight:700;padding:15px 20px;border-radius:999px;text-decoration:none">
      View &amp; Respond on Board →
    </a>
  `, "HomeRates.ai · Track 5 · Borrower identity is kept private until mutual acceptance.");
}

// ── POST ───────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : null;

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

  if (!session.composite_score) {
    return NextResponse.json({ error: 'Score not yet computed' }, { status: 422 });
  }

  // ── 2. Extract ZIP + state from property address ───────────────────────────
  const address = (session.property_address as string | null) ?? '';
  const zip     = extractZip(address);
  const state   = extractState(address) ?? 'CA';

  if (!zip) {
    return NextResponse.json({ error: 'Could not extract ZIP from property address' }, { status: 422 });
  }

  // ── 3. Build scenario context from session ─────────────────────────────────
  const sj        = (session.scenario_json ?? {}) as Record<string, unknown>;
  const price     = typeof sj.price === 'number' ? sj.price : null;
  const dpPct     = typeof sj.dp_pct === 'number' ? sj.dp_pct : null;
  const lt        = typeof sj.lt === 'string' ? sj.lt : 'conventional';
  const rate      = typeof sj.rate === 'number' ? sj.rate : null;
  const term      = typeof sj.term === 'number' ? sj.term : 30;

  const composite = session.composite_score as number;
  const verdict   = verdictLabel(composite);
  const loanType  = loanTypeLabel(lt);
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

  // ── 5. Create anonymous scenario brief (ZIP only, identity hidden) ─────────
  const brief = {
    borrower_id:     userId,
    // Standard scenario_briefs fields (anonymized at match time)
    loan_type:       loanType,
    state,
    price_range:     priceRange,
    credit_tier:        'Not disclosed',   // not collected; LO sees score instead
    timeline:           'ASAP (under 30 days)',
    visibility:         'public',
    status:             'open',
    down_payment_pct:   dpPct ?? 0,       // NOT NULL col; use card dp% or 0 if unknown
    // Track5-specific
    session_id:      sessionId,
    property_zip:    zip,
    share_level:     'zip_only',
    composite_score: composite,
    verdict_label:   verdict,
    from_track5:     true,
    // Card data (exact scenario numbers)
    has_card_data:   price != null,
    card_price:      price,
    card_dp_pct:     dpPct,
    card_rate:       rate,
    card_term:       term,
    // posted_by_role added in migration 045
    posted_by_role:  'borrower',
  };

  const { data: newBrief, error: insertErr } = await supabase
    .from('scenario_briefs')
    .insert(brief)
    .select('id')
    .single();

  if (insertErr || !newBrief) {
    console.error('[track5/match] insert error:', insertErr);
    return NextResponse.json({ error: 'Failed to create match request' }, { status: 500 });
  }

  // ── 6. Alert LOs (state-matched, fire-and-forget) ─────────────────────────
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (RESEND_API_KEY) {
    // Run alerts async — don't block the response
    (async () => {
      try {
        const { data: loRows } = await supabase
          .from('loan_officers')
          .select('user_id, lender')
          .limit(50);

        if (!loRows?.length) return;

        const ids = loRows.map(r => r.user_id);
        const { data: userRows } = await supabase
          .from('users').select('id, email').in('id', ids);
        const emailMap: Record<string, string> = {};
        for (const u of userRows ?? []) { if (u.email) emailMap[u.id] = u.email; }

        const resend   = new Resend(RESEND_API_KEY);
        const FROM     = process.env.RESEND_FROM_EMAIL ?? 'digest@homerates.ai';
        const boardUrl = 'https://chat.homerates.ai/lo/scenarios';

        await Promise.allSettled(
          loRows
            .filter(lo => emailMap[lo.user_id])
            .map(lo =>
              resend.emails.send({
                from:    `HomeRates.ai <${FROM}>`,
                to:      emailMap[lo.user_id],
                subject: `Track 5 match — ${loanType} buyer · ZIP ${zip} · Score ${composite}`,
                html:    track5AlertHtml({
                  loName:    lo.lender ?? 'there',
                  composite,
                  verdict,
                  zip,
                  state,
                  loanType,
                  priceRange,
                  dpPct,
                  boardUrl,
                }),
              })
            )
        );
      } catch (e) {
        console.error('[track5/match] alert send failed:', e);
      }
    })();
  }

  return NextResponse.json({ ok: true, scenarioId: newBrief.id });
}
