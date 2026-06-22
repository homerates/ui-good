// app/api/market-rates-digest/route.ts
// GET  — stats (last sent, subscriber count, current 30yr rate)
// POST — generate + send daily market rate brief to newsletter_subscribers
//        Body: { dryRun?: boolean }
//        Auth: CRON_SECRET header OR admin Clerk session

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { emailShell } from "../../../lib/sendEmail";
import { unsubscribeUrl, isEmailSuppressed } from "../../../lib/unsubscribe";
import { isAdminId } from "../../../lib/adminAuth";

const BASE = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai";
const FROM = process.env.RESEND_FROM_EMAIL ?? "updates@homerates.ai";

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`) return true;
  try {
    const { userId } = await auth();
    if (await isAdminId(userId)) return true;
  } catch { /* not authenticated */ }
  return false;
}

// ── Rate data from FRED ───────────────────────────────────────────────────────

interface RateSnapshot {
  rate30y: number;
  rate15y: number;
  rate10y: number;
  fedFunds: number;
  cpi: number;
  week52High: number;
  week52Low: number;
  ytdChange: number;
  spread: number; // bps
  lastUpdated: string;
  // week-over-week change for 30yr
  weekChange: number | null;
}

async function fetchRates(): Promise<RateSnapshot> {
  const res = await fetch(`${BASE}/api/rate-intelligence`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`rate-intelligence failed: ${res.status}`);
  const d = await res.json();

  const weekly30y: { date: string; value: number }[] = d.series?.weekly30y ?? [];
  const prev30y = weekly30y.length >= 2 ? weekly30y[weekly30y.length - 2].value : null;
  const weekChange = prev30y != null ? parseFloat((d.current.rate30y - prev30y).toFixed(2)) : null;

  return {
    rate30y:     d.current.rate30y,
    rate15y:     d.current.rate15y,
    rate10y:     d.current.rate10y,
    fedFunds:    d.current.fedFunds,
    cpi:         d.current.cpi,
    week52High:  d.meta.week52High,
    week52Low:   d.meta.week52Low,
    ytdChange:   d.meta.ytdChange,
    spread:      d.meta.spread,
    lastUpdated: d.current.lastUpdated,
    weekChange,
  };
}

// ── Grok commentary ───────────────────────────────────────────────────────────

async function grokBrief(r: RateSnapshot): Promise<string> {
  const key = process.env.XAI_API_KEY;
  if (!key) return "";

  const ctx = `Today's Date: ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
30-Year Fixed: ${r.rate30y.toFixed(2)}% (week change: ${r.weekChange != null ? (r.weekChange > 0 ? "+" : "") + r.weekChange.toFixed(2) + "%" : "n/a"})
15-Year Fixed: ${r.rate15y.toFixed(2)}%
10-Year Treasury: ${r.rate10y.toFixed(2)}%
Fed Funds Rate: ${r.fedFunds.toFixed(2)}%
CPI (YoY): ${r.cpi.toFixed(2)}%
MBS Spread (30Y minus 10Y Treasury): ${r.spread} bps
52-Week High: ${r.week52High.toFixed(2)}% | 52-Week Low: ${r.week52Low.toFixed(2)}%
YTD Change: ${r.ytdChange > 0 ? "+" : ""}${r.ytdChange.toFixed(2)}%
Source: FRED / Freddie Mac`;

  const system = `You are the HomeRates.AI Rate Oracle — a sharp, data-driven mortgage market analyst.
HARD RULES:
1. Every specific number you write MUST come directly from the live data provided. Never use training-data values.
2. All timelines must be calculated forward from TODAY'S DATE in the data. Never reference past years as future.
3. Write in present tense anchored to today. This will be read immediately after generation.`;

  const prompt = `Live FRED market data:\n${ctx}\n\nWrite a 2–3 sentence daily market brief for a homebuyer or homeowner. Cover what's driving the current 30-year rate environment and one concrete implication for someone watching rates right now. Be specific — cite the actual spread and CPI figures from the data. Keep it under 60 words. No disclaimers, no headers.`;

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model: (process.env.XAI_MODEL || "grok-4").trim(),
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature: 0.25,
    }),
  });

  if (!res.ok) return "";
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

