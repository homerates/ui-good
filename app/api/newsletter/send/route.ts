// app/api/newsletter/send/route.ts
// GET  — stats (subscriber count, last send date)
// POST — send weekly market update to all newsletter_subscribers
//        Body: { dryRun?: boolean, subject?: string }
//        Auth: CRON_SECRET in Authorization header, OR admin session (checked server-side)

export const runtime = "nodejs";
export const maxDuration = 300; // up to 5 min for large lists

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { emailShell } from "../../../../lib/sendEmail";
import { unsubscribeUrl, isEmailSuppressed } from "../../../../lib/unsubscribe";
import { getFredSnapshot } from "@/lib/fred";

const BASE = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai";
const FROM = process.env.RESEND_FROM_EMAIL ?? "updates@homerates.ai";
const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRate(r: number | null | undefined): string {
  if (!r || !Number.isFinite(r)) return "—";
  return r.toFixed(2) + "%";
}

function weekLabel(): string {
  return new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function buildEmail(opts: {
  recipientEmail: string;
  rate30yr: number | null;
  articles: { title: string; excerpt: string; slug: string; category: string }[];
}): string {
  const { recipientEmail, rate30yr, articles } = opts;
  const unsub = unsubscribeUrl(recipientEmail);
  const rateStr = formatRate(rate30yr);

  const articleRows = articles
    .map(
      (a) => `
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#00e87a;">${a.category ?? "Market"}</p>
        <a href="${BASE}/knowledge-hub/${a.slug}" style="display:block;margin:0 0 6px;font-size:15px;font-weight:700;color:#e6edf3;text-decoration:none;line-height:1.3;">${a.title}</a>
        <p style="margin:0 0 8px;font-size:13px;color:#8b949e;line-height:1.6;">${a.excerpt}</p>
        <a href="${BASE}/knowledge-hub/${a.slug}" style="font-size:12px;color:#00e87a;font-weight:600;text-decoration:none;">Read article →</a>
      </td></tr>`,
    )
    .join("");

  const body = `
    <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#00e87a;">Weekly Market Update</p>
    <h1 style="margin:0 0 24px;font-size:22px;font-weight:800;color:#e6edf3;line-height:1.2;">This Week in Mortgage Markets</h1>
    <p style="margin:0 0 24px;font-size:13px;color:#8b949e;line-height:1.5;">${weekLabel()}</p>

    <!-- Rate snapshot -->
    <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#1c2433" style="margin-bottom:28px;background-color:#1c2433;border:1px solid #2a3444;border-radius:12px;overflow:hidden;">
      <tr>
        <td bgcolor="#1c2433" style="background-color:#1c2433;padding:20px 24px;">
          <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#8b949e;">Current Rate</p>
          <p style="margin:0;font-size:32px;font-weight:800;color:#00e87a;letter-spacing:-0.02em;">${rateStr}</p>
          <p style="margin:4px 0 0;font-size:12px;color:#8b949e;">30-Year Fixed Avg · Source: FRED / Freddie Mac</p>
        </td>
        <td bgcolor="#1c2433" style="background-color:#1c2433;padding:20px 24px;text-align:right;vertical-align:middle;">
          <a href="${BASE}" style="display:inline-block;padding:10px 20px;background:#00e87a;color:#07100f;font-size:13px;font-weight:700;border-radius:999px;text-decoration:none;">View Live Rates →</a>
        </td>
      </tr>
    </table>

    <!-- Articles -->
    ${articles.length > 0 ? `
    <p style="margin:0 0 16px;font-size:13px;font-weight:700;color:#e6edf3;">This week's reads</p>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${articleRows}
    </table>` : ""}

    <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#1c2433" style="margin-top:8px;background-color:#1c2433;border:1px solid #2a3444;border-radius:12px;">
      <tr>
        <td bgcolor="#1c2433" style="background-color:#1c2433;padding:20px 24px;text-align:center;">
          <p style="margin:0 0 12px;font-size:13px;color:#8b949e;">Get matched with top loan officers instantly.</p>
          <a href="${BASE}" style="display:inline-block;padding:12px 28px;background:#00e87a;color:#07100f;font-size:13px;font-weight:700;border-radius:999px;text-decoration:none;">Explore HomeRates.ai →</a>
        </td>
      </tr>
    </table>
  `;

  return emailShell(body, "HomeRates.ai · homerates.ai", unsub);
}

// ── Auth check ────────────────────────────────────────────────────────────────

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  try {
    const { userId } = await auth();
    if (userId && ADMIN_USER_IDS.includes(userId)) return true;
  } catch { /* not authenticated */ }

  return false;
}

// ── GET — stats ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = db();
  const [subCount, lastSend] = await Promise.all([
    supabase.from("newsletter_subscribers").select("id", { count: "exact", head: true }),
    supabase.from("newsletter_sends").select("sent_at, subject, recipient_count").order("sent_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return NextResponse.json({
    subscriber_count: subCount.count ?? 0,
    last_send: lastSend.data ?? null,
  });
}

// ── POST — send ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun: boolean = body.dryRun ?? false;

  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
  if (!resend && !dryRun) {
    return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 503 });
  }

  const supabase = db();

  // Fetch subscribers
  const { data: subscribers, error: subErr } = await supabase
    .from("newsletter_subscribers")
    .select("email, source")
    .order("created_at", { ascending: true });

  if (subErr) {
    return NextResponse.json({ error: subErr.message }, { status: 500 });
  }

  if (!subscribers || subscribers.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, skipped: 0, message: "No subscribers" });
  }

  // Fetch FRED rate + latest 3 articles in parallel
  const [fredSnap, articlesRes] = await Promise.allSettled([
    getFredSnapshot({ timeoutMs: 8000 }),
    supabase
      .from("generated_articles")
      .select("title, excerpt, slug, category")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(3),
  ]);

  const rate30yr = fredSnap.status === "fulfilled" ? (fredSnap.value?.mort30Avg ?? null) : null;
  const articles = articlesRes.status === "fulfilled"
    ? (articlesRes.value.data ?? [])
    : [];

  const subject = body.subject ?? `HomeRates Weekly: ${weekLabel()}`;

  if (dryRun) {
    const sampleHtml = buildEmail({
      recipientEmail: "preview@example.com",
      rate30yr,
      articles,
    });
    return NextResponse.json({
      ok: true,
      dryRun: true,
      subject,
      subscriber_count: subscribers.length,
      rate30yr,
      articles,
      sample_html: sampleHtml,
    });
  }

  // Send to each subscriber
  const results = { sent: 0, skipped: 0, errors: 0, errorList: [] as string[] };

  for (const sub of subscribers) {
    try {
      // Check suppression
      const suppressed = await isEmailSuppressed(sub.email);
      if (suppressed) {
        results.skipped++;
        continue;
      }

      const html = buildEmail({ recipientEmail: sub.email, rate30yr, articles });

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

      if (sendErr) {
        results.errors++;
        results.errorList.push(`${sub.email}: ${sendErr.message}`);
      } else {
        results.sent++;
      }
    } catch (e: any) {
      results.errors++;
      results.errorList.push(`${sub.email}: ${e.message}`);
    }
  }

  // Log the batch
  await supabase.from("newsletter_sends").insert({
    subject,
    recipient_count: results.sent,
    skipped_count: results.skipped,
    error_count: results.errors,
    notes: results.errorList.length > 0 ? results.errorList.slice(0, 5).join("; ") : null,
  });

  console.log("[newsletter/send] complete", { subject, ...results });
  return NextResponse.json({ ok: true, subject, ...results });
}
