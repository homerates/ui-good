// app/api/calc/answer/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// bump each push to confirm what's live
const BUILD_TAG = "calc-v2.3-parser-guard-2025-11-08";

import { NextResponse, type NextRequest } from "next/server";

/* ---------- tiny helpers ---------- */

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

/* ---------- parsing ---------- */

function parseQuery(q: string): Inputs {
    let s = q.replace(/\s+/g, " ").trim().toLowerCase();

    // explicit price/loan
    const priceMatch = s.match(/\bprice\s*\$?([0-9\.,]+[mk]?)/) || s.match(/\bprice\s*([0-9\.,mk\$]+)/);
    const loanMatch = s.match(/\bloan\s*\$?([0-9\.,]+[mk]?)/) || s.match(/\bloan\s*([0-9\.,mk\$]+)/);

    // down%: “down 20%” or “20% down”
    const downMatch = s.match(/down\s*([0-9\.]+)\s*%/) || s.match(/([0-9\.]+)\s*%\s*down/);

    // ins/hoa
    const insMatch = s.match(/\bins(?:urance)?\s*\$?\s*([0-9\.,]+)/) || s.match(/\$?\s*([0-9\.,]+)\s*(?:ins|insurance)\b/);
    const hoaMatch = s.match(/\bhoa\s*\$?\s*([0-9\.,]+)/) || s.match(/\$?\s*([0-9\.,]+)\s*hoa\b/);

    // ZIP
    const zipMatch = s.match(/\b(\d{5})(?:-\d{4})?\b/);

    const inputs: Inputs = {};

    // price / loan
    const price = toNumber(priceMatch?.[1]);
    const loan = toNumber(loanMatch?.[1]);
    if (typeof price === "number") inputs.price = price;
    if (typeof loan === "number") inputs.loanAmount = loan;

    // down%
    const downP = toPercent(downMatch?.[1]);
    if (typeof downP === "number") inputs.downPercent = downP;

    // derive loan from price+down%
    if (inputs.price != null && inputs.downPercent != null && inputs.loanAmount == null) {
        inputs.loanAmount = inputs.price * (1 - inputs.downPercent / 100);
    }

    // ===== Term detection (more tolerant) =====
    // forms: 30y / 30yr / 30 yrs / 30 years / 360 months
    const termMatch =
        s.match(/\b(\d{1,3})\s*(?:y|yr|yrs|year|years)\b/) ||
        s.match(/\b(\d{1,3})(?:y|yr|yrs)\b/) ||
        s.match(/\b(\d{1,3})\s*(?:mo|months)\b/);

    const termMonths =
        toTermMonths(termMatch?.[0]) ||
        (function () {
            const bare = s.match(/\b(\d{2,3})\b(?=.*\b(year|yr|y|years)\b)/);
