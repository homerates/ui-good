// app/api/calc/answer/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// bump this on every edit to confirm what's live in prod
const BUILD_TAG = "calc-v2.1-parser-guard-2025-11-07";

import { NextResponse, type NextRequest } from "next/server";

function noStore(json: unknown, status = 200) {
    const res = NextResponse.json(json, { status });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    return res;
}

type Inputs = {
    price?: number;
    downPercent?: number;
    loanAmount?: number;
    ratePct?: number;
    termMonths?: number;
    zip?: string;
    monthlyIns?: number;
    monthlyHOA?: number;
};
type Breakdown = {
    monthlyPI: number;
    monthlyTaxes: number;
    monthlyIns: number;
    monthlyHOA: number;
    monthlyMI: number;
    monthlyTotalPITI: number;
};
type Answer = {
    ok: boolean;
    build: string;
    inputs: Inputs;
    breakdown?: Breakdown;
    taxSource?: string;
    msg?: string;
};

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function toNumber(raw?: string | null): number | undefined {
    if (!raw) return undefined;
    let s = raw.trim().toLowerCase().replace(/[\$,]/g, "");
    let mult = 1;
    if (s.endsWith("m")) { mult = 1_000_000; s = s.slice(0, -1); }
    else if (s.endsWith("k")) { mult = 1_000; s = s.slice(0, -1); }
    const n = Number(s);
    return isFinite(n) ? n * mult : undefined;
}

function toPercent(raw?: string | null): number | undefined {
    if (!raw) return undefined;
    const s = raw.trim().toLowerCase().replace(/%/g, "");
    if (!s) return undefined;
    const n = Number(s);
    if (!isFinite(n)) return undefined;
    // guard: 625 => 6.25
    return n > 100 ? n / 100 : n;
}

function toTermMonths(raw?: string | null): number | undefined {
    if (!raw) return undefined;
    const m = raw.toLowerCase().match(/(\d{1,3})/);
    if (!m) return undefined;
    const years = Number(m[1]);
    if (!isFinite(years) || years <= 0) return undefined;
    return years * 12;
}

function parseQuery(q: string): Inputs {
    const s = q.replace(/\s+/g, " ").trim().toLowerCase();

    const priceMatch = s.match(/price\s*\$?([0-9\.,]+[mk]?)/) || s.match(/\bprice\s*([0-9\.,mk\$]+)/);
    const loanMatch = s.match(/\bloan\s*\$?([0-9\.,]+[mk]?)/) || s.match(/\bloan\s*([0-9\.,mk\$]+)/);

    const downMatch = s.match(/down\s*([0-9\.]+)\s*%/) || s.match(/([0-9\.]+)\s*%\s*down/);
    const rateMatch =
        s.match(/\brate\s*([0-9\.]+%?)/) ||
        s.match(/\b([0-9]+(?:\.[0-9]+)?)\s*%/) ||
        s.match(/\b([0-9]+(?:\.[0-9]+)?)\b(?=.*\b(yr|year|years|y|mo|months)\b)/);
    const termMatch =
        s.match(/\b(\d{1,3})\s*(?:y|yr|yrs|year|years)\b/) ||
        s.match(/\b(\d{1,3})\s*(?:mo|months)\b/);

    const zipMatch = s.match(/\b(\d{5})(?:-\d{4})?\b/);

    const insMatch = s.match(/\bins(?:urance)?\s*\$?\s*([0-9\.,]+)/) || s.match(/\$?\s*([0-9\.,]+)\s*(?:ins|insurance)\b/);
    const hoaMatch = s.match(/\bhoa\s*\$?\s*([0-9\.,]+)/) || s.match(/\$?\s*([0-9\.,]+)\s*hoa\b/);

    const inputs: Inputs = {};

    const price = toNumber(priceMatch?.[1]);
    const loan = toNumber(loanMatch?.[1]);
    const downP = toPercent(downMatch?.[1]);

    if (typeof price === "number") inputs.price = price;
    if (typeof loan === "number") inputs.loanAmount = loan;
    if (typeof downP === "number") inputs.downPercent = downP;

    if (inputs.price != null && inputs.downPercent != null && inputs.loanAmount == null) {
        inputs.loanAmount = inputs.price * (1 - inputs.downPercent / 100);
    }

    const ratePct = toPercent(rateMatch?.[1]);
    if (typeof ratePct === "number") inputs.ratePct = ratePct;

    const termMonths =
        toTermMonths(termMatch?.[0]) ||
        (function () {
            const bare = s.match(/\b(\d{2,3})\b(?=.*\b(year|yr|y|years)\b)/);
            return bare ? Number(bare[1]) * 12 : undefined;
        })();
    if (typeof termMonths === "number") inputs.termMonths = termMonths;

    if (zipMatch?.[1]) inputs.zip = zipMatch[1];

    const monthlyIns = toNumber(insMatch?.[1]);
    const monthlyHOA = toNumber(hoaMatch?.[1]);
    if (typeof monthlyIns === "number") inputs.monthlyIns = monthlyIns;
    if (typeof monthlyHOA === "number") inputs.monthlyHOA = monthlyHOA;

    return inputs;
}

