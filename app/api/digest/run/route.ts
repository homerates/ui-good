// app/api/digest/run/route.ts
// POST  — run digest for a single borrower (LO-triggered or cron)
// Body: { borrower_id: string }
// Auth: must be the LO who owns the borrower, OR internal cron secret

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '../../../../lib/adminAuth';
import { Resend } from 'resend';
import { digestEmailHtml } from '@/digest/emailTemplate';
import { getFredSnapshot } from '@/lib/fred';

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

async function getLiveRate(): Promise<number> {
    try {
        const snap = await getFredSnapshot({ timeoutMs: 6000 });
        if (snap?.mort30Avg && Number.isFinite(snap.mort30Avg) && snap.mort30Avg > 3 && snap.mort30Avg < 12) {
            return snap.mort30Avg;
        }
    } catch { /* fall through */ }
    // Only used for display in digest — fall back to recent historical average
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

    // Rent estimate (best-effort — gracefully skip if unavailable)
    let rentEstimate: number | null = null;
    try {
        const rentRes = await fetch(`${base}/avm/rent/long-term?address=${enc}`, { headers: hdrs });
        if (rentRes.ok) {
            const rentData = await rentRes.json();
            rentEstimate = rentData?.rent ?? rentData?.rentRangeHigh ?? null;
        }
    } catch { /* skip */ }

    return { estimatedValue, estimatedValueLow, estimatedValueHigh, estimatedBalance, estimatedEquity, purchaseRate, lastSaleDate, lastSalePrice, rentEstimate };
}

