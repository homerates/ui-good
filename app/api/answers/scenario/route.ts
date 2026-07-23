// HR-Build: scenario-proof-12-19-25-v5
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { buildAnswerMarkdown } from "../../../../lib/answerFormat";
import { runScenarioMath } from "../../../../lib/scenarioMath";
import { isScenarioComparisonQuestion } from "../../../../lib/calcDispatcher";
import { buildScenarioComparisonCard } from "../../../../lib/cardBuilders";
import { createClient } from "@supabase/supabase-js";
import { getSnapshot } from "../../../../lib/market-data";
import { routeAIRequest } from "../../../../lib/ai-providers/router";
import {
    getRecentScenarioHistory,
    buildSystemPromptWithMemory,
    storeScenarioMemory,
    isFollowUpQuestion,
} from "../../../../lib/memory";

/* =========================
   Helpers
========================= */

/**
 * Safe number formatter - prevents .toFixed() errors
 */
function safeToFixed(value: any, decimals: number = 2): string {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) {
        return 'N/A';
    }
    return num.toFixed(decimals);
}

function noStore(json: any, init?: ResponseInit) {
    return NextResponse.json(json, {
        ...(init || {}),
        headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            Pragma: "no-cache",
            Expires: "0",
            ...(init?.headers || {}),
        },
    });
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string) {
    let t: any;
    const timeout = new Promise<never>((_, rej) => {
        t = setTimeout(() => rej(new Error(`Timeout: ${label} after ${ms}ms`)), ms);
    });
    return Promise.race([p.finally(() => clearTimeout(t)), timeout]);
}

function extractLikelyJsonObject(text: string) {
    if (!text) return null;
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first === -1 || last === -1 || last <= first) return null;
    const slice = text.slice(first, last + 1).trim();
    return slice.startsWith("{") && slice.endsWith("}") ? slice : null;
}

function compactWhitespace(s: string) {
    return s.replace(/\s+/g, " ").trim();
}

function isFiniteNumber(n: any): n is number {
    return typeof n === "number" && Number.isFinite(n);
}

function safeAbsMoney(n: any) {
    return isFiniteNumber(n) ? Math.abs(n) : n;
}

function hasAny(text: string, terms: string[]) {
    const t = (text || "").toLowerCase();
    return terms.some((k) => t.includes(k));
}