// ── Email builder ─────────────────────────────────────────────────────────────

function fmtRate(n: number): string { return n.toFixed(2) + "%"; }
function fmtChange(n: number | null): string {
  if (n === null) return "";
  const sign = n > 0 ? "▲ +" : n < 0 ? "▼ " : "";
  const color = n > 0 ? "#ff6b6b" : n < 0 ? "#00e87a" : "#8b949e";
  return `<span style="font-size:12px;font-weight:700;color:${color};">${sign}${n.toFixed(2)}% wk</span>`;
}

function buildRateBriefEmail(opts: {
  recipientEmail: string;
  rates: RateSnapshot;
  commentary: string;
}): string {
  const { recipientEmail, rates, commentary } = opts;
  const unsub = unsubscribeUrl(recipientEmail);
  const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const rateCards = [
    { label: "30-Yr Fixed",    value: fmtRate(rates.rate30y), sub: fmtChange(rates.weekChange), highlight: true },
    { label: "15-Yr Fixed",    value: fmtRate(rates.rate15y), sub: "",                          highlight: false },
    { label: "10-Yr Treasury", value: fmtRate(rates.rate10y), sub: `${rates.spread} bps spread`, highlight: false },
    { label: "Fed Funds",      value: fmtRate(rates.fedFunds),sub: `CPI ${fmtRate(rates.cpi)}`, highlight: false },
  ].map(c => `
    <td style="width:25%;padding:0 6px 0 0;vertical-align:top;">
      <table width="100%" cellpadding="0" cellspacing="0" bgcolor="${c.highlight ? "#00301a" : "#1c2433"}" style="background-color:${c.highlight ? "#00301a" : "#1c2433"};border:1px solid ${c.highlight ? "#00e87a44" : "#2a3444"};border-radius:10px;">
        <tr><td bgcolor="${c.highlight ? "#00301a" : "#1c2433"}" style="background-color:${c.highlight ? "#00301a" : "#1c2433"};padding:14px 16px;">
          <p style="margin:0 0 2px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#8b949e;">${c.label}</p>
          <p style="margin:0;font-size:${c.highlight ? "26px" : "22px"};font-weight:800;color:${c.highlight ? "#00e87a" : "#e6edf3"};letter-spacing:-0.02em;">${c.value}</p>
          ${c.sub ? `<p style="margin:4px 0 0;">${c.sub}</p>` : ""}
        </td></tr>
      </table>
    </td>`).join("");

  const body = `
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#00e87a;">Daily Rate Brief</p>
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:800;color:#e6edf3;line-height:1.2;">Mortgage Market Snapshot</h1>
    <p style="margin:0 0 24px;font-size:12px;color:#8b949e;">${dateLabel} · Source: FRED / Freddie Mac</p>

    <!-- Rate grid -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;table-layout:fixed;">
      <tr>${rateCards}</tr>
    </table>

    <!-- 52-week context strip -->
    <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#131b27" style="background-color:#131b27;border:1px solid #2a3444;border-radius:10px;margin-bottom:24px;">
      <tr>
        <td bgcolor="#131b27" style="background-color:#131b27;padding:12px 20px;">
          <span style="font-size:11px;color:#8b949e;">52-wk range: </span>
          <span style="font-size:11px;font-weight:700;color:#e6edf3;">${fmtRate(rates.week52Low)} – ${fmtRate(rates.week52High)}</span>
          <span style="font-size:11px;color:#8b949e;margin-left:16px;">YTD: </span>
          <span style="font-size:11px;font-weight:700;color:${rates.ytdChange > 0 ? "#ff6b6b" : "#00e87a"};">${rates.ytdChange > 0 ? "+" : ""}${rates.ytdChange.toFixed(2)}%</span>
        </td>
      </tr>
    </table>

    ${commentary ? `
    <!-- AI commentary -->
    <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#1a2236" style="background-color:#1a2236;border-left:3px solid #00e87a;border-radius:0 10px 10px 0;margin-bottom:24px;">
      <tr><td bgcolor="#1a2236" style="background-color:#1a2236;padding:16px 20px;">
        <p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#00e87a;">Rate Oracle</p>
        <p style="margin:0;font-size:13px;color:#c9d1d9;line-height:1.7;">${commentary}</p>
      </td></tr>
    </table>` : ""}

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#1c2433" style="background-color:#1c2433;border:1px solid #2a3444;border-radius:12px;">
      <tr>
        <td bgcolor="#1c2433" style="background-color:#1c2433;padding:20px 24px;text-align:center;">
          <p style="margin:0 0 14px;font-size:13px;color:#8b949e;">Charts, trends, and deeper analysis — including Fed impact, lock windows, and ARM vs Fixed.</p>
          <a href="${BASE}/market-intelligence" style="display:inline-block;padding:12px 28px;background:#00e87a;color:#07100f;font-size:13px;font-weight:700;border-radius:999px;text-decoration:none;">View Full Rate Analysis →</a>
        </td>
      </tr>
    </table>
  `;

  return emailShell(body, "HomeRates.ai · homerates.ai", unsub);
}