export async function POST(req: Request) {
    // Allow either authenticated LO or internal cron call
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('x-cron-secret');
    const isCron     = cronSecret && authHeader === cronSecret;

    const { userId } = isCron ? { userId: null } : await auth();
    if (!isCron && !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { borrower_id, consumer_id, preview = false, send_to_lo = false, admin_override = false } = body;
    if (!borrower_id && !consumer_id) return NextResponse.json({ error: 'borrower_id or consumer_id required' }, { status: 400 });

    // Admin bypass — validate admin status when flag is set
    const isAdmin = admin_override ? !(await requireAdmin()).error : false;

    const db = sb();
    const today = new Date().toISOString().split('T')[0];

    // ── CONSUMER PATH (direct-to-consumer homeowner) ──────────────────────────
    if (consumer_id) {
        if (!isCron) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: consumer } = await db
            .from('consumer_homeowners')
            .select('*')
            .eq('id', consumer_id)
            .single();

        if (!consumer) return NextResponse.json({ error: 'Consumer not found' }, { status: 404 });
        if (!consumer.property_address) return NextResponse.json({ error: 'No property address on file.' }, { status: 400 });

        const [liveRate, rentcast] = await Promise.all([getLiveRate(), rentcastLookup(consumer.property_address)]);
        if (!rentcast) return NextResponse.json({ error: 'Could not look up property data.' }, { status: 422 });

        const { data: snapshot } = await db
            .from('consumer_snapshots')
            .upsert({
                consumer_id,
                snapshot_date:        today,
                estimated_value:      rentcast.estimatedValue,
                estimated_value_low:  rentcast.estimatedValueLow,
                estimated_value_high: rentcast.estimatedValueHigh,
                estimated_balance:    rentcast.estimatedBalance,
                estimated_equity:     rentcast.estimatedEquity,
                purchase_rate:        rentcast.purchaseRate,
                live_rate:            liveRate,
                last_sale_price:      rentcast.lastSalePrice,
                last_sale_date:       rentcast.lastSaleDate,
            }, { onConflict: 'consumer_id,snapshot_date' })
            .select()
            .single();

        const [prevSnapshotRes, historyRes] = await Promise.all([
            db.from('consumer_snapshots')
                .select('estimated_value, estimated_equity')
                .eq('consumer_id', consumer_id)
                .lt('snapshot_date', today)
                .order('snapshot_date', { ascending: false })
                .limit(1)
                .single(),
            db.from('consumer_snapshots')
                .select('snapshot_date, estimated_value')
                .eq('consumer_id', consumer_id)
                .not('estimated_value', 'is', null)
                .order('snapshot_date', { ascending: true })
                .limit(12),
        ]);
        const prevSnapshot = prevSnapshotRes.data;
        const valueHistory = (historyRes.data ?? []).map(r => ({ date: r.snapshot_date as string, value: r.estimated_value as number }));

        const emailData = {
            borrowerName: consumer.name ?? 'Homeowner',
            address:      consumer.property_address,
            liveRate,
            ...rentcast,
            valueDelta:  (rentcast.estimatedValue && prevSnapshot?.estimated_value)
                ? rentcast.estimatedValue - prevSnapshot.estimated_value : null,
            equityDelta: (rentcast.estimatedEquity && prevSnapshot?.estimated_equity)
                ? rentcast.estimatedEquity - prevSnapshot.estimated_equity : null,
            loName:  'HomeRates.ai',
            loEmail: null,
            valueHistory: valueHistory.length >= 2 ? valueHistory : undefined,
        };

        if (preview) return NextResponse.json({ ok: true, preview: true, emailData, snapshot });

        const resendKey = process.env.RESEND_API_KEY;
        if (!resendKey) return NextResponse.json({ ok: false, error: 'RESEND_API_KEY not configured' }, { status: 503 });
        if (!consumer.email) return NextResponse.json({ ok: false, error: 'Consumer has no email address' }, { status: 400 });

        const resend = new Resend(resendKey);
        const { data: sent, error: sendErr } = await resend.emails.send({
            from:    `HomeRates.ai <${process.env.RESEND_FROM_EMAIL ?? 'digest@homerates.ai'}>`,
            to:      consumer.email,
            subject: `Your Home Update — ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
            html:    digestEmailHtml(emailData),
        });

        if (sendErr) {
            console.error('[digest/consumer] Resend error:', sendErr);
            return NextResponse.json({ ok: false, error: sendErr.message }, { status: 500 });
        }

        await db.from('consumer_digest_sends').insert({
            consumer_id,
            snapshot_id: snapshot?.id,
            resend_id:   sent?.id,
            status:      'sent',
        });

        return NextResponse.json({ ok: true, resend_id: sent?.id });
    }

    // ── BORROWER PATH (LO-gated) ──────────────────────────────────────────────
    // Load borrower + LO (include override columns — graceful if migration not run)
    let borrower: Record<string, any> | null = null;
    {
        const res = await db
            .from('borrowers')
            .select('*, loan_officers(user_id, email), actual_balance, actual_rate, actual_purchase_price, actual_purchase_date')
            .eq('id', borrower_id)
            .single();
        if (res.error?.code === '42703') {
            const fallback = await db
                .from('borrowers')
                .select('*, loan_officers(user_id, email)')
                .eq('id', borrower_id)
                .single();
            borrower = fallback.data;
        } else {
            borrower = res.data;
        }
    }

    if (!borrower) return NextResponse.json({ error: 'Borrower not found' }, { status: 404 });

    // LO auth check (skip for cron or verified admin)
    if (!isCron && !isAdmin && userId) {
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
            snapshot_date:       today,
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

    // Fetch previous snapshot + 12-month history in parallel
    const [prevSnapshotRes, historyRes] = await Promise.all([
        db.from('homeowner_snapshots')
            .select('estimated_value, estimated_equity')
            .eq('borrower_id', borrower_id)
            .lt('snapshot_date', today)
            .order('snapshot_date', { ascending: false })
            .limit(1)
            .single(),
        db.from('homeowner_snapshots')
            .select('snapshot_date, estimated_value')
            .eq('borrower_id', borrower_id)
            .not('estimated_value', 'is', null)
            .order('snapshot_date', { ascending: true })
            .limit(12),
    ]);
    const prevSnapshot = prevSnapshotRes.data;
    const valueHistory = (historyRes.data ?? []).map(r => ({ date: r.snapshot_date, value: r.estimated_value as number }));

    const loName  = 'HomeRates.ai';
    const loEmail = (borrower.loan_officers as any)?.email ?? null;

    // Prefer LO-supplied overrides over Rentcast/historical estimates
    const overrideBalance = borrower.actual_balance        ? Number(borrower.actual_balance)        : null;
    const overrideRate    = borrower.actual_rate           ? Number(borrower.actual_rate)           : null;
    const overrideValue   = rentcast.estimatedValue; // AVM always from Rentcast
    const effectiveBalance = overrideBalance ?? rentcast.estimatedBalance;
    const effectiveRate    = overrideRate    ?? rentcast.purchaseRate;
    const effectiveEquity  = (overrideValue && effectiveBalance) ? Math.round(overrideValue - effectiveBalance) : rentcast.estimatedEquity;

    const emailData = {
        borrowerName:    borrower.name,
        address:         borrower.property_address,
        liveRate,
        ...rentcast,
        // Override-aware fields (actual wins over estimate)
        estimatedBalance: effectiveBalance,
        estimatedEquity:  effectiveEquity,
        purchaseRate:     effectiveRate,
        valueDelta: (rentcast.estimatedValue && prevSnapshot?.estimated_value)
            ? rentcast.estimatedValue - prevSnapshot.estimated_value : null,
        equityDelta: (effectiveEquity && prevSnapshot?.estimated_equity)
            ? effectiveEquity - prevSnapshot.estimated_equity : null,
        loName,
        loEmail,
        valueHistory: valueHistory.length >= 2 ? valueHistory : undefined,
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

    // send_to_lo mode — send digest to the LO's own inbox, not the borrower
    if (send_to_lo) {
        if (!loEmail) return NextResponse.json({ ok: false, error: 'No LO email on file' }, { status: 400 });
        const resend  = new Resend(resendKey);
        const fromAddr = process.env.RESEND_FROM_EMAIL ?? 'digest@homerates.ai';
        const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const { data: sent, error: sendErr } = await resend.emails.send({
            from:    `HomeRates.ai <${fromAddr}>`,
            to:      loEmail,
            subject: `[Preview] ${borrower.name}'s Home Update — ${monthLabel}`,
            html:    digestEmailHtml(emailData),
        });
        if (sendErr) {
            console.error('[digest/lo-preview] Resend error:', sendErr);
            return NextResponse.json({ ok: false, error: sendErr.message }, { status: 500 });
        }
        return NextResponse.json({ ok: true, lo_preview: true, resend_id: sent?.id });
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
