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

/* ---------- Parse calc-style questions ---------- */
type Parsed = {
    price?: number;
    downPercent?: number | null;
    loan?: number | null;
    rate?: number | null;
    termYears?: number | null;
    zip?: string | undefined;
};

function kmToNumber(num: string, unit?: string) {
    const base = Number(num.replace(/,/g, ""));
    if (!Number.isFinite(base)) return null;
    const u = (unit || "").toLowerCase();
    return base * (u === "m" ? 1_000_000 : u === "k" ? 1_000 : 1);
}

function parseQuestion(qRaw: string): Parsed | null {
    const q = qRaw.trim();

    // normalize spacing for some patterns
    const qq = q.replace(/\u00A0/g, ' ');

    // $750k home / $1.25m purchase / price $650,000 / $650,000 house
    const priceRe =
        /\$?\s*([\d,]+(?:\.\d+)?)\s*(k|m)?\s*(?:home|house|condo|property|purchase|price)?\b/i;
    // $480k loan / loan $480,000
    const loanRe =
        /\b(?:loan)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(k|m)?\b|\$?\s*([\d,]+(?:\.\d+)?)\s*(k|m)?\s*loan\b/i;
    // 10% down / 10 percent down / 10% dp
    const downRe = /(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(?:down|dp)\b/i;
    // at 6.375% / 6.375% fixed / rate 6.375 / at 6.375
    const rateRe = /(?:rate\s*)?(\d+(?:\.\d+)?)\s*(?:%|percent)?\s*(?:fixed|arm)?\b/i;
    // 30 years / 30yr / 30-year / 30y
    const termRe = /\b(\d+)\s*(?:years?|yrs?|yr|y|year|-year)\b/i;
    // zip 91301 / in 91301 / 91301
    const zipRe = /\b(?:zip\s*)?(\d{5})\b/i;

    // helper: K/M to number
    const kmToNumber = (num: string, unit?: string) => {
        const base = Number(num.replace(/,/g, ""));
        if (!Number.isFinite(base)) return null;
        const u = (unit || "").toLowerCase();
        return base * (u === "m" ? 1_000_000 : u === "k" ? 1_000 : 1);
    };

    // price
    let price: number | null = null;
    const pm = qq.match(priceRe);
    if (pm) price = kmToNumber(pm[1] || pm[3], (pm[2] || pm[4]) as string | undefined);

    // loan
    let loan: number | null = null;
    const lm = qq.match(loanRe);
    if (lm) {
        // pattern has two possible capture pairs: (1,2) OR (3,4)
        const n = lm[1] || lm[3];
        const u = (lm[2] || lm[4]) as string | undefined;
        loan = n ? kmToNumber(n, u) : null;
    }

    // down
    const dm = qq.match(downRe);
    const downPercent = dm ? Number(dm[1]) : null;

    // rate (prefer a match that’s near words like "rate"/"fixed/arm", but allow "at 6.5")
    const rm = qq.match(rateRe);
    const rate = rm ? Number(rm[1]) : null;

    // term
    const tm = qq.match(termRe);
    const termYears = tm ? Number(tm[1]) : null;

    // zip
    const zm = qq.match(zipRe);
    const zip = zm ? zm[1] : undefined;

    const hasSignals =
        !!rate && (!!loan || (!!price && downPercent != null) || !!termYears || !!zip);

    if (!hasSignals) return null;

    return { price: price ?? undefined, downPercent, loan, rate, termYears, zip };
}


/* ---------- Main handler ---------- */
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
            message:
                "I couldn’t extract enough details. Include price + down % + rate (and ZIP) or provide a direct loan amount.",
            answer: "",
        });
    }

    const term = parsed.termYears ?? 30;

    const params = new URLSearchParams();
    if (parsed.loan != null) params.set("loan", String(parsed.loan));
    if (parsed.price != null) params.set("price", String(parsed.price));
    if (parsed.downPercent != null) params.set("downPercent", String(parsed.downPercent));
    if (parsed.rate != null) params.set("rate", String(parsed.rate));
    params.set("term", String(term));
    if (parsed.zip) params.set("zip", parsed.zip);
    // simple defaults; your UI can override
    params.set("ins", "100");
    // params.set("hoa", "0");
    // params.set("taxBase", "price");

    const calcURL = new URL(`/api/calc/payment?${params.toString()}`, origin);
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
        answer: j?.answer ?? `Estimated monthly payment (see itemization):\n${nice}`,
        lineItem: nice,
    });
}

export async function GET(req: NextRequest) {
    return handle(req);
}

export async function POST(req: NextRequest) {
    // Also accept POST { q: "..." }
    const url = new URL(req.url);
    try {
        const body = (await req.json()) as { q?: string };
        const q = (body?.q || "").trim();
        if (q) url.searchParams.set("q", q);
    } catch {
        // no body / invalid JSON — ignore and fall through
    }
    return handle(req, url); // pass URL override; do NOT construct NextRequest
}
