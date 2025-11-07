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

/* ---------------- Types ---------------- */
type Parsed = {
    price?: number;
    downPercent?: number | null;
    loan?: number | null;
    rate?: number | null;      // e.g., 6.375
    termYears?: number | null; // 30, 15, etc.
    zip?: string | undefined;
};

/* ---------------- Helpers ---------------- */
function km(num: string, unit?: string | null) {
    const base = Number(num.replace(/,/g, ""));
    if (!Number.isFinite(base)) return null;
    const u = (unit || "").toLowerCase();
    return base * (u === "m" ? 1_000_000 : u === "k" ? 1_000 : 1);
}

/** Accept only “real” money tokens (has $ or k/m or comma or >= 1000) */
function safeMoney(whole: string, num: string, unit?: string | null) {
    const val = km(num, unit);
    if (val == null) return null;
    const hasDollar = /\$/.test(whole);
    const hasComma = /,/.test(whole);
    const hasUnit = !!unit;
    const looksLarge = val >= 1000;
    if (!hasDollar && !hasComma && !hasUnit && !looksLarge) return null; // avoid catching “30” (years)
    return val;
}

/* ---------------- Parser ---------------- */
function parseQuestion(qRaw: string): Parsed | null {
    const qq = qRaw.trim().replace(/\u00A0/g, " ");

    // “$750k” / “750k price” / “$1,250,000 home” / etc.
    const priceRe =
        /(\$?\s*([\d,]+(?:\.\d+)?)(?:\s*(k|m))?)(?:\s*(?:home|house|condo|property|purchase|price))?\b/i;

    // “loan $480k” OR “$480k loan”
    const loanRe =
        /\bloan\b[\s:]*\$?\s*([\d,]+(?:\.\d+)?)(?:\s*(k|m))?\b|^\s*\$?\s*([\d,]+(?:\.\d+)?)(?:\s*(k|m))?\s*\bloan\b/i;

    // “10% down” / “10 percent down / dp”
    const downRe = /(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(?:down|dp)?\b/i;

    // RATE — require either a %/percent OR the word “rate” or the token “at”
    // This prevents 400/750 “money” tokens from being misread as the rate.
    const rateRe =
        /(?:\brate\b\s*|\bat\s*)(\d+(?:\.\d+)?)(?:\s*(%|percent))?\b|(\d+(?:\.\d+)?)\s*(%|percent)\b/i;

    // “30 years / 30 yr / for 30 years / 360”
    const termRe =
        /\b(30|15|360|180)\b|\b(?:for\s+)?(\d+)\s*(?:years?|yrs?|yr|y|months?|mos?)\b/i;

    // “zip 91301 / in 91301 / 91301”
    const zipRe = /\b(?:zip\s*)?(\d{5})\b/i;

    // ---- price
    let price: number | null = null;
    const pm = qq.match(priceRe);
    if (pm) {
        // pm[0]=whole, pm[2]=number, pm[3]=unit
        price = safeMoney(pm[0], pm[2], pm[3]);
    }

    // ---- loan
    let loan: number | null = null;
    const lm = qq.match(loanRe);
    if (lm) {
        // two branches: [1,2] or [3,4]
        const n = lm[1] || lm[3];
        const u = lm[2] || lm[4];
        loan = n ? safeMoney(lm[0], n, u) : null;
    }

    // ---- down %
    const dm = qq.match(downRe);
    const downPercent = dm ? Number(dm[1]) : null;

    // ---- rate
    let rate: number | null = null;
    const rm = qq.match(rateRe);
    if (rm) {
        // Either group 1 (from “rate/at”), or group 3 (from “… %”)
        rate = rm[1] ? Number(rm[1]) : rm[3] ? Number(rm[3]) : null;
    }

    // ---- term
    let termYears: number | null = null;
    const tm = qq.match(termRe);
    if (tm) {
        if (tm[1]) {
            // matched 30/15/360/180
            const t = Number(tm[1]);
            termYears = t > 100 ? Math.round(t / 12) : t;
        } else if (tm[2]) {
            // matched “for 30 years” etc.
            const n = Number(tm[2]);
            termYears = /\bmonths?|mos?\b/i.test(qq) ? Math.round(n / 12) : n;
        }
    }

    // ---- zip
    const zm = qq.match(zipRe);
    const zip = zm ? zm[1] : undefined;

    // Allow: loan OR price (with/without down). If only a big money token is present,
    // prefer interpreting it as loan for typical user phrasing like “$400k at 6.5 …”.
    if (!loan && price && downPercent == null) {
        loan = price;
    }

    if (!loan && !price) return null;

    return { price: price ?? undefined, downPercent, loan, rate, termYears, zip };
}

/* ---------------- Main handler ---------------- */
async function handle(req: NextRequest, urlOverride?: URL) {
    const now = new Date().toISOString();
    const url = urlOverride ?? new URL(req.url);
    const origin = `${url.protocol}//${url.host}`;
    const question = (url.searchParams.get("q") || "").trim();

    if (!question) {
        return noStore({
            ok: true,
            route: "calc/answer",
            at: now,
            message:
                "Try: “$750k in 91301 with 10% down at 6.375% for 30 years” or “$480k loan at 6% for 30 years, ZIP 90011”.",
            answer: "",
        });
    }

    const parsed = parseQuestion(question);
    if (!parsed) {
        return noStore({
            ok: false,
            route: "calc/answer",
            at: now,
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

    // Build params for /api/calc/payment
    const q = new URLSearchParams();

    // Core amount(s)
    if (parsed.loan != null) q.set("loan", String(parsed.loan));
    if (parsed.price != null) q.set("price", String(parsed.price));
    if (parsed.downPercent != null) q.set("downPercent", String(parsed.downPercent));

    // If only loan is known (derived from price), pass price too (helps tax calc)
    if (parsed.loan != null && parsed.price == null) {
        q.set("price", String(parsed.loan));
    }

    // Rate
    if (parsed.rate != null) {
        q.set("rate", String(parsed.rate));
        q.set("ratePct", String(parsed.rate));
    }

    // Term
    q.set("term", String(termYears));
    q.set("termMonths", String(termYears * 12));

    // ZIP
    if (parsed.zip) q.set("zip", parsed.zip);

    // Soft defaults
    q.set("ins", "100");
    q.set("monthlyIns", "100");
    q.set("hoa", "0");
    q.set("monthlyHOA", "0");
    // q.set("taxBase", "price"); // leave to engine unless you want to force

    const calcURL = new URL(`/api/calc/payment?${q.toString()}`, origin);
    const resp = await fetch(calcURL, { cache: "no-store" });

    if (!resp.ok) {
        const text = await resp.text();
        return noStore(
            {
                ok: false,
                route: "calc/answer",
                at: now,
                message: `Payment engine error (${resp.status}).`,
                answer: text.slice(0, 400),
                suggest: [
                    "$750k in 91301 with 10% down at 6.375% for 30 years",
                    "Loan $480k at 6.5% for 30 years, ZIP 90011",
                ],
            },
            502
        );
    }

    const j = await resp.json();
    const b = (j?.breakdown ?? {}) as Record<string, number>;
    const nice =
        `P&I $${(b.monthlyPI ?? 0).toLocaleString()} • ` +
        `Tax $${(b.monthlyTax ?? 0).toLocaleString()} • ` +
        `Ins $${(b.monthlyIns ?? 0).toLocaleString()}` +
        ((b.monthlyHOA ?? 0) ? ` • HOA $${(b.monthlyHOA ?? 0).toLocaleString()}` : "");

    return noStore({
        ok: true,
        route: "calc/answer",
        at: now,
        inputs: j?.inputs,
        lookups: j?.lookups,
        breakdown: j?.breakdown,
        sensitivity: j?.sensitivity,
        answer: j?.answer ?? `Estimated monthly payment (see itemization):\n${nice}`,
        lineItem: nice,
    });
}

export async function GET(req: NextRequest) {
    return handle(req);
}
export async function POST(req: NextRequest) {
    const url = new URL(req.url);
    try {
        const body = (await req.json()) as { q?: string };
        const q = (body?.q || "").trim();
        if (q) url.searchParams.set("q", q);
    } catch {
        // ignore
    }
    return handle(req, url);
}
