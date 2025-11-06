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

    const priceMatch =
        q.match(/\$?\s*([\d,]+(?:\.\d+)?)\s*(k|m)?\s*(?:home|purchase|price)\b/i) ||
        q.match(/\bprice\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(k|m)?\b/i);
    const price = priceMatch ? kmToNumber(priceMatch[1], priceMatch[2]) : null;

    const loanMatch =
        q.match(/\$?\s*([\d,]+(?:\.\d+)?)\s*(k|m)?\s*(?:loan)\b/i) ||
        q.match(/\bloan\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(k|m)?\b/i);
    const loan = loanMatch ? kmToNumber(loanMatch[1], loanMatch[2]) : null;

    const downMatch = q.match(/(\d+(?:\.\d+)?)\s*%\s*(?:down|dp)\b/i);
    const downPercent = downMatch ? Number(downMatch[1]) : null;

    const rateMatch = q.match(/(\d+(?:\.\d+)?)\s*%.*?(?:rate|fixed|arm)/i);
    const rate = rateMatch ? Number(rateMatch[1]) : null;

    const termMatch = q.match(/(\d+)\s*(?:years?|yrs?)\b/i);
    const termYears = termMatch ? Number(termMatch[1]) : null;

    // Prefer CA zip first; then any US 5-digit zip
    const zipMatch = q.match(/\b(9\d{4})\b/) || q.match(/\b(\d{5})\b/);
    const zip = zipMatch ? zipMatch[1] : undefined;

    const hasSignals =
        !!rate && (!!loan || (!!price && downPercent != null) || !!termYears || !!zip);

    if (!hasSignals) return null;

    return { price: price ?? undefined, downPercent, loan, rate, termYears, zip };
}

/* ---------- Main handler ---------- */
async function handle(req: NextRequest) {
    const now = new Date().toISOString();
    const url = new URL(req.url);
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
    let q = "";
    try {
        const body = (await req.json()) as { q?: string };
        q = (body.q || "").trim();
    } catch { }
    if (q) url.searchParams.set("q", q);
    return handle(new NextRequest(url.toString(), req));
}
