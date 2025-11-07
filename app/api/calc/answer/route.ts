// app/api/calc/answer/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

function noStore(json: unknown, status = 200) {
    const res = NextResponse.json(json, { status });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    return res;
}

type Parsed = {
    price?: number;
    downPercent?: number | null;
    loan?: number | null;
    rate?: number | null;      // percent as number, e.g., 6.375
    termYears?: number | null; // 30, 15, etc.
    zip?: string | undefined;
};

function km(num: string, unit?: string | null) {
    const base = Number(num.replace(/,/g, ""));
    if (!Number.isFinite(base)) return null;
    const u = (unit || "").toLowerCase();
    return base * (u === "m" ? 1_000_000 : u === "k" ? 1_000 : 1);
}

function parseQuestion(qRaw: string): Parsed | null {
    const qq = qRaw.trim().replace(/\u00A0/g, " ");

    // Allow bare $750k / 750k price / etc.
    const priceRe = /\$?\s*([\d,]+(?:\.\d+)?)\s*(k|m)?(?:\s*(?:home|house|condo|property|purchase|price))?\b/i;
    const loanRe = /\bloan\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(k|m)?\b|\$?\s*([\d,]+(?:\.\d+)?)\s*(k|m)?\s*loan\b/i;
    const downRe = /(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(?:down|dp)?\b/i;
    const rateRe = /(?:rate\s*)?(\d+(?:\.\d+)?)\s*(?:%|percent)?\s*(?:fixed|arm)?\b/i;
    const termRe = /\b(\d+)\s*(?:years?|yrs?|yr|y|year|-year)\b/i;
    const zipRe = /\b(?:zip\s*)?(\d{5})\b/i;

    let price: number | null = null;
    const pm = qq.match(priceRe); if (pm) price = km(pm[1], pm[2]);

    let loan: number | null = null;
    const lm = qq.match(loanRe);
    if (lm) { const n = lm[1] || lm[3]; const u = lm[2] || lm[4]; loan = n ? km(n, u) : null; }

    const dm = qq.match(downRe); const downPercent = dm ? Number(dm[1]) : null;
    const rm = qq.match(rateRe); const rate = rm ? Number(rm[1]) : null;
    const tm = qq.match(termRe); const termYears = tm ? Number(tm[1]) : null;
    const zm = qq.match(zipRe); const zip = zm ? zm[1] : undefined;

    if (!loan && !price) return null;
    return { price: price ?? undefined, downPercent, loan, rate, termYears, zip };
}

async function handle(req: NextRequest, urlOverride?: URL) {
    const now = new Date().toISOString();
    const url = urlOverride ?? new URL(req.url);
    const origin = `${url.protocol}//${url.host}`;
    const question = (url.searchParams.get("q") || "").trim();

    if (!question) {
        return noStore({
            ok: true, route: "calc/answer", at: now,
            message: "Try: “$750k in 91301 with 10% down at 6.375% for 30 years” or “$480k loan at 6% for 30 years, ZIP 90011”.",
            answer: "",
        });
    }

    const parsed = parseQuestion(question);
    if (!parsed) {
        return noStore({
            ok: false, route: "calc/answer", at: now,
            message: "I couldn’t compute a payment yet—add one number and we’re good.",
            needs: ["loan OR price (+ optional down%)", "rate", "term", "zip"],
            suggest: [
                "$750k in 91301 with 10% down at 6.375% for 30 years",
                "Loan $480k at 6.5% for 30 years, ZIP 90011",
                "Price $900k, 20% down, 6.25%, 30 years, ZIP 92688",
            ],
            answer: "",
        });
    }

    const termYears = parsed.termYears ?? 30;

    // Build params targeting BOTH naming conventions.
    const q = new URLSearchParams();

    // Core amount
    if (parsed.loan != null) q.set("loan", String(parsed.loan));
    if (parsed.price != null) q.set("price", String(parsed.price));
    if (parsed.downPercent != null) q.set("downPercent", String(parsed.downPercent));

    // Rate (percent)
    if (parsed.rate != null) {
        q.set("rate", String(parsed.rate));        // newer style
        q.set("ratePct", String(parsed.rate));     // engine style
    }

    // Term
    q.set("term", String(termYears));            // newer style (years)
    q.set("termMonths", String(termYears * 12)); // engine style (months)

    // ZIP for tax lookup
    if (parsed.zip) q.set("zip", parsed.zip);

    // Soft defaults for recurring fields (map to both styles)
    // Insurance
    q.set("ins", "100");           // newer
    q.set("monthlyIns", "100");    // engine
    // HOA (default 0)
    q.set("hoa", "0");
    q.set("monthlyHOA", "0");
    // Let engine decide tax via ZIP, but nudge sensible defaults:
    // q.set("taxBase", "price");  // uncomment if your engine needs it

    const calcURL = new URL(`/api/calc/payment?${q.toString()}`, origin);
    const resp = await fetch(calcURL, { cache: "no-store" });

    if (!resp.ok) {
        const text = await resp.text();
        return noStore({
            ok: false, route: "calc/answer", at: now,
            message: `Payment engine error (${resp.status}).`,
            answer: text.slice(0, 400),
            suggest: [
                "$750k in 91301 with 10% down at 6.375% for 30 years",
                "Loan $480k at 6.5% for 30 years, ZIP 90011",
            ],
        }, 502);
    }

    const j = await resp.json();
    const b = (j?.breakdown ?? {}) as Record<string, number>;
    const nice = `P&I $${(b.monthlyPI ?? 0).toLocaleString()} • Tax $${(b.monthlyTax ?? 0).toLocaleString()} • Ins $${(b.monthlyIns ?? 0).toLocaleString()}${(b.monthlyHOA ?? 0 ? ` • HOA $${(b.monthlyHOA ?? 0).toLocaleString()}` : "")}`;

    return noStore({
        ok: true, route: "calc/answer", at: now,
        inputs: j?.inputs, lookups: j?.lookups, breakdown: j?.breakdown,
        answer: j?.answer ?? `Estimated monthly payment (see itemization):\n${nice}`,
        lineItem: nice,
    });
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) {
    const url = new URL(req.url);
    try { const body = (await req.json()) as { q?: string }; const q = (body?.q || "").trim(); if (q) url.searchParams.set("q", q); } catch { }
    return handle(req, url);
}
