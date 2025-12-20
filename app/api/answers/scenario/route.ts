// HR-Build: scenario-proof-12-19-25-v5
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

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
    if (inputs.property_tax_pct != null) lines.push(`- Property tax: ${formatPct(inputs.property_tax_pct, 2)} (annual assumption)`);
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

type ScenarioInputs = {
    rent_monthly: number;
    price: number;
    down_payment_pct: number;
    vacancy_pct: number;
    maintenance_pct: number;
    property_tax_pct: number;
    insurance_pct: number;
    term_years?: number; // default 30
};

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

    const maintMonthly = (inputs.price * (inputs.maintenance_pct / 100)) / 12;
    const taxMonthly = (inputs.price * (inputs.property_tax_pct / 100)) / 12;
    const insMonthly = (inputs.price * (inputs.insurance_pct / 100)) / 12;

    const monthlyPI = calcMonthlyPI(loanAmount, annualRatePct, termYears);
    const PITIA = monthlyPI + taxMonthly + insMonthly;

    // Operating expenses in this prompt = maintenance (you can extend later)
    const operating = maintMonthly;

    const monthlyCashFlow = effectiveRent - operating - PITIA;

    const dscr = PITIA > 0 ? (effectiveRent / PITIA) : null;

    return {
        termYears,
        loanAmount: round2(loanAmount),
        effectiveRent: round2(effectiveRent),
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

function ensureScenarioInputs(result: any): ScenarioInputs | null {
    const si = result?.scenario_inputs;
    if (!si || typeof si !== "object") return null;

    const required = ["rent_monthly", "price", "down_payment_pct", "vacancy_pct", "maintenance_pct", "property_tax_pct", "insurance_pct"];
    for (const k of required) {
        if (!Number.isFinite(Number(si[k]))) return null;
    }
    return {
        rent_monthly: Number(si.rent_monthly),
        price: Number(si.price),
        down_payment_pct: Number(si.down_payment_pct),
        vacancy_pct: Number(si.vacancy_pct),
        maintenance_pct: Number(si.maintenance_pct),
        property_tax_pct: Number(si.property_tax_pct),
        insurance_pct: Number(si.insurance_pct),
        term_years: si.term_years != null ? Number(si.term_years) : undefined,
    };
}

function postParseValidateScenario(result: any, message: string, marketData: any) {
    const out = { ...(result || {}) };
    const warnings: string[] = Array.isArray(out.validation_warnings)
        ? [...out.validation_warnings]
        : [];

    const inputs = ensureScenarioInputs(out);
    const rateUsed = Number(out?.rate_context?.rate_used ?? marketData?.thirtyYearFixed);

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
    const promptWantsStress =
        /\+\s*0\.5%|\+\s*1%|\brate\s*stress\b|\brates\s*(rise|rising|increase|higher|up)\b|\brates\s*(drop|lower|down)\b/i.test(
            message
        );

    // 1) monthly_payment must equal computed P&I (strict)
    const modelPmt = Number(out.monthly_payment);
    const strictTol = Math.max(50, base.monthlyPI * 0.02); // $50 or 2%
    if (!Number.isFinite(modelPmt) || Math.abs(modelPmt - base.monthlyPI) > strictTol) {
        warnings.push(
            `monthly_payment adjusted from ${Number.isFinite(modelPmt) ? round2(modelPmt) : "null"
            } to ${base.monthlyPI} (computed).`
        );
        out.monthly_payment = base.monthlyPI;
    } else {
        out.monthly_payment = Math.abs(modelPmt);
    }

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

    // Amortization snapshot table
    if (Array.isArray(out.amortization_summary) && out.amortization_summary.length) {
        out.grokcard_tables.amortization_snapshot = {
            headers: ["Yr", "Prin", "Int", "Bal"],
            rows: out.amortization_summary.map((r: any) => [
                Number(r?.year),
                Number(r?.principal_paid),
                Number(r?.interest_paid),
                Number(r?.ending_balance),
            ]),
        };
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
    if (dscr != null) lines.push(`- DSCR-like coverage (effective rent ÷ PITIA): ${dscr}x`);

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

    // Summary: ensure Inputs block appears first, then the model narrative (no duplication)
    const narrative =
        typeof out.plain_english_summary === "string" && out.plain_english_summary.trim()
            ? out.plain_english_summary.trim()
            : "";

    // If narrative already starts with "Scenario inputs", don't double-insert.
    if (narrative.toLowerCase().startsWith("scenario inputs")) {
        out.plain_english_summary = narrative;
    } else {
        out.plain_english_summary = narrative
            ? `${inputsBlock}\n\n${narrative}`
            : inputsBlock;
    }

    // GrokCard-friendly tables with short headers (prevents header overlap)
    const grokcard_tables: any = {};

    if (Array.isArray(out.amortization_summary) && out.amortization_summary.length) {
        grokcard_tables.amortization_snapshot = {
            headers: ["Yr", "Prin", "Int", "Bal"],
            rows: out.amortization_summary.map((r: any) => [
                r.year,
                r.principal_paid,
                r.interest_paid,
                r.ending_balance,
            ]),
        };
    }

    if (Array.isArray(out.cash_flow_table) && out.cash_flow_table.length) {
        grokcard_tables.cash_flow = {
            headers: ["Yr", "Net CF"],
            rows: out.cash_flow_table.map((r: any) => [r.year, r.net_cash_flow]),
            unit: "annual_or_periodic",
        };
    }

    // Only build rate sensitivity table if borrower requested it AND sensitivity_table exists
    if (includeRateSensitivity && out.sensitivity_table && typeof out.sensitivity_table === "object") {
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
                    ? "Current"
                    : k === "plus_0_5pct"
                        ? "+0.5%"
                        : k === "plus_1pct"
                            ? "+1.0%"
                            : k === "minus_0_5pct"
                                ? "-0.5%"
                                : k.replace(/_/g, " ");

            rows.push([label, safeAbsMoney(v.monthly_payment), v.monthly_cash_flow ?? null, v.dscr ?? null]);
        }

        if (rows.length >= 2) {
            grokcard_tables.rate_sensitivity = {
                headers: ["Case", "Pmt", "CF", "DSCR"],
                rows,
            };
        }
    }

    out.grokcard_tables = grokcard_tables;
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

CONTENT RULES (hard):
- Always include a short "plain_english_summary" that restates the scenario inputs:
  price/balance, down payment %, loan amount, rent, vacancy, taxes, insurance, maintenance, rate used, rate source, and as-of date.
- cash_flow_table must be ANNUAL net cash flow values because rows are labeled by year.
- Keep table header labels short.

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
  "plain_english_summary": "string",
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
