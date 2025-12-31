// lib/scenarioMath.ts
// Deterministic scenario math (single source of truth)

export type ScenarioMathInputs = {
    scenario_inputs: any;      // extractedInputs from your extractor
    rate_used_pct: number;     // annual rate % (e.g., 6.25)
};

export type CashFlowRow = { year: number; net_cash_flow: number };

export type ScenarioMathResult = {
    // Canonical core
    loan_amount: number | null;
    rate_used_pct: number | null;
    term_years: number;

    // Monthly components
    monthly_pi: number | null;
    monthly_tax: number;
    monthly_ins: number;
    monthly_hoa: number;
    monthly_pitia: number;

    // Income + ops
    rent_used: number | null;
    effective_rent: number;
    monthly_maint: number;

    // DSCR (LoanDepot = gross / PITIA)
    dscr_gross: number | null;
    dscr_economic: number | null;

    // Cash flow (effective rent - PITIA - maint)
    monthly_cash_flow: number;
    annual_cash_flow: number;

    // GrokCard-friendly
    cash_flow_table: CashFlowRow[];
};

function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.min(Math.max(n, lo), hi);
}

// Accepts 5 or 0.05; returns percent (5)
function normalizePct(v: any): number {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n > 0 && n < 1 ? n * 100 : n;
}

function pickNum(obj: any, keys: string[], fallback: number): number {
    for (const k of keys) {
        const v = Number(obj?.[k]);
        if (Number.isFinite(v)) return v;
    }
    return fallback;
}

// Standard fixed-rate fully amortizing monthly P&I
function calcMonthlyPI(principal: number, ratePct: number, termYears: number): number {
    if (!Number.isFinite(principal) || principal <= 0) return NaN;

    const years = Number.isFinite(termYears) && termYears > 0 ? termYears : 30;
    const n = Math.max(1, Math.round(years * 12));

    const apr = Number(ratePct);
    if (!Number.isFinite(apr) || apr <= 0) return principal / n;

    const r = apr / 100 / 12;
    const pow = Math.pow(1 + r, n);
    return principal * (r * pow) / (pow - 1);
}

function deriveLoanAmountFromPriceDown(si: any): number {
    const price = pickNum(si, ["purchase_price", "purchasePrice", "price", "property_value"], NaN);

    const downPct = normalizePct(pickNum(si, ["down_payment_pct", "downPaymentPct", "down_pct"], NaN));
    const downAmt = pickNum(si, ["down_payment_amount", "downPayment", "down_amount"], NaN);

    if (!Number.isFinite(price) || price <= 0) return NaN;

    if (Number.isFinite(downAmt)) return Math.max(0, price - downAmt);
    if (Number.isFinite(downPct)) return Math.max(0, price * (1 - downPct / 100));

    return NaN;
}

export function runScenarioMath(input: ScenarioMathInputs): ScenarioMathResult | null {
    const si: any = input?.scenario_inputs ?? {};
    const rateUsed = Number(input?.rate_used_pct);

    // Core inputs
    const price = pickNum(si, ["purchase_price", "purchasePrice", "price", "property_value"], NaN);

    const rent = pickNum(
        si,
        [
            "rent_monthly",
            "monthly_rent",
            "gross_rent_monthly",
            "gross_monthly_rent",
            "grossRentMonthly",
            "rent",
            "gross_rent",
        ],
        NaN
    );

    const termYears = Number(
        pickNum(si, ["term_years", "termYears"], 30)
    ) || 30;

    // Percents
    const vacancyPct = normalizePct(pickNum(si, ["vacancy_pct", "vacancy", "vacancyPct"], 0));
    const maintPct = normalizePct(pickNum(si, ["maintenance_pct", "maintenance", "maintenancePct"], 0));
    const taxPct = normalizePct(pickNum(si, ["property_tax_pct", "tax_pct", "property_tax", "taxPct"], 0));
    const insPct = normalizePct(pickNum(si, ["insurance_pct", "insurance", "insurancePct"], 0));

    // HOA monthly dollars
    const hoa = pickNum(si, ["hoa_monthly", "hoa_monthly_amount", "hoa", "monthly_hoa"], 0);

    // Loan amount: explicit wins, else derive from price/down
    const explicitLoan = pickNum(si, ["loan_amount", "loanAmount"], NaN);
    const derivedLoan = deriveLoanAmountFromPriceDown(si);
    const loanAmount = Number.isFinite(explicitLoan) ? explicitLoan : derivedLoan;

    // If the *core* pieces aren't there, don't run (prevents nonsense)
    if (!Number.isFinite(price) || price <= 0) return null;
    if (!Number.isFinite(loanAmount) || loanAmount <= 0) return null;
    if (!Number.isFinite(rateUsed) || rateUsed <= 0) return null;

    // Monthly components
    const monthlyPI = calcMonthlyPI(loanAmount, rateUsed, termYears);
    const monthlyTax = (price * (taxPct / 100)) / 12;
    const monthlyIns = (price * (insPct / 100)) / 12;
    const monthlyHOA = Number.isFinite(hoa) ? hoa : 0;

    const pitia = (Number.isFinite(monthlyPI) ? monthlyPI : 0) + monthlyTax + monthlyIns + monthlyHOA;

    const grossRent = Number.isFinite(rent) ? rent : NaN;
    const effectiveRent = (Number.isFinite(grossRent) ? grossRent : 0) * (1 - clamp(vacancyPct / 100, 0, 0.9));

    const monthlyMaint = (price * (maintPct / 100)) / 12;

    // DSCR
    const dscrGross = Number.isFinite(grossRent) && grossRent > 0 && pitia > 0 ? grossRent / pitia : null;
    const dscrEconomic = effectiveRent > 0 && pitia > 0 ? effectiveRent / pitia : null;

    // Cash flow
    const monthlyCashFlow = effectiveRent - pitia - monthlyMaint;
    const annualCashFlow = monthlyCashFlow * 12;

    const years = [1, 2, 3, 4, 5, 10, 15, 20, 25, 30];
    const cashFlowTable: CashFlowRow[] = years.map((y) => ({
        year: y,
        net_cash_flow: round2(annualCashFlow),
    }));

    return {
        loan_amount: round2(loanAmount),
        rate_used_pct: round2(rateUsed),
        term_years: termYears,

        monthly_pi: Number.isFinite(monthlyPI) ? round2(monthlyPI) : null,
        monthly_tax: round2(monthlyTax),
        monthly_ins: round2(monthlyIns),
        monthly_hoa: round2(monthlyHOA),
        monthly_pitia: round2(pitia),

        rent_used: Number.isFinite(grossRent) ? round2(grossRent) : null,
        effective_rent: round2(effectiveRent),
        monthly_maint: round2(monthlyMaint),

        dscr_gross: dscrGross === null ? null : round2(dscrGross),
        dscr_economic: dscrEconomic === null ? null : round2(dscrEconomic),

        monthly_cash_flow: round2(monthlyCashFlow),
        annual_cash_flow: round2(annualCashFlow),

        cash_flow_table: cashFlowTable,
    };
}
