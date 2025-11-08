// app/api/calc/answer/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

/* =========================
   Utilities
========================= */

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
    inputs: Inputs;
    breakdown?: Breakdown;
    taxSource?: string;
    msg?: string;
};

/* =========================
   Parsing helpers
========================= */

// toNumber: handles "400k", "1.2m", "$480,000"
function toNumber(raw?: string | null): number | undefined {
    if (!raw) return undefined;
    let s = raw.trim().toLowerCase().replace(/[\$,]/g, "");
    const mult =
        s.endsWith("m") ? (s = s.slice(0, -1), 1_000_000)
            : s.endsWith("k") ? (s = s.slice(0, -1), 1_000)
                : 1;
    const n = Number(s);
    if (!isFinite(n) || Number.isNaN(n)) return undefined;
    return n * mult;
}

// toPercent: accepts "6.25", "6.25%", "625"->6.25 only if clearly percent
function toPercent(raw?: string | null): number | undefined {
    if (!raw) return undefined;
    let s = raw.trim().toLowerCase().replace(/%/g, "");
    if (!s) return undefined;
    const n = Number(s);
    if (!isFinite(n) || Number.isNaN(n)) return undefined;
    // Heuristic: if n > 100, treat as basis-point style mistake (e.g., 625 -> 6.25)
    if (n > 100) return n / 100;
    return n;
}

// toTermMonths: "30", "30y", "30 yr", "30 years"
function toTermMonths(raw?: string | null): number | undefined {
    if (!raw) return undefined;
    const s = raw.trim().toLowerCase();
    const m = s.match(/(\d{1,3})/);
    if (!m) return undefined;
    const years = Number(m[1]);
    if (!isFinite(years) || years <= 0) return undefined;
    return years * 12;
}

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function parseQuery(q: string): Inputs {
    const s = q.replace(/\s+/g, " ").trim().toLowerCase();

    // price / loan amounts
    const priceMatch =
        s.match(/(?:^|[\s,])price\s*([$\d\.,]+[mk]?)/i) ||
        s.match(/(?:^|[\s,])\$?(\d[\d,\.]*[mk]?)(?=.*\bprice\b)/i) ||
        s.match(/(?:^|\s)price\s*([0-9\.\,mk\$]+)/i);
    const loanMatch =
        s.match(/(?:^|[\s,])loan\s*\$?([\d\.,]+[mk]?)/i) ||
        s.match(/(?:^|[\s,])\$?([\d\.,]+[mk]?)(?=.*\bloan\b)/i);

    // standalone leading money when user writes "price900k ...", capture "900k"
    const squeezedPrice = s.match(/price\s*([0-9\.,mk\$]+)/i);

    // down percent "down 20%" / "20% down"
    const downPctMatch =
        s.match(/down\s*([0-9\.]+)\s*%/) ||
        s.match(/([0-9\.]+)\s*%\s*down/);

    // rate: "6.25" or "6.25%" or "rate 6.25"
    const rateMatch =
        s.match(/\brate\s*([0-9\.\%]+)/) ||
        s.match(/\b([0-9]+\.[0-9]+|\d+)\s*%/) ||
        s.match(/\b([0-9]+\.[0-9]+)\b(?=.*\b(year|yr|y|years|mo|months)\b)/);

    // term: "30y", "30 years", "30 yr"
    const termMatch =
        s.match(/\b(\d{1,3})\s*(?:y|yr|yrs|year|years)\b/) ||
        s.match(/\b(\d{1,3})\s*(?:mo|months)\b/) ||
        s.match(/\b(\d{2,3})\s*(?=y|yr|yrs|year|years)\b/);

    // ZIP 5 digits
    const zipMatch = s.match(/\b(\d{5})(?:-\d{4})?\b/);

    // monthly insurance & HOA (accepts "ins 125", "insurance 125", "$125 ins", etc.)
    const insMatch =
        s.match(/\bins(?:urance)?\s*\$?\s*([0-9\.,]+)/) ||
        s.match(/\$?\s*([0-9\.,]+)\s*(?:ins|insurance)\b/);

    const hoaMatch =
        s.match(/\bhoa\s*\$?\s*([0-9\.,]+)/) ||
        s.match(/\$?\s*([0-9\.,]+)\s*hoa\b/);

    // Also accept compact "price900k" / "loan480k"
    const compactPrice = s.match(/\bprice\s*([0-9\.,mk\$]+)/);
    const compactLoan = s.match(/\bloan\s*([0-9\.,mk\$]+)/);

    // Build inputs
    const inputs: Inputs = {};

    // Price first (if present), else loan
    const priceRaw =
        priceMatch?.[1] ?? compactPrice?.[1] ?? squeezedPrice?.[1];
    const loanRaw =
        loanMatch?.[1] ?? compactLoan?.[1];

    const price = toNumber(priceRaw);
    const loan = toNumber(loanRaw);
    const downPercent = toPercent(downPctMatch?.[1]);

    if (typeof price === "number") inputs.price = price;
    if (typeof downPercent === "number") inputs.downPercent = downPercent;
    if (typeof loan === "number") inputs.loanAmount = loan;

    // If price & down% provided and loan missing, derive loan
    if (inputs.price && inputs.downPercent != null && inputs.loanAmount == null) {
        const ltv = 1 - inputs.downPercent / 100;
        inputs.loanAmount = inputs.price * ltv;
    }

    // Rate and term
    const ratePct = toPercent(rateMatch?.[1]);
    const termMonths = toTermMonths(termMatch?.[0] || termMatch?.[1] || "");

    // If still no term but a bare "30" exists next to years text
    if (!termMonths) {
        const bareYears = s.match(/\b(\d{2,3})\b(?=.*\b(year|yr|y|years)\b)/);
        if (bareYears) inputs.termMonths = Number(bareYears[1]) * 12;
    } else {
        inputs.termMonths = termMonths;
    }

    if (typeof ratePct === "number") inputs.ratePct = ratePct;

    // ZIP
    if (zipMatch?.[1]) inputs.zip = zipMatch[1];

    // Monthly ins / HOA
    const monthlyIns = toNumber(insMatch?.[1]);
    const monthlyHOA = toNumber(hoaMatch?.[1]);
    if (typeof monthlyIns === "number") inputs.monthlyIns = monthlyIns;
    if (typeof monthlyHOA === "number") inputs.monthlyHOA = monthlyHOA;

    // Final clamps / sensible defaults left to compute phase
    return inputs;
}

