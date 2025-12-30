// lib/scenarioMath.ts
// Deterministic mortgage math for HomeRates.ai scenarios.
// Single source of truth. No LLM math allowed.

export type AmortPoint = {
    year: number;
    principalPaid: number; // cumulative
    interestPaid: number;  // cumulative
    endingBalance: number;
};

export type ScenarioMathInputs = {
    loanAmount: number;              // e.g. 630000
    annualRatePct: number;           // e.g. 6.18 (percent)
    termYears?: number;              // default 30
    grossRentMonthly?: number;       // e.g. 6000
    pitiaMonthly?: number;           // optional full PITIA if you have it
};

export type ScenarioMathResults = {
    monthlyRate: number;
    termMonths: number;
    monthlyPI: number;
    monthlyInterestOnly: number;
    dscr: number | null;
    dscrBasis: "PITIA" | "PI_ONLY" | "NONE";
    monthlyCashFlow: number | null;
    annualCashFlow: number | null;
    amortizationSnapshot: AmortPoint[];
};

function assertFinite(name: string, v: number) {
    if (!Number.isFinite(v)) throw new Error(`scenarioMath: ${name} is not finite`);
}

function round2(n: number) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

function pow(base: number, exp: number) {
    // Tiny wrapper so we can clamp weirdness if needed later
    return Math.pow(base, exp);
}

/**
 * Standard fully-amortizing mortgage payment (P&I).
 * Formula: M = P * r(1+r)^n / ((1+r)^n - 1)
 */
export function calcMonthlyPI(loanAmount: number, annualRatePct: number, termYears = 30): number {
    assertFinite("loanAmount", loanAmount);
    assertFinite("annualRatePct", annualRatePct);

    const n = Math.round(termYears * 12);
    if (loanAmount <= 0) return 0;
    if (n <= 0) throw new Error("scenarioMath: termYears must be > 0");

    const r = (annualRatePct / 100) / 12;

    // Handle true 0% rate edge case
    if (r === 0) return round2(loanAmount / n);

    const onePlusR = 1 + r;
    const factor = pow(onePlusR, n);

    const payment = loanAmount * (r * factor) / (factor - 1);

    assertFinite("monthlyPI", payment);
    return round2(payment);
}

/**
 * Interest-only payment (not used for 30Y fixed P&I, but useful for checks/alt scenarios)
 */
export function calcMonthlyInterestOnly(loanAmount: number, annualRatePct: number): number {
    assertFinite("loanAmount", loanAmount);
    assertFinite("annualRatePct", annualRatePct);
    const r = (annualRatePct / 100) / 12;
    const pmt = loanAmount * r;
    assertFinite("monthlyInterestOnly", pmt);
    return round2(pmt);
}

/**
 * Build amortization snapshot at selected years.
 * Returns cumulative principal/interest paid and ending balance at each year mark.
 */
export function amortizationSnapshot(
    loanAmount: number,
    annualRatePct: number,
    termYears = 30,
    years: number[] = [1, 2, 3, 4, 5, 10, 15, 20, 25, 30]
): AmortPoint[] {
    const monthlyPI = calcMonthlyPI(loanAmount, annualRatePct, termYears);
    const r = (annualRatePct / 100) / 12;
    const termMonths = Math.round(termYears * 12);

    // If payment is 0 (loanAmount=0), return zeros
    if (monthlyPI === 0) {
        return years.map((y) => ({
            year: y,
            principalPaid: 0,
            interestPaid: 0,
            endingBalance: 0
        }));
    }

    let balance = loanAmount;
    let cumPrincipal = 0;
    let cumInterest = 0;

    const targets = new Set(years.map((y) => Math.min(Math.max(y, 0), termYears)));
    const out: AmortPoint[] = [];

    for (let m = 1; m <= termMonths; m++) {
        const interest = round2(balance * r);
        let principal = round2(monthlyPI - interest);

        // Clamp final month so we don't go negative due to rounding
        if (principal > balance) principal = round2(balance);

        balance = round2(balance - principal);
        cumPrincipal = round2(cumPrincipal + principal);
        cumInterest = round2(cumInterest + interest);

        const yearNow = m / 12;

        // Capture at exact year boundaries (month 12,24,...)
        if (Number.isInteger(yearNow) && targets.has(yearNow)) {
            out.push({
                year: yearNow,
                principalPaid: cumPrincipal,
                interestPaid: cumInterest,
                endingBalance: balance
            });
        }

        if (balance <= 0) break;
    }

    // Ensure we include year 30 if requested, even if rounding ended early
    // (rare but safe)
    const requested30 = years.includes(termYears);
    const has30 = out.some((p) => p.year === termYears);
    if (requested30 && !has30) {
        out.push({
            year: termYears,
            principalPaid: round2(loanAmount),
            interestPaid: round2(out.length ? out[out.length - 1].interestPaid : 0),
            endingBalance: 0
        });
    }

    return out;
}

