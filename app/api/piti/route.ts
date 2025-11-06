// app/api/piti/route.ts
import { NextResponse } from "next/server";
import {
    taxRateForZip,
    loanLimitsForZip,
    productById,
    listAcronyms,
    countyFromZip,
} from "../../../lib/knowledge";

/** ---------- helpers ---------- */
function cleanNum(s: string | null | undefined): number | null {
    if (!s) return null;
    const t = String(s).trim();
    if (!t) return null;
    const n = Number(t.replace(/[\s,$_%]/g, ""));
    return Number.isFinite(n) ? n : null;
}

// Accepts "6.25", "6.25%", "6.25%25", "0.0625"
function parsePercent(val: string | null): number | null {
    if (val == null) return null;
    let raw = String(val).trim();
    if (!raw) return null;

    // Normalize trailing percent encodings
    if (/%25$/.test(raw)) raw = raw.replace(/%25$/, "%");
    if (raw.endsWith("%")) {
        const n = Number(raw.slice(0, -1).replace(/[, ]/g, ""));
        return Number.isFinite(n) ? n : null;
    }

    const n = Number(raw.replace(/[, ]/g, ""));
    if (!Number.isFinite(n)) return null;
    return n <= 1 ? n * 100 : n; // 0.0625 -> 6.25
}

function parseRatePct(val: string | null): number | null {
    return parsePercent(val);
}

function parseTerm(val: string | null): { months: number } | null {
    if (val == null) return null;
    const n = cleanNum(val);
    if (n == null || n <= 0) return null;
    const months = n >= 100 ? n : Math.round(n * 12); // >=100 -> months, else years
    return { months };
}

function parseTax(val: string | null): number | null {
    if (val == null) return null;
    // Accept "1.2", "1.2%", "1.2%25", "0.012"
    const pct = parsePercent(val);
    if (pct != null) return pct / 100;
    const dec = cleanNum(val);
    return dec == null ? null : dec;
}

// Standard amortization
function computeMonthlyPI(loanAmount: number, annualRatePct: number, months: number) {
    const L = loanAmount;
    const r = (annualRatePct / 100) / 12;
    const n = Math.round(months);
    if (n <= 0) return 0;
    if (r === 0) return L / n;
    const f = Math.pow(1 + r, n);
    return (L * r * f) / (f - 1);
}

/** ---------- route ---------- */
export const dynamic = "force-static";

export async function GET(req: Request) {
    const url = new URL(req.url);

    // Inputs (accept multiple names)
    const zip = url.searchParams.get("zip") ?? "";
    const loanStr = url.searchParams.get("loan");
    const priceStr = url.searchParams.get("price");
    const downStr = url.searchParams.get("down");       // absolute number
    const downPctStr = url.searchParams.get("downPct"); // percent or decimal
    const rateStr = url.searchParams.get("rate");
    const termStr = url.searchParams.get("term");       // years or months
    const taxOverrideStr = url.searchParams.get("tax"); // percent or decimal
    const insStr = url.searchParams.get("ins");
    const hoaStr = url.searchParams.get("hoa");

    const monthlyIns = cleanNum(insStr) ?? 0;
    const monthlyHOA = cleanNum(hoaStr) ?? 0;

    // Determine loan amount
    let loanAmount = cleanNum(loanStr) ?? null;
    const price = cleanNum(priceStr) ?? null;

    if (loanAmount == null && price != null) {
        const downAbs = cleanNum(downStr);
        const dpPct = parsePercent(downPctStr); // e.g., "20" -> 20%
        if (downAbs != null) {
            loanAmount = Math.max(0, price - downAbs);
        } else if (dpPct != null) {
            loanAmount = Math.max(0, price * (1 - dpPct / 100));
        } else {
            loanAmount = price; // default if no down provided
        }
    }

    const ratePct = parseRatePct(rateStr);
    const termParsed = parseTerm(termStr ?? "30");
    const termMonths = termParsed?.months ?? 360;

    // Validate required bits
    const missing: string[] = [];
    if (loanAmount == null || loanAmount <= 0) missing.push("loan (or price/down)");
    if (ratePct == null || ratePct <= 0) missing.push("rate");
    if (termMonths <= 0) missing.push("term (>0)");

    if (missing.length) {
        // Echo raw params to help debug what actually arrived
        const rawParams = Object.fromEntries(url.searchParams.entries());
        return NextResponse.json(
            {
                error: "Missing or invalid inputs.",
                required: ["loan OR (price + down/downPct)", "rate", "term"],
                hint: [
                    "/api/piti?loan=620000&rate=6.25&term=30&zip=90011&ins=125&hoa=125",
                    "/api/piti?price=775000&downPct=20&rate=6.25&term=360&zip=90011",
                    "/api/piti?price=775000&down=155000&rate=6.25&term=30&zip=90011&tax=1.2"
                ],
                got: { loan: loanAmount, rate: ratePct, termMonths },
                rawParams
            },
            { status: 400 }
        );
    }

    // Tax via override or ZIP
    let taxRateDec = 0;
    let taxSource: "override" | "zipLookup" | "default" = "default";
    const taxOverride = parseTax(taxOverrideStr);

    if (taxOverride != null) {
        taxRateDec = taxOverride;
        taxSource = "override";
    } else if (zip) {
        const zr = taxRateForZip(zip);
        if (typeof zr === "number") {
            taxRateDec = zr;
            taxSource = "zipLookup";
        }
    }

    // Lookups
    const limits = zip ? (loanLimitsForZip(zip) ?? null) : null;
    const county = zip ? (countyFromZip(zip) ?? null) : null;

    // Calc
    const monthlyPI = computeMonthlyPI(loanAmount!, ratePct!, termMonths);
    const monthlyTax = (loanAmount! * taxRateDec) / 12; // swap to assessed value base if you prefer
    const monthlyPITI = monthlyPI + monthlyTax + monthlyIns + monthlyHOA;

    // Extras for UI
    const dscrGuide = productById("DSCR") ?? null;
    const glossary = listAcronyms();

    return NextResponse.json(
        {
            status: "ok",
            inputs: {
                zip, county, loanAmount, ratePct, termMonths, monthlyIns, monthlyHOA
            },
            lookups: {
                taxRate: taxRateDec,
                taxSource,
                loanLimits: limits
            },
            breakdown: {
                monthlyPI: Number(monthlyPI.toFixed(2)),
                monthlyTax: Number(monthlyTax.toFixed(2)),
                monthlyPITI: Number(monthlyPITI.toFixed(2))
            },
            context: {
                dscrGuide,
                acronyms: glossary
            }
        },
        { status: 200 }
    );
}
