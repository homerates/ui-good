// app/api/homeowner/analysis/route.ts
// GET — full property intelligence for the signed-in homeowner
// Calls Rentcast (AVM + rent) + FRED, returns all computed fields for the /my-home cards

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { getFredSnapshot } from '@/lib/fred';
import { requireAdmin } from '../../../../lib/adminAuth';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── Historical 30yr fixed annual averages (FRED) ─────────────────────────────
const HIST_RATES: Record<number, number> = {
  2025: 6.76, 2024: 6.87, 2023: 6.81, 2022: 5.34,
  2021: 2.96, 2020: 3.11, 2019: 3.94, 2018: 4.54,
  2017: 3.99, 2016: 3.65, 2015: 3.85, 2014: 4.17,
  2013: 3.98, 2012: 3.66, 2011: 4.45, 2010: 4.69,
  2009: 5.04, 2008: 6.03, 2007: 6.34, 2006: 6.41,
  2005: 5.87, 2004: 5.84, 2003: 5.83, 2002: 6.54,
  2001: 6.97, 2000: 8.05, 1999: 7.44, 1998: 6.94,
  1997: 7.60, 1996: 7.81, 1995: 7.93, 1994: 8.38,
  1993: 7.31, 1992: 8.39, 1991: 9.25, 1990: 10.13,
};
function historicalRate(year: number) { return HIST_RATES[year] ?? 5.5; }