function formatUSD(n: number, decimals = 0) {
    try {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: decimals,
            minimumFractionDigits: decimals,
        }).format(n);
    } catch {
        // Fallback if Intl is unavailable - NOW USES safeToFixed
        const fixed = safeToFixed(n, decimals);
        return `$${fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
    }
}

function formatPct(n: number, decimals = 2) {
    return `${safeToFixed(n, decimals)}%`;  // ← UPDATED to use safeToFixed
}

/**
 * Parse dollar amounts like "$650,000" "$3,600" "650k" "1.2m"
 * Returns a number or null.
 */
function parseMoneyLike(s: string) {
    if (!s) return null;
    const raw = s.toLowerCase().replace(/,/g, "").trim();
    const m = raw.match(/^\$?\s*(\d+(\.\d+)?)\s*([km])?$/i);
    if (!m) return null;
    const base = Number(m[1]);
    if (!Number.isFinite(base)) return null;
    const suffix = m[3];
    if (suffix === "k") return base * 1000;
    if (suffix === "m") return base * 1_000_000;
    return base;
}
// ADD THIS RIGHT AFTER LINE 111 (after the parseMoneyLike function closes)

// ===== MORTGAGE CALCULATOR HELPERS =====
/**
 * Detect if scenario involves mortgage payment calculations
 */
function needsMortgageCalculation(message: string): boolean {
    // Scenario route is ALWAYS about mortgage calculations
    // But we specifically check if it has price/loan info
    return /\$[\d,]+|price|loan|down.*payment|\d+%/i.test(message);
}

/**
 * Extract mortgage parameters from scenario message
 */
function extractScenarioMortgageParams(message: string, marketData: any): {
    price?: number;
    downPaymentPct?: number;
    rate?: number;
    termYears?: number;
} | null {
    // Extract price
    const priceMatch = message.match(/\$\s*([\d,]+(?:\.\d+)?)\s*k?\b/i) ||
        message.match(/price.*?(\d+[,\d]*)/i);
    if (!priceMatch) return null;

    let price = parseFloat(priceMatch[1].replace(/,/g, ''));
    if (message.match(/\$?\s*[\d,]+\s*k\b/i)) {
        price *= 1000;
    }

    // Extract down payment
    const downMatch = message.match(/(\d+(?:\.\d+)?)\s*%?\s*down/i);
    const downPaymentPct = downMatch ? parseFloat(downMatch[1]) : 20;

    // Extract rate - look for rate mentioned AFTER down payment
    let rateMatch = message.match(/down.*?(\d+(?:\.\d+)?)\s*%/i);
    if (!rateMatch) {
        rateMatch = message.match(/(?:rate|interest|at)\s*(\d+(?:\.\d+)?)\s*%/i);
    }
    const rate = rateMatch
        ? parseFloat(rateMatch[1])
        : (marketData?.thirtyYearFixed || 6.0);

    // Extract term
    const termMatch = message.match(/(\d+)[\s-]?year/i);
    const termYears = termMatch ? parseInt(termMatch[1]) : 30;

    return { price, downPaymentPct, rate, termYears };
}
// ===== END MORTGAGE HELPERS =====
/**
 * Fix scenario inputs BEFORE they go to scenarioMath
 */
function fixScenarioInputsBeforeMath(inputs: any): any {
    if (!inputs || typeof inputs !== 'object') return inputs;

    const fixed = { ...inputs };

    if (fixed.price && fixed.price < 100000) {
        console.log(`[PreMath Fix] price: ${fixed.price} → ${fixed.price * 1000}`);
        fixed.price = fixed.price * 1000;
    }
    if (fixed.purchase_price && fixed.purchase_price < 100000) {
        console.log(`[PreMath Fix] purchase_price: ${fixed.purchase_price} → ${fixed.purchase_price * 1000}`);
        fixed.purchase_price = fixed.purchase_price * 1000;
    }
    if (fixed.loan_amount && fixed.loan_amount < 100000) {
        console.log(`[PreMath Fix] loan_amount: ${fixed.loan_amount} → ${fixed.loan_amount * 1000}`);
        fixed.loan_amount = fixed.loan_amount * 1000;
    }

    return fixed;
}
/**
 * Fix scenario numbers that Claude might return in wrong scale
 */
function fixScenarioNumbers(result: any, userMessage: string): any {
    console.log('[DEBUG] fixScenarioNumbers called!');
    console.log('[DEBUG] Full result structure:', JSON.stringify(result, null, 2).substring(0, 500));
    console.log('[DEBUG] result.scenario_inputs:', result?.scenario_inputs);

    if (!result || typeof result !== 'object') {
        return result;
    }

    const warnings: string[] = result.validation_warnings || [];

    if (result.scenario_inputs) {
        const inputs = result.scenario_inputs;

        if (inputs.price && inputs.price < 100000) {
            const oldPrice = inputs.price;
            inputs.price = inputs.price * 1000;
            warnings.push(`Price corrected from ${oldPrice} to ${inputs.price}`);
            console.log(`[Fix] Price: ${oldPrice} → ${inputs.price}`);
        }

        if (inputs.loan_amount && inputs.loan_amount < 100000) {
            const oldLoan = inputs.loan_amount;
            inputs.loan_amount = inputs.loan_amount * 1000;
            warnings.push(`Loan corrected from ${oldLoan} to ${inputs.loan_amount}`);
            console.log(`[Fix] Loan: ${oldLoan} → ${inputs.loan_amount}`);
        }
    }

    if (result.computed_financials && result.computed_financials.loan_amount) {
        if (result.computed_financials.loan_amount < 100000) {
            const oldLoan = result.computed_financials.loan_amount;
            result.computed_financials.loan_amount = oldLoan * 1000;
            warnings.push(`Computed loan corrected from ${oldLoan} to ${result.computed_financials.loan_amount}`);
            console.log(`[Fix] Computed loan: ${oldLoan} → ${result.computed_financials.loan_amount}`);
        }
    }

    result.validation_warnings = warnings;
    return result;
}
/**
 * Only treat a percent as a USER-PROVIDED MORTGAGE RATE if it appears in a rate context.
/**
 * Only treat a percent as a USER-PROVIDED MORTGAGE RATE if it appears in a rate context.
 * Prevents capture of "tax 1.10%" / "vacancy 7%" etc.
 */
function detectUserProvidedRate(message: string) {
    const m = message || "";

    // Strong context: "rate 6.25%", "interest rate 6.25%", "APR 6.25%"
    const ctx1 = m.match(
        /\b(?:interest\s*rate|rate|apr)\s*(?:is|=|at)?\s*(\d{1,2}(?:\.\d{1,3})?)\s*%/i
    );
    if (ctx1) {
        const val = Number(ctx1[1]);
        if (Number.isFinite(val) && val >= 0.5 && val <= 20) return val;
    }

    // Moderate context: "at 6.25%" but reject if nearby mentions non-rate keywords.
    const ctx2 = m.match(/\bat\s*(\d{1,2}(?:\.\d{1,3})?)\s*%/i);
    if (ctx2) {
        const val = Number(ctx2[1]);
        if (!Number.isFinite(val) || val < 0.5 || val > 20) return null;

        const idx = ctx2.index ?? 0;
        const windowText = m
            .slice(Math.max(0, idx - 50), Math.min(m.length, idx + 50))
            .toLowerCase();

        const nonRateHints = [
            "tax",
            "property tax",
            "insurance",
            "vacancy",
            "maintenance",
            "capex",
            "hoa",
            "appreciation",
            "rent",
            "growth",
        ];

        if (nonRateHints.some((h) => windowText.includes(h))) return null;
        return val;
    }

    return null;
}

/**
 * Rate sensitivity ONLY when borrower explicitly asks for rate comparisons.
 */
function wantsRateSensitivity(message: string) {
    const m = (message || "").toLowerCase();

    const explicitPhrases = [
        "rate comparison",
        "compare rates",
        "if rates go up",
        "if rates go down",
        "if rates increase",
        "if rates decrease",
        "if rates rise",
        "if rates fall",
        "higher rate",
        "lower rate",
        "rate shock",
        "stress test",
        "rate stress",
        "rate sensitivity",
        "show cash flow under current rate vs",
    ];
    if (explicitPhrases.some((p) => m.includes(p))) return true;

    // Explicit deltas
    const deltaPatterns = [
        /(\+|\-)\s*0\.?5\s*%/i,
        /(\+|\-)\s*1(\.0)?\s*%/i,
        /\bplus\s*0\.?5\b/i,
        /\bplus\s*1\b/i,
        /\bminus\s*0\.?5\b/i,
    ];
    if (deltaPatterns.some((re) => re.test(m))) return true;

    return false;
}

/* =========================
   Inputs summary extraction (borrower-visible)
========================= */
function extractScenarioInputs(message: string) {
    const m = message || "";

    const inputs: any = {};

    // Price / balance: first large $ figure (> $50k) is typically price or balance.
    const dollarMatches = Array.from(m.matchAll(/\$?\s*[\d,.]+(?:\s*[km])?/gi))
        .map(x => x[0])
        .map(x => x.trim());

    const moneyValues = dollarMatches
        .map(v => ({ raw: v, val: parseMoneyLike(v) }))
        .filter(x => x.val != null) as { raw: string; val: number }[];

    // Rent detection
    const rentMatch = m.match(/(?:rental\s+income|rent)\s*(?:is|of|=|:)?\s*\$?\s*([\d,.]+)\s*(?:\/?\s*mo|month|monthly|per\s*month)?/i);
    if (rentMatch) {
        const rentVal = parseMoneyLike(rentMatch[1]);
        if (rentVal != null) inputs.rent_monthly = rentVal;
    }

    // Purchase price / balance selection
    const largeMoney = moneyValues.filter(x => x.val >= 50_000);
    if (largeMoney.length) {
        // Prefer explicit "buying a $X home" / "purchase $X"
        const buyMatch = m.match(/buy(?:ing)?\s*(?:a|an)?\s*\$?\s*([\d,.]+)\s*(?:home|house|property)?/i);
        const ppMatch = m.match(/\b(?:purchase\s*price|price|pp)\s*(?:is|=|:)?\s*\$?\s*([\d,.]+)\b/i);
        const balMatch = m.match(/\b(?:balance|loan\s*balance)\s*(?:is|=|:)?\s*\$?\s*([\d,.]+)\b/i);

        const pick = (mm: RegExpMatchArray | null) => (mm ? parseMoneyLike(mm[1]) : null);

        const buyVal = pick(buyMatch);
        const ppVal = pick(ppMatch);
        const balVal = pick(balMatch);

        if (buyVal != null) inputs.price = buyVal;
        else if (ppVal != null) inputs.price = ppVal;
        else if (balVal != null) inputs.balance = balVal;
        else inputs.price = largeMoney[0].val;
    }

    // Down payment percent
    const downPct = m.match(/(\d{1,2}(?:\.\d+)?)\s*%\s*down/i);
    if (downPct) {
        const dp = Number(downPct[1]);
        if (Number.isFinite(dp) && dp > 0 && dp < 100) inputs.down_payment_pct = dp;
    }

    // Vacancy
    const vac = m.match(/vacancy\s*(?:is|=|:)?\s*(\d{1,2}(?:\.\d+)?)\s*%/i);
    if (vac) {
        const v = Number(vac[1]);
        if (Number.isFinite(v)) inputs.vacancy_pct = v;
    }

    // Maintenance
    const maint = m.match(/maintenance\s*(?:is|=|:)?\s*(\d{1,2}(?:\.\d+)?)\s*%/i);
    if (maint) {
        const v = Number(maint[1]);
        if (Number.isFinite(v)) inputs.maintenance_pct = v;
    }

    // Property tax
    const tax = m.match(/property\s*tax(?:es)?\s*(?:is|=|:)?\s*(\d{1,2}(?:\.\d+)?)\s*%/i);
    if (tax) {
        const v = Number(tax[1]);
        if (Number.isFinite(v)) inputs.property_tax_pct = v;
    }
    // Rent (monthly) — capture "$6,000", "Rent 6000", "rent: 6k", "$6k rent"
    {
        const rentMatch =
            m.match(/\brent\b\s*[:=]?\s*\$?\s*([\d,]+(?:\.\d+)?)(\s*k)?\b/i) ||
            m.match(/\b\$?\s*([\d,]+(?:\.\d+)?)(\s*k)?\s*\b(?:\/\s*mo|per\s*month|monthly)\b.*\brent\b/i) ||
            m.match(/\b(?:rental\s+income|gross\s+rent|monthly\s+rent|rent)\b.*?\$?\s*([\d,]+(?:\.\d+)?)(\s*k)?\b/i) ||
            m.match(/\b\$?\s*([\d,]+(?:\.\d+)?)(\s*k)?\s*\brent\b/i);

        if (rentMatch) {
            let v = Number(String(rentMatch[1]).replace(/,/g, ""));
            if (rentMatch[2] && String(rentMatch[2]).toLowerCase().includes("k")) v *= 1000;
            if (Number.isFinite(v) && v > 0) inputs.rent_monthly = v;
        }
    }

    // Insurance
    const ins = m.match(/insurance\s*(?:is|=|:)?\s*(\d{1,2}(?:\.\d+)?)\s*%/i);
    if (ins) {
        const v = Number(ins[1]);
        if (Number.isFinite(v)) inputs.insurance_pct = v;
    }

    // Extra payment / invest return
    const extra = m.match(/extra\s*\$?\s*([\d,.]+)\s*\/?\s*(?:mo|month|monthly)/i);
    if (extra) {
        const v = parseMoneyLike(extra[1]);
        if (v != null) inputs.extra_payment_monthly = v;
    }

    const invest = m.match(/invest(?:ing)?\s*(?:it\s*)?at\s*(\d{1,2}(?:\.\d+)?)\s*%/i);
    if (invest) {
        const v = Number(invest[1]);
        if (Number.isFinite(v)) inputs.invest_return_pct = v;
    }

    // Term / years left
    const yrsLeft = m.match(/(\d{1,2})\s*years?\s*left/i);
    if (yrsLeft) {
        const v = Number(yrsLeft[1]);
        if (Number.isFinite(v)) inputs.years_left = v;
    }

    return inputs;
}

function buildInputsSummary(inputs: any, rate_context: any) {
    const lines: string[] = [];
    lines.push("Scenario inputs");

    if (inputs.price != null) lines.push(`- Purchase price: ${formatUSD(inputs.price)}`);
    if (inputs.balance != null) lines.push(`- Loan balance: ${formatUSD(inputs.balance)}`);

    if (inputs.down_payment_pct != null && inputs.price != null) {
        const dpPct = inputs.down_payment_pct;
        const dpAmt = (inputs.price * dpPct) / 100;
        const loanAmt = inputs.price - dpAmt;
        lines.push(`- Down payment: ${formatPct(dpPct, 2)} (${formatUSD(dpAmt)})`);
        lines.push(`- Loan amount: ${formatUSD(loanAmt)}`);
    } else if (inputs.down_payment_pct != null) {
        lines.push(`- Down payment: ${formatPct(inputs.down_payment_pct, 2)}`);
    }

    if (inputs.rent_monthly != null) lines.push(`- Rent: ${formatUSD(inputs.rent_monthly)}/mo`);

    if (inputs.vacancy_pct != null) lines.push(`- Vacancy: ${formatPct(inputs.vacancy_pct, 2)}`);
    if (inputs.maintenance_pct != null) lines.push(`- Maintenance: ${formatPct(inputs.maintenance_pct, 2)} (annual assumption)`);
    if (inputs.property_tax_pct != null) lines.push(`- Property tax: ${formatPct(inputs, 2)} (annual assumption)`);
    if (inputs.rent_monthly != null) lines.push(`- Rent: ${formatUSD(inputs.rent_monthly)}/mo`);

    if (inputs.insurance_pct != null) lines.push(`- Insurance: ${formatPct(inputs.insurance_pct, 2)} (annual assumption)`);

    if (inputs.extra_payment_monthly != null) lines.push(`- Extra payment: ${formatUSD(inputs.extra_payment_monthly)}/mo`);
    if (inputs.invest_return_pct != null) lines.push(`- Investment return: ${formatPct(inputs.invest_return_pct, 2)} (assumed)`);

    if (inputs.years_left != null) lines.push(`- Term remaining: ${inputs.years_left} years`);

    if (rate_context?.rate_used != null) {
        const rateLine = `- Rate used: ${formatPct(Number(rate_context.rate_used), 2)} (${rate_context.source}${rate_context.as_of ? `, ${rate_context.as_of}` : ""})`;
        lines.push(rateLine);
    }

    return lines.join("\n");
}

/* =========================
   Scenario normalizer
========================= */
/* =========================
   Post-parse validator (Scenario)
   - Recomputes cash flow + DSCR from scenario_inputs
   - Fixes sign mismatches and obvious inconsistencies
   - Keeps output deterministic for GrokCard
========================= */


function clamp(n: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, n));
}

function round2(n: number) {
    return Math.round(n * 100) / 100;
}

function calcMonthlyPI(loanAmount: number, annualRatePct: number, termYears: number) {
    const r = (annualRatePct / 100) / 12;
    const n = termYears * 12;
    if (!Number.isFinite(r) || r <= 0) return loanAmount / n;
    const pow = Math.pow(1 + r, n);
    return loanAmount * (r * pow) / (pow - 1);
}

function calcBaselineFromInputs(inputs: ScenarioInputs, annualRatePct: number) {
    const termYears = inputs.term_years ?? 30;

    const downPct = clamp(inputs.down_payment_pct / 100, 0, 0.99);
    const loanAmount = inputs.price * (1 - downPct);

    const effectiveRent = inputs.rent_monthly * (1 - clamp(inputs.vacancy_pct / 100, 0, 0.9));
    const grossRent = inputs.rent_monthly;
    const maintMonthly = (inputs.price * (inputs.maintenance_pct / 100)) / 12;
    const taxMonthly = (inputs.price * (inputs.property_tax_pct / 100)) / 12;
    const insMonthly = (inputs.price * (inputs.insurance_pct / 100)) / 12;

    const monthlyPI = calcMonthlyPI(loanAmount, annualRatePct, termYears);
    const hoaMonthly = Number.isFinite(inputs.hoa_monthly) ? inputs.hoa_monthly : 0;
    const PITIA = monthlyPI + taxMonthly + insMonthly + hoaMonthly;


    // Operating expenses in this prompt = maintenance (you can extend later)
    const operating = maintMonthly;

    const monthlyCashFlow = effectiveRent - operating - PITIA;

    // LoanDepot DSCR (underwriting) — GROSS rent only
    const dscrLoanDepot = PITIA > 0 ? (grossRent / PITIA) : null;

    // Economic DSCR (informational only)
    const dscrEconomic = PITIA > 0 ? (effectiveRent / PITIA) : null;

    // Default DSCR = lender-style (gross rent ÷ PITIA). Economic DSCR kept separately for reference.

    const dscr = dscrLoanDepot;

    return {
        termYears,
        loanAmount: round2(loanAmount),
        effectiveRent: round2(effectiveRent),
        grossRent: round2(grossRent),
        dscrLoanDepot: dscrLoanDepot == null ? null : round2(dscrLoanDepot),
        dscrEconomic: dscrEconomic == null ? null : round2(dscrEconomic),

        monthlyPI: round2(monthlyPI),
        taxMonthly: round2(taxMonthly),
        insMonthly: round2(insMonthly),
        operating: round2(operating),
        PITIA: round2(PITIA),
        monthlyCashFlow: round2(monthlyCashFlow),
        annualCashFlow: round2(monthlyCashFlow * 12),
        dscr: dscr == null ? null : round2(dscr),
    };
}

type ScenarioInputs = {
    price: number;
    down_payment_pct: number;
    rent_monthly: number;

    vacancy_pct: number;        // default 0
    maintenance_pct: number;    // default 0
    property_tax_pct: number;   // default 0
    insurance_pct: number;      // default 0
    hoa_monthly: number;        // default 0

    term_years?: number;        // optional, default handled elsewhere (e.g. 30)
};

function ensureScenarioInputs(result: any): ScenarioInputs | null {
    const si = result?.scenario_inputs || result?.scenarioInputs;
    if (!si || typeof si !== "object") return null;

    // Only require the *core three* so validation can run on typical DSCR questions.
    const price = Number(si.price ?? si.purchase_price);
    const down = Number(si.down_payment_pct ?? si.downPaymentPct ?? si.down_payment_percent);
    const rent = Number(si.rent_monthly ?? si.rent ?? si.monthly_rent);

    if (!Number.isFinite(price) || !Number.isFinite(down)) return null;

    // Rent is optional - default to 0 if not provided
    const rentValue = Number.isFinite(rent) ? rent : 0;

    // Default any missing assumptions to 0 (matches your prompt: "treat as 0 if not provided").
    const numOrZero = (v: any) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    };

    const termYearsRaw = Number(si.term_years ?? si.termYears ?? si.term);
    const term_years = Number.isFinite(termYearsRaw) && termYearsRaw > 0 ? termYearsRaw : undefined;

    return {
        price,
        down_payment_pct: down,
        rent_monthly: rentValue,  // ← Use rentValue instead

        vacancy_pct: numOrZero(si.vacancy_pct),
        maintenance_pct: numOrZero(si.maintenance_pct),
        // IMPORTANT: Do NOT coerce missing tax to 0 here.
        // Keep NaN when missing so we can apply a default later (e.g., 1.25%) in the canonical PITIA block.
        property_tax_pct: (() => {
            const v =
                si.property_tax_pct ??
                si.propertyTaxPct ??
                si.tax_pct ??
                si.taxPct ??
                si.property_tax ??
                si.propertyTax ??
                si.taxes_pct ??
                si.taxesPct;

            const n = Number(v);
            return Number.isFinite(n) ? n : NaN;
        })(),

        insurance_pct: numOrZero(si.insurance_pct),
        hoa_monthly: numOrZero(si.hoa_monthly),

        term_years,
    };
}


function postParseValidateScenario(result: any, message: string, marketData: any, memoryHistory?: any[]) {
    const out = { ...(result || {}) };
    const warnings: string[] = Array.isArray(out.validation_warnings)
        ? [...out.validation_warnings]
        : [];

    const inputs = ensureScenarioInputs(out);

    // Rate should NOT come from ScenarioInputs (it isn't part of that type).
    // Pull it from rate_context (or scenario_inputs fallback) deterministically.
    const rawRate = Number(
        (out as any)?.rate_context?.rate_used ??
        (out as any)?.rate_context?.rate ??
        (out as any)?.scenario_inputs?.rate_used ??
        (out as any)?.scenario_inputs?.rate ??
        NaN
    );

    // Normalize: accept 6.25 or 0.0625
    const rateUsed = rawRate > 1 ? rawRate : rawRate * 100;



    // Guard: if inputs/rate missing, do not attempt computed overrides.
    if (!inputs || !Number.isFinite(rateUsed) || rateUsed <= 0) {
        out.validation_warnings = warnings;
        return out;
    }

    // Always enforce term default: 30y unless user explicitly asked and it was captured.
    const termYears = Number(inputs.term_years ?? 30) || 30;
    inputs.term_years = termYears;

    const base = calcBaselineFromInputs(inputs, rateUsed);

    // --- Helper: build computed sensitivity rows ---
    const mkSens = (label: string, ratePct: number) => {
        const b = calcBaselineFromInputs(inputs, ratePct);
        return {
            monthly_payment: b.monthlyPI,
            monthly_cash_flow: b.monthlyCashFlow,
            dscr: b.dscr,
            _rate_used: ratePct,
            _label: label,
        };
    };

    // Borrower must explicitly ask for stress/compare (or the model already returned those keys)
    const promptWantsStress = wantsRateSensitivity(message);


    // 1) monthly_payment must equal computed P&I (strict, deterministic)
    // Never trust model-authored monthly_payment.
    const modelPmt = Number(out.monthly_payment);
    if (!Number.isFinite(modelPmt) || Math.abs(modelPmt - base.monthlyPI) > 0) {
        warnings.push(
            `monthly_payment forced to computed value ${base.monthlyPI} (model was ${Number.isFinite(modelPmt) ? round2(modelPmt) : "null"}).`
        );
    }
    out.monthly_payment = base.monthlyPI;


    // 2) Sensitivity: only generate/overwrite when borrower asked for rate comparison/stress
    if (promptWantsStress) {
        if (!out.sensitivity_table || typeof out.sensitivity_table !== "object") {
            out.sensitivity_table = {};
        }

        const cur = mkSens("Current", rateUsed);
        const p05 = mkSens("+0.5%", rateUsed + 0.5);
        const p10 = mkSens("+1.0%", rateUsed + 1.0);
        const m05 = mkSens("-0.5%", Math.max(0.01, rateUsed - 0.5));

        out.sensitivity_table.current_rate = {
            monthly_payment: cur.monthly_payment,
            monthly_cash_flow: cur.monthly_cash_flow,
            dscr: cur.dscr,
        };
        out.sensitivity_table.plus_0_5pct = {
            monthly_payment: p05.monthly_payment,
            monthly_cash_flow: p05.monthly_cash_flow,
            dscr: p05.dscr,
        };
        out.sensitivity_table.plus_1pct = {
            monthly_payment: p10.monthly_payment,
            monthly_cash_flow: p10.monthly_cash_flow,
            dscr: p10.dscr,
        };
        out.sensitivity_table.minus_0_5pct = {
            monthly_payment: m05.monthly_payment,
            monthly_cash_flow: m05.monthly_cash_flow,
            dscr: m05.dscr,
        };

        warnings.push("sensitivity_table overwritten for consistency (computed).");
    } else {
        // If borrower didn't ask, don't render sensitivity in GrokCard.
        // Keep raw sensitivity_table if upstream generated it, but we won't build rate_sensitivity table.
    }

    // 3) cash_flow_table should be ANNUAL by definition (consistent with year labels).
    // If missing or mismatched, overwrite with computed annual cash flow (no growth assumptions were provided).
    const computedAnnual = base.annualCashFlow;

    const needsCashOverwrite = (() => {
        if (!Array.isArray(out.cash_flow_table) || out.cash_flow_table.length === 0) return true;

        const row1 =
            out.cash_flow_table.find((r: any) => Number(r?.year) === 1) ?? out.cash_flow_table[0];
        const v = Number(row1?.net_cash_flow);
        if (!Number.isFinite(v)) return true;

        const signMismatch = v !== 0 && Math.sign(v) !== Math.sign(computedAnnual);
        const magMismatch =
            Math.abs(v - computedAnnual) > Math.max(1500, Math.abs(computedAnnual) * 0.25);

        // Detect "monthly disguised as annual": looks like monthly and near current monthly cash flow
        const curMCF = Number(out?.sensitivity_table?.current_rate?.monthly_cash_flow);
        const looksMonthly =
            Math.abs(v) < 20000 &&
            Number.isFinite(curMCF) &&
            Math.abs(v - curMCF) <= Math.max(50, Math.abs(curMCF) * 0.25);

        return signMismatch || magMismatch || looksMonthly;
    })();

    if (needsCashOverwrite) {
        out.cash_flow_table = [
            { year: 1, net_cash_flow: computedAnnual },
            { year: 5, net_cash_flow: computedAnnual },
            { year: 10, net_cash_flow: computedAnnual },
            { year: 15, net_cash_flow: computedAnnual },
            { year: 20, net_cash_flow: computedAnnual },
            { year: 25, net_cash_flow: computedAnnual },
            { year: 30, net_cash_flow: computedAnnual },
        ];
        warnings.push(
            `cash_flow_table overwritten for consistency (computed annual CF = ${computedAnnual}).`
        );
    }

    // 4) Amortization sanity: remove any payoff rows before termYears (kills 15Y hallucinations)
    if (Array.isArray(out.amortization_summary) && out.amortization_summary.length) {
        const cleaned = out.amortization_summary.filter((r: any) => {
            const y = Number(r?.year);
            const bal = Number(r?.ending_balance);
            if (!Number.isFinite(y)) return false;
            if (Number.isFinite(bal) && bal === 0 && y < termYears) return false;
            return true;
        });

        if (cleaned.length !== out.amortization_summary.length) {
            warnings.push(
                `amortization_summary removed premature payoff rows before year ${termYears}.`
            );
            out.amortization_summary = cleaned;
        }
    }

    // 5) Rebuild grokcard_tables from corrected sources of truth
    if (!out.grokcard_tables || typeof out.grokcard_tables !== "object") {
        out.grokcard_tables = {};
    }

    // Amortization snapshot table (cumulative totals)
    if (Array.isArray(out.amortization_summary) && out.amortization_summary.length) {
        let cumPrin = 0;
        let cumInt = 0;

        // Backfill amortization inputs deterministically so the UI never sees them as "missing".
        const cf = (out as any)?.computed_financials || {};
        (out as any).scenario_inputs = (out as any).scenario_inputs || {};

        const loanAmtDet =
            Number.isFinite(Number((out as any).scenario_inputs.loan_amount)) ? Number((out as any).scenario_inputs.loan_amount) :
                Number.isFinite(Number(cf.loan_amount)) ? Number(cf.loan_amount) :
                    NaN;

        const rateUsedPctDet =
            Number.isFinite(Number((out as any).scenario_inputs.rate_used_pct)) ? Number((out as any).scenario_inputs.rate_used_pct) :
                Number.isFinite(Number(cf.rate_used_pct)) ? Number(cf.rate_used_pct) :
                    NaN;

        const termYearsDet =
            Number.isFinite(Number((out as any).scenario_inputs.term_years)) ? Number((out as any).scenario_inputs.term_years) :
                Number.isFinite(Number(cf.term_years)) ? Number(cf.term_years) :
                    30;

        // Write back so the renderer sees them and doesn't throw "inputs missing"
        if (Number.isFinite(loanAmtDet)) (out as any).scenario_inputs.loan_amount = loanAmtDet;
        if (Number.isFinite(rateUsedPctDet)) (out as any).scenario_inputs.rate_used_pct = rateUsedPctDet;
        if (Number.isFinite(termYearsDet)) (out as any).scenario_inputs.term_years = termYearsDet;

        // Use these canonical values below
        const loanAmt = loanAmtDet;
        const rateUsedPct = rateUsedPctDet;
        const termYears = termYearsDet;


        if (!Number.isFinite(loanAmt) || loanAmt <= 0 || !Number.isFinite(rateUsedPct) || rateUsedPct <= 0 || !Number.isFinite(termYears) || termYears <= 0) {
            // Fail-soft: skip amortization snapshot but keep the rest of the scenario output.
            (out as any).amortization_note = "Amortization snapshot skipped: missing loan amount, rate, or term.";

            // IMPORTANT: do not clear amortization_summary here.
            // It may be valid data that the UI can render once canonical inputs are backfilled.
            if ((out as any).grokcard_tables?.amortization_snapshot) delete (out as any).grokcard_tables.amortization_snapshot;
        } else {


            out.grokcard_tables.amortization_snapshot = {
                headers: ["Yr", "Principal Paid", "Interest Paid", "Ending Balance"],
                rows: out.amortization_summary.map((r: any) => {
                    const y = Number(r?.year);
                    const pDelta = Number(r?.principal_paid);
                    const iDelta = Number(r?.interest_paid);

                    if (Number.isFinite(pDelta)) cumPrin += pDelta;
                    if (Number.isFinite(iDelta)) cumInt += iDelta;

                    const bal =
                        Number.isFinite(loanAmt) && Number.isFinite(cumPrin)
                            ? Math.max(loanAmt - cumPrin, 0)
                            : null;

                    return [
                        Number.isFinite(y) ? y : null,
                        Number.isFinite(cumPrin) ? Math.round(cumPrin) : null,
                        Number.isFinite(cumInt) ? Math.round(cumInt) : null,
                        bal !== null ? Math.round(bal) : null,
                    ];
                }),
            };
        }

    }


    // Cash flow table (ANNUAL)
    if (Array.isArray(out.cash_flow_table) && out.cash_flow_table.length) {
        out.grokcard_tables.cash_flow = {
            headers: ["Yr", "Net CF"],
            rows: out.cash_flow_table.map((r: any) => [
                Number(r?.year),
                Number(r?.net_cash_flow),
            ]),
            unit: "annual",
        };
    }

    // Rate sensitivity table (ONLY if borrower asked)
    if (promptWantsStress) {
        const s = out.sensitivity_table || {};
        const rows: any[] = [];

        const fmtMoney = (v: any) =>
            Number.isFinite(Number(v))
                ? `$${Math.round(Number(v)).toLocaleString()}`
                : null;

        const fmtCF = (v: any) =>
            Number.isFinite(Number(v))
                ? `${Number(v) < 0 ? "-" : ""}$${Math.abs(Math.round(Number(v))).toLocaleString()}`
                : null;

        const fmtDSCR = (v: any) =>
            Number.isFinite(Number(v)) ? `${round2(Number(v))}x` : null;

        if (s.minus_0_5pct)
            rows.push([
                "-0.5%",
                fmtMoney(s.minus_0_5pct.monthly_payment),
                fmtCF(s.minus_0_5pct.monthly_cash_flow),
                fmtDSCR(s.minus_0_5pct.dscr),
            ]);

        if (s.current_rate)
            rows.push([
                "Current Rate",
                fmtMoney(s.current_rate.monthly_payment),
                fmtCF(s.current_rate.monthly_cash_flow),
                fmtDSCR(s.current_rate.dscr),
            ]);

        if (s.plus_0_5pct)
            rows.push([
                "+0.5%",
                fmtMoney(s.plus_0_5pct.monthly_payment),
                fmtCF(s.plus_0_5pct.monthly_cash_flow),
                fmtDSCR(s.plus_0_5pct.dscr),
            ]);

        if (s.plus_1pct)
            rows.push([
                "+1.0%",
                fmtMoney(s.plus_1pct.monthly_payment),
                fmtCF(s.plus_1pct.monthly_cash_flow),
                fmtDSCR(s.plus_1pct.dscr),
            ]);

        out.grokcard_tables.rate_sensitivity = {
            headers: ["Scenario", "Payment", "Cash Flow", "DSCR"],
            rows,
        };
    } else {
        if (out.grokcard_tables?.rate_sensitivity) delete out.grokcard_tables.rate_sensitivity;
    }


    // 6) Regenerate summary from computed baseline (prevents P&I hallucinations)
    const effRent = base.effectiveRent;
    const maint = base.operating;
    const pitia = base.PITIA;
    const mcf = base.monthlyCashFlow;
    const acf = base.annualCashFlow;
    const dscr = base.dscr;

    const lines: string[] = [];
    lines.push("Scenario inputs");
    lines.push(`- Purchase price: $${Math.round(inputs.price).toLocaleString()}`);
    lines.push(
        `- Down payment: ${round2(inputs.down_payment_pct)}% ($${Math.round(
            inputs.price * (inputs.down_payment_pct / 100)
        ).toLocaleString()})`
    );
    lines.push(`- Loan amount: $${Math.round(base.loanAmount).toLocaleString()}`);
    lines.push(`- Rent: $${Math.round(inputs.rent_monthly).toLocaleString()}/mo`);
    lines.push(`- Vacancy: ${round2(inputs.vacancy_pct)}%`);
    lines.push(`- Maintenance: ${round2(inputs.maintenance_pct)}% (annual assumption)`);
    lines.push(`- Property tax: ${round2(inputs.property_tax_pct)}% (annual assumption)`);
    lines.push(`- Insurance: ${round2(inputs.insurance_pct)}% (annual assumption)`);
    lines.push(
        `- Rate used: ${round2(rateUsed)}% (${out?.rate_context?.source || "market"}, ${out?.rate_context?.as_of || marketData?.date || "as of"
        })`
    );
    lines.push("");
    lines.push(`Computed baseline (term ${termYears}y)`);
    lines.push(`- Effective rent (after vacancy): $${effRent.toLocaleString()}/mo`);
    lines.push(`- P&I: $${base.monthlyPI.toLocaleString()}/mo`);
    lines.push(`- PITIA (P&I + tax + insurance): $${pitia.toLocaleString()}/mo`);
    lines.push(`- Maintenance (modeled): $${maint.toLocaleString()}/mo`);
    lines.push(`- Net cash flow: $${mcf.toLocaleString()}/mo (${acf.toLocaleString()}/yr)`);
    {
        const dscrLd = (base as any)?.dscrLoanDepot ?? null;
        const dscrEcon = (base as any)?.dscrEconomic ?? (base as any)?.dscr ?? null;

        const fmtDSCRLocal = (n: any) => {
            const x = typeof n === "number" ? n : Number(n);
            if (!Number.isFinite(x)) return "-";
            return `${x.toFixed(2)}x`;
        };

        lines.push(`- DSCR (gross rent ÷ PITIA): ${fmtDSCRLocal(dscrLd)}`);
        lines.push(`- DSCR-like (economic, effective rent ÷ PITIA): ${fmtDSCRLocal(dscrEcon)}`);

    }


    if (promptWantsStress) {
        const s = out.sensitivity_table;
        lines.push("");
        lines.push("Rate stress (monthly cash flow / DSCR)");
        if (s?.plus_0_5pct)
            lines.push(
                `- +0.5%: $${Number(s.plus_0_5pct.monthly_cash_flow).toLocaleString()}/mo, DSCR ${s.plus_0_5pct.dscr
                }x`
            );
        if (s?.plus_1pct)
            lines.push(
                `- +1.0%: $${Number(s.plus_1pct.monthly_cash_flow).toLocaleString()}/mo, DSCR ${s.plus_1pct.dscr
                }x`
            );
    }

    out.plain_english_summary = lines.join("\n");

    out.validation_warnings = warnings;
    return out;
}


function normalizeForGrokCard(result: any, message: string, marketData: any) {
    const out = { ...(result || {}) };

    // Always protect against negative payments being rendered as negative “payment”
    out.monthly_payment = safeAbsMoney(out.monthly_payment);

    // Decide if borrower requested rate comparison
    const includeRateSensitivity = wantsRateSensitivity(message);

    // If NOT explicitly requested, remove sensitivity_table entirely (even if model returns it)
    if (!includeRateSensitivity) {
        delete out.sensitivity_table;
    } else if (out.sensitivity_table && typeof out.sensitivity_table === "object") {
        // sanitize within sensitivity rows
        for (const key of Object.keys(out.sensitivity_table)) {
            const row = out.sensitivity_table[key];
            if (row && typeof row === "object" && "monthly_payment" in row) {
                row.monthly_payment = safeAbsMoney((row as any).monthly_payment);
            }
        }
    }

    // Rate provenance: add rate_context + prepend to summary
    // Trust Claude's rate if it already set one (from memory context)
    const claudeRate = Number(out?.scenario_inputs?.rate_used_pct);
    const userRate = detectUserProvidedRate(message);
    const rateUsed = (Number.isFinite(claudeRate) && claudeRate > 0)
        ? claudeRate
        : (userRate ?? marketData?.thirtyYearFixed ?? null);

    // Determine source: Claude (memory), user (current message), or FRED (fallback)
    let rateSource: string;
    if (Number.isFinite(claudeRate) && claudeRate > 0 && userRate == null) {
        rateSource = "user"; // From memory (user set it in previous question)
    } else if (userRate != null) {
        rateSource = "user"; // From current message
    } else {
        rateSource = "FRED"; // Fallback to market data
    }

    const rate_context = {
        rate_used: rateUsed,
        source: rateSource,
        as_of: marketData?.date ?? null,
        series: rateSource === "FRED" ? "MORTGAGE30US" : null,
    };
    out.rate_context = rate_context;
    // Inputs summary (borrower-visible + structured)
    // CRITICAL: Trust Claude's scenario_inputs (from memory), fill gaps with message extraction
    const claudeInputs = out.scenario_inputs || {};
    const extractedInputs = extractScenarioInputs(message);


    // Merge: Start with memory, override ONLY with non-zero new changes from message
    const mergedInputs = { ...claudeInputs }; // Start with ALL memory values

    // Only override if we extracted a meaningful value from the message
    // Don't let 0 or undefined overwrite existing values
    Object.keys(extractedInputs).forEach(key => {
        const newVal = extractedInputs[key];
        const oldVal = claudeInputs[key];

        // Override if:
        // 1. New value exists and is not undefined/null
        // 2. OR old value doesn't exist (new field)
        if (newVal !== undefined && newVal !== null) {
            // For percentage fields, 0 is valid if explicitly set
            // For other fields, only override if non-zero OR if old value was also 0
            if (newVal !== 0 || oldVal === undefined || oldVal === 0) {
                mergedInputs[key] = newVal;
            }
            // else: keep old value (don't override non-zero with 0)
        }
    });

    out.scenario_inputs = mergedInputs;
    const inputsBlock = buildInputsSummary(mergedInputs, rate_context);

    /* =========================
       Deterministic Scenario Math (single source of truth)
       ========================= */

    const fixedInputs = fixScenarioInputsBeforeMath(mergedInputs);

    const scenarioMathResult = runScenarioMath({
        scenario_inputs: fixedInputs,
        rate_used_pct: Number((rate_context as any)?.rate_used ?? (rate_context as any)?.rate),
    });

    // Only apply if math successfully ran
    if (scenarioMathResult) {
        // Canonical monthly P&I
        out.monthly_payment = scenarioMathResult.monthly_pi;

        // Canonical DSCR (LoanDepot = GROSS rent / PITIA)
        (out as any).dscr = scenarioMathResult.dscr_gross;

        // Canonical computed financials (single source of truth)
        (out as any).computed_financials = {
            ...(out as any).computed_financials,

            loan_amount: scenarioMathResult.loan_amount,
            rate_used_pct: scenarioMathResult.rate_used_pct,
            term_years: scenarioMathResult.term_years,

            monthly_pi: scenarioMathResult.monthly_pi,
            monthly_tax: scenarioMathResult.monthly_tax,
            monthly_ins: scenarioMathResult.monthly_ins,
            monthly_hoa: scenarioMathResult.monthly_hoa,

            monthly_pitia: scenarioMathResult.monthly_pitia,

            dscr_gross: scenarioMathResult.dscr_gross,
            dscr_economic: scenarioMathResult.dscr_economic,

            monthly_cash_flow: scenarioMathResult.monthly_cash_flow,
            annual_cash_flow: scenarioMathResult.annual_cash_flow,
        };

        // Flat cash flow table (keeps GrokCard plumbing intact)
        out.cash_flow_table = scenarioMathResult.cash_flow_table;
    }

    // Summary: ensure Inputs block appears first, then the model narrative (no duplication)
    const narrative =
        typeof out.plain_english_summary === "string" && out.plain_english_summary.trim()
            ? out.plain_english_summary.trim()
            : "";

    // If narrative already starts with "Scenario inputs", don't double-insert.
    if (narrative.toLowerCase().startsWith("scenario inputs")) {
        out.plain_english_summary = narrative;
    } else {
        out.plain_english_summary = narrative ? `${inputsBlock}\n\n${narrative}` : inputsBlock;
    }

    // =========================
    // Key Risks guardrail: prevent stale/LLM DSCR numbers leaking into UI
    // If Grok returns key_risks, sanitize DSCR mentions to match deterministic computed_financials.
    // =========================
    try {
        const cfKR = (out as any).computed_financials || {};
        const dscrGross = Number(cfKR.dscr_gross);
        const dscrEcon = Number(cfKR.dscr_economic);

        if (Array.isArray((out as any).key_risks)) {
            (out as any).key_risks = (out as any).key_risks.map((r: any) => {
                if (typeof r !== "string") return r;

                let rr = r;

                // Replace any "DSCR 0.99" / "DSCR 1.16" / "DSCR: 1.16x" with the current lender DSCR
                if (Number.isFinite(dscrGross)) {
                    rr = rr.replace(
                        /\bDSCR\b\s*[:=]?\s*\d+(?:\.\d+)?\s*x?\b/gi,
                        `DSCR ${dscrGross.toFixed(2)}x`
                    );
                }

                // Replace any "DSCR-like ..." or "Economic DSCR ..." numbers with current economic DSCR
                if (Number.isFinite(dscrEcon)) {
                    rr = rr.replace(
                        /\bDSCR-?like\b\s*[:=]?\s*\d+(?:\.\d+)?\s*x?\b/gi,
                        `DSCR-like ${dscrEcon.toFixed(2)}x`
                    );
                    rr = rr.replace(
                        /\bEconomic\s+DSCR\b\s*[:=]?\s*\d+(?:\.\d+)?\s*x?\b/gi,
                        `Economic DSCR ${dscrEcon.toFixed(2)}x`
                    );
                }

                return rr;
            });
        }
    } catch { }

    // GrokCard-friendly tables with short headers (prevents header overlap)
    const grokcard_tables: any = {};

    // ---- Amortization guardrail: force build when user asks ----
    const promptWantsAmortization =
        /\bamort\b|\bamortization\b|\bschedule\b|\bprincipal\b|\binterest\b|\bpayoff\b/i.test(message);

    // Deterministic helpers (NO try/catch, NO IIFE: keep brace balance stable)
    const pickNum = (obj: any, keys: string[], fallback: number) => {
        for (const k of keys) {
            const v = Number(obj?.[k]);
            if (Number.isFinite(v)) return v;
        }
        return fallback;
    };
    // Percent normalizers (domain-safe)
    // - For tax/ins/maint/vacancy: values like 0.5 mean 0.5% (NOT 50%)
    //   but values like 0.0125 mean 1.25% (fraction form).
    // - For down payment: 0.27 means 27%.
    // - For rate: 0.0625 means 6.25%.
    const pctDomain = (v: any) => {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) return 0;
        // Treat "tiny decimals" as fractions (0.0125 => 1.25%), but allow 0.5 => 0.5%
        return n > 0 && n < 0.2 ? n * 100 : n;
    };

    const pctDownPayment = (v: any) => {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) return 0;
        return n > 0 && n <= 1 ? n * 100 : n;
    };

    const pctRate = (v: any) => {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) return 0;
        return n > 0 && n <= 1 ? n * 100 : n;
    };



    // Standard fully-amortizing fixed-rate monthly P&I
    const calcMonthlyPI = (principal: number, ratePct: number, termYears: number) => {
        if (!Number.isFinite(principal) || principal <= 0) return NaN;
        const n = Math.max(1, Math.round((Number.isFinite(termYears) && termYears > 0 ? termYears : 30) * 12));
        const r = (Number.isFinite(ratePct) ? ratePct : 0) / 100 / 12;
        if (!Number.isFinite(r) || r <= 0) return principal / n;
        const pow = Math.pow(1 + r, n);
        return principal * (r * pow) / (pow - 1);
    };

    // Pull scenario inputs from extractedInputs (this is the correct scope)
    const si: any = extractedInputs || {};

    // --- Determine loan amount / rate / term with deterministic fallbacks ---
    const price = pickNum(si, ["purchase_price", "purchasePrice", "price", "property_value"], NaN);

    // Down payment can be % or $, try both
    const downPct = pctDownPayment(pickNum(si, ["down_payment_pct", "downPaymentPct", "down_pct"], NaN));
    const downAmt = pickNum(si, ["down_payment_amount", "downPayment", "down_amount"], NaN);

    const derivedLoanAmount =
        Number.isFinite(price) && price > 0
            ? Number.isFinite(downAmt)
                ? Math.max(0, price - downAmt)
                : Number.isFinite(downPct)
                    ? Math.max(0, price * (1 - downPct / 100))
                    : NaN
            : NaN;

    // IMPORTANT: keep your original raw variables shape so later code still works
    const loanAmtRaw =
        (out as any)?.baseline?.loanAmount ??
        (out as any)?.scenario_inputs?.loan_amount ??
        (out as any)?.scenario_inputs?.loanAmount ??
        (out as any)?.loan_amount ??
        (out as any)?.loanAmount ??
        (Number.isFinite(pickNum(si, ["loan_amount", "loanAmount"], NaN)) ? pickNum(si, ["loan_amount", "loanAmount"], NaN) : undefined) ??
        (Number.isFinite(derivedLoanAmount) ? derivedLoanAmount : undefined);

    const rateRaw =
        (out as any)?.rate_context?.rate ??
        (out as any)?.scenario_inputs?.rate ??
        (out as any)?.scenario_inputs?.rate_used ??
        (out as any)?.rate_used ??
        (out as any)?.rate ??
        (Number.isFinite(pickNum(si, ["rate_used", "rate", "interest_rate", "ratePct"], NaN))
            ? pickNum(si, ["rate_used", "rate", "interest_rate", "ratePct"], NaN)
            : undefined) ??
        (Number.isFinite((rate_context as any)?.rate) ? (rate_context as any).rate : undefined);

    const termYearsRaw =
        (out as any)?.scenario_inputs?.term_years ??
        (out as any)?.scenario_inputs?.termYears ??
        (Number.isFinite(pickNum(si, ["term_years", "termYears"], 30)) ? pickNum(si, ["term_years", "termYears"], 30) : 30) ??
        30;


    const loanAmt = Number(loanAmtRaw);
    const ratePct = Number(rateRaw);
    const termYears = Number(termYearsRaw);

    // Deterministic monthly P&I (source of truth)
    const monthlyPI = calcMonthlyPI(loanAmt, ratePct, termYears);

    // Set monthly_payment to deterministic P&I ONLY (this field is used everywhere)
    if (Number.isFinite(monthlyPI)) {
        out.monthly_payment = monthlyPI;
    }

    // Optional: store deterministic core values for later DSCR/cashflow code paths
    (out as any).computed_financials = {
        ...(out as any).computed_financials,
        loan_amount: Number.isFinite(loanAmt) ? loanAmt : null,
        rate_used_pct: Number.isFinite(ratePct) ? ratePct : null,
        term_years: Number.isFinite(termYears) ? termYears : 30,
        monthly_pi: Number.isFinite(monthlyPI) ? monthlyPI : null,
    };

    if (Number.isFinite(loanAmt) && loanAmt > 0 && Number.isFinite(ratePct) && ratePct > 0) {
        const buildAmortLocal = (loanAmount: number, aprPct: number, years: number) => {
            const yearsToShow = new Set([1, 2, 3, 4, 5, 10, 15, 20, 25, 30]);

            const r = aprPct / 100 / 12;
            const n = Math.round((Number.isFinite(years) && years > 0 ? years : 30) * 12);

            if (!Number.isFinite(r) || r <= 0 || !Number.isFinite(n) || n <= 0) return [];

            const pow = Math.pow(1 + r, n);
            const pmt = (loanAmount * r * pow) / (pow - 1);

            let bal = loanAmount;
            let cumPrin = 0;
            let cumInt = 0;

            const rows: any[] = [];

            for (let m = 1; m <= n; m++) {
                const interest = bal * r;
                let principal = pmt - interest;

                if (principal > bal) principal = bal;

                bal -= principal;
                cumPrin += principal;
                cumInt += interest;

                if (m % 12 === 0) {
                    const y = m / 12;
                    if (yearsToShow.has(y)) {
                        rows.push({
                            year: y,
                            principal_paid: Math.round(cumPrin),
                            interest_paid: Math.round(cumInt),
                            ending_balance: Math.max(Math.round(bal), 0),
                        });
                    }
                }
            }

            if (!rows.some((rr) => rr.year === 30)) {
                rows.push({
                    year: 30,
                    principal_paid: Math.round(cumPrin),
                    interest_paid: Math.round(cumInt),
                    ending_balance: 0,
                });
            }

            return rows;
        };

        out.amortization_summary = buildAmortLocal(loanAmt, ratePct, termYears);
    }
    // ---- end amortization guardrail ----


    /* =========================
       Deterministic Scenario Math (Single Source of Truth)
       - Do NOT derive payment from amortization (LLM-contaminated)
       - Compute P&I / PITIA / DSCR / Cash Flow from extracted inputs + rate_context
    ========================= */

    // NOTE: extractedInputs is already defined above and assigned to out.scenario_inputs
    const siDet: any = extractedInputs || {};
    // Trust scenario_inputs.rate_used_pct first (Claude's value), then rate_context, then FRED
    const rateUsedPct = Number(
        out?.scenario_inputs?.rate_used_pct ??
        out?.rate_context?.rate_used ??
        marketData?.thirtyYearFixed ??
        NaN
    );

    // Helpers
    const toPctDet = (v: any) => {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) return 0;
        return n > 0 && n < 1 ? n * 100 : n;
    };

    const termYearsDet =
        Number(siDet?.term_years) ||
        Number(siDet?.termYears) ||
        30;

    const priceDet = Number.isFinite(Number(siDet?.price)) ? Number(siDet.price) : NaN;
    const rawRentDet = Number.isFinite(Number(siDet?.rent_monthly))
        ? Number(siDet.rent_monthly)
        : NaN;

    // Normalize to MONTHLY rent (defensive against upstream annual bleed)
    const rentDet = Number.isFinite(rawRentDet)
        ? (rawRentDet > 20000 ? rawRentDet / 12 : rawRentDet)
        : NaN;
    if (Number.isFinite(rawRentDet) && rawRentDet > 20000) {
        (out as any)._diagnostics = (out as any)._diagnostics || [];
        (out as any)._diagnostics.push(
            `rent_monthly normalized (raw=${rawRentDet}, monthly=${rentDet})`
        );
    }



    const downPctDet = Number.isFinite(Number(siDet?.down_payment_pct))
        ? pctDownPayment(siDet.down_payment_pct)
        : NaN;


    // If loan amount was already explicitly provided somewhere, respect it, else derive.
    const explicitLoanDet =
        Number.isFinite(Number(siDet?.loan_amount)) ? Number(siDet.loan_amount) :
            Number.isFinite(Number((out as any)?.computed_financials?.loan_amount)) ? Number((out as any).computed_financials.loan_amount) :
                NaN;

    const loanAmountDet =
        Number.isFinite(explicitLoanDet) ? explicitLoanDet :
            (Number.isFinite(priceDet) && Number.isFinite(downPctDet))
                ? priceDet * (1 - (downPctDet / 100))
                : NaN;

    // Percent assumptions (canonical units)
    // RULE: keep *_pct as WHOLE percent (e.g. 1.25 means 1.25%), never decimal.
    // Convert to decimal exactly once at the math edge.

    const firstFinite = (...vals: any[]) => {
        for (const v of vals) {
            const n = Number(v);
            if (Number.isFinite(n)) return n;
        }
        return NaN;
    };

    // Pull from multiple possible keys to avoid silent 0s
    // (We’ve seen both property_tax_pct and property_tax_pct variants across paths)
    const vacancyPctDet = firstFinite(siDet?.vacancy_pct, (siDet as any)?.vacancyPct, (siDet as any)?.vacancy);
    const maintPctDet = firstFinite(siDet?.maintenance_pct, (siDet as any)?.maint_pct, (siDet as any)?.maintenancePct, (siDet as any)?.maintenance);
    const taxPctDet = firstFinite(
        siDet?.property_tax_pct,
        (siDet as any)?.property_tax,
        (siDet as any)?.tax_pct,
        (siDet as any)?.taxPct,
        (siDet as any)?.propertyTax,
        (siDet as any)?.propertyTaxPct
    );
    const insPctDet = firstFinite(siDet?.insurance_pct, (siDet as any)?.ins_pct, (siDet as any)?.insurancePct, (siDet as any)?.insurance);

    // Default any missing to 0 (whole percent)
    const vacancyPct = Number.isFinite(vacancyPctDet) ? vacancyPctDet : 0;
    const maintPct = Number.isFinite(maintPctDet) ? maintPctDet : 0;
    // Default property tax only when missing. If user explicitly provides 0, keep 0.
    const taxPct = Number.isFinite(taxPctDet) ? taxPctDet : 1.25;
    (siDet as any).property_tax_pct = taxPct;

    const insPct = Number.isFinite(insPctDet) ? insPctDet : 0;

    // HOA monthly (if you later extract it). For now default 0.
    const hoaMonthlyDet = Number.isFinite(Number(siDet?.hoa_monthly)) ? Number(siDet.hoa_monthly) : 0;

    // Deterministic P&I
    const calcMonthlyPI_Det = (principal: number, ratePct: number, years: number) => {
        if (!Number.isFinite(principal) || principal <= 0) return NaN;
        const n = Math.max(1, Math.round((Number.isFinite(years) && years > 0 ? years : 30) * 12));
        const r = (Number.isFinite(ratePct) ? ratePct : 0) / 100 / 12;
        if (!Number.isFinite(r) || r <= 0) return principal / n;
        const pow = Math.pow(1 + r, n);
        return principal * (r * pow) / (pow - 1);
    };

    const monthlyPI_Det =
        (Number.isFinite(loanAmountDet) && Number.isFinite(rateUsedPct) && rateUsedPct > 0)
            ? calcMonthlyPI_Det(loanAmountDet, rateUsedPct, termYearsDet)
            : NaN;

    if (Number.isFinite(monthlyPI_Det)) {
        out.monthly_payment = monthlyPI_Det; // canonical P&I number
    }

    // Monthly tax/ins based on purchase price
    // Validation targets:
    //  - taxPct=1.25, price=900000 => 937.50/mo
    //  - insPct=0.50, price=900000 => 375.00/mo
    const monthlyTaxDet =
        (Number.isFinite(priceDet) && taxPct > 0)
            ? (priceDet * (taxPct / 100)) / 12
            : 0;

    const monthlyInsDet =
        (Number.isFinite(priceDet) && insPct > 0)
            ? (priceDet * (insPct / 100)) / 12
            : 0;

    const pitiaDet =
        (Number.isFinite(monthlyPI_Det) ? monthlyPI_Det : 0) +
        monthlyTaxDet +
        monthlyInsDet +
        (Number.isFinite(hoaMonthlyDet) ? hoaMonthlyDet : 0);


    // DSCR (LoanDepot style): gross rent / PITIA
    const dscrGrossDet =
        (Number.isFinite(rentDet) && rentDet > 0 && pitiaDet > 0)
            ? rentDet / pitiaDet
            : null;

    // Cash flow (economic): effective rent after vacancy - PITIA - maintenance
    const effectiveRentDet =
        (Number.isFinite(rentDet) ? rentDet : 0) * (1 - (vacancyPctDet / 100));

    const monthlyMaintDet =
        (Number.isFinite(priceDet) && maintPctDet > 0)
            ? (priceDet * (maintPctDet / 100)) / 12
            : 0;

    const monthlyCashFlowDet =
        effectiveRentDet - pitiaDet - monthlyMaintDet;

    const annualCashFlowDet = monthlyCashFlowDet * 12;

    // Store deterministic computed values
    (out as any).computed_financials = {
        ...(out as any).computed_financials,
        loan_amount: Number.isFinite(loanAmountDet) ? loanAmountDet : null,
        rate_used_pct: Number.isFinite(rateUsedPct) ? rateUsedPct : null,
        term_years: termYearsDet,
        monthly_pi: Number.isFinite(monthlyPI_Det) ? monthlyPI_Det : null,
        monthly_tax: monthlyTaxDet,
        monthly_ins: monthlyInsDet,
        monthly_hoa: hoaMonthlyDet,
        monthly_pitia: pitiaDet,
        dscr_gross: dscrGrossDet,
        monthly_cash_flow: monthlyCashFlowDet,
        annual_cash_flow: annualCashFlowDet,
    };
    // =========================
    // CANONICAL OVERRIDE (single source of truth)
    // Force all downstream narrative + DSCR + tables to use computed_financials values.
    // This prevents any later “det math” variables from overwriting Grok’s correct numbers.
    // =========================
    {
        const cf = (out as any).computed_financials || {};

        const canonMonthlyPI = Number(cf.monthly_pi);
        const canonMonthlyTax = Number(cf.monthly_tax);
        const canonMonthlyIns = Number(cf.monthly_ins);
        const canonMonthlyHOA = Number(cf.monthly_hoa);
        const canonMonthlyPITIA = Number(cf.monthly_pitia);

        // 1) Monthly P&I: always use computed_financials.monthly_pi if valid
        if (Number.isFinite(canonMonthlyPI) && canonMonthlyPI > 0) {
            // Keep BOTH keys since different renderers reference different ones
            (out as any).monthly_payment = canonMonthlyPI;
            (out as any).monthly_pi = canonMonthlyPI;
        }

        // 2) Monthly PITIA: if provided, make it the canonical housing payment
        // (some code paths call it PITIA, others call it PITI)
        if (Number.isFinite(canonMonthlyPITIA) && canonMonthlyPITIA > 0) {
            (out as any).monthly_pitia = canonMonthlyPITIA;
            (out as any).monthly_piti = canonMonthlyPITIA;
        } else {
            // If PITIA wasn't provided, compute it from the canonical pieces (only when pieces are sane)
            const pitiaFallback =
                (Number.isFinite(canonMonthlyPI) ? canonMonthlyPI : 0) +
                (Number.isFinite(canonMonthlyTax) ? canonMonthlyTax : 0) +
                (Number.isFinite(canonMonthlyIns) ? canonMonthlyIns : 0) +
                (Number.isFinite(canonMonthlyHOA) ? canonMonthlyHOA : 0);

            if (pitiaFallback > 0) {
                (out as any).computed_financials.monthly_pitia = pitiaFallback;
                (out as any).monthly_pitia = pitiaFallback;
                (out as any).monthly_piti = pitiaFallback;
            }
        }

        // 3) DSCR: if your scenario output is using DSCR, recompute it deterministically from canonical values.
        // IMPORTANT: you previously wanted LoanDepot DSCR = GROSS rent / PITIA.
        const rentMonthly = Number((out as any)?.scenario_inputs?.rent_monthly);
        const pitia = Number((out as any)?.computed_financials?.monthly_pitia);

        if (Number.isFinite(rentMonthly) && rentMonthly > 0 && Number.isFinite(pitia) && pitia > 0) {
            // LoanDepot DSCR (gross)
            const dscrGross = rentMonthly / pitia;
            (out as any).dscr = dscrGross;
            (out as any).computed_financials.dscr_gross = dscrGross;
        }
    }

    // If you expose a top-level dscr field, make it the lender-style dscr
    if (dscrGrossDet !== null) (out as any).dscr = dscrGrossDet;

    // Build flat annual cash flow table (no growth assumptions)
    out.cash_flow_table = Array.from({ length: 30 }, (_, i) => ({
        year: i + 1,
        net_cash_flow: annualCashFlowDet,
    }));

    grokcard_tables.cash_flow = {
        headers: ["Yr", "Net CF"],
        rows: out.cash_flow_table.map((r: any) => [r.year, r.net_cash_flow]),
        unit: "annual",
    };

    // Amortization snapshot is already built deterministically above in your guardrail section.
    // Keep it, but do NOT back-drive payment from it.




    // Only build rate sensitivity table if borrower requested it AND sensitivity_table exists
    if (false && includeRateSensitivity && out.sensitivity_table && typeof out.sensitivity_table === "object") {
        const rows: any[] = [];
        const order = ["current_rate", "plus_0_5pct", "plus_1pct", "minus_0_5pct"];
        const keys = Array.from(new Set([...order, ...Object.keys(out.sensitivity_table)]));

        for (const k of keys) {
            const v: any = (out.sensitivity_table as any)[k];
            if (!v || typeof v !== "object") continue;

            const hasRateMetrics =
                isFiniteNumber(v.monthly_payment) || isFiniteNumber(v.monthly_cash_flow) || isFiniteNumber(v.dscr);
            if (!hasRateMetrics) continue;

            const label =
                k === "current_rate"
                    ? "Current Rate"
                    : k === "plus_0_5pct"
                        ? "+0.5%"
                        : k === "plus_1pct"
                            ? "+1.0%"
                            : k === "minus_0_5pct"
                                ? "-0.5%"
                                : k.replace(/_/g, " ");


            const fmtMoneyLocal = (n: any) => {
                const x = typeof n === "number" ? n : Number(n);
                if (!isFinite(x)) return null;
                const abs = Math.abs(x);
                const s = abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                return `$${s}`;
            };

            const fmtCFLocal = (n: any) => {
                const x = typeof n === "number" ? n : Number(n);
                if (!isFinite(x)) return null;
                const sign = x < 0 ? "-" : "";
                return `${sign}${fmtMoneyLocal(x)}`;
            };

            const fmtDSCRLocal = (n: any) => {
                const x = typeof n === "number" ? n : Number(n);
                if (!isFinite(x)) return null;
                return `${x.toFixed(2)}x`;
            };

            rows.push([
                label,
                fmtMoneyLocal(v.monthly_payment),
                fmtCFLocal(v.monthly_cash_flow),
                fmtDSCRLocal(v.dscr),
            ]);


        }
        // rate_sensitivity is built in postParseValidateScenario() (single source of truth)
        // Intentionally do not build it here to avoid raw-table overwrites.
        if (rows.length >= 2) {
            // no-op
        }

    }
    /* =========================
   P+I HARD LOCK (Phase 1)
   Canonicalize monthly P&I and force Smart Scenario text to match.
   Source of truth priority:
   1) out.computed_financials.monthly_pi
   2) grok.result.monthly_payment
   3) out.monthly_payment
========================= */
    try {
        const cf: any = (out as any).computed_financials || {};
        const grokMonthly = Number((out as any)?.grok?.result?.monthly_payment);
        const cfMonthly = Number(cf?.monthly_pi);
        const outMonthly = Number((out as any).monthly_payment);

        const canonicalPI =
            Number.isFinite(cfMonthly) && cfMonthly > 0
                ? cfMonthly
                : Number.isFinite(grokMonthly) && grokMonthly > 0
                    ? grokMonthly
                    : Number.isFinite(outMonthly) && outMonthly > 0
                        ? outMonthly
                        : null;

        if (canonicalPI !== null) {
            // Hard lock numeric fields
            (out as any).monthly_payment = canonicalPI;
            (out as any).computed_financials = {
                ...cf,
                monthly_pi: canonicalPI,
            };

            // Force Smart Scenario narrative to display the canonical number
            const fmtMoney = (n: number) =>
                n.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                });

            const piStr = fmtMoney(canonicalPI);

            const s = typeof (out as any).plain_english_summary === "string"
                ? (out as any).plain_english_summary
                : "";

            // Replace any "Monthly P&I: $X" or "Monthly P&I $X" occurrences
            const replaced = s.replace(
                /Monthly\s+P&I\s*[:=]?\s*\$[\d,]+(?:\.\d{1,2})?/gi,
                `Monthly P&I: ${piStr}`
            );

            // Also pin DSCR numbers in the narrative to the deterministic computed values
            // (Prevents Grok from inventing a DSCR like "0.99" in Key Risks.)
            let replaced2 = replaced;

            try {
                const cf2 = (out as any).computed_financials || {};
                const dscrLoanDepot = Number.isFinite(Number(cf2.dscr_loan_depot)) ? Number(cf2.dscr_loan_depot) : NaN;
                // Economic DSCR must be computed deterministically from rent/vacancy and monthly PITIA.
                // Do NOT trust cf2.dscr_economic (it can be wrong/stale).
                const rentM =
                    Number.isFinite(Number((out as any)?.scenario_inputs?.rent_monthly))
                        ? Number((out as any).scenario_inputs.rent_monthly)
                        : NaN;

                const vacPct =
                    Number.isFinite(Number((out as any)?.scenario_inputs?.vacancy_pct))
                        ? Number((out as any).scenario_inputs.vacancy_pct)
                        : NaN;

                const pitiaM =
                    Number.isFinite(Number(cf2.monthly_pitia))
                        ? Number(cf2.monthly_pitia)
                        : NaN;

                const effRentM =
                    Number.isFinite(rentM) && Number.isFinite(vacPct)
                        ? rentM * (1 - Math.max(0, Math.min(0.9, vacPct / 100)))
                        : NaN;

                const dscrEconomic =
                    Number.isFinite(effRentM) && Number.isFinite(pitiaM) && pitiaM > 0
                        ? effRentM / pitiaM
                        : NaN;

                // Format like "1.16x"
                const fmtX = (v: number) => `${v.toFixed(2)}x`;

                // Replace lender-style DSCR mentions with canonical lender DSCR
                // Keep it simple (no callback) to avoid TS/Next build issues.
                if (Number.isFinite(dscrLoanDepot)) {
                    replaced2 = replaced2.replace(
                        /\bDSCR(\s*\(.*?\))?\s*[:=]?\s*\d+(?:\.\d+)?\s*x?\b/gi,
                        `DSCR: ${fmtX(dscrLoanDepot)}`
                    );
                }
                if (Number.isFinite(dscrEconomic)) {
                    replaced2 = replaced2.replace(
                        /\bDSCR-?like(\s*\(.*?\))?\s*[:=]?\s*\d+(?:\.\d+)?\s*x?\b/gi,
                        `DSCR-like: ${fmtX(dscrEconomic)}`
                    );
                }


                // Replace "DSCR-like" / economic DSCR mentions
                if (Number.isFinite(dscrEconomic)) {
                    replaced2 = replaced2.replace(
                        /DSCR-?like(\s*\(.*?\))?\s*[:=]?\s*\d+(?:\.\d+)?\s*x?/gi,
                        `DSCR-like: ${fmtX(dscrEconomic)}`
                    );
                    replaced2 = replaced2.replace(
                        /Economic\s+DSCR(\s*\(.*?\))?\s*[:=]?\s*\d+(?:\.\d+)?\s*x?/gi,
                        `Economic DSCR: ${fmtX(dscrEconomic)}`
                    );
                }
            } catch { }

            (out as any).plain_english_summary = replaced2;
        }
    } catch { }
    // =========================
    // Key Risks: ALWAYS deterministic
    // Do NOT trust Grok key_risks (it may invent DSCR math and stale numbers)
    // =========================
    try {
        const cfKR = (out as any).computed_financials || {};

        const dscrLoanDepot =
            Number.isFinite(Number(cfKR.dscr_loan_depot)) ? Number(cfKR.dscr_loan_depot) :
                (Number.isFinite(Number(cfKR.dscr_gross)) ? Number(cfKR.dscr_gross) : NaN);

        // Economic DSCR must be computed deterministically from rent/vacancy and monthly PITIA.
        // Do NOT trust cfKR.dscr_economic (it can be wrong/stale).
        const rentM =
            Number.isFinite(Number((out as any)?.scenario_inputs?.rent_monthly))
                ? Number((out as any).scenario_inputs.rent_monthly)
                : NaN;

        const vacPct =
            Number.isFinite(Number((out as any)?.scenario_inputs?.vacancy_pct))
                ? Number((out as any).scenario_inputs.vacancy_pct)
                : NaN;

        const pitiaM =
            Number.isFinite(Number(cfKR.monthly_pitia))
                ? Number(cfKR.monthly_pitia)
                : NaN;

        const effRentM =
            Number.isFinite(rentM) && Number.isFinite(vacPct)
                ? rentM * (1 - Math.max(0, Math.min(0.9, vacPct / 100)))
                : NaN;

        const dscrEconomic =
            Number.isFinite(effRentM) && Number.isFinite(pitiaM) && pitiaM > 0
                ? effRentM / pitiaM
                : NaN;


        const monthlyCF =
            Number.isFinite(Number(cfKR.monthly_cash_flow)) ? Number(cfKR.monthly_cash_flow) : NaN;

        const fmtX = (v: number) => `${v.toFixed(2)}x`;
        const fmtMoney0 = (v: number) =>
            v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

        const risks: string[] = [];

        if (Number.isFinite(dscrLoanDepot)) {
            if (dscrLoanDepot < 1.0) {
                risks.push(`DSCR ${fmtX(dscrLoanDepot)} is below 1.00x. This is typically not eligible for DSCR financing without compensating factors.`);
            } else if (dscrLoanDepot < 1.2) {
                risks.push(`DSCR ${fmtX(dscrLoanDepot)} is tight. The deal is vulnerable to small rent declines or payment increases (tax, insurance, rate).`);
            } else {
                risks.push(`DSCR ${fmtX(dscrLoanDepot)} is healthy relative to common DSCR thresholds, but still sensitive to vacancy and expense shocks.`);
            }
        }

        if (Number.isFinite(dscrEconomic)) {
            risks.push(`Economic DSCR ${fmtX(dscrEconomic)} reflects vacancy-adjusted rent. If this trends near 1.00x, cash flow pressure is likely even if lender DSCR passes.`);
        }

        if (Number.isFinite(monthlyCF)) {
            const direction = monthlyCF >= 0 ? "positive" : "negative";
            risks.push(`Flat assumptions: cash flow is ${direction} at ${fmtMoney0(monthlyCF)}/mo with no modeled rent growth, capex, or reserve planning.`);
        } else {
            risks.push(`Flat assumptions: no rent/expense growth modeled; real-world vacancy, maintenance, and capex can exceed estimates.`);
        }

        (out as any).key_risks = risks;
    } catch { }


    // =========================
    // Cash Flow table: ALWAYS deterministic
    // Do NOT trust Grok cash_flow_table (it has been the source of repeated wild values)
    // =========================
    const cf = (out as any).computed_financials || {};
    const annualCF =
        Number.isFinite(Number(cf.annual_cash_flow)) ? Number(cf.annual_cash_flow) :
            (Number.isFinite(Number(cf.monthly_cash_flow)) ? Number(cf.monthly_cash_flow) * 12 : NaN);

    if (Number.isFinite(annualCF)) {
        const years = 30;
        const cfRows: any[] = [];
        for (let y = 1; y <= years; y++) cfRows.push([y, round2(annualCF)]);
        grokcard_tables.cash_flow = {
            headers: ["Yr", "Net CF"],
            rows: cfRows,
            unit: "annual",
        };

        // Also hard override any model-provided cash_flow_table so it can’t leak back in
        if (Array.isArray((out as any).cash_flow_table)) {
            (out as any).cash_flow_table = cfRows.map(([year, net]) => ({ year, net_cash_flow: net }));
        }
    }
    console.log("SCENARIO RESULT KEYS:", Object.keys((out as any).result || {}));
    console.log("HAS amortization_summary:", Array.isArray((out as any).amortization_summary), "len:", (out as any).amortization_summary?.length);
    console.log("HAS computed_financials:", Object.keys((out as any).computed_financials || {}));

    out.grokcard_tables = grokcard_tables;
    // =========================
    // Canonical amortization inputs (ALWAYS present)
    // Ensures UI can build amortization snapshot deterministically
    // =========================
    try {
        (out as any).scenario_inputs = (out as any).scenario_inputs || {};
        const si = (out as any).scenario_inputs;
        const cf = (out as any).computed_financials || {};

        const loanAmt =
            Number.isFinite(Number(si.loan_amount)) ? Number(si.loan_amount) :
                Number.isFinite(Number(cf.loan_amount)) ? Number(cf.loan_amount) :
                    Number.isFinite(Number((cf as any).loanAmount)) ? Number((cf as any).loanAmount) :
                        NaN;

        const rateUsedPct =
            Number.isFinite(Number(si.rate_used_pct)) ? Number(si.rate_used_pct) :
                Number.isFinite(Number(cf.rate_used_pct)) ? Number(cf.rate_used_pct) :
                    Number.isFinite(Number((cf as any).rate_used)) ? Number((cf as any).rate_used) :
                        NaN;

        const termYears =
            Number.isFinite(Number(si.term_years)) ? Number(si.term_years) :
                Number.isFinite(Number(cf.term_years)) ? Number(cf.term_years) :
                    30;

        if (Number.isFinite(loanAmt)) si.loan_amount = loanAmt;
        if (Number.isFinite(rateUsedPct)) si.rate_used_pct = rateUsedPct;
        if (Number.isFinite(termYears)) si.term_years = termYears;

        // Mirror into result wrapper if present
        if ((out as any).result && typeof (out as any).result === "object") {
            (out as any).result.scenario_inputs = (out as any).result.scenario_inputs || {};
            const rsi = (out as any).result.scenario_inputs;
            if (Number.isFinite(loanAmt)) rsi.loan_amount = loanAmt;
            if (Number.isFinite(rateUsedPct)) rsi.rate_used_pct = rateUsedPct;
            if (Number.isFinite(termYears)) rsi.term_years = termYears;
        }
    } catch { }

    return out;
}


/* =========================
   FRED market data (parallel, fast)
   AD-11 Seam 2: was its own direct FRED fetch; now reads the synced values
   from Market Data Service. Fallback notes only appear now if a series has
   genuinely never synced (cold start), not on every request as before.
========================= */
async function getCurrentMortgageData() {
    const today = new Date().toISOString().slice(0, 10);

    try {
        const snap = await getSnapshot(['MORTGAGE30US', 'DGS10']);
        const thirty = snap['MORTGAGE30US']?.value ?? null;
        const ten = snap['DGS10']?.value ?? null;

        let usedFallbacks = false;
        const notes: string[] = [];

        if (thirty == null) {
            usedFallbacks = true;
            notes.push("MORTGAGE30US not yet synced; defaulted to 6.27.");
        }
        if (ten == null) {
            usedFallbacks = true;
            notes.push("DGS10 not yet synced; defaulted to 4.16.");
        }

        return {
            date: today,
            thirtyYearFixed: thirty ?? 6.27,
            tenYearTreasury: ten ?? 4.16,
            usedFallbacks,
            fallbackNotes: notes,
        };
    } catch (err: any) {
        return {
            date: today,
            thirtyYearFixed: 6.27,
            tenYearTreasury: 4.16,
            usedFallbacks: true,
            fallbackNotes: [`Market Data Service error: ${err?.message || String(err)}`],
        };
    }
}

/* =========================
   xAI chat call
========================= */
async function callXaiJson(systemPrompt: string, userPrompt: string, maxTokens: number) {
    const XAI_API_KEY = process.env.XAI_API_KEY;
    const model = process.env.XAI_MODEL_SCENARIO || process.env.XAI_MODEL || "grok-4";

    if (!XAI_API_KEY) throw new Error("Missing XAI_API_KEY");

    const url = "https://api.x.ai/v1/chat/completions";
    const payload = {
        model,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
    };

    const res = await withTimeout(
        fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${XAI_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        }),
        15000,
        "xAI chat.completions"
    );

    if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`xAI HTTP ${res.status}: ${errText.slice(0, 400)}`);
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty content from xAI");

    try {
        return { model, raw: content, parsed: JSON.parse(content) };
    } catch {
        const salvaged = extractLikelyJsonObject(content);
        if (!salvaged) throw new Error("Model content was not valid JSON");
        return { model, raw: content, parsed: JSON.parse(salvaged) };
    }
}

/* =========================
   Route
========================= */
export async function POST(req: NextRequest) {
    // ===== Supabase (service-side client; used for memory + logging) =====
    const SUPABASE_URL =
        process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
    const SUPABASE_SERVICE_ROLE_KEY =
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

    const supabase =
        SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
            ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
                auth: { persistSession: false },
            })
            : null;

    const t0 = Date.now();
    const buildTag = "scenario-proof-04-04-26-v1";
    const requestId =
        (globalThis.crypto as any)?.randomUUID?.() || Math.random().toString(36).slice(2);

    let fred_ms = 0;
    let ai_ms = 0;
    let parse_ms = 0;
    let memoryThreadId: string | null = null;
    let provider: 'claude' | 'grok' | 'unknown' = 'unknown';  // ADD THIS LINE
    try {
        const body = (await req.json().catch(() => ({}))) as { message?: string; userId?: string };
        const message = (body?.message || "").trim();
        const userId = body?.userId;
        // ===== HR-MEMORY:THREAD-ID (server-authoritative by userId + chat_id) =====
        function isUuid(v: string) {
            return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
        }

        // Accept chat_id from body/header/query (client should persist per conversation)
        const chatIdRaw =
            (body as any)?.chat_id ||
            (body as any)?.chatId ||
            req.headers.get("x-chat-id") ||
            req.nextUrl.searchParams.get("chat_id") ||
            null;

        const clientMemoryThreadIdRaw =
            (body as any)?.memory_thread_id ||
            (body as any)?.memoryThreadId ||
            req.headers.get("x-memory-thread-id") ||
            req.nextUrl.searchParams.get("memory_thread_id") ||
            null;

        const chatIdFromClient =
            typeof chatIdRaw === "string" && isUuid(chatIdRaw) ? chatIdRaw : null;

        const clientMemoryThreadId =
            typeof clientMemoryThreadIdRaw === "string" && isUuid(clientMemoryThreadIdRaw)
                ? clientMemoryThreadIdRaw
                : null;

        // Ensure we always have a chat_id (server can mint one for backward compat)
        const chatId: string =
            chatIdFromClient ||
            (globalThis.crypto as any)?.randomUUID?.() ||
            Math.random().toString(36).slice(2);

        async function resolveOrCreateMemoryThreadId() {
            if (!supabase || !userId) {
                // No server DB client (or unauthenticated) -> best-effort fallback
                return clientMemoryThreadId || null;
            }

            // 1) Try to resolve mapping from chat_threads (server-authoritative)
            // Expected schema (Option 1):
            //   chat_threads: chat_id (uuid, pk), clerk_user_id (text), memory_thread_id (uuid), created_at (timestamptz)
            try {
                const { data: existing, error } = await supabase
                    .from("chat_threads")
                    .select("memory_thread_id")
                    .eq("clerk_user_id", userId)
                    .eq("chat_id", chatId)
                    .maybeSingle();

                if (!error && existing?.memory_thread_id && isUuid(existing.memory_thread_id)) {
                    return existing.memory_thread_id as string;
                }
            } catch {
                // If table doesn't exist yet, fall through to legacy behavior.
            }

            // 2) Choose a memory thread id:
            //    - Prefer client-provided memory_thread_id ONLY as a bootstrap (legacy clients).
            //    - Otherwise create a new memory_threads row.
            let id = clientMemoryThreadId;

            if (!id) {
                try {
                    const { data: created, error } = await supabase
                        .from("memory_threads")
                        .insert({ clerk_user_id: userId })
                        .select("id")
                        .single();

                    if (!error && created?.id && isUuid(created.id)) {
                        id = created.id as string;
                    }
                } catch (e: any) {
                    console.warn("SCENARIO: memory thread create failed", e?.message || e);
                }
            }

            // 3) Upsert mapping into chat_threads so future calls are deterministic
            if (id && isUuid(id)) {
                try {
                    await supabase
                        .from("chat_threads")
                        .upsert(
                            { chat_id: chatId, clerk_user_id: userId, memory_thread_id: id },
                            { onConflict: "chat_id" }
                        );
                } catch {
                    // If chat_threads doesn't exist yet, ignore (legacy fallback)
                }
            }

            return id || null;
        }

        memoryThreadId = await resolveOrCreateMemoryThreadId();
        // ===== /HR-MEMORY:THREAD-ID =====
        // =========================
        // MEMORY READ: latest scenario snapshot for this thread
        // =========================
        let lastScenarioSnapshot: any | null = null;

        try {
            if (supabase && memoryThreadId) {
                const { data } = await supabase
                    .from("memory_items")
                    .select("content_json, created_at")
                    .eq("memory_thread_id", memoryThreadId)
                    .eq("kind", "scenario_snapshot")
                    .order("created_at", { ascending: false })
                    .limit(1);

                if (Array.isArray(data) && data.length && (data[0] as any)?.content_json) {
                    lastScenarioSnapshot = (data[0] as any).content_json;
                }
            }
        } catch {
            // swallow — memory read must never break scenario
        }

        // Wrapper so ALL responses include memory_thread_id without editing every return block
        const respond = (json: any, init?: ResponseInit) => {
            const obj = (json && typeof json === "object") ? json : { data: json };

            // Force-stamp at the very end so nothing downstream can "replace" it
            const stamped = {
                ...obj,
                chat_id: chatId,
                memory_thread_id: memoryThreadId,
                meta: {
                    ...(obj.meta && typeof obj.meta === "object" ? obj.meta : {}),
                    chat_id: chatId,
                    memory_thread_id: memoryThreadId,
                },
            };

            return noStore(stamped, init);
        };



        if (!message) {
            return respond(
                { error: "Message is required" },
                { status: 400, headers: { "X-Hr-Build-Tag": buildTag, "X-Hr-Request-Id": requestId } }
            );
        }

        // ── SCENARIO COMPARISON CARD (intercept before AI) ───────────────────
        const _scenarioTool = isScenarioComparisonQuestion(message);
        console.log('[ScenarioRoute] msg=', JSON.stringify(message.slice(0, 80)), 'tool=', _scenarioTool);
        if (_scenarioTool) {
            const _scPriceM = message.match(/\$\s*([\d,]+(?:\.\d+)?)\s*[mM]\b/);
            const _scPriceK = message.match(/\$\s*([\d,]+(?:\.\d+)?)\s*[kK]\b/);
            const _scPricePl = message.match(/\$\s*([\d,]{5,})/);
            const _scPrice = _scPriceM ? parseFloat(_scPriceM[1].replace(/,/g, '')) * 1_000_000
                : _scPriceK ? parseFloat(_scPriceK[1].replace(/,/g, '')) * 1_000
                : _scPricePl ? parseFloat(_scPricePl[1].replace(/,/g, ''))
                : undefined;
            const _scRateM = message.match(/(\d+\.?\d*)\s*%/);
            const _scRate = _scRateM ? parseFloat(_scRateM[1]) : undefined;
            const _scRentM = message.match(/rent(?:ing)?\s*(?:is|at|of|for)?\s*\$?\s*([\d,]+)/i);
            const _scRent = _scRentM ? parseFloat(_scRentM[1].replace(/,/g, '')) : undefined;
            const _scCreditM = message.match(/(?:seller\s*credit|credit|concession)\s*(?:of|is)?\s*\$?\s*([\d,]+)/i);
            const _scCredit = _scCreditM ? parseFloat(_scCreditM[1].replace(/,/g, '')) : undefined;
            const compCard = buildScenarioComparisonCard({
                tool: _scenarioTool,
                price: _scPrice,
                rate: _scRate && _scRate >= 3 && _scRate <= 12 ? _scRate : undefined,
                rent: _scRent,
                credit: _scCredit,
            });
            return respond({
                success: true,
                path: 'scenario_comparison',
                grok: {
                    answer: compCard.answer,
                    next_step: compCard.next_step,
                    follow_up: compCard.follow_up,
                    follow_up_chips: compCard.follow_up_chips,
                    confidence: compCard.confidence,
                    scenarioComparisonCard: compCard.scenarioComparisonCard,
                },
            });
        }

        // [deep-analysis] seeds never reach this route — they go to /api/answers (same as comparison cards)
        const aiMessage = message;

        // 1) FRED
        const tFred = Date.now();
        const marketData = await getCurrentMortgageData();
        fred_ms = Date.now() - tFred;

        // 2) System prompt (sensitivity OPTIONAL + only if borrower asks)
        // ===== MORTGAGE CALCULATOR PRE-CALCULATION =====
        let mortgageCalcContext = "";

        if (needsMortgageCalculation(aiMessage)) {
            const params = extractScenarioMortgageParams(message, marketData);

            if (params && params.price) {
                try {
                    console.log('[Scenario Calc] Detected question, calling calculator with:', params);

                    // Import calculator
                    const { calculateMortgage } = await import('../../../../lib/mortgageCalculator');

                    // Calculate
                    const result = calculateMortgage({
                        price: params.price,
                        downPaymentPct: params.downPaymentPct!,
                        rate: params.rate!,
                        termYears: params.termYears!,
                    });

                    // Build context
                    mortgageCalcContext = `
PRE-CALCULATED MORTGAGE VALUES (USE THESE EXACTLY):
- Loan Amount: ${result.loanAmount}
- Monthly P&I: ${result.monthlyPI.toFixed(2)} (use this exact value)
- Total Interest Over Term: ${Math.round(result.totalInterest)}
- Total Payments: ${Math.round(result.totalPayments)}
- Number of Payments: ${result.numberOfPayments}

CRITICAL: Use these EXACT values in your JSON response:
  "monthly_payment": ${result.monthlyPI},
  "total_interest_over_term": ${Math.round(result.totalInterest)},

Do NOT recalculate. These are verified using industry-standard formulas.
`;

                    console.log('[Scenario Calc] Pre-calculated:', {
                        monthlyPI: result.monthlyPI,
                        totalInterest: result.totalInterest
                    });

                } catch (err: any) {
                    console.error('[Scenario Calc] Error:', err.message);
                }
            }
        }
        // ===== END MORTGAGE CALCULATOR =====

        // 2) System prompt (sensitivity OPTIONAL + only if borrower asks)

        let systemPrompt = compactWhitespace(`
You are HomeRates.AI Smart Scenario Engine.

OUTPUT RULES (hard):
- Return ONLY valid JSON (no markdown, no backticks, no commentary).
- Output MUST match the schema below. Do not add extra keys. Do not omit required keys.
- All money fields must be numbers (no "$" in JSON). Put any "$" formatting only inside plain_english_summary.
- Never output a negative value for "monthly_payment". If showing savings, show it in the summary, not as a negative payment.

MATH DEFINITIONS (hard):
- "monthly_payment" MUST mean MONTHLY P&I ONLY (principal + interest). It is NOT PITIA.
- Use standard fully-amortizing fixed-rate mortgage formula:
  M = P * [ r * (1+r)^n ] / [ (1+r)^n - 1 ]
  Where:
  - P = loan amount
  - r = (annual_rate_percent / 100) / 12
  - n = term_years * 12  (default term_years = 30 unless explicitly provided)
- total_interest_over_term MUST be (monthly_payment * n) - P (rounded reasonably).
- amortization_summary MUST be consistent with the same mortgage math (no alternate payment calculators).

${mortgageCalcContext}

ASSUMPTIONS (hard):

ASSUMPTIONS (hard):
- Use the user-provided rate if explicitly stated in the user prompt.
- Only use live FRED 30-year rate if the user did NOT provide a rate.
- If taxes/insurance/maintenance/vacancy are not provided by the user, treat them as 0 for calculation BUT explicitly state "not provided" in plain_english_summary.
- Do NOT invent rent growth, expense growth, refinancing, or any changing cash flow assumptions unless the user explicitly provides growth assumptions.
- cash_flow_table MUST be flat annual net cash flow values (same number each year) unless user explicitly provides growth assumptions. If no growth assumptions are provided, all years MUST match.

CONTENT RULES (hard):
- Always include a "plain_english_summary" that restates the scenario inputs:
  price/balance, down payment %, loan amount, rent, vacancy, taxes, insurance, maintenance, rate used, rate source, and as-of date.
- Keep table headers short.

COMPARISON FORMATTING (hard):
- When comparing multiple scenarios (e.g., "25% down vs 30% down", "FHA vs Conventional"), format plain_english_summary with clear structure using markdown:
  
  **Scenario 1: [Name]**
  - Purchase price: $X
  - Down payment: $Y (Z%)
  - Loan amount: $A
  - Monthly P&I: $B
  - Monthly expenses: [list]
  - Cash flow: $C
  - DSCR: X.XXx
  
  **Scenario 2: [Name]**
  - [Same format]
  
  **Comparison:**
  [Brief summary of key differences and recommendation]

- Use bullet points for clarity
- Bold the scenario headers
- End with a brief comparison summary

SENSITIVITY RULE (hard):
- Do NOT include "sensitivity_table" unless the user explicitly asks for rate comparison or stress testing
  (examples: "+0.5%", "+1%", "-0.5%", "rate stress", "what if rates rise/fall", "compare rates").
Date: ${marketData?.date || 'N/A'}
Live data:
- 30-year fixed (FRED MORTGAGE30US): ${typeof marketData?.thirtyYearFixed === 'number' ? marketData.thirtyYearFixed.toFixed(2) : 'N/A'}%
- 10-year Treasury (FRED DGS10): ${typeof marketData?.tenYearTreasury === 'number' ? marketData.tenYearTreasury.toFixed(2) : 'N/A'}%

Schema:
{
  "scenario_inputs": {
    "price": number,
    "down_payment_pct": number,
    "loan_amount": number,
    "rate_used_pct": number,
    "term_years": number,
    "property_tax_pct": number,
    "rent_monthly": number,
    "maintenance_pct": number,
    "vacancy_pct": number,
    "insurance_pct": number,
    "hoa_monthly": number
  },
  
  "monthly_payment": number,
  "total_interest_over_term": number,
  "amortization_summary": [{ "year": number, "principal_paid": number, "interest_paid": number, "ending_balance": number }],
  "cash_flow_table": [{ "year": number, "net_cash_flow": number }],
  "plain_english_summary": string,
  "key_risks": ["string", "string"],

  "sensitivity_table": {
    "current_rate": { "monthly_payment": number, "monthly_cash_flow": number, "dscr": number },
    "plus_0_5pct": { "monthly_payment": number, "monthly_cash_flow": number, "dscr": number },
    "plus_1pct": { "monthly_payment": number, "monthly_cash_flow": number, "dscr": number },
    "minus_0_5pct": { "monthly_payment": number, "monthly_cash_flow": number, "dscr": number }
  }
}

MEMORY RULES (for follow-up questions):
- When user asks "what if X changes", you MUST output ALL scenario_inputs fields in your response
- Copy forward all fields from prior context that user did NOT explicitly change
- Only update the specific field(s) the user mentions changing
- Example: If user says "what if down payment is 25%" but prior scenario had rent_monthly=5000:
  You MUST include both "down_payment_pct": 25 AND "rent_monthly": 5000 in your scenario_inputs output
- Fields to always include if they were in prior context: rent_monthly, maintenance_pct, vacancy_pct, insurance_pct, hoa_monthly, property_tax_pct
- If a field was NOT in prior context and user does not mention it, you may omit it or set to 0  
`);


        // 3) AI Provider (Claude or Grok via intelligent routing)
        const tAI = Date.now();
        const maxTokens = 4096;  // Let Claude use what it needs
        // =========================
        // MEMORY: Fetch conversation history for follow-ups
        // =========================
        let memoryHistory: any[] = [];

        // DEBUG: Log memory thread info
        console.log('[Memory Debug] memoryThreadId:', memoryThreadId);
        console.log('[Memory Debug] userId:', userId);
        console.log('[Memory Debug] supabase exists:', !!supabase);

        if (supabase && memoryThreadId) {
            memoryHistory = await getRecentScenarioHistory(supabase, memoryThreadId, 5);
            console.log('[Memory] Retrieved', memoryHistory.length, 'previous scenarios');

            // DEBUG: If no scenarios found, check database directly
            if (memoryHistory.length === 0) {
                const { data: dbCheck, error: dbError } = await supabase
                    .from('memory_items')
                    .select('id, kind, created_at')
                    .eq('memory_thread_id', memoryThreadId)
                    .eq('kind', 'scenario_snapshot');

                console.log('[Memory Debug] Direct DB check - scenarios in this thread:', dbCheck?.length || 0);
                if (dbError) console.log('[Memory Debug] DB Error:', dbError.message);
            } else {
                console.log('[Memory Debug] Most recent scenario price:', memoryHistory[0]?.scenario_inputs?.price);
                console.log('[Memory Debug] Most recent scenario FULL:', JSON.stringify(memoryHistory[0]?.scenario_inputs));  // ← ADD THIS
                console.log('[Memory Debug] Most recent scenario maintenance_pct:', memoryHistory[0]?.scenario_inputs?.maintenance_pct);  // ← ADD THIS
                console.log('[Memory Debug] Most recent scenario rent_monthly:', memoryHistory[0]?.scenario_inputs?.rent_monthly);  // ← ADD THIS

            }
        }



        // ============================================================
        // REFI INTERCEPT v2 — full smart advisor, catches before scenario math
        // Detect if last memory snapshot was a refi
        const lastWasRefi = memoryHistory?.[0]?.scenario_inputs?.refi_type != null ||
            memoryHistory?.[0]?.scenario_inputs?.current_rate_pct != null;

        const isRefiQ = (q: string): boolean => {
            const t = q.toLowerCase();
            if (/\b(?:refinanc|refi\b)/.test(t)) return true;
            if (/(?:current rate|my rate)/.test(t) && /(?:rates?\s+(?:go|drop|hit|reach)|to\s+\d+\.?\d*%)/.test(t)) return true;
            if (/(?:save|saving).{0,30}(?:refi|refinanc)/i.test(q)) return true;
            if (/(?:cash.?out|arm.*reset|fha.*conventional|remove\s*mip)/.test(t)) return true;
            // Context-aware: follow-up on a prior refi session
            if (lastWasRefi && /(?:what about|what if|show me|compare|now vs|wait|trigger|breakeven|20.?year|15.?year|shorten|no.?cost|lender credit|extra pay|principal pay)/i.test(q)) return true;
            return false;
        };

        if (isRefiQ(message)) {
            // Pull stored refi context from memory for follow-up questions
            const memRefi = lastWasRefi ? memoryHistory[0]?.scenario_inputs : null;
            // SMART REFI ADVISOR v2 — AI-powered decision engine
            // Not a calculator. A verdict.
            // ============================================================

            // ── Math helpers ──
            const mpi = (p: number, r: number, n: number): number => {
                const mr = (r / 100) / 12;
                if (n <= 0 || p <= 0) return 0;
                if (mr === 0) return p / n;
                const pw = Math.pow(1 + mr, n);
                return p * (mr * pw) / (pw - 1);
            };

            const remainBal = (origBal: number, rPct: number, totalMo: number, paidMo: number): number => {
                const r = (rPct / 100) / 12;
                if (r === 0) return origBal * (1 - paidMo / totalMo);
                const pw = Math.pow(1 + r, totalMo);
                const pwp = Math.pow(1 + r, paidMo);
                const pmt = origBal * (r * pw) / (pw - 1);
                return pmt * (pw - pwp) / (r * pw);
            };

            // What rate achieves a target breakeven (binary search)
            const triggerRate = (bal: number, curRatePct: number, costs: number, targetBeYears: number, moLeft: number): number | null => {
                const curPmt = mpi(bal, curRatePct, moLeft);
                for (let r10 = Math.floor(curRatePct * 10) - 1; r10 >= 15; r10--) {
                    const r = r10 / 10;
                    const newPmt = mpi(bal, r, moLeft);
                    const save = curPmt - newPmt;
                    if (save > 0 && costs / save <= targetBeYears * 12) return r;
                }
                return null;
            };

            const f$ = (n: number) => `$${Math.round(n).toLocaleString()}`;
            const fD = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            const fPct = (n: number) => `${n.toFixed(2)}%`;

            // ── Parse inputs ──
            const qFull = message;

            // Balance — handles $1,280,000 / $1.28M / $580k / on my $X
            const balM =
                qFull.match(/\$\s*([\d,]+(?:,\d{3})+)/i) ??
                qFull.match(/\$\s*(\d+(?:\.\d+)?)\s*[Mm]\b/) ??
                qFull.match(/\bon\s+(?:my\s+)?\$\s*(\d+(?:\.\d+)?)\s*k?\b/i) ??
                qFull.match(/\$\s*(\d+(?:\.\d+)?)\s*k\b/i);
            let balance: number | null = null;
            if (balM) {
                const raw = balM[1].replace(/,/g, '');
                const n = parseFloat(raw);
                if (isFinite(n)) {
                    const mSuf = /\$\s*\d+(?:\.\d+)?\s*[Mm]\b/.test(qFull);
                    const kSuf = /\$\s*\d+(?:\.\d+)?\s*k\b/i.test(balM[0]);
                    balance = mSuf ? n * 1_000_000 : kSuf ? n * 1000 : n;
                }
            }
            // Memory fallback — pull balance from prior refi snapshot if not in message
            if (!balance && memRefi?.loan_amount) balance = memRefi.loan_amount;

            // Current rate — handles "current rate is 6.5%" / "at 6.5%" / "6.5% rate"
            const curRM =
                qFull.match(/\b(?:current\s*rate|my\s*rate)\b\s*(?:is\s+)?(\d+\.?\d*)\s*%/i) ??
                qFull.match(/\bat\s+(\d+\.?\d*)\s*%/i) ??
                qFull.match(/(\d+\.?\d*)\s*%\s*(?:rate|interest|on\s*my|current)/i) ??
                (() => {
                    const all = [...qFull.matchAll(/(\d+\.?\d*)\s*%/g)].map(m => parseFloat(m[1])).filter(r => r > 1 && r < 20);
                    return all.length >= 1 ? { 1: String(all[0]) } as any : null;
                })();
            let currentRate = curRM ? parseFloat(curRM[1]) : null;
            if (!currentRate && memRefi?.current_rate_pct) currentRate = memRefi.current_rate_pct;

            // New/target rate
            const newRM =
                qFull.match(/\b(?:refi(?:nance)?\s+(?:to|at|when)|new\s*rate)\s+(\d+\.?\d*)\s*%/i) ??
                qFull.match(/(?:go\s+(?:down\s+)?to|drop\s+to|hit|reach|down\s+to)\s*(\d+\.?\d*)\s*%/i) ??
                qFull.match(/when.*?rates?.*?(?:go|drop|hit|reach|become|are).*?(?:to|at)?\s*(\d+\.?\d*)\s*%/i) ??
                (() => {
                    const all = [...qFull.matchAll(/(\d+\.?\d*)\s*%/g)].map(m => parseFloat(m[1])).filter(r => r > 1 && r < 20);
                    return all.length >= 2 ? { 1: String(all[all.length - 1]) } as any : null;
                })();
            let newRate = newRM ? parseFloat((newRM as any)[1]) : null;
            // Fall back to stored offered rate from memory (so follow-ups like "what if 5 years"
            // keep the original offered rate rather than defaulting to market rate)
            if (!newRate && memRefi?.rate_used_pct) newRate = memRefi.rate_used_pct;

            // Years info
            const ylM = qFull.match(/(\d+)\s*(?:years?|yrs?)\s*(?:left|remaining|to\s*go)/i);
            const yiM = qFull.match(/(\d+)\s*years?\s*(?:in|into|ago)/i) ??
                qFull.match(/(?:bought|purchased|got\s*(?:the\s*)?loan)\s*(\d+)\s*years?\s*ago/i);
            const yearsLeft = ylM ? parseInt(ylM[1]) : null;
            const yearsIn = yiM ? parseInt(yiM[1]) : null;
            const monthsLeft = yearsLeft ? yearsLeft * 12 : yearsIn ? (30 - yearsIn) * 12 : 360;

            // Closing costs, home value, loan type signals
            const costsM = qFull.match(/\b(?:costs?|closing\s*costs?|fees?)\s*\$?\s*([\d,]+)/i);
            const closingCosts = costsM ? parseFloat(costsM[1].replace(/,/g, '')) : null;

            const homeValM = qFull.match(/(?:home|house|property|value|worth)\s+(?:is\s+|worth\s+)?\$?\s*([\d,]+)\s*k?\b/i);
            const homeValue = homeValM ? parseFloat(homeValM[1].replace(/,/g, '')) * (homeValM[1].length <= 4 ? 1000 : 1) : null;

            // Refi TYPE detection
            const qLow = qFull.toLowerCase();
            const isCashOut = /cash.?out|pull\s*(?:out|equity)|access\s*equity|take\s*out\s*\$/.test(qLow);
            const isFHAtoConv = /fha.{0,20}(?:conventional|conv)|remove\s*mip|drop\s*mip|get\s*rid.*mip/.test(qLow);
            const isARMtoFixed = /\b(?:arm|5\/1|7\/1|10\/1|adjustable|reset|fixed\s*rate\s*(?:security|peace))\b/.test(qLow);
            const isRateWatch = /tell\s*me\s*when|rate\s*alert|when\s+(?:should|to)\s+refi|trigger\s+rate|watch\s+for/.test(qLow);
            const isStreamline = /streamline|irrrl|va\s*refi|fha\s*streamline/.test(qLow);
            const isShorten = /(?:shorten|shorter|20.?year|15.?year|pay\s*off\s*(?:faster|sooner)|reduce\s*term)/.test(qLow);

            const refiType = isCashOut ? "cash_out" : isFHAtoConv ? "fha_to_conv" : isARMtoFixed ? "arm_to_fixed" : isStreamline ? "streamline" : "rate_term";

            // Live FRED market data
            const marketRate = marketData?.thirtyYearFixed ?? null;
            const fredAsOf = marketData?.date ?? new Date().toISOString().slice(0, 10);

            // ── If missing key inputs — smart ask with context ──
            if (!balance || !currentRate) {
                const marketNote = marketRate
                    ? `\n\n> 📡 **Today's market rate: ${fPct(marketRate)}** (FRED, live ${fredAsOf})`
                    : '';

                const contextChips = isFHAtoConv
                    ? [
                        { label: "FHA→conventional to kill MIP — show me the math", seed: "I have an FHA loan at 6.5% on a $450k home — is it worth refinancing to conventional to remove MIP?" },
                        { label: "How much equity do I need to remove MIP?", seed: "How much equity do I need to refinance FHA to conventional and remove MIP?" },
                        { label: "FHA→conventional at same rate — is it worth it?", seed: "Would it make sense to refi FHA to conventional at the same rate just to remove MIP on my $500k loan?" },
                    ]
                    : isARMtoFixed
                        ? [
                            { label: "ARM reset worst-case — show me the numbers", seed: "My 7/1 ARM is resetting — what's my worst-case payment if rates stay at 6.5%?" },
                            { label: "Lock to fixed now vs ride out the ARM", seed: "Should I lock my 5/1 ARM at 6% to a 30yr fixed at 5.99%, or ride it out?" },
                            { label: "ARM cap protection — what rate am I exposed to?", seed: "My ARM has a 2/2/5 cap structure at 4.5% start rate — what's my max payment exposure?" },
                        ]
                        : [
                            { label: "Tell me when a refi makes sense — what's my trigger rate?", seed: `What rate would I need to see to make a refi worth it on my $650,000 mortgage at ${currentRate ?? 6.5}%?` },
                            { label: "Refi now vs wait for a better rate — show the math", seed: "I have a $780k balance at 6.75% — compare refinancing to 5.99% now vs waiting for 5.5%" },
                            { label: "Should I make extra payments instead of refinancing?", seed: "I have a $500k balance at 6.5% — compare refinancing to 5.5% vs making extra principal payments" },
                        ];

                const askMsg = `## 🏦 Refi Advisor — What's Your Situation?${marketNote}

To give you a real verdict (not just math), I need:

- **Current loan balance** (e.g. $650,000)
- **Your current interest rate** (e.g. 6.5%)
- **Target rate or timeframe** you're considering

**Optional but powerful:**
- How many years you've been in the loan (affects amortization reset analysis)
- Home value (needed for cash-out or FHA→conventional analysis)
- How long you plan to stay

**Example:** *"Balance $780k at 6.75%, want to refi to 5.99%, bought 3 years ago, plan to stay 7 more years"*`;

                return noStore({
                    ok: true, memory_thread_id: memoryThreadId, route: "answers",
                    grok: { answer: askMsg, follow_up: contextChips[0].label, follow_up_chips: contextChips, confidence: "needs_input" },
                    debug: { bypass: "refi_needs_input", refiType, parsed: { balance, currentRate, newRate, monthsLeft } },
                    message: askMsg, answerMarkdown: buildAnswerMarkdown(askMsg),
                    followUp: contextChips[0].label, follow_up_chips: contextChips,
                });
            }

            // ── FULL CALCULATION ENGINE ──
            const effNewRate = newRate ?? marketRate ?? (currentRate - 0.5);
            const effCosts = closingCosts ?? balance * 0.02;
            const amortReset = yearsIn && yearsIn >= 10; // warn if resetting significant amortization

            // Core payments
            const curPI = mpi(balance, currentRate, monthsLeft);
            const newPI = mpi(balance, effNewRate, monthsLeft);
            const save = curPI - newPI;
            const annSav = save * 12;
            const beM = save > 0 ? effCosts / save : null;
            const beYrs = beM ? beM / 12 : null;

            // Total interest comparison (remaining term)
            const totIntCur = (curPI * monthsLeft) - balance;
            const totIntNew = (newPI * monthsLeft) - balance;
            const lifeSave = totIntCur - totIntNew - effCosts;

            // Amortization reset cost — what they pay extra in interest by restarting 30yr
            let resetPenalty = 0;
            let resetWarning = "";
            if (yearsIn && yearsIn >= 5) {
                const moLeft20 = Math.max(monthsLeft, 0);
                const totalIf30yr = newPI * 360;
                const totalIfRemaining = curPI * monthsLeft;
                resetPenalty = totalIf30yr - totalIfRemaining;
                if (resetPenalty > 0 && yearsIn >= 10) {
                    resetWarning = `\n> ⚠️ **Amortization reset penalty:** You're **${yearsIn} years in** — refinancing to a new 30yr restarts your clock. You'd pay an extra **${f$(resetPenalty)}** in total interest vs finishing your current loan. Consider a 20yr or 15yr refi instead.`;
                }
            }

            // Trigger rates (what rate achieves X-year breakeven)
            const trig2yr = triggerRate(balance, currentRate, effCosts, 2, monthsLeft);
            const trig3yr = triggerRate(balance, currentRate, effCosts, 3, monthsLeft);
            const trig5yr = triggerRate(balance, currentRate, effCosts, 5, monthsLeft);

            // Wait scenarios — anchor below currentRate (not effNewRate)
            // When market > current (Hold verdict), effNewRate > currentRate so
            // wait rows must anchor to currentRate to show meaningful savings
            const waitAnchor = Math.min(currentRate, effNewRate);
            const wr1 = Math.max(waitAnchor - 0.5, 2.0);
            const wr2 = Math.max(waitAnchor - 1.0, 2.0);
            const piW1 = mpi(balance, wr1, monthsLeft);
            const piW2 = mpi(balance, wr2, monthsLeft);
            const svW1 = curPI - piW1;
            const svW2 = curPI - piW2;
            const beW1 = svW1 > 0 ? effCosts / svW1 : null;
            const beW2 = svW2 > 0 ? effCosts / svW2 : null;
            const extraMoW1 = svW1 - save;
            const moToRecoverW1 = extraMoW1 > 0 ? Math.ceil(save / extraMoW1) : 999;

            // Shorten to 20yr
            const pi20 = mpi(balance, effNewRate, 240);
            const int20 = (pi20 * 240) - balance;
            const int20saved = totIntNew - int20;

            // Net savings milestones
            const net5 = (save * 60) - effCosts;
            const net10 = (save * 120) - effCosts;

            // FHA MIP context
            let mipNote = "";
            if (isFHAtoConv) {
                const estMIP = balance * 0.0055 / 12;
                mipNote = `\n\n---\n\n## 🎯 FHA → Conventional: The Real Play\n\nAt ${fPct(effNewRate)}, this isn't just about the rate — it's about **permanently eliminating MIP**.\n\n| | FHA (current) | Conventional (refi) |\n|--|--|--|\n| Rate | ${fPct(currentRate)} | ${fPct(effNewRate)} |\n| Monthly MIP | ~${f$(estMIP)}/mo | ❌ Gone |\n| PMI at 20% equity | — | Auto-cancels |\n| Combined savings | — | **${f$(save + estMIP)}/mo** |\n\n> ✅ Even if the rate savings alone are marginal, **MIP removal saves ~${f$(estMIP * 12)}/yr forever**. This changes the calculus entirely — a breakeven that looks like 6 years becomes 3 years when you factor in MIP.`;
            }

            // ARM context
            let armNote = "";
            if (isARMtoFixed) {
                const armResetRaw = qFull.match(/(\d+)\/(\d+)\s*arm/i);
                const fixedYrs = armResetRaw ? parseInt(armResetRaw[1]) : 5;
                const adjCap = currentRate + 2; // typical 2% periodic cap
                const lifeCap = currentRate + 5; // typical 5% lifetime cap
                const piWorstCase = mpi(balance, lifeCap, monthsLeft);
                armNote = `\n\n---\n\n## ⚠️ ARM Reset Risk\n\nWith a ${fixedYrs}/1 ARM, your rate adjusts annually after year ${fixedYrs}. **Worst case at caps:**\n\n| Scenario | Rate | Monthly P&I |\n|--|--|--|\n| Today (fixed period) | ${fPct(currentRate)} | ${fD(curPI)} |\n| First reset (+2% cap) | ${fPct(adjCap)} | ${fD(mpi(balance, adjCap, monthsLeft))} |\n| Lifetime cap (+5%) | ${fPct(lifeCap)} | ${fD(piWorstCase)} |\n| **Fixed at ${fPct(effNewRate)}** | **${fPct(effNewRate)}** | **${fD(newPI)}** |\n\n> 🔒 Locking to a fixed rate at ${fPct(effNewRate)} costs you ${f$(newPI - curPI > 0 ? newPI - curPI : 0)}/mo more now but **caps your worst-case exposure** at ${fD(piWorstCase - newPI)}/mo vs staying on the ARM.`;
            }

            // Cash-out context  
            let cashOutNote = "";
            if (isCashOut) {
                const cashM = qFull.match(/(?:cash\s*out|pull|take\s*out)\s*\$?\s*([\d,]+)\s*k?\b/i);
                const cashAmt = cashM ? parseFloat(cashM[1]) * (cashM[1].length <= 3 ? 1000 : 1) : null;
                cashOutNote = `\n\n---\n\n## 💵 Cash-Out: What Lenders Won't Tell You\n\n${cashAmt ? `You want to pull **${f$(cashAmt)}** out of equity.` : 'You want to pull equity out.'} Here's the true cost comparison:\n\n| Option | Rate | Monthly cost | True cost of $${cashAmt ? cashAmt / 1000 : 'X'}k |\n|--|--|--|--|\n| Cash-out refi (new 30yr) | ~${fPct(effNewRate)} | Higher P&I | ${cashAmt ? f$(cashAmt * (effNewRate / 100)) + '/yr in interest' : 'depends on amount'} |\n| HELOC (variable) | Prime+1% (~9-10%) | Interest-only option | Higher rate, flexible draw |\n| Personal loan | 8-15% | Fixed short-term | Best for amounts < $50k |\n\n> ⚠️ **Tax note:** Cash-out interest is only deductible if proceeds are used for home improvement. Debt consolidation or other uses lost deductibility under TCJA 2017.\n\n> 💡 **Pro move:** If your current rate is below 5%, think carefully — a cash-out refi replaces your entire loan at the new (higher) rate. A HELOC keeps your low first mortgage intact.`;
            }

            // FRED live market comparison
            const fredNote = marketRate
                ? save <= 0 && marketRate >= currentRate
                    ? `\n> 📡 **Today's market rate: ${fPct(marketRate)}** (FRED, live) — it's *above* your current rate. **Don't refi right now.**`
                    : `\n> 📡 **Today's market rate: ${fPct(marketRate)}** (FRED, live ${fredAsOf})${Math.abs(marketRate - effNewRate) < 0.1 ? ' — your target rate is **available right now**.' : ` — your target (${fPct(effNewRate)}) is ${effNewRate > marketRate ? fPct(effNewRate - marketRate) + ' above' : fPct(marketRate - effNewRate) + ' below'} today's market.`}`
                : '';

            // ── VERDICT LOGIC ──
            const rateDrop = currentRate - effNewRate;
            let vEmoji: string, vTitle: string, vBody: string;

            // Special: market rate is above/at current rate — don't refi at all
            if (marketRate && marketRate >= currentRate && !newRate) {
                vEmoji = "⛔";
                vTitle = "Hold — today's rates are not better than yours";
                vBody = `Market is at ${fPct(marketRate)} vs your ${fPct(currentRate)}. Refinancing now would increase your payment. The right move is to wait and watch for your trigger rate.`;
            } else if (save <= 0) {
                vEmoji = "⛔";
                vTitle = "This refi doesn't pencil";
                vBody = `At ${fPct(effNewRate)} your payment rises by ${f$(Math.abs(save))}/mo. Only makes sense for cash-out, term shortening, or removing MIP.`;
            } else if (rateDrop < 0.375) {
                vEmoji = "🔴";
                vTitle = "Not worth it — spread is too thin";
                vBody = `A ${fPct(rateDrop)} drop saves ${f$(save)}/mo but breakeven is ${beYrs ? beYrs.toFixed(1) : '?'} years. The general rule of thumb: refi needs at least a 0.5%–0.75% improvement to cover costs. Your trigger rate for a 3-year breakeven is **${trig3yr ? fPct(trig3yr) : 'not achievable at current costs'}**.`;
            } else if (beYrs && beYrs <= 2.5) {
                vEmoji = "✅";
                vTitle = "Strong refi — pull the trigger";
                vBody = `Breakeven in **${beYrs.toFixed(1)} years** saving ${f$(save)}/mo. This is a clear win if you're staying more than 2–3 years.`;
            } else if (beYrs && beYrs <= 4) {
                vEmoji = "✅";
                vTitle = "Good refi — solid if staying 4+ years";
                vBody = `Breakeven in **${beYrs.toFixed(1)} years**. At ${f$(save)}/mo and ${f$(annSav)}/yr, this pencils as long as you're not planning to sell soon.`;
            } else if (beYrs && beYrs <= 6) {
                vEmoji = "🟡";
                vTitle = "Marginal — depends on your timeline";
                vBody = `Breakeven is **${beYrs.toFixed(1)} years**. If you're staying 7+ years, it works. If you might sell in 3–4 years, you'll likely be underwater on the costs.`;
            } else {
                vEmoji = "🔴";
                vTitle = "Long breakeven — not recommended unless staying long-term";
                vBody = `Breakeven is **${beYrs ? beYrs.toFixed(1) : '?'} years**. That's a long time to recover closing costs. Your trigger rate for a 5-year breakeven is **${trig5yr ? fPct(trig5yr) : 'not available at 2% costs'}**.`;
            }

            // Rate-watch verdict
            const rateWatchSection = `\n\n---\n\n## 📡 Your Rate-Watch Trigger Points\n\n| Target Breakeven | Rate You Need | Monthly Savings at That Rate |\n|--|--|--|\n| 2-year breakeven | **${trig2yr ? fPct(trig2yr) : 'N/A'}** | ${trig2yr ? f$(mpi(balance, currentRate, monthsLeft) - mpi(balance, trig2yr, monthsLeft)) + '/mo' : '—'} |\n| 3-year breakeven | **${trig3yr ? fPct(trig3yr) : 'N/A'}** | ${trig3yr ? f$(mpi(balance, currentRate, monthsLeft) - mpi(balance, trig3yr, monthsLeft)) + '/mo' : '—'} |\n| 5-year breakeven | **${trig5yr ? fPct(trig5yr) : 'N/A'}** | ${trig5yr ? f$(mpi(balance, currentRate, monthsLeft) - mpi(balance, trig5yr, monthsLeft)) + '/mo' : '—'} |\n\n${fredNote}`;

            // What lenders won't tell you section
            const costsNote = closingCosts
                ? `your provided ${f$(closingCosts)} cost figure`
                : `2% estimate (${f$(effCosts)}) — get actual lender quotes, jumbo loans often run 1.5–2.5%`;
            const lenderSection = `\n\n---\n\n## 🔍 What Lenders Won't Tell You\n\n${amortReset ? `- **Amortization reset:** You're ${yearsIn} years in. Resetting to 30yr means your early payments are mostly interest again — potentially ${f$(resetPenalty)} in extra lifetime interest.\n` : ''}${pi20 < curPI ? `- **20yr refi trick:** A 20yr refi at ${fPct(effNewRate)} (${fD(pi20)}/mo) is *still lower* than your current payment (${fD(curPI)}/mo) and saves **${f$(int20saved)}** in interest.\n` : ''}${isFHAtoConv ? '' : `- **No-cost refi option:** Ask lenders about lender credits (typically 0.25–0.5% higher rate). On a ${f$(balance)} loan, this can eliminate closing costs entirely — breakeven becomes month 1.\n`}- **Lock timing:** Once decided, lock within 5–7 business days. Float-down options cost ~0.1–0.25% but protect you if rates drop before close.\n- **Lender cost variance:** On jumbo loans, closing costs vary $5k–$15k between lenders. Get 3 quotes minimum.`;

            // ── MAIN OUTPUT ──
            const costsUsedNote = closingCosts ? `your ${f$(closingCosts)} quote` : `2% estimate (${f$(effCosts)})`;
            const md = `## ${vEmoji} Refi Analysis — ${fPct(currentRate)} → ${fPct(effNewRate)}
${fredNote}

---

## 💰 Monthly Savings Breakdown

| | Current (${fPct(currentRate)}) | Refi to ${fPct(effNewRate)} | Change |
|--|--|--|--|
| P&I payment | ${fD(curPI)}/mo | ${fD(newPI)}/mo | **${save >= 0 ? '+' : ''}${f$(save)}/mo** |
| Annual savings | — | — | **${f$(annSav)}/yr** |
| Closing costs | — | ~${f$(effCosts)} | ${costsNote} |
| **Breakeven** | — | — | **${beM ? `${Math.ceil(beM)} months (${beYrs!.toFixed(1)} yrs)` : 'N/A — payment rises'}** |

---

## 🎯 ${vTitle}

${vBody}

**5-year net:** ${net5 >= 0 ? `✅ +${f$(net5)} ahead` : `⚠️ ${f$(Math.abs(net5))} short of breakeven — not there yet`}
**10-year net:** ${net10 >= 0 ? `✅ +${f$(net10)} ahead` : `⚠️ ${f$(Math.abs(net10))} — still not recovered`}
**Lifetime interest saved (${(monthsLeft / 12).toFixed(0)} yrs remaining):** **${f$(lifeSave)}** after costs
${resetWarning}

---

## 📊 Refi Now vs Wait — Full Scenario Table

| Rate | Monthly P&I | Saved vs Current | Breakeven | Lifetime Savings |
|--|--|--|--|--|
| ${fPct(currentRate)} *(current)* | ${fD(curPI)} | — | — | — |
| **${fPct(effNewRate)} *(your target)*** | **${fD(newPI)}** | **${f$(save)}/mo** | **${beM ? Math.ceil(beM) + ' mo' : 'N/A'}** | **${f$(lifeSave)}** |
| ${fPct(wr1)} *(if you wait 0.5% more)* | ${fD(piW1)} | ${f$(svW1)}/mo | ${beW1 ? Math.ceil(beW1) + ' mo' : 'N/A'} | ${f$(totIntCur - (piW1 * monthsLeft - balance) - effCosts)} |
| ${fPct(wr2)} *(stretch — wait 1% more)* | ${fD(piW2)} | ${f$(svW2)}/mo | ${beW2 ? Math.ceil(beW2) + ' mo' : 'N/A'} | ${f$(totIntCur - (piW2 * monthsLeft - balance) - effCosts)} |

${(extraMoW1 > 0 && save > 0) ? `> 💡 **Refi now vs wait for ${fPct(wr1)}:** Waiting earns you an extra **${f$(extraMoW1)}/mo** more savings. But every month at ${fPct(currentRate)} costs **${f$(save)}** in lost opportunity. Waiting only pays if ${fPct(wr1)} arrives within **${moToRecoverW1} months**.` : ''}

---

## 🔁 Should You Shorten to 20 Years?

| | 30yr at ${fPct(effNewRate)} | 20yr at ${fPct(effNewRate)} | Difference |
|--|--|--|--|
| Monthly P&I | ${fD(newPI)} | ${fD(pi20)} | +${f$(pi20 - newPI)}/mo |
| Total interest | ${f$(totIntNew)} | ${f$(int20)} | **Save ${f$(int20saved)}** |

${pi20 < curPI ? `> ✅ **Hidden win:** 20yr payment (${fD(pi20)}) is *still lower* than your current payment (${fD(curPI)}). You'd pay off 10 years faster and save ${f$(int20saved)} in interest — for *less* than you pay today.` : `> ⚠️ 20yr payment (${fD(pi20)}) is higher than current (${fD(curPI)}) — budget accordingly.`}
${rateWatchSection}${mipNote}${armNote}${cashOutNote}${lenderSection}