/**
 * DSCR: gross monthly rent / monthly PITIA (preferred).
 * If PITIA is not provided, fall back to PI-only DSCR and label basis.
 */
export function calcDSCR(
    grossRentMonthly: number | undefined,
    monthlyPI: number,
    pitiaMonthly?: number
): { dscr: number | null; basis: "PITIA" | "PI_ONLY" | "NONE" } {
    if (!grossRentMonthly || grossRentMonthly <= 0) return { dscr: null, basis: "NONE" };

    const denom = (pitiaMonthly && pitiaMonthly > 0) ? pitiaMonthly : monthlyPI;

    if (denom <= 0) return { dscr: null, basis: "NONE" };

    const dscr = round2(grossRentMonthly / denom);
    return { dscr, basis: (pitiaMonthly && pitiaMonthly > 0) ? "PITIA" : "PI_ONLY" };
}

/**
 * Cash flow: gross rent - PITIA (preferred), otherwise rent - PI only.
 */
export function calcCashFlow(
    grossRentMonthly: number | undefined,
    monthlyPI: number,
    pitiaMonthly?: number
): { monthly: number | null; annual: number | null } {
    if (!grossRentMonthly || grossRentMonthly <= 0) return { monthly: null, annual: null };
    const outflow = (pitiaMonthly && pitiaMonthly > 0) ? pitiaMonthly : monthlyPI;
    const monthly = round2(grossRentMonthly - outflow);
    return { monthly, annual: round2(monthly * 12) };
}

/**
 * Invariant validator to prevent “garbage tables”.
 * Throw if anything violates basic identities.
 */
export function validateInvariants(res: ScenarioMathResults, inputs: ScenarioMathInputs) {
    // If we have cash flow and rent, enforce identity
    if (inputs.grossRentMonthly && res.monthlyCashFlow !== null) {
        const outflow = (inputs.pitiaMonthly && inputs.pitiaMonthly > 0) ? inputs.pitiaMonthly : res.monthlyPI;
        const expected = round2(inputs.grossRentMonthly - outflow);
        if (round2(res.monthlyCashFlow) !== expected) {
            throw new Error(
                `scenarioMath invariant failed: cashflow_monthly mismatch (got ${res.monthlyCashFlow}, expected ${expected})`
            );
        }
    }

    if (res.annualCashFlow !== null && res.monthlyCashFlow !== null) {
        const expectedAnnual = round2(res.monthlyCashFlow * 12);
        if (round2(res.annualCashFlow) !== expectedAnnual) {
            throw new Error(
                `scenarioMath invariant failed: cashflow_annual mismatch (got ${res.annualCashFlow}, expected ${expectedAnnual})`
            );
        }
    }

    if (res.dscr !== null && inputs.grossRentMonthly) {
        const denom = (inputs.pitiaMonthly && inputs.pitiaMonthly > 0) ? inputs.pitiaMonthly : res.monthlyPI;
        const expected = round2(inputs.grossRentMonthly / denom);
        if (round2(res.dscr) !== expected) {
            throw new Error(
                `scenarioMath invariant failed: dscr mismatch (got ${res.dscr}, expected ${expected})`
            );
        }
    }
}

/**
 * One-shot scenario math: compute everything deterministically.
 */
export function computeScenarioMath(inputs: ScenarioMathInputs): ScenarioMathResults {
    const termYears = inputs.termYears ?? 30;

    const monthlyPI = calcMonthlyPI(inputs.loanAmount, inputs.annualRatePct, termYears);
    const monthlyInterestOnly = calcMonthlyInterestOnly(inputs.loanAmount, inputs.annualRatePct);

    const monthlyRate = round2((inputs.annualRatePct / 100) / 12);
    const termMonths = Math.round(termYears * 12);

    const { dscr, basis } = calcDSCR(inputs.grossRentMonthly, monthlyPI, inputs.pitiaMonthly);
    const cf = calcCashFlow(inputs.grossRentMonthly, monthlyPI, inputs.pitiaMonthly);

    const amort = amortizationSnapshot(inputs.loanAmount, inputs.annualRatePct, termYears);

    const res: ScenarioMathResults = {
        monthlyRate,
        termMonths,
        monthlyPI,
        monthlyInterestOnly,
        dscr,
        dscrBasis: basis,
        monthlyCashFlow: cf.monthly,
        annualCashFlow: cf.annual,
        amortizationSnapshot: amort
    };

    validateInvariants(res, inputs);
    return res;
}