// ── GET — stats ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = db();
  const [subCount, lastSend] = await Promise.all([
    supabase.from("newsletter_subscribers").select("id", { count: "exact", head: true }),
    supabase.from("newsletter_sends")
      .select("sent_at, subject, recipient_count")
      .ilike("subject", "[Rate Brief]%")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let currentRate: number | null = null;
  try {
    const r = await fetchRates();
    currentRate = r.rate30y;
  } catch { /* non-fatal */ }

  return NextResponse.json({
    subscriber_count: subCount.count ?? 0,
    last_send: lastSend.data ?? null,
    current_rate_30y: currentRate,
  });
}

// ── POST — send ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const dryRun: boolean = body.dryRun ?? false;

  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
  if (!resend && !dryRun) return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 503 });

  // Fetch live rates + Grok commentary in parallel
  let rates: RateSnapshot;
  try {
    rates = await fetchRates();
  } catch (e: any) {
    return NextResponse.json({ error: `Rate fetch failed: ${e.message}` }, { status: 500 });
  }

  const commentary = await grokBrief(rates).catch(() => "");
  const subject = `[Rate Brief] 30yr at ${fmtRate(rates.rate30y)}${rates.weekChange != null ? ` (${rates.weekChange > 0 ? "+" : ""}${rates.weekChange.toFixed(2)}% wk)` : ""} · ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  if (dryRun) {
    const sampleHtml = buildRateBriefEmail({ recipientEmail: "preview@example.com", rates, commentary });
    return NextResponse.json({ ok: true, dryRun: true, subject, rates, commentary, sample_html: sampleHtml });
  }

  const supabase = db();
  const { data: subscribers, error: subErr } = await supabase
    .from("newsletter_subscribers")
    .select("email")
    .order("created_at", { ascending: true });

  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 });
  if (!subscribers?.length) return NextResponse.json({ ok: true, sent: 0, message: "No subscribers" });

  const results = { sent: 0, skipped: 0, errors: 0, errorList: [] as string[] };

  for (const sub of subscribers) {
    try {
      if (await isEmailSuppressed(sub.email)) { results.skipped++; continue; }
      const html = buildRateBriefEmail({ recipientEmail: sub.email, rates, commentary });
      const { error: sendErr } = await resend!.emails.send({
        from: `HomeRates.ai <${FROM}>`,
        to: sub.email,
        subject,
        html,
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl(sub.email)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      if (sendErr) { results.errors++; results.errorList.push(`${sub.email}: ${sendErr.message}`); }
      else results.sent++;
    } catch (e: any) {
      results.errors++;
      results.errorList.push(`${sub.email}: ${e.message}`);
    }
  }

  await supabase.from("newsletter_sends").insert({
    subject,
    recipient_count: results.sent,
    skipped_count: results.skipped,
    error_count: results.errors,
    notes: results.errorList.length > 0 ? results.errorList.slice(0, 5).join("; ") : null,
  });

  console.log("[market-rates-digest] complete", { subject, ...results });
  return NextResponse.json({ ok: true, subject, ...results });
}
