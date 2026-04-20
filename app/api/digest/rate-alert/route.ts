// app/api/digest/rate-alert/route.ts
// GET — daily cron: if 30yr mortgage rate moved >10bps since yesterday, fire digest for all active borrowers
// Called by Vercel cron at 8am daily via x-cron-secret header

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getFredSnapshot } from '@/lib/fred';

const sb = () => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get('x-cron-secret') !== secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = sb();
    const today = new Date().toISOString().split('T')[0];

    // Get current FRED rate
    const snap = await getFredSnapshot({ timeoutMs: 8000 });
    const currentRate = snap?.mort30Avg;
    if (!currentRate || !Number.isFinite(currentRate)) {
        return NextResponse.json({ ok: false, reason: 'FRED unavailable' });
    }

    // Get last stored rate snapshot
    const { data: lastSnap } = await db
        .from('rate_snapshots')
        .select('rate, snapshot_date')
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .single();

    // Store today's snapshot
    await db.from('rate_snapshots').upsert({ snapshot_date: today, rate: currentRate }, { onConflict: 'snapshot_date' });

    // Check if rate moved >10bps
    if (!lastSnap || lastSnap.snapshot_date === today) {
        return NextResponse.json({ ok: true, reason: 'No prior snapshot or already ran today', currentRate });
    }

    const delta = currentRate - lastSnap.rate;
    if (Math.abs(delta) < 0.10) {
        return NextResponse.json({ ok: true, reason: `Rate moved only ${Math.abs(delta).toFixed(3)}% — below 0.10% threshold`, currentRate, delta });
    }

    // Rate moved enough — find all digest-subscribed borrowers
    const { data: borrowers } = await db
        .from('borrowers')
        .select('id, email, name, property_address')
        .eq('digest_enabled', true)
        .not('email', 'is', null)
        .not('property_address', 'is', null);

    if (!borrowers?.length) {
        return NextResponse.json({ ok: true, reason: 'No eligible borrowers', delta });
    }

    const appBase = process.env.NEXT_PUBLIC_APP_BASE_URL ?? 'https://chat.homerates.ai';
    const results: { id: string; status: string }[] = [];

    for (const b of borrowers) {
        try {
            const res = await fetch(`${appBase}/api/digest/run`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-cron-secret': secret ?? '',
                },
                body: JSON.stringify({
                    borrower_id:    b.id,
                    is_rate_alert:  true,
                    rate_delta:     delta,
                }),
            });
            results.push({ id: b.id, status: res.ok ? 'sent' : `error:${res.status}` });
        } catch (e) {
            results.push({ id: b.id, status: `exception:${String(e)}` });
        }
    }

    // Also notify consumer homeowners who set a personal rate threshold
    const { data: consumerAlerts } = await db
        .from('homeowner_rate_alerts')
        .select('id, email, property_address, threshold_rate')
        .eq('active', true)
        .gte('threshold_rate', currentRate); // their target rate is now at or above current (i.e. rates dropped to their level)

    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const consumerResults: { email: string; status: string }[] = [];

    for (const alert of (consumerAlerts ?? [])) {
        try {
            await resend.emails.send({
                from: 'HomeRates.ai <digest@homerates.ai>',
                to: alert.email,
                subject: `🔔 Rate Alert: 30-year mortgage rates dropped to ${currentRate.toFixed(2)}%`,
                html: `
<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;background:#080c12;color:#f0f0f0;padding:32px 24px;border-radius:12px">
  <div style="font-size:0.65rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#00e87a;margin-bottom:8px">Rate Alert</div>
  <h2 style="font-size:1.4rem;font-weight:800;color:#fff;margin:0 0 16px">30-Year rates hit ${currentRate.toFixed(2)}%</h2>
  <p style="color:#94a3b8;font-size:0.9rem;line-height:1.6;margin:0 0 20px">
    You set an alert for when 30-year fixed rates dropped to <strong style="color:#fff">${alert.threshold_rate}%</strong> or below.
    Current rate: <strong style="color:#00e87a">${currentRate.toFixed(2)}%</strong>.
  </p>
  ${alert.property_address ? `<p style="color:#64748b;font-size:0.8rem;margin:0 0 20px">For: ${alert.property_address}</p>` : ''}
  <a href="${appBase}/my-home" style="display:inline-block;padding:12px 24px;background:#00e87a;color:#07100f;font-weight:800;font-size:0.88rem;border-radius:999px;text-decoration:none">Run My Numbers →</a>
  <p style="color:#1e293b;font-size:0.68rem;margin-top:24px;line-height:1.5">HomeRates.ai · Educational use only · Not financial advice · <a href="${appBase}/my-home" style="color:#1e293b">Manage alerts</a></p>
</div>`,
            });
            // Mark alert as triggered
            await db.from('homeowner_rate_alerts').update({ triggered_at: new Date().toISOString(), active: false }).eq('id', alert.id);
            consumerResults.push({ email: alert.email, status: 'sent' });
        } catch (e) {
            consumerResults.push({ email: alert.email, status: `error:${String(e)}` });
        }
    }

    return NextResponse.json({ ok: true, currentRate, prevRate: lastSnap.rate, delta, borrowersNotified: results.length, results, consumerAlertsNotified: consumerResults.length, consumerResults });
}
