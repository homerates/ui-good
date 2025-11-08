// app/api/calc/answer/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUILD_TAG = "calc-v2.5-parser-guard-2025-11-08";

import { NextResponse, type NextRequest } from "next/server";

/* ---------- helpers ---------- */

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

// For inputs that explicitly carry a % (or "rate 6.25"), allow 625 -> 6.25.
function toPercentExplicit(raw?: string | null): number | undefined {
    if (!raw) return undefined;
    const s = raw.trim().toLowerCase().replace(/%/g, "");
    if (!s) return undefined;
    const n = Number(s);
    if (!isFinite(n)) return undefined;
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

    // explicit price/loan (also accepts "price900k", "loan480k")
    const priceMatch =
        s.match(/\bprice\s*\$?([0-9\.,]+[mk]?)/) ||
        s.match(/\bprice\s*([0-9\.,mk\$]+)/);

    const loanMatch =
        s.match(/\bloan\s*\$?([0-9\.,]+[mk]?)/) ||
        s.match(/\bloan\s*([0-9\.,mk\$]+)/);

    // down% spans: “down 20%” OR “20% down”
    const downSpanA = s.match(/down\s*[0-9\.]+\s*%/);
    const downSpanB = s.match(/[0-9\.]+\s*%\s*down/);
    const downMatch = s.match(/down\s*([0-9\.]+)\s*%/) || s.match(/([0-9\.]+)\s*%\s*down/);

    // ins/hoa tokens
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
    const downP = toPercentExplicit(downMatch?.[1]);
    if (typeof downP === "number") inputs.downPercent = downP;

    // derive loan from price+down%
    if (inputs.price != null && inputs.downPercent != null && inputs.loanAmount == null) {
        inputs.loanAmount = inputs.price * (1 - inputs.downPercent / 100);
    }

    // ===== Term detection (fixed months test; tolerant glued forms) =====
    // 30y / 30yr / 30yrs / 30 years / 360mo / 360 months
    let termMonths: number | undefined;
    const termToken =
        s.match(/\b(\d{1,3})\s*(?:y|yr|yrs|year|years)\b/) ||
        s.match(/\b(\d{1,3})(?:y|yr|yrs)\b/) ||
        s.match(/\b(\d{2,3})\s*(?:mo|months)\b/);

    if (termToken?.[0]) {
        if (/(?:^|\b)(?:mo|months)\b/.test(termToken[0])) {
            const m = termToken[1] ? Number(termToken[1]) : undefined;
            termMonths = typeof m === "number" && isFinite(m) ? m : undefined;
        } else {
            termMonths = toTermMonths(termToken[0]);
        }
    }
    if (termMonths == null) {
        const bareYears = s.match(/\b(\d{2,3})\b(?=.*\b(year|yr|y|years)\b)/);
        if (bareYears) termMonths = Number(bareYears[1]) * 12;
    }
    if (typeof termMonths === "number") inputs.termMonths = termMonths;

    // ===== Rate detection =====
    // Build a clean string for rate parsing by removing the exact down% span(s) by index
    let sForRate = s;
    const spans: Array<{ start: number; end: number }> = [];
    if (downSpanA) spans.push({ start: downSpanA.index!, end: downSpanA.index! + downSpanA[0].length });
    if (downSpanB) spans.push({ start: downSpanB.index!, end: downSpanB.index! + downSpanB[0].length });
    if (spans.length) {
        spans.sort((a, b) => b.start - a.start).forEach(sp => {
            sForRate = sForRate.slice(0, sp.start) + " " + sForRate.slice(sp.end);
        });
    }

    // 1) Explicit forms (normalize 625 -> 6.25 OK here)
    let ratePct: number | undefined;
    let m =
        sForRate.match(/\brate\s*([0-9]+(?:\.[0-9]+)?%?)/) ||
        sForRate.match(/[@]\s*([0-9]+(?:\.[0-9]+)?%)/) ||
        sForRate.match(/\bat\s*([0-9]+(?:\.[0-9]+)?%)/) ||
        sForRate.match(/\b([0-9]+(?:\.[0-9]+)?)\s*%/);
    if (m?.[1]) {
        ratePct = toPercentExplicit(m[1]);
    }

    // 2) If still no rate and we have a term, choose the **closest valid decimal before the term token**.
    //    IMPORTANT: for bare numbers, DO NOT scale by 100. Only accept in 0.1–25 range.
    if (ratePct == null && inputs.termMonths) {
        const termPos = termToken?.index ?? sForRate.length;

        // collect number tokens with their exact indices and whether a trailing % exists
        const numRegex = /\b([0-9]+(?:\.[0-9]+)?)\b/g;
        const candidates: Array<{ val: number; idx: number; hasPct: boolean }> = [];
        let mm: RegExpExecArray | null;
        while ((mm = numRegex.exec(sForRate)) !== null) {
            const idx = mm.index!;
            const text = mm[1];
            // Ignore amounts like 900k/1.2m (price-ish)
            const nextChar = sForRate.slice(idx + text.length, idx + text.length + 1);
            if (nextChar === "k" || nextChar === "m") continue;

            // Ignore numbers that live inside previously removed down% spans (already stripped, but guard)
            // (No-op here due to index-strip; kept for clarity)

            // See if a % immediately follows (allow spaces)
            const tail = sForRate.slice(idx + text.length);
            const pctAfter = /^\s*%/.test(tail);

            // Convert: if percent form -> allow 625 -> 6.25
            const rawNum = Number(text);
            if (!isFinite(rawNum)) continue;
            const val = pctAfter ? (rawNum > 100 ? rawNum / 100 : rawNum) : rawNum;

            candidates.push({ val, idx, hasPct: pctAfter });
        }

        // only those before the term token and within sane bounds
        const beforeTerm = candidates
            .filter(c => c.idx < termPos)
            .filter(c => c.val >= 0.1 && c.val <= 25);

        if (beforeTerm.length) {
            // prefer 1–15%, then the right-most (closest to term)
            const pref = beforeTerm.filter(c => c.val >= 1 && c.val <= 15);
            const pick = (pref.length ? pref : beforeTerm).sort((a, b) => b.idx - a.idx)[0];
            ratePct = pick.val;
        }
    }

    if (typeof ratePct === "number") inputs.ratePct = ratePct;

    // ===== Bare loan detection =====
    // Treat a leading/bare amount as LOAN when followed by '@ 6.x' or 'at 6.x'
    if (inputs.loanAmount == null && inputs.price == null) {
        const bareLoan = s.match(
            /(?:^|\b)\$?([0-9][\d,\.]*[mk]?)(?=\s*(?:@|at)\s*[0-9])/i
        );