function remainingBalance(purchasePrice: number, downPct = 0.20, ratePct: number, monthsElapsed: number) {
  const principal = purchasePrice * (1 - downPct);
  const r = ratePct / 100 / 12;
  const n = 360;
  if (r === 0) return Math.max(0, principal - (principal / n) * monthsElapsed);
  const pmt = (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return Math.max(0, principal * Math.pow(1 + r, monthsElapsed) - pmt * ((Math.pow(1 + r, monthsElapsed) - 1) / r));
}

function monthsAgo(d: Date) {
  const now = new Date();
  return Math.max(0, (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()));
}

function monthlyPayment(principal: number, annualRate: number, months = 360): number {
  const r = annualRate / 100 / 12;
  if (r === 0 || principal <= 0) return Math.round(principal / months);
  return Math.round((principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1));
}

async function rentcastLookup(address: string) {
  const key = process.env.RENTCAST_API_KEY;
  if (!key) return null;

  const enc  = encodeURIComponent(address);
  const base = 'https://api.rentcast.io/v1';
  const hdrs = { 'X-Api-Key': key, Accept: 'application/json' };

  const [propRes, avmRes, rentRes] = await Promise.allSettled([
    fetch(`${base}/properties?address=${enc}&limit=1`, { headers: hdrs }),
    fetch(`${base}/avm/value?address=${enc}`,          { headers: hdrs }),
    fetch(`${base}/avm/rent/long-term?address=${enc}`, { headers: hdrs }),
  ]);

  const propData = propRes.status === 'fulfilled' && propRes.value.ok ? await propRes.value.json() : null;
  const avmData  = avmRes.status  === 'fulfilled' && avmRes.value.ok  ? await avmRes.value.json()  : null;
  const rentData = rentRes.status === 'fulfilled' && rentRes.value.ok ? await rentRes.value.json() : null;
  const prop     = Array.isArray(propData) ? propData[0] : propData;
  if (!prop) return null;

  const rawDate        = prop.lastSaleDate ?? null;
  const lastSaleDate   = rawDate ? new Date(rawDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : null;
  const lastSalePrice  = prop.lastSalePrice ?? null;
  const estimatedValue      = avmData?.price          ?? null;
  const estimatedValueLow   = avmData?.priceRangeLow  ?? null;
  const estimatedValueHigh  = avmData?.priceRangeHigh ?? null;
  const rentEstimate         = rentData?.rent ?? rentData?.rentRangeLow ?? null;

  let estimatedBalance: number | null = null;
  let estimatedEquity:  number | null = null;
  let purchaseRate:     number | null = null;

  if (lastSalePrice && rawDate) {
    const saleDate   = new Date(rawDate);
    const elapsed    = monthsAgo(saleDate);
    purchaseRate     = historicalRate(saleDate.getFullYear());
    estimatedBalance = Math.round(remainingBalance(lastSalePrice, 0.20, purchaseRate, elapsed));
    estimatedEquity  = Math.round((estimatedValue ?? lastSalePrice) - estimatedBalance);
  }

  return {
    estimatedValue, estimatedValueLow, estimatedValueHigh,
    estimatedBalance, estimatedEquity, purchaseRate,
    lastSaleDate, lastSalePrice, rentEstimate,
  };
}

// ── Shared computation — same logic for consumer and LO/borrower paths ────────
function buildAnalysis(
  rentcast: NonNullable<Awaited<ReturnType<typeof rentcastLookup>>>,
  fred: Awaited<ReturnType<typeof getFredSnapshot>>,
  record: Record<string, any>,
  historyRows: Record<string, any>[],
) {
  const liveRate  = fred?.mort30Avg ?? 7.0;
  const prime     = 4.25 + 3;
  const helocRate = prime + 0.5;

  const { lastSalePrice, lastSaleDate } = rentcast;

  // actual_value: LO/borrower-entered appraisal or verified valuation — always wins over AVM estimate
  const estimatedValue   = record.actual_value ? Number(record.actual_value) : rentcast.estimatedValue;
  const valueIsVerified  = !!record.actual_value;

  const balance        = record.actual_balance ? Number(record.actual_balance) : rentcast.estimatedBalance;
  const purchaseRate   = record.actual_rate    ? Number(record.actual_rate)    : rentcast.purchaseRate;
  const estimatedEquity  = (estimatedValue && balance) ? Math.round(estimatedValue - balance) : rentcast.estimatedEquity;
  const estimatedBalance = balance;

  const balanceIsEstimated    = !record.actual_balance;
  const rateIsEstimated       = !record.actual_rate;
  const purchasePriceOverride = record.actual_purchase_price ? Number(record.actual_purchase_price) : null;

  const ltv       = (estimatedValue && estimatedBalance) ? Math.round((estimatedBalance / estimatedValue) * 100) : null;
  const equityPct = (estimatedValue && estimatedEquity)  ? Math.round((estimatedEquity  / estimatedValue) * 100) : null;

  const helocMax   = (estimatedValue && estimatedBalance) ? Math.max(0, Math.round(estimatedValue * 0.85 - estimatedBalance)) : null;
  const cashOutMax = (estimatedValue && estimatedBalance) ? Math.max(0, Math.round(estimatedValue * 0.80 - estimatedBalance)) : null;
  const helocDraws = helocMax ? [
    { label: '25% draw', amount: Math.round(helocMax * 0.25) },
    { label: '50% draw', amount: Math.round(helocMax * 0.50) },
    { label: 'Full draw', amount: helocMax },
  ].map(d => ({
    ...d,
    interestOnly: Math.round((d.amount * (helocRate / 100)) / 12),
    amortizing:   monthlyPayment(d.amount, helocRate, 240),
  })) : [];

  const origPurchasePrice   = purchasePriceOverride ?? lastSalePrice;
  // If LO entered actual balance, use it directly; otherwise estimate 80% LTV from purchase price
  const origBalance         = record.actual_balance
    ? Number(record.actual_balance)
    : origPurchasePrice ? origPurchasePrice * 0.8 : (estimatedBalance ?? 0) * 1.5;
  const refiMonthlySaving   = (purchaseRate && estimatedBalance && purchaseRate > liveRate)
    ? Math.max(0, monthlyPayment(estimatedBalance, purchaseRate) - monthlyPayment(estimatedBalance, liveRate)) : 0;
  const refiClosingCost     = estimatedBalance ? Math.round(estimatedBalance * 0.02) : 0;
  const refiBreakEven       = refiMonthlySaving > 0 ? Math.round(refiClosingCost / refiMonthlySaving) : null;

  const paidOff    = origBalance > 0 && estimatedBalance ? origBalance - estimatedBalance : 0;
  const paidOffPct = origBalance > 0 ? Math.round((paidOff / origBalance) * 100) : 0;

  const purchaseDateStr = record.actual_purchase_date ?? lastSaleDate;
  const purchaseYear    = purchaseDateStr ? new Date(purchaseDateStr).getFullYear() : null;
  const yearsElapsed    = purchaseYear ? new Date().getFullYear() - purchaseYear : null;
  const origPmt         = purchaseRate ? monthlyPayment(origBalance, purchaseRate) : null;
  const totalPaid       = (origPmt && yearsElapsed) ? origPmt * yearsElapsed * 12 : null;
  const interestPaid    = (totalPaid && paidOff) ? Math.max(0, Math.round(totalPaid - paidOff)) : null;

  const payoffYear = (estimatedBalance && purchaseRate) ? (() => {
    const pmt = monthlyPayment(origBalance, purchaseRate);
    const r   = purchaseRate / 100 / 12;
    const arg = 1 - (r * estimatedBalance) / pmt;
    if (arg <= 0) return new Date().getFullYear() + 30;
    const rem = Math.ceil(-Math.log(arg) / Math.log(1 + r));
    return new Date().getFullYear() + Math.ceil(rem / 12);
  })() : null;

  const nextValueTarget     = estimatedValue ? Math.ceil(estimatedValue / 250_000) * 250_000 : null;
  const yearsToTarget       = (nextValueTarget && estimatedValue) ? Math.ceil(Math.log(nextValueTarget / estimatedValue) / Math.log(1.042)) : null;
  const nextValueTargetYear = (yearsToTarget && yearsToTarget > 0 && yearsToTarget <= 15) ? new Date().getFullYear() + yearsToTarget : null;

  const piti        = (estimatedBalance && purchaseRate) ? monthlyPayment(estimatedBalance, purchaseRate) + Math.round((estimatedValue ?? 0) * 0.015 / 12) : null;
  const rentMonthly = rentcast.rentEstimate ?? (estimatedValue ? Math.round(estimatedValue * 0.0055) : null);
  const rentVsOwn   = (piti && rentMonthly) ? rentMonthly - piti : null;

  // Use actual purchase price override when available — avoids comparing vs a 2018 Rentcast sale
  const appreciationBaseline = purchasePriceOverride ?? lastSalePrice;
  const appreciationPct = (appreciationBaseline && estimatedValue) ? +((estimatedValue - appreciationBaseline) / appreciationBaseline * 100).toFixed(1) : null;

  const valueHistory = historyRows.map(r => ({ date: r.snapshot_date as string, value: r.estimated_value as number }));

  // Overlay actual purchase data so the UI always shows what the LO entered, not Rentcast history
  const displaySalePrice = purchasePriceOverride ?? lastSalePrice;
  const displaySaleDate  = record.actual_purchase_date
    ? new Date(record.actual_purchase_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : lastSaleDate;

  return {
    ...rentcast,
    estimatedValue,
    lastSalePrice: displaySalePrice,
    lastSaleDate:  displaySaleDate,
    estimatedBalance, estimatedEquity, purchaseRate,
    liveRate, fedFundsRate: null,
    valueHistory: valueHistory.length >= 2 ? valueHistory : [],
    valueIsVerified,
    savedOverrides: {
      actual_balance:        record.actual_balance        ?? null,
      actual_rate:           record.actual_rate           ?? null,
      actual_purchase_price: record.actual_purchase_price ?? null,
      actual_purchase_date:  record.actual_purchase_date  ?? null,
      actual_value:          record.actual_value          ?? null,
    },
    balanceIsEstimated, rateIsEstimated,
    ltv, equityPct, appreciationPct,
    helocMax, helocRate, cashOutMax, helocDraws,
    refiMonthlySaving, refiBreakEven, refiClosingCost,
    paidOffPct, interestPaid, yearsElapsed,
    payoffYear, nextValueTarget, nextValueTargetYear,
    piti, rentMonthly, rentVsOwn, prime, helocRateLabel: `${prime.toFixed(2)}% + 0.50%`,
  };
}

export async function GET(request: NextRequest) {
  // ── REPORT TOKEN PATH: public shareable report (no Clerk auth needed) ────────
  const reportToken = request.nextUrl.searchParams.get('report_token');
  if (reportToken) {
    const { data: rep } = await db()
      .from('borrower_reports')
      .select('borrower_id')
      .eq('token', reportToken)
      .single();
    if (!rep) return NextResponse.json({ error: 'Invalid report token' }, { status: 404 });

    const { data: bor } = await db()
      .from('borrowers')
      .select('id, name, property_address, actual_balance, actual_rate, actual_purchase_price, actual_purchase_date, actual_value')
      .eq('id', rep.borrower_id)
      .single();
    if (!bor?.property_address) return NextResponse.json({ error: 'No address on file' }, { status: 404 });

    const [rentcast, fred] = await Promise.all([
      rentcastLookup(bor.property_address),
      getFredSnapshot({ timeoutMs: 8000 }),
    ]);
    if (!rentcast) return NextResponse.json({ error: 'Could not retrieve property data' }, { status: 422 });

    return NextResponse.json({
      ...buildAnalysis(rentcast, fred, bor, []),
      borrowerName: bor.name,
      address: bor.property_address,
    });
  }

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const borrowerId = request.nextUrl.searchParams.get('borrower_id');

  // ── LO PATH: viewing a specific borrower's home ───────────────────────────
  if (borrowerId) {
    // Admin bypass — admins can view any borrower without being the LO
    const adminCheck = await requireAdmin();
    const isAdmin = !adminCheck.error;

    // Verify caller is an LO who owns this borrower (skip for admins)
    const loRes = isAdmin
      ? { data: null }
      : await db().from('loan_officers').select('id').eq('user_id', userId).maybeSingle();
    if (!isAdmin && !loRes.data) return NextResponse.json({ error: 'Not an LO account' }, { status: 403 });

    let borrower: Record<string, any> | null = null;
    {
      let q = db()
        .from('borrowers')
        .select('id, name, property_address, actual_balance, actual_rate, actual_purchase_price, actual_purchase_date, actual_value')
        .eq('id', borrowerId);
      if (!isAdmin && loRes.data) q = q.eq('loan_officer_id', loRes.data.id);
      const res = await q.maybeSingle();
      if (res.error?.code === '42703') {
        let qf = db()
          .from('borrowers')
          .select('id, name, property_address')
          .eq('id', borrowerId);
        if (!isAdmin && loRes.data) qf = qf.eq('loan_officer_id', loRes.data.id);
        const fallback = await qf.maybeSingle();
        borrower = fallback.data;
      } else {
        borrower = res.data;
      }
    }

    if (!borrower?.property_address) {
      return NextResponse.json({ error: 'No address on file for this borrower' }, { status: 404 });
    }

    const [rentcast, fred, historyRes] = await Promise.all([
      rentcastLookup(borrower.property_address),
      getFredSnapshot({ timeoutMs: 8000 }),
      db()
        .from('homeowner_snapshots')
        .select('snapshot_date, estimated_value')
        .eq('borrower_id', borrowerId)
        .not('estimated_value', 'is', null)
        .order('snapshot_date', { ascending: true })
        .limit(12),
    ]);

    if (!rentcast) return NextResponse.json({ error: 'Could not retrieve property data' }, { status: 422 });

    return NextResponse.json({
      ...buildAnalysis(rentcast, fred, borrower, historyRes.data ?? []),
      borrowerName: borrower.name,
      address: borrower.property_address,
      isLoView: true,
    });
  }

  // ── CONSUMER PATH: viewing own home ───────────────────────────────────────
  // Accepts ?property_id=<uuid> for multi-home; falls back to primary or first.
  const propertyId = request.nextUrl.searchParams.get('property_id');
  const SEL = 'id, property_address, actual_balance, actual_rate, actual_purchase_price, actual_purchase_date, actual_value';

  let homeowner: Record<string, any> | null = null;

  if (propertyId) {
    // Specific property requested — enforce ownership via user_id
    const res = await db()
      .from('consumer_homeowner_properties')
      .select(SEL)
      .eq('id', propertyId)
      .eq('user_id', userId)
      .maybeSingle();
    homeowner = res.data ?? null;
  }

  if (!homeowner) {
    // Fall back: primary property
    const primary = await db()
      .from('consumer_homeowner_properties')
      .select(SEL)
      .eq('user_id', userId)
      .eq('is_primary', true)
      .maybeSingle();
    homeowner = primary.data ?? null;
  }

  if (!homeowner) {
    // Fall back: first property by created_at
    const first = await db()
      .from('consumer_homeowner_properties')
      .select(SEL)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    homeowner = first.data ?? null;
  }

  if (!homeowner) {
    // Legacy fallback: old consumer_homeowners table (pre-migration)
    const legacy = await db()
      .from('consumer_homeowners')
      .select('property_address, id, actual_balance, actual_rate, actual_purchase_price, actual_purchase_date, actual_value')
      .eq('user_id', userId)
      .maybeSingle();
    homeowner = legacy.data ?? null;
  }

  if (!homeowner?.property_address) {
    return NextResponse.json({ error: 'No address on file' }, { status: 404 });
  }

  // Fetch Rentcast + FRED + value history in parallel
  const [rentcast, fred, historyRes] = await Promise.all([
    rentcastLookup(homeowner.property_address),
    getFredSnapshot({ timeoutMs: 8000 }),
    db()
      .from('consumer_snapshots')
      .select('snapshot_date, estimated_value')
      .eq('consumer_id', homeowner.id)
      .not('estimated_value', 'is', null)
      .order('snapshot_date', { ascending: true })
      .limit(12),
  ]);

  if (!rentcast) {
    return NextResponse.json({ error: 'Could not retrieve property data' }, { status: 422 });
  }

  return NextResponse.json({
    address: homeowner.property_address,
    ...buildAnalysis(rentcast, fred, homeowner, historyRes.data ?? []),
  });
}
