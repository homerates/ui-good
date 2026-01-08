// HR-Build: scenario-proof-12-19-25-v5
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { runScenarioMath } from "../../../../lib/scenarioMath";


/* =========================
   Helpers
========================= */
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
        // Fallback if Intl is unavailable
        const fixed = n.toFixed(decimals);
        return `$${fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
    }
}

function formatPct(n: number, decimals = 2) {
    return `${n.toFixed(decimals)}%`;
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
    const rentMatch = m.match(/rent\s*(?:is|=|:)?\s*\$?\s*([\d,.]+)\s*(?:\/?\s*mo|month|monthly)?/i);
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
            m.match(/\b(?:gross\s+rent|monthly\s+rent|rent)\b.*?\$?\s*([\d,]+(?:\.\d+)?)(\s*k)?\b/i) ||
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

    if (!Number.isFinite(price) || !Number.isFinite(down) || !Number.isFinite(rent)) return null;

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
        rent_monthly: rent,

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


function postParseValidateScenario(result: any, message: string, marketData: any) {
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

            // IMPORTANT: remove triggers so the UI does not attempt to render amortization at all
            if (Array.isArray((out as any).amortization_summary)) (out as any).amortization_summary = [];
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

        lines.push(`- DSCR (LoanDepot, gross rent ÷ PITIA): ${fmtDSCRLocal(dscrLd)}`);
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
    const userRate = detectUserProvidedRate(message);
    const rateUsed = userRate ?? marketData?.thirtyYearFixed ?? null;

    const rate_context = {
        rate_used: rateUsed,
        source: userRate != null ? "user" : "FRED",
        as_of: marketData?.date ?? null,
        series: userRate != null ? null : "MORTGAGE30US",
    };
    out.rate_context = rate_context;
    // Inputs summary (borrower-visible + structured)
    const extractedInputs = extractScenarioInputs(message);
    out.scenario_inputs = extractedInputs;
    const inputsBlock = buildInputsSummary(extractedInputs, rate_context);
    /* =========================
   Deterministic Scenario Math (single source of truth)
   ========================= */

    const scenarioMathResult = runScenarioMath({
        scenario_inputs: extractedInputs,
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
    const rateUsedPct = Number(out?.rate_context?.rate_used ?? marketData?.thirtyYearFixed ?? NaN);

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
========================= */
async function getCurrentMortgageData() {
    const fredApiKey = process.env.FRED_API_KEY;
    const today = new Date().toISOString().slice(0, 10);

    if (!fredApiKey) {
        return {
            date: today,
            thirtyYearFixed: 6.27,
            tenYearTreasury: 4.16,
            usedFallbacks: true,
            fallbackNotes: ["FRED_API_KEY missing; used hardcoded defaults."],
        };
    }

    const base =
        "https://api.stlouisfed.org/fred/series/observations?file_type=json&sort_order=desc&limit=1";
    const u30 = `${base}&series_id=MORTGAGE30US&api_key=${encodeURIComponent(fredApiKey)}`;
    const dgs10 = `${base}&series_id=DGS10&api_key=${encodeURIComponent(fredApiKey)}`;

    try {
        const [u30Res, dgs10Res] = await Promise.all([
            fetch(u30, { cache: "no-store" }),
            fetch(dgs10, { cache: "no-store" }),
        ]);

        const [u30Json, dgs10Json] = await Promise.all([u30Res.json(), dgs10Res.json()]);

        const parseLatest = (j: any) => {
            const v = j?.observations?.[0]?.value;
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
        };

        const thirty = parseLatest(u30Json);
        const ten = parseLatest(dgs10Json);

        let usedFallbacks = false;
        const notes: string[] = [];

        if (thirty == null) {
            usedFallbacks = true;
            notes.push("FRED MORTGAGE30US missing/invalid; defaulted to 6.27.");
        }
        if (ten == null) {
            usedFallbacks = true;
            notes.push("FRED DGS10 missing/invalid; defaulted to 4.16.");
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
            fallbackNotes: [`FRED fetch error: ${err?.message || String(err)}`],
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
    const t0 = Date.now();
    const buildTag = "scenario-proof-12-19-25-v5";
    const requestId =
        (globalThis.crypto as any)?.randomUUID?.() || Math.random().toString(36).slice(2);

    let fred_ms = 0;
    let xai_ms = 0;
    let parse_ms = 0;

    try {
        const body = (await req.json().catch(() => ({}))) as { message?: string; userId?: string };
        const message = (body?.message || "").trim();
        const userId = body?.userId;

        if (!message) {
            return noStore(
                { error: "Message is required" },
                { status: 400, headers: { "X-Hr-Build-Tag": buildTag, "X-Hr-Request-Id": requestId } }
            );
        }

        // 1) FRED
        const tFred = Date.now();
        const marketData = await getCurrentMortgageData();
        fred_ms = Date.now() - tFred;

        // 2) System prompt (sensitivity OPTIONAL + only if borrower asks)
        const systemPrompt = compactWhitespace(`
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