/* =========================
   Finance helpers
========================= */

function monthlyPI(loanAmount: number, ratePct: number, termMonths: number) {
    const r = clamp(ratePct, 0.1, 25) / 100 / 12;
    const n = Math.max(12, termMonths);
    // Standard amortization
    return loanAmount * (r / (1 - Math.pow(1 + r, -n)));
}

function estimateMonthlyTaxes(base: number, zip?: string): { amount: number; source: string } {
    // TODO: plug real table by ZIP later
    const annualRate = 0.012; // 1.20% fallback
    const amt = (base * annualRate) / 12;
    return { amount: amt, source: `fallback:default • ${(annualRate * 100).toFixed(2)}%${zip ? ` • ZIP ${zip}` : ""}` };
}

/* =========================
   Handler
========================= */

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();

    if (!q) {
        return noStore(<Answer>{
            ok: false,
            msg: "Missing q. Example: 'Price $900k, 20% down, 6.25%, 30 years, ZIP 92688'.",
            inputs: {},
        }, 400);
    }

    const inputs = parseQuery(q);

    // Require minimal set: (loan OR (price + down%)) AND rate AND term
    const hasLoan = typeof inputs.loanAmount === "number";
    const hasPriceCombo = typeof inputs.price === "number" && typeof inputs.downPercent === "number";
    const hasRate = typeof inputs.ratePct === "number";
    const hasTerm = typeof inputs.termMonths === "number";

    if (!((hasLoan || hasPriceCombo) && hasRate && hasTerm)) {
        const hint = "Try: 'Loan $400k at 6.5% for 30 years' or 'Price $900k, 20% down, 6.25%, 30 years, ZIP 92688'.";
        return noStore(<Answer>{ ok: false, inputs, msg: `Need loan+rate+term OR price+down%+rate+term. ${hint}` }, 400);
    }

    // Compute canonical loanAmount
    let loanAmount = inputs.loanAmount!;
    if (!loanAmount && inputs.price && inputs.downPercent != null) {
        loanAmount = inputs.price * (1 - inputs.downPercent / 100);
    }

    // Defaults for ins/HOA if not provided
    const monthlyIns = typeof inputs.monthlyIns === "number" ? inputs.monthlyIns : 100;
    const monthlyHOA = typeof inputs.monthlyHOA === "number" ? inputs.monthlyHOA : 0;

    // Taxes: base it on price if available, otherwise loan
    const taxBase = inputs.price ?? loanAmount;
    const taxEst = estimateMonthlyTaxes(taxBase, inputs.zip);

    // PI
    const pi = monthlyPI(loanAmount, inputs.ratePct!, inputs.termMonths!);

    const breakdown: Breakdown = {
        monthlyPI: pi,
        monthlyTaxes: taxEst.amount,
        monthlyIns,
        monthlyHOA,
        monthlyMI: 0,
        monthlyTotalPITI: pi + taxEst.amount + monthlyIns + monthlyHOA + 0,
    };

    const body: Answer = {
        ok: true,
        inputs: {
            ...inputs,
            loanAmount,
            // Normalize/round to two decimals for display stability on client
            ratePct: Number(inputs.ratePct!.toFixed(4)),
            termMonths: inputs.termMonths!,
        },
        breakdown,
        taxSource: taxEst.source,
    };

    return noStore(body, 200);
}