---

**Next steps:** Get 2–3 lender quotes · Ask about no-cost refi option · Lock when you're ready`;

            // ── DYNAMIC CHIPS based on scenario verdict ──
            let refiChips: Array<{ label: string; seed: string }>;

            if (vEmoji === "⛔" && marketRate && marketRate >= currentRate) {
                // Hold — market worse than current
                refiChips = [
                    { label: `What rate is my trigger? Show ${fPct(trig3yr ?? currentRate - 1)} analysis`, seed: `What rate do I need to see to refi my ${f$(balance)} at ${fPct(currentRate)} with a 3-year breakeven?` },
                    { label: "Make extra payments instead — show payoff comparison", seed: `Compare making extra principal payments vs refinancing on my ${f$(balance)} at ${fPct(currentRate)}` },
                    { label: `What if rates drop to ${trig3yr ? fPct(trig3yr) : '4.00%'}? Full refi analysis`, seed: `Full refi analysis on my ${f$(balance)} at ${fPct(currentRate)} if rates drop to ${trig3yr ? fPct(trig3yr) : '4.00%'}` },
                ];
            } else if (vEmoji === "🔴" && rateDrop < 0.375) {
                // Spread too thin
                refiChips = [
                    { label: `My trigger rate is ${trig3yr ? fPct(trig3yr) : '5.5%'} — show full analysis at that rate`, seed: `Refi analysis on ${f$(balance)} at ${fPct(currentRate)} if rates drop to ${trig3yr ? fPct(trig3yr) : '5.5%'}` },
                    { label: "Extra principal payments vs waiting for trigger rate — which wins?", seed: `Compare making extra payments vs waiting to refi on my ${f$(balance)} at ${fPct(currentRate)}` },
                    { label: "No-cost refi — does lender credit change this calculus?", seed: `If the lender covers closing costs on my ${f$(balance)} at ${fPct(currentRate)} refi to ${fPct(effNewRate)}, does it pencil?` },
                ];
            } else if (vEmoji === "✅" && beYrs && beYrs <= 2.5) {
                // Strong — lock focused chips
                refiChips = [
                    pi20 < curPI
                        ? { label: `20yr at ${fPct(effNewRate)} — still lower payment + save ${f$(int20saved)}?`, seed: `Show me 20yr vs 30yr refi at ${fPct(effNewRate)} on ${f$(balance)} — I heard 20yr might still be cheaper than my current payment` }
                        : { label: `Lock now vs float-down — what's the rate risk?`, seed: `Should I lock at ${fPct(effNewRate)} now or use a float-down option on my ${f$(balance)} refi? What's the cost?` },
                    { label: "No-cost refi — eliminate closing costs with lender credit", seed: `What rate do I need for a no-cost refi on my ${f$(balance)}? Show me the lender credit breakeven vs paying ${f$(effCosts)} upfront` },
                    { label: `Refi again if rates hit ${fPct(wr1)} — double-refi math`, seed: `If I refi now to ${fPct(effNewRate)} and rates later hit ${fPct(wr1)} on my ${f$(balance)}, does a second refi make sense?` },
                ];
            } else if (vEmoji === "✅") {
                // Good — timeline chips
                refiChips = [
                    { label: `How many years do I need to stay for this to pay off?`, seed: `I have a ${f$(balance)} at ${fPct(currentRate)} and want to refi to ${fPct(effNewRate)} — how many years do I need to stay for it to make sense?` },
                    pi20 < curPI
                        ? { label: `20yr refi = lower payment + ${f$(int20saved)} saved — show full breakdown`, seed: `20yr refi at ${fPct(effNewRate)} on ${f$(balance)} vs 30yr — I heard 20yr might cost less per month` }
                        : { label: `No-cost refi option — lender credit eliminates closing costs`, seed: `What rate for a no-cost refi on ${f$(balance)}? Show me breakeven on lender credit vs ${f$(effCosts)} upfront` },
                    { label: `What if I sell in 3 years — does this refi lose money?`, seed: `If I refi my ${f$(balance)} from ${fPct(currentRate)} to ${fPct(effNewRate)} and sell in 3 years, am I ahead or behind?` },
                ];
            } else if (vEmoji === "🟡") {
                // Marginal — decision chips
                refiChips = [
                    { label: `How many years until this breaks even?`, seed: `At what year does a refi from ${fPct(currentRate)} to ${fPct(effNewRate)} on ${f$(balance)} break even? Show me a year-by-year table` },
                    { label: `My trigger rate for 3yr breakeven: ${trig3yr ? fPct(trig3yr) : 'show me'}`, seed: `What rate do I need for a 3-year breakeven on my ${f$(balance)} at ${fPct(currentRate)}? Show me the trigger rate analysis.` },
                    { label: "No-cost refi — changes everything at marginal spreads", seed: `If closing costs are zero on my ${f$(balance)} refi from ${fPct(currentRate)} to ${fPct(effNewRate)}, does the math change?` },
                ];
            } else {
                // Long breakeven / default
                refiChips = [
                    { label: `Trigger rate for 3yr breakeven: ${trig3yr ? fPct(trig3yr) : 'calculate it'}`, seed: `What rate do I need for a 3-year breakeven on my ${f$(balance)} at ${fPct(currentRate)}?` },
                    { label: "Extra principal payments vs refi — which builds equity faster?", seed: `Compare making $500/mo extra payments vs refinancing my ${f$(balance)} from ${fPct(currentRate)} to ${fPct(effNewRate)}` },
                    { label: `What if I wait until rates hit ${fPct(trig3yr ?? effNewRate - 0.5)}?`, seed: `Refi analysis if I wait until rates reach ${fPct(trig3yr ?? effNewRate - 0.5)} on my ${f$(balance)} at ${fPct(currentRate)}` },
                ];
            }

            // Override chips for special refi types
            if (isFHAtoConv) {
                refiChips = [
                    { label: `FHA→conventional at same rate — MIP removal alone worth it?`, seed: `If I refi my FHA to conventional at ${fPct(effNewRate)} on ${f$(balance)} just to remove MIP, what's the breakeven?` },
                    { label: `How long until 20% equity at current paydown speed?`, seed: `At ${fPct(currentRate)} on ${f$(balance)}, how many months until I hit 20% equity? How does refi speed this up?` },
                    { label: `What's my total MIP cost if I stay FHA vs refi now?`, seed: `Show me total MIP cost remaining on my ${f$(balance)} FHA loan at ${fPct(currentRate)} vs refinancing to conventional at ${fPct(effNewRate)}` },
                ];
            } else if (isARMtoFixed) {
                refiChips = [
                    { label: "ARM worst-case payment at lifetime cap — show me the number", seed: `My ARM balance is ${f$(balance)} at ${fPct(currentRate)} — what's my worst-case payment at the lifetime cap?` },
                    { label: "Lock to fixed now vs ride the ARM — breakeven comparison", seed: `Should I lock my ${f$(balance)} ARM at ${fPct(currentRate)} to a 30yr fixed at ${fPct(effNewRate)} or ride it out? Show the math.` },
                    { label: "What if my ARM resets to 2% higher — payment shock analysis", seed: `My ARM is ${f$(balance)} at ${fPct(currentRate)} — show me payment shock if it resets to ${fPct(currentRate + 2)}` },
                ];
            } else if (isCashOut) {
                refiChips = [
                    { label: "HELOC vs cash-out refi — total cost comparison", seed: `Compare HELOC vs cash-out refi on my ${f$(balance)} home at ${fPct(currentRate)} — I need to pull out $100k` },
                    { label: "Cash-out refi — what rate makes it worth the reset?", seed: `If I do a cash-out refi on my ${f$(balance)} from ${fPct(currentRate)} to ${fPct(effNewRate)}, what's the true cost of the equity I'm pulling out?` },
                    { label: "Tax deductibility of cash-out — what's actually deductible?", seed: `I'm doing a cash-out refi on my ${f$(balance)} home — is the new mortgage interest tax deductible? What are the rules?` },
                ];
            }


            // === REFI MEMORY SAVE — store snapshot so follow-up questions work ===
            if (supabase && memoryThreadId) {
                const refiSnapshot = {
                    scenario_inputs: {
                        loan_amount: balance,
                        rate_used_pct: effNewRate,
                        current_rate_pct: currentRate,
                        term_years: monthsLeft / 12,
                        price: balance,
                        down_payment_pct: 0,
                        refi_type: refiType,
                        years_in: yearsIn ?? null,
                        closing_costs: effCosts,
                    },
                    monthly_payment: newPI,
                    plain_english_summary: md,
                };
                try {
                    await storeScenarioMemory(supabase, memoryThreadId, refiSnapshot, message, {
                        buildTag, requestId, provider: "refi_advisor", model: "local", userId,
                    });
                    console.log('[Memory] Stored refi advisor snapshot');
                } catch (err) {
                    console.error('[Memory] Failed to store refi snapshot:', err);
                }
            }

            return respond(
                {
                    success: true,
                    provider: "refi_advisor",
                    memory_thread_id: memoryThreadId,
                    result: {
                        plain_english_summary: md,
                        scenario_inputs: {
                            loan_amount: balance,
                            rate_used_pct: effNewRate,
                            current_rate_pct: currentRate,
                            term_years: monthsLeft / 12,
                            price: balance,
                            refi_type: refiType,
                            years_in: yearsIn ?? null,
                            closing_costs: effCosts,
                        },
                        monthly_payment: newPI,
                        refi_verdict: vTitle,
                        follow_up_chips: refiChips,
                    },
                    marketData: marketData,
                    meta: {
                        build_tag: buildTag,
                        requestId,
                        memory_thread_id: memoryThreadId,
                        bypass: "refi_advisor_v2",
                        refiType,
                        verdict: vTitle,
                        // Chips here so scenarioToApiResponse → meta → GrokCard can find them
                        followUp: refiChips[0].label,
                        follow_up_chips: refiChips,
                        grok: {
                            answer: md,
                            follow_up: refiChips[0].label,
                            follow_up_chips: refiChips,
                            confidence: `1.00 (refi: ${f$(balance)} @ ${fPct(currentRate)}→${fPct(effNewRate)})`,
                        },
                        timing_ms: { fred_ms: 0, ai_ms: 0, parse_ms: 0, total_ms: 0 },
                    },
                },
                { headers: { "X-Hr-Build-Tag": buildTag, "X-Hr-Request-Id": requestId } }
            );
        }
        // ── END REFI INTERCEPT ──


        // =========================
        // MEMORY INJECTION: Add context for follow-up questions
        // =========================
        let contextualPrompt = systemPrompt;

        const isFollowUp = isFollowUpQuestion(message);
        console.log('[Memory Debug] Question:', message.substring(0, 100));
        console.log('[Memory Debug] Detected as follow-up:', isFollowUp);

        if (isFollowUp && memoryHistory.length > 0) {
            console.log('[Memory] Adding context from', memoryHistory.length, 'previous scenarios');
            contextualPrompt = buildSystemPromptWithMemory(systemPrompt, aiMessage, memoryHistory);
        } else if (isFollowUp && memoryHistory.length === 0) {
            console.log('[Memory WARNING] Follow-up detected but NO history available!');
        } else if (!isFollowUp && lastScenarioSnapshot) {
            console.log('[Memory] Using legacy single scenario baseline');
            const memBlock =
                `\n\nPRIOR SCENARIO MEMORY (use as baseline unless user overrides):\n` +
                JSON.stringify(lastScenarioSnapshot) +
                `\n\nRules:\n- Treat this as the active baseline.\n- If user provides new inputs, update only those fields.\n`;
            contextualPrompt = `${systemPrompt}${memBlock}`;
        }

        // =========================
        // ENHANCED: Add number formatting instructions for Claude
        // =========================
        const enhancedPrompt = `${contextualPrompt}

CRITICAL - NUMERIC FORMAT REQUIREMENTS:
1. ALL dollar amounts must be FULL NUMBERS in JSON (e.g., 650000, NOT 650 or "650k")
2. Examples of CORRECT formatting:
   - User says "$650k home" → You return: "price": 650000
   - User says "$585k loan" → You return: "loan_amount": 585000
   - User says "$3,490 payment" → You return: "monthly_payment": 3490
3. NO thousand separators (commas) in JSON numbers
4. NO string values for numeric fields
5. NO abbreviated notation (k, m, etc.) in JSON output

Your plain_english_summary CAN use $650k notation for readability, but the JSON fields MUST use full numbers.

CRITICAL - FOLLOW-UP QUESTION RULES:
When the user asks a follow-up question (e.g., "what if X changes"):
1. You MUST include ALL fields from scenario_inputs in your JSON output
2. For fields the user did NOT mention changing: copy the EXACT value from the prior context
3. For fields the user mentions changing: use the new value
4. NEVER set a field to 0 if it had a non-zero value in prior context (unless user explicitly says "0")

Example:
Prior context: {"price": 900000, "down_payment_pct": 30, "rent_monthly": 5000, "maintenance_pct": 0.5}
User asks: "What if down payment is 35%?"
YOU MUST OUTPUT ALL FIELDS:
{
  "scenario_inputs": {
    "price": 900000,           // ← from prior (unchanged)
    "down_payment_pct": 35,    // ← user changed this
    "rent_monthly": 5000,      // ← from prior (unchanged)
    "maintenance_pct": 0.5,    // ← from prior (unchanged) - DO NOT change to 0!
    "vacancy_pct": 0,
    "property_tax_pct": 1.3,   // ← from prior (unchanged)
    "insurance_pct": 0,
    "hoa_monthly": 0,
    "rate_used_pct": 6.09,
    "loan_amount": 585000,     // ← recalculated from new down payment
    "term_years": 30
  }
}
`;

        const aiResult = await routeAIRequest(enhancedPrompt, aiMessage, maxTokens, 'auto');
        ai_ms = Date.now() - tAI;
        provider = aiResult.provider; // 'claude' or 'grok'

        // 4) parse timing
        const tParse = Date.now();
        let result = aiResult.parsed;

        // =========================
        // SAFETY NET: Fix any numbers Claude returned in wrong scale
        // =========================
        result = fixScenarioNumbers(result, message);

        parse_ms = Date.now() - tParse;

        // Normalize for GrokCard + Inputs block + on-demand sensitivity only
        try {
            console.log('[PIPELINE] Starting normalization pipeline');
            console.log('[PIPELINE] Input result has keys:', Object.keys(result || {}));

            result = normalizeForGrokCard(result, message, marketData);
            console.log('[PIPELINE] After normalizeForGrokCard - OK');

            // FIX: Restore fields Claude incorrectly set to 0 (before validation)
            if (memoryHistory && memoryHistory.length > 0 && result?.scenario_inputs) {
                const prev = memoryHistory[0]?.scenario_inputs || {};
                const claudeInputs = result.scenario_inputs;
                ['maintenance_pct', 'vacancy_pct', 'insurance_pct', 'hoa_monthly'].forEach(f => {
                    if ((claudeInputs[f] === 0 || claudeInputs[f] == null) && prev[f] && prev[f] !== 0) {
                        console.log(`[Memory Restore] ${f}: ${claudeInputs[f]} → ${prev[f]}`);
                        claudeInputs[f] = prev[f];
                    }
                });
            }

            result = postParseValidateScenario(result, message, marketData, memoryHistory);
            console.log('[PIPELINE] After postParseValidateScenario - OK');
            console.log('[PIPELINE] Final result keys:', Object.keys(result || {}));
        } catch (err: any) {
            console.error('[PIPELINE] ERROR during normalization:', err.message);
            console.error('[PIPELINE] Stack:', err.stack);
            // Don't throw - let it continue with whatever result we have
        }

        // Validation gate (AFTER normalization which builds plain_english_summary)
        if (!result || typeof result !== "object") {
            return respond(
                {
                    success: false,
                    provider: provider,
                    memory_thread_id: memoryThreadId,
                    error: { message: "Scenario normalization failed", requestId },
                    marketData,
                    meta: {
                        build_tag: buildTag,
                        requestId,
                        userIdPresent: Boolean(userId),
                        model: aiResult.model,
                        maxTokens,
                        memory_thread_id: memoryThreadId,
                        timing_ms: { fred_ms, ai_ms, parse_ms, total_ms: Date.now() - t0 },
                    },
                },
                { status: 502, headers: { "X-Hr-Build-Tag": buildTag, "X-Hr-Request-Id": requestId } }
            );
        }

        // === Final hard guards (deterministic) ===
        // 1) Enforce default 30Y term unless user explicitly asked otherwise.
        //    If model hallucinated an early payoff (e.g., 15Y), the validator should already correct payment,
        //    but we also remove any amortization rows showing payoff before 30.
        try {
            const termYears =
                Number((result as any)?.scenario_inputs?.term_years) ||
                Number((result as any)?.term_years) ||
                30;

            if (Array.isArray((result as any)?.amortization_summary) && termYears === 30) {
                const cleaned = (result as any).amortization_summary.filter((r: any) => {
                    const y = Number(r?.year);
                    const bal = Number(r?.ending_balance);
                    if (!Number.isFinite(y)) return false;
                    if (Number.isFinite(bal) && bal === 0 && y < 30) return false; // remove premature payoff rows
                    return true;
                });
                (result as any).amortization_summary = cleaned;
            }

            // 2) Cash flow table unit normalization:
            //    If cash_flow_table values appear to be MONTHLY (and match sensitivity monthly_cash_flow),
            //    convert to ANNUAL so GrokCard is consistent.
            const cashTable = (result as any)?.cash_flow_table;
            const curMCF = Number((result as any)?.sensitivity_table?.current_rate?.monthly_cash_flow);

            if (Array.isArray(cashTable) && cashTable.length) {
                const row1 = cashTable.find((r: any) => Number(r?.year) === 1) ?? cashTable[0];
                const cf1 = Number(row1?.net_cash_flow);

                const looksMonthly =
                    Number.isFinite(cf1) &&
                    Math.abs(cf1) < 20000 && // annual CF often exceeds this; monthly usually within a few thousand
                    Number.isFinite(curMCF) &&
                    Math.abs(cf1 - curMCF) <= Math.max(50, Math.abs(curMCF) * 0.25);

                if (looksMonthly) {
                    (result as any).cash_flow_table = cashTable.map((r: any) => ({
                        year: Number(r?.year),
                        net_cash_flow: Math.round(Number(r?.net_cash_flow) * 12),
                    }));
                    // Ensure GrokCard unit reflects annual
                    if ((result as any)?.grokcard_tables?.cash_flow) {
                        (result as any).grokcard_tables.cash_flow.unit = "annual";
                    }
                    if (Array.isArray((result as any)?.validation_warnings)) {
                        (result as any).validation_warnings.push(
                            "cash_flow_table appeared monthly; converted to annual for consistency."
                        );
                    } else {
                        (result as any).validation_warnings = [
                            "cash_flow_table appeared monthly; converted to annual for consistency.",
                        ];
                    }
                }
            }
        } catch {
            // swallow; never fail the request due to guardrails
        }

        const total_ms = Date.now() - t0;
        // === MEMORY WRITE: scenario snapshot (success only) ===
        try {
            if (supabase && memoryThreadId) {
                await storeScenarioMemory(
                    supabase,
                    memoryThreadId,
                    result,
                    message,
                    {
                        buildTag,
                        requestId,
                        provider,
                        model: aiResult.model,
                        userId: userId,
                        complexity: aiResult.complexity,
                    }
                );
                console.log('[Memory] Stored scenario snapshot');
            }
        } catch (err) {
            console.error('[Memory] Failed to store scenario:', err);
            // swallow — memory must never break response
        }

        return respond(
            {
                success: true,
                provider: provider,
                // ✅ Top-level parity
                memory_thread_id: memoryThreadId,
                result,
                marketData,
                meta: {
                    build_tag: buildTag,
                    requestId,
                    userIdPresent: Boolean(userId),
                    model: aiResult.model,
                    maxTokens,
                    // ✅ Meta parity
                    memory_thread_id: memoryThreadId,
                    timing_ms: { fred_ms, ai_ms, parse_ms, total_ms },
                    complexity: aiResult.complexity, // NEW: shows 'simple'/'medium'/'complex'
                },
            },
            { headers: { "X-Hr-Build-Tag": buildTag, "X-Hr-Request-Id": requestId } }
        );

    } catch (err: any) {
        const total_ms = Date.now() - t0;
        return noStore(
            {
                success: false,
                provider: provider || "unknown",
                // ✅ Top-level parity (even on error)
                memory_thread_id: memoryThreadId,
                error: {
                    message: "Scenario engine failed",
                    requestId,
                    // ✅ Meta parity location doesn't exist here, so we include it inside error
                    // (optional) If you prefer meta, we can add a meta object instead.
                    timing_ms: { fred_ms, ai_ms, parse_ms, total_ms },
                    detail: err?.message || String(err),
                },
                // ✅ Add meta with memory_thread_id if you want the same read path:
                meta: {
                    build_tag: buildTag,
                    requestId,
                    memory_thread_id: memoryThreadId,
                },
            },
            { status: 500, headers: { "X-Hr-Build-Tag": buildTag, "X-Hr-Request-Id": requestId } }
        );
    }
}