ASSUMPTIONS (hard):
- Use the user-provided rate if explicitly stated in the user prompt.
- Only use live FRED 30-year rate if the user did NOT provide a rate.
- If taxes/insurance/maintenance/vacancy are not provided by the user, treat them as 0 for calculation BUT explicitly state "not provided" in plain_english_summary.
- Do NOT invent rent growth, expense growth, refinancing, or any changing cash flow assumptions unless the user explicitly provides growth assumptions.
- cash_flow_table MUST be flat annual net cash flow values (same number each year) unless user explicitly provides growth assumptions. If no growth assumptions are provided, all years MUST match.

DSCR RULE (hard):
- If you mention DSCR anywhere, define it explicitly as:
  DSCR = gross_monthly_rent / (monthly_payment + monthly_tax + monthly_insurance + monthly_HOA)
  If tax/insurance/HOA are missing, they are treated as 0 in the denominator, and you MUST say "tax/insurance/HOA not provided" in plain_english_summary.
- Do NOT reduce rent for vacancy for DSCR unless the user explicitly asks for an "effective rent" view.

CONTENT RULES (hard):
- Always include a short "plain_english_summary" that restates the scenario inputs:
  price/balance, down payment %, loan amount, rent, vacancy, taxes, insurance, maintenance, rate used, rate source, and as-of date.
- Keep table headers short.

SENSITIVITY RULE (hard):
- Do NOT include "sensitivity_table" unless the user explicitly asks for rate comparison or stress testing
  (examples: "+0.5%", "+1%", "-0.5%", "rate stress", "what if rates rise/fall", "compare rates").

Date: ${marketData.date}
Live data:
- 30-year fixed (FRED MORTGAGE30US): ${marketData.thirtyYearFixed.toFixed(2)}%
- 10-year Treasury (FRED DGS10): ${marketData.tenYearTreasury.toFixed(2)}%

Schema:
{
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
`);


        // 3) xAI
        const tXai = Date.now();
        const maxTokens = 900;
        const xai = await callXaiJson(systemPrompt, message, maxTokens);
        xai_ms = Date.now() - tXai;

        // 4) parse timing
        const tParse = Date.now();
        let result = xai.parsed;
        parse_ms = Date.now() - tParse;

        // Validation gate
        if (!result || typeof result !== "object" || typeof result.plain_english_summary !== "string") {
            return noStore(
                {
                    success: false,
                    provider: "xai",
                    error: { message: "Scenario payload missing required fields", requestId },
                    marketData,
                    meta: {
                        build_tag: buildTag,
                        requestId,
                        userIdPresent: Boolean(userId),
                        model: xai.model,
                        maxTokens,
                        timing_ms: { fred_ms, xai_ms, parse_ms, total_ms: Date.now() - t0 },
                    },
                },
                { status: 502, headers: { "X-Hr-Build-Tag": buildTag, "X-Hr-Request-Id": requestId } }
            );
        }

        // Normalize for GrokCard + Inputs block + on-demand sensitivity only
        result = normalizeForGrokCard(result, message, marketData);
        result = postParseValidateScenario(result, message, marketData);

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

        return noStore(
            {
                success: true,
                provider: "xai",
                result,
                marketData,
                meta: {
                    build_tag: buildTag,
                    requestId,
                    userIdPresent: Boolean(userId),
                    model: xai.model,
                    maxTokens,
                    timing_ms: { fred_ms, xai_ms, parse_ms, total_ms },
                },
            },
            { headers: { "X-Hr-Build-Tag": buildTag, "X-Hr-Request-Id": requestId } }
        );
    } catch (err: any) {
        const total_ms = Date.now() - t0;
        return noStore(
            {
                success: false,
                provider: "xai",
                error: {
                    message: "Scenario engine failed",
                    requestId,
                    timing_ms: { fred_ms, xai_ms, parse_ms, total_ms },
                    detail: err?.message || String(err),
                },
            },
            { status: 500, headers: { "X-Hr-Build-Tag": buildTag, "X-Hr-Request-Id": requestId } }
        );
    }
}