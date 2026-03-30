// app/api/alerts/check/route.ts
// Called by Vercel Cron (daily). Evaluates all active alerts and fires notifications.
// Add to vercel.json: { "crons": [{ "path": "/api/alerts/check", "schedule": "0 14 * * *" }] }

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabaseServer";
import { getFredSnapshot } from "@/lib/fred";

const CRON_SECRET = process.env.CRON_SECRET ?? "";

// ---------------------------------------------------------------------------
// Email delivery — wire a real provider here (Resend, SendGrid, etc.)
// Add RESEND_API_KEY to .env.local to enable
// ---------------------------------------------------------------------------
async function sendAlertEmail(to: string, subject: string, body: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[alerts/check] Email skipped (no RESEND_API_KEY). To: ${to} | ${subject}`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from: "HomeRates.ai <alerts@homerates.ai>",
        to,
        subject,
        html: body,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function emailHtml(title: string, message: string, cta?: string): string {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#080c12;color:#e0f0e8;padding:32px;border-radius:12px;border:1px solid rgba(0,232,122,0.15)">
      <div style="color:#00e87a;font-size:12px;letter-spacing:2px;margin-bottom:16px">HOMERATES.AI ALERT</div>
      <h2 style="margin:0 0 12px;font-size:22px;color:#ffffff">${title}</h2>
      <p style="color:#a0c0a8;line-height:1.6">${message}</p>
      ${cta ? `<a href="https://chat.homerates.ai/chat" style="display:inline-block;margin-top:24px;padding:12px 24px;background:#00e87a;color:#080c12;font-weight:600;border-radius:8px;text-decoration:none">${cta}</a>` : ""}
      <p style="margin-top:32px;font-size:11px;color:#4a6a52">You received this because you set up an alert on HomeRates.ai. <a href="https://chat.homerates.ai/chat" style="color:#00e87a">Manage alerts</a></p>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Alert evaluators
// ---------------------------------------------------------------------------
async function checkRateAlert(
  params: { threshold: number; direction: "below" | "above" },
  currentRate: number | null
): Promise<{ triggered: boolean; message: string }> {
  if (currentRate === null) return { triggered: false, message: "Rate unavailable" };
  const { threshold, direction } = params;
  const triggered =
    direction === "below" ? currentRate <= threshold : currentRate >= threshold;
  return {
    triggered,
    message: `Current 30Y fixed rate is ${currentRate.toFixed(2)}% (your target: ${direction} ${threshold}%)`,
  };
}

async function checkRefiAlert(
  params: { currentRate: number; balance: number; targetMonthlySavings: number },
  currentRate: number | null
): Promise<{ triggered: boolean; message: string }> {
  if (currentRate === null) return { triggered: false, message: "Rate unavailable" };
  // Simple savings estimate: monthly payment diff on 30Y
  const calcPayment = (rate: number, bal: number) => {
    const r = rate / 100 / 12;
    const n = 360;
    return (bal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  };
  const oldPmt = calcPayment(params.currentRate, params.balance);
  const newPmt = calcPayment(currentRate, params.balance);
  const savings = Math.round(oldPmt - newPmt);
  const triggered = savings >= params.targetMonthlySavings;
  return {
    triggered,
    message: `Refinancing your $${params.balance.toLocaleString()} loan from ${params.currentRate}% → ${currentRate.toFixed(2)}% saves ~$${savings}/mo (your target: $${params.targetMonthlySavings}/mo)`,
  };
}

async function checkPropertyAlert(
  params: { address: string; lastValue: number }
): Promise<{ triggered: boolean; message: string; newValue?: number }> {
  // Call our own property lookup API
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_BASE_URL}/api/property/lookup?address=${encodeURIComponent(params.address)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return { triggered: false, message: "Property data unavailable" };
    const data = await res.json();
    const newValue = data?.estimatedValue ?? data?.value ?? null;
    if (!newValue) return { triggered: false, message: "Could not retrieve property value" };
    const changePct = ((newValue - params.lastValue) / params.lastValue) * 100;
    const triggered = Math.abs(changePct) >= 3; // trigger on ≥3% change
    return {
      triggered,
      message: `${params.address}: estimated value changed ${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}% → $${newValue.toLocaleString()} (was $${params.lastValue.toLocaleString()})`,
      newValue,
    };
  } catch {
    return { triggered: false, message: "Property lookup failed" };
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  // Verify cron secret (set CRON_SECRET in Vercel env)
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  // Fetch current 30Y rate once, shared across all rate/refi checks
  const snap = await getFredSnapshot({ timeoutMs: 6000 });
  const currentRate = snap?.mort30Avg ?? null;

  // Load all active alerts
  const { data: alerts, error } = await sb
    .from("hr_alerts")
    .select("*")
    .eq("active", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: { id: string; type: string; triggered: boolean; sent: boolean }[] = [];

  for (const alert of alerts ?? []) {
    let result: { triggered: boolean; message: string; newValue?: number } = {
      triggered: false,
      message: "",
    };

    if (alert.type === "rate") result = await checkRateAlert(alert.params, currentRate);
    else if (alert.type === "refi") result = await checkRefiAlert(alert.params, currentRate);
    else if (alert.type === "property") result = await checkPropertyAlert(alert.params);

    let sent = false;
    if (result.triggered) {
      const subject =
        alert.type === "property"
          ? `Property Update: ${alert.params.address}`
          : alert.type === "refi"
          ? "Your Refi Opportunity Has Arrived"
          : `Rate Alert: 30Y Fixed is now ${currentRate?.toFixed(2)}%`;

      sent = await sendAlertEmail(
        alert.email,
        subject,
        emailHtml(alert.label, result.message, "Open HomeRates.ai")
      );

      // Update last triggered + optionally update stored property value
      const updates: Record<string, unknown> = {
        last_triggered_at: new Date().toISOString(),
        trigger_count: (alert.trigger_count ?? 0) + 1,
        last_checked_at: new Date().toISOString(),
      };
      if (alert.type === "property" && result.newValue) {
        updates.params = { ...alert.params, lastValue: result.newValue };
      }
      await sb.from("hr_alerts").update(updates).eq("id", alert.id);
    } else {
      await sb
        .from("hr_alerts")
        .update({ last_checked_at: new Date().toISOString() })
        .eq("id", alert.id);
    }

    results.push({ id: alert.id, type: alert.type, triggered: result.triggered, sent });
  }

  return NextResponse.json({ ok: true, checked: results.length, results });
}
