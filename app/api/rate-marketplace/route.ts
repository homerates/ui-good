// app/api/rate-marketplace/route.ts
// POST — return anonymous rate table for a borrower's scenario.
// Fetches FRED par rate, runs LLPA engine, applies lender margins, sorts by APR.
// Lender identity is never included in the response — only anonymousId + label.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  buildRateTable,
  type MarketplaceInput,
  type MarketplaceLender,
} from '../../../lib/pricing/marketplace-engine';

const FALLBACK_PAR_RATE = 6.82;

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function fetchParRate(): Promise<number> {
  const key = process.env.FRED_API_KEY ?? '';
  if (!key) return FALLBACK_PAR_RATE;
  try {
    const url =
      `https://api.stlouisfed.org/fred/series/observations` +
      `?series_id=MORTGAGE30US&api_key=${key}&file_type=json&sort_order=desc&limit=1`;
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    if (!r.ok) return FALLBACK_PAR_RATE;
    const json = await r.json();
    const val = parseFloat(json.observations?.[0]?.value ?? '');
    return isNaN(val) ? FALLBACK_PAR_RATE : val;
  } catch {
    return FALLBACK_PAR_RATE;
  }
}

export async function POST(req: NextRequest) {
  let body: Partial<MarketplaceInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    creditScore, ltv, occupancy, loanPurpose, propertyType,
    loanAmount, lockDays, state, loanType,
  } = body;

  // Input validation
  if (
    typeof creditScore !== 'number' ||
    typeof ltv !== 'number' ||
    typeof loanAmount !== 'number' ||
    !['primary','second','investment'].includes(occupancy ?? '') ||
    !['purchase','rate_term_refi','cash_out_refi'].includes(loanPurpose ?? '') ||
    !['sfr','2unit','3_4unit','condo','manufactured'].includes(propertyType ?? '') ||
    ![15,30,45,60].includes(lockDays ?? 0) ||
    typeof state !== 'string' || state.length !== 2 ||
    !['conventional','fha','va','jumbo','dscr'].includes(loanType ?? '')
  ) {
    return NextResponse.json({ error: 'Missing or invalid input fields' }, { status: 400 });
  }

  if (creditScore < 580 || creditScore > 850) {
    return NextResponse.json({ error: 'creditScore must be 580–850' }, { status: 400 });
  }
  if (ltv < 1 || ltv > 97) {
    return NextResponse.json({ error: 'LTV must be 1–97' }, { status: 400 });
  }
  if (loanAmount < 50_000 || loanAmount > 10_000_000) {
    return NextResponse.json({ error: 'loanAmount out of range' }, { status: 400 });
  }

  // Fetch FRED par rate and active lenders in parallel
  const [parRate, lendersResult] = await Promise.all([
    fetchParRate(),
    db()
      .from('marketplace_lenders')
      .select(
        'id, margin_over_par, loan_types, eligible_states, ' +
        'min_loan_amount, max_loan_amount, min_credit_score, max_ltv, ' +
        'lock_15_adj, lock_45_adj, lock_60_adj',
      )
      .eq('status', 'active'),
  ]);

  const lenders = (lendersResult.data ?? []) as unknown as MarketplaceLender[];

  const result = buildRateTable(
    body as MarketplaceInput,
    lenders,
    parRate,
  );

  // Increment view counters for matched lenders (fire-and-forget)
  if (result.rows.length > 0) {
    const ids = result.rows.map(r => r.anonymousId);
    Promise.resolve(
      db().rpc('increment_marketplace_views', { lender_ids: ids })
    ).catch(() => {});
  }

  return NextResponse.json(result);
}
