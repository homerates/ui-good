// lib/scenarioMath.ts
// ======================================================
// Deterministic Scenario Math Engine
// Single source of truth for all scenario calculations
// ======================================================

export interface ScenarioMathInputs {
    purchasePrice: number;

    // One of these is required (loanAmount wins if provided)
    downPaymentPct?: number;      // percent, e.g. 30 or 0.30
    downPaymentAmount?: number;   // dollars
    loanAmount?: number;

    ratePct: number;              // e.g. 6.25
    termYears?: number;           // default 30

    rentMonthly: number;

    vacancyPct?: number;          // percent, e.g. 5 or 0.05
    taxPct?: number;              // percent, e.g. 1.25
    insurancePct?: number;        // percent, e.g. 0.5
    maintenancePct?: number;      // percent, e.g. 1.0

    hoaMonthly?: number;          // dollars
}

export interface ScenarioMathResult {
    loanAmount: number;

    monthlyPI: number;

    monthlyTax: number;
    monthlyInsurance: number;
    monthlyHOA: number;
    monthlyMaintenance: number;

    monthlyPITIA: number;

    effectiveMonthlyRent: number;

    monthlyCashFlow: number;
    annualCashFlow: number;

    dscrGross: number | null;     // LoanDepot DSCR (gross rent / PITIA)
}

// -----------------------------
// Internal helpers (pure)
// -----------------------------

const normalizePct = (v?: number): number => {
    const n = typeof v === "number" ? v : NaN;
    if (!Number.isFinite(n)) return 0;
    return n > 0 && n < 1 ? n * 100 : n;
};

const calcMonthlyPI = (
    principal: number,
    ratePct: number,
    termYears: number
): number => {
    if (principal <= 0 || ratePct <= 0) return NaN;

    const n = termYears * 12;
    const r = ratePct / 100 / 12;

    const pow = Math.pow(1 + r, n);
    return (principal * r * pow) / (pow - 1);
};

// ======================================================
// MAIN ENGINE
// ======================================================

export function computeScenarioMath(
    input: ScenarioMathInputs
): ScenarioMathResult {
    const termYears = input.termYears ?? 30;

    // --- Loan amount resolution (single authority) ---
    let loanAmount: number;

    if (Number.isFinite(input.loanAmount)) {
        loanAmount = input.loanAmount!;
    } else if (Number.isFinite(input.downPaymentAmount)) {
        loanAmount = input.purchasePrice - input.downPaymentAmount!;
    } else if (Number.isFinite(input.downPaymentPct)) {
        const dpPct = normalizePct(input.downPaymentPct);
        loanAmount = input.purchasePrice * (1 - dpPct / 100);
    } else {
        throw new Error("ScenarioMath: loan amount cannot be determined");
    }

    // --- Monthly P&I (authoritative) ---
    const monthlyPI = calcMonthlyPI(
        loanAmount,
        input.ratePct,
        termYears
    );

    // --- Monthly expenses ---
    const taxPct = normalizePct(input.taxPct);
    const insPct = normalizePct(input.insurancePct);
    const maintPct = normalizePct(input.maintenancePct);

    const monthlyTax =
        input.purchasePrice * (taxPct / 100) / 12;

    const monthlyInsurance =
        input.purchasePrice * (insPct / 100) / 12;

    const monthlyMaintenance =
        input.purchasePrice * (maintPct / 100) / 12;

    const monthlyHOA =
        Number.isFinite(input.hoaMonthly) ? input.hoaMonthly! : 0;

    // --- PITIA (LoanDepot definition) ---
    const monthlyPITIA =
        monthlyPI +
        monthlyTax +
        monthlyInsurance +
        monthlyHOA;

    // --- Effective rent ---
    const vacancyPct = normalizePct(input.vacancyPct);

    const effectiveMonthlyRent =
        input.rentMonthly * (1 - vacancyPct / 100);

    // --- Cash flow ---
    const monthlyCashFlow =
        effectiveMonthlyRent -
        monthlyPITIA -
        monthlyMaintenance;

    const annualCashFlow = monthlyCashFlow * 12;

    // --- DSCR (LoanDepot: GROSS rent) ---
    const dscrGross =
        monthlyPITIA > 0
            ? input.rentMonthly / monthlyPITIA
            : null;

    return {
        loanAmount,

        monthlyPI,

        monthlyTax,
        monthlyInsurance,
        monthlyHOA,
        monthlyMaintenance,

        monthlyPITIA,

        effectiveMonthlyRent,

        monthlyCashFlow,
        annualCashFlow,

        dscrGross,
    };
}
