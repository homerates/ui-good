// app/api/digest/run/route.ts
// POST  — run digest for a single borrower (LO-triggered or cron)
// Body: { borrower_id: string }
// Auth: must be the LO who owns the borrower, OR internal cron secret

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { digestEmailHtml } from '@/digest/emailTemplate';

const sb = () => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Historical 30yr fixed annual averages (FRED) ─────────────────────────────
const HIST_RATES: Record<number, number> = {
    2025: 6.76, 2024: 6.87, 2023: 6.81, 2022: 5.34,
    2021: 2.96, 2020: 3.11, 2019: 3.94, 2018: 4.54,
    2017: 3.99, 2016: 3.65, 2015: 3.85, 2014: 4.17,
    2013: 3.98, 2012: 3.66, 2011: 4.45, 2010: 4.69,
    2009: 5.04, 2008: 6.03, 2007: 6.34, 2006: 6.41,
    2005: 5.87, 2004: 5.84, 2003: 5.83, 2002: 6.54,
    2001: 6.97, 2000: 8.05,
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

async function getLiveRate(): Promise<number> {
    try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://chat.homerates.ai'}/api/ticker`, { cache: 'no-store' });
        const json = await res.json();
        const item = json?.items?.find((i: any) => i.label === '30Y FIXED');
        if (item?.value) {
            const p = parseFloat(String(item.value).replace('%', ''));
            if (Number.isFinite(p) && p > 3 && p < 12) return p;
        }
    } catch { /* fall through */ }
    return 7.0;
}