function monthlyPI(loanAmount: number, ratePct: number, termMonths: number) {
    const r = clamp(ratePct, 0.1, 25) / 100 / 12;
    const n = Math.max(12, termMonths);
    return loanAmount * (r / (1 - Math.pow(1 + r, -n)));
}

function estimateMonthlyTaxes(base: number, zip?: string) {
    const annualRate = 0.012; // fallback 1.20%
    const amt = (base * annualRate) / 12;
    return {
        amount: amt,
        source: "fallback:default • " + (annualRate * 100).toFixed(2) + "%" + (zip ? " • ZIP " + zip : "")
    };
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();

    if (!q) {
        return noStore(
            { ok: false, build: BUILD_TAG, inputs: {}, msg: "Missing q. Example: 'Price $900k, 20% down, 6.25%, 30 years, ZIP 92688'." } as Answer,
            400
        );
    }

    const inputs = parseQuery(q);

    const hasLoan = typeof inputs.loanAmount === "number";
    const hasPriceCombo = typeof inputs.price === "number" && typeof inputs.downPercent === "number";
    const hasRate = typeof inputs.ratePct === "number";
    const hasTerm = typeof inputs.termMonths === "number";

    if (!((hasLoan || hasPriceCombo) && hasRate && hasTerm)) {
        const hint = "Need loan+rate+term OR price+down%+rate+term. Try: 'Loan $400k at 6.5% for 30 years' or 'Price $900k, 20% down, 6.25%, 30 years, ZIP 92688'.";
        return noStore({ ok: false, build: BUILD_TAG, inputs, msg: hint } as Answer, 400);
    }

    const loanAmount = hasLoan
        ? (inputs.loanAmount as number)
        : (inputs.price as number) * (1 - (inputs.downPercent as number) / 100);

    const ratePct = inputs.ratePct as number;
    const termMonths = inputs.termMonths as number;

    const monthlyIns = typeof inputs.monthlyIns === "number" ? inputs.monthlyIns : 100;
    const monthlyHOA = typeof inputs.monthlyHOA === "number" ? inputs.monthlyHOA : 0;

    const taxBase = inputs.price != null ? inputs.price : loanAmount;
    const taxEst = estimateMonthlyTaxes(taxBase, inputs.zip);

    const pi = monthlyPI(loanAmount, ratePct, termMonths);

    const breakdown: Breakdown = {
        monthlyPI: pi,
        monthlyTaxes: taxEst.amount,
        monthlyIns,
        monthlyHOA,
        monthlyMI: 0,
        monthlyTotalPITI: pi + taxEst.amount + monthlyIns + monthlyHOA
    };

    const body: Answer = {
        ok: true,
        build: BUILD_TAG,
        inputs: {
            ...inputs,
            loanAmount,
            ratePct: Number(ratePct.toFixed(4)),
            termMonths
        },
        breakdown,
        taxSource: taxEst.source
    };

    return noStore(body, 200);
}