async function rentcastLookup(address: string) {
    const key = process.env.RENTCAST_API_KEY;
    if (!key) return null;
    const enc  = encodeURIComponent(address);
    const base = 'https://api.rentcast.io/v1';
    const hdrs = { 'X-Api-Key': key, 'Accept': 'application/json' };

    const [propRes, avmRes] = await Promise.allSettled([
        fetch(`${base}/properties?address=${enc}&limit=1`, { headers: hdrs }),
        fetch(`${base}/avm/value?address=${enc}`,          { headers: hdrs }),
    ]);

    const propData = propRes.status === 'fulfilled' && propRes.value.ok ? await propRes.value.json() : null;
    const avmData  = avmRes.status  === 'fulfilled' && avmRes.value.ok  ? await avmRes.value.json()  : null;
    const prop     = Array.isArray(propData) ? propData[0] : propData;
    if (!prop) return null;

    const rawDate       = prop.lastSaleDate ?? null;
    const lastSaleDate  = rawDate ? new Date(rawDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : null;
    const lastSalePrice = prop.lastSalePrice ?? null;
    const estimatedValue     = avmData?.price          ?? null;
    const estimatedValueLow  = avmData?.priceRangeLow  ?? null;
    const estimatedValueHigh = avmData?.priceRangeHigh ?? null;

    let estimatedBalance: number | null = null;
    let estimatedEquity:  number | null = null;
    let purchaseRate:     number | null = null;

    if (lastSalePrice && rawDate) {
        const saleDate   = new Date(rawDate);
        const elapsed    = monthsAgo(saleDate);
        purchaseRate     = historicalRate(saleDate.getFullYear());
        estimatedBalance = Math.round(remainingBalance(lastSalePrice, 0.20, purchaseRate, elapsed));
        const curVal     = estimatedValue ?? lastSalePrice;
        estimatedEquity  = Math.round(curVal - estimatedBalance);
    }

    return { estimatedValue, estimatedValueLow, estimatedValueHigh, estimatedBalance, estimatedEquity, purchaseRate, lastSaleDate, lastSalePrice };
}

export async function POST(req: Request) {
    // Allow either authenticated LO or internal cron call
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('x-cron-secret');
    const isCron     = cronSecret && authHeader === cronSecret;

    const { userId } = isCron ? { userId: null } : await auth();
    if (!isCron && !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { borrower_id, preview = false } = await req.json();
    if (!borrower_id) return NextResponse.json({ error: 'borrower_id required' }, { status: 400 });

    const db = sb();

    // Load borrower + LO
    const { data: borrower } = await db
        .from('borrowers')
        .select('*, loan_officers(user_id, email)')
        .eq('id', borrower_id)
        .single();

    if (!borrower) return NextResponse.json({ error: 'Borrower not found' }, { status: 404 });

    // LO auth check (skip for cron)
    if (!isCron && userId) {
        const loUserId = (borrower.loan_officers as any)?.user_id;
        if (loUserId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!borrower.property_address) {
        return NextResponse.json({ error: 'No property address on file for this borrower.' }, { status: 400 });
    }

    // Fetch live rate + Rentcast in parallel
    const [liveRate, rentcast] = await Promise.all([getLiveRate(), rentcastLookup(borrower.property_address)]);

    if (!rentcast) {
        return NextResponse.json({ error: 'Could not look up property data for this address.' }, { status: 422 });
    }

    // Save snapshot (upsert — one per borrower per day)
    const { data: snapshot } = await db
        .from('homeowner_snapshots')
        .upsert({
            borrower_id,
            snapshot_date:       new Date().toISOString().split('T')[0],
            estimated_value:     rentcast.estimatedValue,
            estimated_value_low: rentcast.estimatedValueLow,
            estimated_value_high: rentcast.estimatedValueHigh,
            estimated_balance:   rentcast.estimatedBalance,
            estimated_equity:    rentcast.estimatedEquity,
            purchase_rate:       rentcast.purchaseRate,
            live_rate:           liveRate,
            last_sale_price:     rentcast.lastSalePrice,
            last_sale_date:      rentcast.lastSaleDate,
        }, { onConflict: 'borrower_id,snapshot_date' })
        .select()
        .single();

    // Fetch previous snapshot for month-over-month delta
    const { data: prevSnapshot } = await db
        .from('homeowner_snapshots')
        .select('estimated_value, estimated_equity')
        .eq('borrower_id', borrower_id)
        .lt('snapshot_date', new Date().toISOString().split('T')[0])
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .single();

    const loName  = 'HomeRates.ai';
    const loEmail = (borrower.loan_officers as any)?.email ?? null;

    const emailData = {
        borrowerName:    borrower.name,
        address:         borrower.property_address,
        liveRate,
        ...rentcast,
        valueDelta: (rentcast.estimatedValue && prevSnapshot?.estimated_value)
            ? rentcast.estimatedValue - prevSnapshot.estimated_value : null,
        equityDelta: (rentcast.estimatedEquity && prevSnapshot?.estimated_equity)
            ? rentcast.estimatedEquity - prevSnapshot.estimated_equity : null,
        loName,
        loEmail,
    };

    // Preview mode — return data without sending
    if (preview) {
        return NextResponse.json({ ok: true, preview: true, emailData, snapshot });
    }

    // Send email via Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
        return NextResponse.json({ ok: false, error: 'RESEND_API_KEY not configured' }, { status: 503 });
    }

    if (!borrower.email) {
        return NextResponse.json({ ok: false, error: 'Borrower has no email address' }, { status: 400 });
    }

    const resend   = new Resend(resendKey);
    const fromName = loName.includes('HomeRates') ? loName : `${loName} via HomeRates.ai`;
    const fromAddr = process.env.RESEND_FROM_EMAIL ?? 'digest@homerates.ai';

    const { data: sent, error: sendErr } = await resend.emails.send({
        from:    `${fromName} <${fromAddr}>`,
        to:      borrower.email,
        subject: `Your Home Update — ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
        html:    digestEmailHtml(emailData),
    });

    if (sendErr) {
        console.error('[digest] Resend error:', sendErr);
        return NextResponse.json({ ok: false, error: sendErr.message }, { status: 500 });
    }

    // Log the send
    await db.from('digest_sends').insert({
        borrower_id,
        lo_user_id:  userId ?? 'cron',
        snapshot_id: snapshot?.id,
        resend_id:   sent?.id,
        status:      'sent',
    });

    return NextResponse.json({ ok: true, resend_id: sent?.id });
}
