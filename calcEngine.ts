// lib/calcEngine.ts
// ============================================================
// HOMERATES CALC ENGINE — Single source of all mortgage math
// Every formula verified. No LLM involvement. No markdown.
// All functions: pure inputs → pure outputs.
// ============================================================

// ─────────────────────────────────────────────
// CONSTANTS — 2026 HUD / GSE guidelines
// ─────────────────────────────────────────────
export const FHA_UFMIP_RATE = 0.0175;   // 1.75% upfront MIP
export const FHA_MIP_RATE = 0.0055;   // 0.55%/yr annual MIP (>15yr, LTV >90%)
export const FHA_MIP_RATE_LOW = 0.0050;   // 0.50%/yr (LTV ≤90% or ≤15yr)
export const FHA_FLOOR_2026 = 541287;   // national floor loan limit
export const FHA_CEILING_2026 = 1249125;  // high-cost ceiling
export const CONF_STANDARD = 832750;   // 2026 national conforming baseline (FHFA, up from $806,500 in 2025)
export const CONF_HIGH_BALANCE = 1249125;  // 2026 high-cost area ceiling (FHFA, up from $1,209,750 in 2025)
export const PMI_RATE_STD = 0.0055;   // ~0.55%/yr PMI (LTV 90–95%)
export const PMI_RATE_LOW = 0.0030;   // ~0.30%/yr PMI (LTV 80–90%)
export const TAX_RATE_DEFAULT = 0.011;    // 1.1% property tax default
export const INS_ANNUAL_DEFAULT = 1200;    // $1,200/yr homeowner's insurance

// ─────────────────────────────────────────────
// PRIMITIVE MATH — used by every calc
// ─────────────────────────────────────────────

/**
 * Monthly P&I payment — standard amortization formula
 * M = P × [r(1+r)^n] / [(1+r)^n - 1]
 */
export function monthlyPI(
    principal: number,
    annualRatePct: number,
    termMonths: number,
): number {
    if (principal <= 0 || termMonths <= 0) return 0;
    const r = annualRatePct / 100 / 12;
    if (r === 0) return principal / termMonths;
    const pw = Math.pow(1 + r, termMonths);
    return principal * (r * pw) / (pw - 1);
}

/**
 * Remaining balance after paidMonths payments on a loan
 */
export function remainingBalance(
    originalBalance: number,
    annualRatePct: number,
    totalMonths: number,
    paidMonths: number,
): number {
    if (paidMonths <= 0) return originalBalance;
    if (paidMonths >= totalMonths) return 0;
    const r = annualRatePct / 100 / 12;
    if (r === 0) return originalBalance * (1 - paidMonths / totalMonths);
    const pw = Math.pow(1 + r, totalMonths);
    const pwp = Math.pow(1 + r, paidMonths);
    const pmt = originalBalance * (r * pw) / (pw - 1);
    return pmt * (pw - pwp) / (r * pw);
}

/**
 * Total interest paid over life of loan
 */
export function totalInterest(
    principal: number,
    annualRatePct: number,
    termMonths: number,
): number {
    return monthlyPI(principal, annualRatePct, termMonths) * termMonths - principal;
}

/**
 * Years until loan balance reaches targetLTV * homeValue
 * Returns exact month (as fractional years), or termYears if never reached
 */
export function yearsToLTV(
    loanAmount: number,
    homeValue: number,
    annualRatePct: number,
    termYears: number,
    targetLTV: number, // e.g. 0.80
): number {
    const target = homeValue * targetLTV;
    const r = annualRatePct / 100 / 12;
    const n = termYears * 12;
    const pmt = monthlyPI(loanAmount, annualRatePct, n);
    let bal = loanAmount;
    for (let mo = 1; mo <= n; mo++) {
        bal -= pmt - bal * r;
        if (bal <= target) return Math.round((mo / 12) * 10) / 10;
    }
    return termYears;
}

/**
 * PMI monthly cost based on LTV
 */
export function monthlyPMI(loanAmount: number, ltv: number): number {
    if (ltv <= 0.80) return 0;
    const rate = ltv > 0.90 ? PMI_RATE_STD : PMI_RATE_LOW;
    return loanAmount * rate / 12;
}

/**
 * FHA MIP rate based on term and LTV — per HUD 2024 guidelines
 */
export function fhaMIPRate(termYears: number, ltv: number): number {
    if (termYears <= 15) return ltv <= 0.90 ? 0.0015 : 0.0040;
    return ltv <= 0.90 ? FHA_MIP_RATE_LOW : FHA_MIP_RATE;
}

/**
 * FHA MIP duration
 */
export function fhaMIPDuration(downPaymentPct: number): '11 years' | 'Life of loan' {
    return downPaymentPct >= 10 ? '11 years' : 'Life of loan';
}

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface ConventionalInput {
    purchasePrice: number;
    downPaymentPct: number;        // e.g. 20 for 20%
    annualRatePct: number;
    termYears?: number;            // default 30
    propertyTaxRate?: number;      // default 1.1%
    annualInsurance?: number;      // default 1200
    hoaMonthly?: number;
    monthlyDebts?: number;
    annualIncome?: number;
}

export interface ConventionalResult {
    // Inputs echoed
    purchasePrice: number;
    downPaymentPct: number;
    annualRatePct: number;
    termYears: number;
    // Loan structure
    downPayment: number;
    loanAmount: number;
    ltv: number;                   // e.g. 0.80
    // Monthly breakdown
    monthlyPI: number;
    monthlyTax: number;
    monthlyInsurance: number;
    monthlyPMI: number;
    monthlyHOA: number;
    totalMonthly: number;
    // Lifetime
    totalInterest: number;
    totalPayments: number;
    // PMI removal
    pmiRemovalYears: number | null; // null if no PMI
    // DTI (only if annualIncome provided)
    frontEndDTI: number | null;
    backEndDTI: number | null;
    // Derived
    monthlyRate: number;
    numberOfPayments: number;
}

export interface FHAInput {
    purchasePrice: number;
    downPaymentPct?: number;       // default 3.5
    annualRatePct: number;
    termYears?: number;            // default 30
    creditScore?: number;          // default 580
    propertyTaxRate?: number;
    annualInsurance?: number;
    hoaMonthly?: number;
    monthlyDebts?: number;
    annualIncome?: number;
    fhaLoanLimit?: number;         // if known from county lookup
}

export interface FHAResult {
    // Inputs echoed
    purchasePrice: number;
    downPaymentPct: number;
    annualRatePct: number;
    termYears: number;
    creditScore: number;
    // Loan structure
    downPayment: number;
    baseLoanAmount: number;        // pre-UFMIP
    ufmip: number;                 // 1.75% of base loan
    totalLoanAmount: number;       // base + UFMIP
    ltv: number;
    // Monthly breakdown
    monthlyPI: number;             // on totalLoanAmount
    monthlyMIP: number;            // on BASE loan (HUD spec)
    monthlyTax: number;
    monthlyInsurance: number;
    monthlyHOA: number;
    totalMonthly: number;
    // MIP details
    mipRate: number;
    mipDuration: '11 years' | 'Life of loan';
    totalMIPPaid: number;
    // Lifetime
    totalInterest: number;
    totalPayments: number;
    // Qualification
    frontEndDTI: number | null;
    backEndDTI: number | null;
    qualifies: boolean | null;
    // Checklist
    meetsCreditRequirement: boolean;
    meetsDownPaymentRequirement: boolean;
    withinLimitStatus: 'below_floor' | 'within_range' | 'above_ceiling' | 'unknown';
    fhaLoanLimit: number | null;
}

export interface RefiInput {
    currentBalance: number;
    currentRatePct: number;
    newRatePct: number;
    remainingMonths?: number;      // default 360
    closingCosts?: number;         // default 2% of balance
    yearsIn?: number;              // for amortization reset warning
    refiTermMonths?: number;       // new loan term, default = remainingMonths
    isFHAtoConv?: boolean;
    currentMonthlyMIP?: number;    // for FHA→conv savings calc
    homeValue?: number;
}

export interface RefiResult {
    // Inputs echoed
    currentBalance: number;
    currentRatePct: number;
    newRatePct: number;
    remainingMonths: number;
    refiTermMonths: number;
    closingCosts: number;
    // Current loan
    currentMonthlyPI: number;
    currentTotalInterest: number;
    // New loan
    newMonthlyPI: number;
    newTotalInterest: number;
    // Savings
    monthlyPISavings: number;
    annualSavings: number;
    totalMIPSavingsIfFHA: number;  // 0 if not FHA→conv
    combinedMonthlySavings: number; // PI savings + MIP if applicable
    // Breakeven
    breakEvenMonths: number | null;
    breakEvenYears: number | null;
    // Trigger rates (rate needed for X-year breakeven)
    triggerRate2yr: number | null;
    triggerRate3yr: number | null;
    triggerRate5yr: number | null;
    // Wait scenarios
    waitRate05: number;            // target - 0.5%
    waitRate10: number;            // target - 1.0%
    waitMonthlySavings05: number;
    waitMonthlySavings10: number;
    waitBreakeven05: number | null;
    waitBreakeven10: number | null;
    // Amortization reset
    resetPenalty: number;          // extra interest if resetting to 30yr
    amortReset: boolean;
    // 20yr alternative
    pi20yr: number;
    interest20yr: number;
    interest20yrSaved: number;     // vs new 30yr
    // Milestones
    netSavings5yr: number;
    netSavings10yr: number;
    // Verdict
    verdict: 'strong' | 'good' | 'marginal' | 'poor' | 'hold' | 'no_savings';
    verdictReason: string;
    rateDrop: number;
}

export interface AffordabilityInput {
    annualIncome: number;
    savings: number;
    monthlyDebts?: number;
    annualRatePct: number;
    downPctOverride?: number;      // if user specifies a down payment
    propertyTaxRate?: number;
    fhaLoanLimit?: number;
    confLoanLimit?: number;
    locationLabel?: string;
}

export interface AffordabilityScenario {
    label: string;
    icon: string;
    program: 'FHA' | 'Conventional';
    downPaymentPct: number;
    homePrice: number;
    downPaymentAmount: number;
    baseLoanAmount: number;
    ufmip: number;
    loanAmount: number;
    closingCosts: number;
    totalCashNeeded: number;
    savingsGap: number;
    savingsAfterClose: number;
    monthlyPI: number;
    monthlyTax: number;
    monthlyInsurance: number;
    monthlyMI: number;
    totalMonthly: number;
    totalInterest: number;
    frontEndDTI: number;
    backEndDTI: number;
    rate: number;
    isFHA: boolean;
    wasLimitCapped: boolean;
    loanLimitForProgram: number;
    locationLabel: string;
}

export interface AffordabilityResult {
    scenarios: AffordabilityScenario[];
    annualIncome: number;
    savings: number;
    monthlyDebts: number;
    rate: number;
}

export interface DSCRInput {
    purchasePrice: number;
    grossMonthlyRent: number;
    downPaymentPct?: number;       // default 25 (DSCR standard)
    annualRatePct: number;
    vacancyRate?: number;          // 0–1, default 0
    propertyTaxRate?: number;
    annualInsurance?: number;
    hoaMonthly?: number;
}

export interface DSCRResult {
    // Inputs echoed
    purchasePrice: number;
    grossMonthlyRent: number;
    downPaymentPct: number;
    annualRatePct: number;
    vacancyRate: number;
    // Loan structure
    downPayment: number;
    loanAmount: number;
    // Monthly
    monthlyPI: number;
    monthlyTax: number;
    monthlyInsurance: number;
    monthlyHOA: number;
    monthlyPITIA: number;
    // Income
    effectiveGrossIncome: number;  // after vacancy
    dscr: number;
    monthlyCashFlow: number;
    annualCashFlow: number;
    totalInterest: number;
    // Status
    dscrStatus: 'excellent' | 'qualifies' | 'below_min' | 'does_not_qualify';
    // Amortization snapshot rows
    amortSnap: Array<{ year: number; cumPrincipal: number; yearInterest: number; balance: number }>;
}

export interface FHAvsConvInput {
    purchasePrice: number;
    annualRatePct: number;
    fhaDownPct?: number;           // default 3.5
    convDownPct?: number;          // default 5
    convRatePct?: number;          // default = annualRatePct
    propertyTaxRate?: number;
    annualIncome?: number;
    monthlyDebts?: number;
    termYears?: number;
}

export interface FHAvsConvResult {
    fha: FHAResult;
    conv: ConventionalResult;
    upfrontDiff: number;           // conv down - fha down (positive = FHA saves upfront)
    monthlyDiff: number;           // fha total - conv total (positive = conv cheaper monthly)
    breakEvenMonths: number | null; // when conv monthly savings pay back the extra upfront cost
}

// ─────────────────────────────────────────────
// CALC: CONVENTIONAL
// ─────────────────────────────────────────────

export function calcConventional(input: ConventionalInput): ConventionalResult {
    const {
        purchasePrice,
        downPaymentPct,
        annualRatePct,
        termYears = 30,
        propertyTaxRate = TAX_RATE_DEFAULT * 100,
        annualInsurance = INS_ANNUAL_DEFAULT,
        hoaMonthly = 0,
        monthlyDebts = 0,
        annualIncome,
    } = input;

    const downPayment = purchasePrice * (downPaymentPct / 100);
    const loanAmount = purchasePrice - downPayment;
    const ltv = loanAmount / purchasePrice;
    const termMo = termYears * 12;

    const mPI = monthlyPI(loanAmount, annualRatePct, termMo);
    const mTax = (purchasePrice * (propertyTaxRate / 100)) / 12;
    const mIns = annualInsurance / 12;
    const mPMI = monthlyPMI(loanAmount, ltv);
    const mHOA = hoaMonthly;
    const total = mPI + mTax + mIns + mPMI + mHOA;

    const totInt = totalInterest(loanAmount, annualRatePct, termMo);
    const totPay = mPI * termMo;

    const pmiRemoval = mPMI > 0
        ? yearsToLTV(loanAmount, purchasePrice, annualRatePct, termYears, 0.80)
        : null;

    let frontEndDTI: number | null = null;
    let backEndDTI: number | null = null;
    if (annualIncome && annualIncome > 0) {
        const mIncome = annualIncome / 12;
        frontEndDTI = Math.round((total / mIncome) * 1000) / 10;
        backEndDTI = Math.round(((total + monthlyDebts) / mIncome) * 1000) / 10;
    }

    return {
        purchasePrice,
        downPaymentPct,
        annualRatePct,
        termYears,
        downPayment: Math.round(downPayment),
        loanAmount: Math.round(loanAmount),
        ltv,
        monthlyPI: Math.round(mPI),
        monthlyTax: Math.round(mTax),
        monthlyInsurance: Math.round(mIns),
        monthlyPMI: Math.round(mPMI),
        monthlyHOA: Math.round(mHOA),
        totalMonthly: Math.round(total),
        totalInterest: Math.round(totInt),
        totalPayments: Math.round(totPay),
        pmiRemovalYears: pmiRemoval,
        frontEndDTI,
        backEndDTI,
        monthlyRate: annualRatePct / 100 / 12,
        numberOfPayments: termMo,
    };
}

// ─────────────────────────────────────────────
// CALC: FHA
// ─────────────────────────────────────────────

export function calcFHA(input: FHAInput): FHAResult {
    const {
        purchasePrice,
        downPaymentPct = 3.5,
        annualRatePct,
        termYears = 30,
        creditScore = 580,
        propertyTaxRate = TAX_RATE_DEFAULT * 100,
        annualInsurance = INS_ANNUAL_DEFAULT,
        hoaMonthly = 0,
        monthlyDebts = 0,
        annualIncome,
        fhaLoanLimit,
    } = input;

    const downPayment = purchasePrice * (downPaymentPct / 100);
    const baseLoanAmount = purchasePrice - downPayment;
    const ltv = baseLoanAmount / purchasePrice;
    const ufmip = Math.round(baseLoanAmount * FHA_UFMIP_RATE);
    const totalLoan = baseLoanAmount + ufmip;
    const termMo = termYears * 12;

    // P&I on TOTAL loan (UFMIP financed in)
    const mPI = monthlyPI(totalLoan, annualRatePct, termMo);

    // MIP on BASE loan — per HUD spec (NOT on total loan)
    const mipRate = fhaMIPRate(termYears, ltv);
    const mMIP = Math.round(baseLoanAmount * mipRate / 12);
    const mipDur = fhaMIPDuration(downPaymentPct);
    const mipMonths = mipDur === '11 years' ? 132 : termMo;
    const totalMIP = mMIP * mipMonths;

    const mTax = (purchasePrice * (propertyTaxRate / 100)) / 12;
    const mIns = annualInsurance / 12;
    const mHOA = hoaMonthly;
    const total = mPI + mMIP + mTax + mIns + mHOA;

    const totInt = totalInterest(totalLoan, annualRatePct, termMo);
    const totPay = mPI * termMo;

    let frontEndDTI: number | null = null;
    let backEndDTI: number | null = null;
    let qualifies: boolean | null = null;
    if (annualIncome && annualIncome > 0) {
        const mIncome = annualIncome / 12;
        frontEndDTI = Math.round((total / mIncome) * 1000) / 10;
        backEndDTI = Math.round(((total + monthlyDebts) / mIncome) * 1000) / 10;
        qualifies = backEndDTI <= 50; // FHA allows up to 50% with compensating factors
    }

    // Loan limit status — against BASE loan (FHA limits apply to base, not total)
    let withinLimitStatus: FHAResult['withinLimitStatus'] = 'unknown';
    if (fhaLoanLimit) {
        if (baseLoanAmount < FHA_FLOOR_2026) withinLimitStatus = 'below_floor';
        else if (baseLoanAmount <= fhaLoanLimit) withinLimitStatus = 'within_range';
        else withinLimitStatus = 'above_ceiling';
    } else {
        // No county data — just flag if above national floor (don't show ❌)
        withinLimitStatus = baseLoanAmount <= FHA_FLOOR_2026 ? 'within_range' : 'unknown';
    }

    return {
        purchasePrice,
        downPaymentPct,
        annualRatePct,
        termYears,
        creditScore,
        downPayment: Math.round(downPayment),
        baseLoanAmount: Math.round(baseLoanAmount),
        ufmip,
        totalLoanAmount: Math.round(totalLoan),
        ltv,
        monthlyPI: Math.round(mPI),
        monthlyMIP: mMIP,
        monthlyTax: Math.round(mTax),
        monthlyInsurance: Math.round(mIns),
        monthlyHOA: Math.round(mHOA),
        totalMonthly: Math.round(total),
        mipRate,
        mipDuration: mipDur,
        totalMIPPaid: Math.round(totalMIP),
        totalInterest: Math.round(totInt),
        totalPayments: Math.round(totPay),
        frontEndDTI,
        backEndDTI,
        qualifies,
        meetsCreditRequirement: creditScore >= 580 || (creditScore >= 500 && downPaymentPct >= 10),
        meetsDownPaymentRequirement: downPaymentPct >= 3.5,
        withinLimitStatus,
        fhaLoanLimit: fhaLoanLimit ?? null,
    };
}

// ─────────────────────────────────────────────
// CALC: FHA vs CONVENTIONAL
// ─────────────────────────────────────────────

export function calcFHAvsConv(input: FHAvsConvInput): FHAvsConvResult {
    const {
        purchasePrice,
        annualRatePct,
        fhaDownPct = 3.5,
        convDownPct = 5,
        convRatePct,
        propertyTaxRate,
        annualIncome,
        monthlyDebts,
        termYears = 30,
    } = input;

    const fha = calcFHA({
        purchasePrice, downPaymentPct: fhaDownPct, annualRatePct,
        termYears, propertyTaxRate, annualIncome, monthlyDebts,
    });
    const conv = calcConventional({
        purchasePrice, downPaymentPct: convDownPct,
        annualRatePct: convRatePct ?? annualRatePct,
        termYears, propertyTaxRate, annualIncome, monthlyDebts,
    });

    const upfrontDiff = conv.downPayment - fha.downPayment;
    const monthlyDiff = fha.totalMonthly - conv.totalMonthly;
    const breakEvenMonths = monthlyDiff > 0 && upfrontDiff > 0
        ? Math.ceil(upfrontDiff / monthlyDiff) : null;

    return { fha, conv, upfrontDiff, monthlyDiff, breakEvenMonths };
}

// ─────────────────────────────────────────────
// CALC: REFI
// ─────────────────────────────────────────────

function triggerRateSearch(
    balance: number,
    currentRatePct: number,
    closingCosts: number,
    targetYears: number,
    remainingMonths: number,
): number | null {
    const curPmt = monthlyPI(balance, currentRatePct, remainingMonths);
    for (let r10 = Math.floor(currentRatePct * 10) - 1; r10 >= 15; r10--) {
        const r = r10 / 10;
        const newPmt = monthlyPI(balance, r, remainingMonths);
        const save = curPmt - newPmt;
        if (save > 0 && closingCosts / save <= targetYears * 12) return r;
    }
    return null;
}

export function calcRefi(input: RefiInput): RefiResult {
    const {
        currentBalance,
        currentRatePct,
        newRatePct,
        remainingMonths = 360,
        closingCosts,
        yearsIn = 0,
        refiTermMonths,
        isFHAtoConv = false,
        currentMonthlyMIP = 0,
        homeValue,
    } = input;

    const effCosts = closingCosts ?? currentBalance * 0.02;
    const refiTerm = refiTermMonths ?? remainingMonths;

    const curPI = monthlyPI(currentBalance, currentRatePct, remainingMonths);
    const newPI = monthlyPI(currentBalance, newRatePct, refiTerm);

    const piSavings = curPI - newPI;
    const mipSavings = isFHAtoConv ? currentMonthlyMIP : 0;
    const combinedSav = piSavings + mipSavings;

    const annualSav = piSavings * 12;

    const curTotInt = (curPI * remainingMonths) - currentBalance;
    const newTotInt = (newPI * refiTerm) - currentBalance;

    // Breakeven uses combined savings (PI + MIP)
    const beMonths = combinedSav > 0 ? effCosts / combinedSav : null;
    const beYears = beMonths ? beMonths / 12 : null;

    // Trigger rates
    const trig2 = triggerRateSearch(currentBalance, currentRatePct, effCosts, 2, remainingMonths);
    const trig3 = triggerRateSearch(currentBalance, currentRatePct, effCosts, 3, remainingMonths);
    const trig5 = triggerRateSearch(currentBalance, currentRatePct, effCosts, 5, remainingMonths);

    // Wait scenarios
    const wr05 = Math.max(newRatePct - 0.5, 2.0);
    const wr10 = Math.max(newRatePct - 1.0, 2.0);
    const piW05 = monthlyPI(currentBalance, wr05, remainingMonths);
    const piW10 = monthlyPI(currentBalance, wr10, remainingMonths);
    const svW05 = curPI - piW05;
    const svW10 = curPI - piW10;
    const beW05 = svW05 > 0 ? effCosts / svW05 : null;
    const beW10 = svW10 > 0 ? effCosts / svW10 : null;

    // Amortization reset penalty
    let resetPenalty = 0;
    if (yearsIn >= 5 && refiTerm > remainingMonths) {
        const totalIf30yr = newPI * 360;
        const totalIfRemaining = curPI * remainingMonths;
        resetPenalty = Math.max(0, totalIf30yr - totalIfRemaining);
    }

    // 20yr alternative
    const pi20yr = monthlyPI(currentBalance, newRatePct, 240);
    const int20yr = (pi20yr * 240) - currentBalance;
    const int20yrSaved = newTotInt - int20yr;

    // Net milestones
    const net5yr = (piSavings * 60) - effCosts;
    const net10yr = (piSavings * 120) - effCosts;

    // Verdict
    const rateDrop = currentRatePct - newRatePct;
    let verdict: RefiResult['verdict'];
    let verdictReason: string;

    if (combinedSav <= 0) {
        verdict = 'no_savings';
        verdictReason = `Payment rises $${Math.round(Math.abs(piSavings))}/mo at ${newRatePct}%. Only makes sense for cash-out, term shortening, or MIP removal.`;
    } else if (rateDrop < 0.375 && !isFHAtoConv) {
        verdict = 'poor';
        verdictReason = `Rate drop of ${rateDrop.toFixed(2)}% is too thin. General rule: need 0.5%+ improvement to cover costs. Your 3yr trigger rate: ${trig3 ? trig3.toFixed(2) + '%' : 'not available'}.`;
    } else if (beYears && beYears <= 2.5) {
        verdict = 'strong';
        verdictReason = `Breakeven in ${beYears.toFixed(1)} years — clear win if staying 2+ years.`;
    } else if (beYears && beYears <= 4) {
        verdict = 'good';
        verdictReason = `Breakeven in ${beYears.toFixed(1)} years. Solid if staying 4+ years.`;
    } else if (beYears && beYears <= 6) {
        verdict = 'marginal';
        verdictReason = `Breakeven is ${beYears.toFixed(1)} years. Works if staying 7+ years.`;
    } else {
        verdict = 'poor';
        verdictReason = `Breakeven is ${beYears ? beYears.toFixed(1) + ' years' : 'too long'}. Consider waiting for a lower rate.`;
    }

    return {
        currentBalance,
        currentRatePct,
        newRatePct,
        remainingMonths,
        refiTermMonths: refiTerm,
        closingCosts: Math.round(effCosts),
        currentMonthlyPI: Math.round(curPI),
        currentTotalInterest: Math.round(curTotInt),
        newMonthlyPI: Math.round(newPI),
        newTotalInterest: Math.round(newTotInt),
        monthlyPISavings: Math.round(piSavings),
        annualSavings: Math.round(annualSav),
        totalMIPSavingsIfFHA: isFHAtoConv ? Math.round(mipSavings * (beMonths ?? 60)) : 0,
        combinedMonthlySavings: Math.round(combinedSav),
        breakEvenMonths: beMonths !== null ? Math.ceil(beMonths) : null,
        breakEvenYears: beYears !== null ? Math.round(beYears * 10) / 10 : null,
        triggerRate2yr: trig2,
        triggerRate3yr: trig3,
        triggerRate5yr: trig5,
        waitRate05: wr05,
        waitRate10: wr10,
        waitMonthlySavings05: Math.round(svW05),
        waitMonthlySavings10: Math.round(svW10),
        waitBreakeven05: beW05 !== null ? Math.round(beW05 / 12 * 10) / 10 : null,
        waitBreakeven10: beW10 !== null ? Math.round(beW10 / 12 * 10) / 10 : null,
        resetPenalty: Math.round(resetPenalty),
        amortReset: yearsIn >= 10,
        pi20yr: Math.round(pi20yr),
        interest20yr: Math.round(int20yr),
        interest20yrSaved: Math.round(int20yrSaved),
        netSavings5yr: Math.round(net5yr),
        netSavings10yr: Math.round(net10yr),
        verdict,
        verdictReason,
        rateDrop: Math.round(rateDrop * 1000) / 1000,
    };
}

// ─────────────────────────────────────────────
// CALC: AFFORDABILITY
// ─────────────────────────────────────────────

export function calcAffordabilityScenario(
    annualIncome: number,
    savings: number,
    monthlyDebts: number,
    annualRatePct: number,
    downPct: number,              // e.g. 3.5
    program: 'FHA' | 'Conventional',
    loanLimit: number,
    propertyTaxRate = TAX_RATE_DEFAULT,
    locationLabel = '',
): AffordabilityScenario {
    const monthlyIncome = annualIncome / 12;
    const r = (annualRatePct / 100) / 12;
    const n = 360;
    const annuityFactor = r === 0 ? n : (Math.pow(1 + r, n) - 1) / (r * Math.pow(1 + r, n));

    const dtiTarget = 0.43;
    let maxPI = (monthlyIncome * dtiTarget - monthlyDebts) * 0.85;

    let homePrice = 0;
    for (let i = 0; i < 6; i++) {
        const loan = maxPI * annuityFactor;
        homePrice = loan / (1 - downPct / 100);
        const mTaxIns = (homePrice * (propertyTaxRate + 0.0035)) / 12;
        const mPMI = program === 'FHA'
            ? (loan * FHA_MIP_RATE / 12)
            : (downPct < 20 ? loan * PMI_RATE_STD / 12 : 0);
        maxPI = (monthlyIncome * dtiTarget - monthlyDebts) - mTaxIns - mPMI;
        if (maxPI <= 0) { maxPI = (monthlyIncome * dtiTarget - monthlyDebts) * 0.5; break; }
    }

    // Cap at loan limit
    const maxPriceForLimit = loanLimit / (1 - downPct / 100);
    const wasLimitCapped = homePrice > maxPriceForLimit;
    if (wasLimitCapped) homePrice = maxPriceForLimit;

    const isFHA = program === 'FHA';
    const baseLoan = homePrice * (1 - downPct / 100);
    const downAmt = homePrice * (downPct / 100);
    const ufmip = isFHA ? Math.round(baseLoan * FHA_UFMIP_RATE) : 0;
    const loanAmt = baseLoan + ufmip;

    const closingCostPct = isFHA ? 0.03 : 0.025;
    const closingCosts = homePrice * closingCostPct;
    const totalCash = downAmt + closingCosts;
    const savingsGap = Math.max(0, totalCash - savings);

    const mPI = monthlyPI(loanAmt, annualRatePct, n);
    const mTax = (homePrice * propertyTaxRate) / 12;
    const mIns = INS_ANNUAL_DEFAULT / 12;
    // MIP on BASE loan
    const mMI = isFHA
        ? Math.round(baseLoan * FHA_MIP_RATE / 12)
        : (downPct < 20 ? Math.round(baseLoan * PMI_RATE_STD / 12) : 0);
    const total = mPI + mTax + mIns + mMI;

    const frontEndDTI = Math.round((total / monthlyIncome) * 1000) / 10;
    const backEndDTI = Math.round(((total + monthlyDebts) / monthlyIncome) * 1000) / 10;
    const totInt = (mPI * n) - loanAmt;

    const label = isFHA ? `FHA (${downPct}% down)` : `Conventional (${downPct}% down)`;
    const icon = isFHA ? '🏠' : downPct >= 20 ? '🛡️' : '🎯';

    return {
        label, icon, program,
        downPaymentPct: downPct,
        homePrice: Math.round(homePrice),
        downPaymentAmount: Math.round(downAmt),
        baseLoanAmount: Math.round(baseLoan),
        ufmip,
        loanAmount: Math.round(loanAmt),
        closingCosts: Math.round(closingCosts),
        totalCashNeeded: Math.round(totalCash),
        savingsGap: Math.round(savingsGap),
        savingsAfterClose: Math.max(0, Math.round(savings - totalCash)),
        monthlyPI: Math.round(mPI),
        monthlyTax: Math.round(mTax),
        monthlyInsurance: Math.round(mIns),
        monthlyMI: mMI,
        totalMonthly: Math.round(total),
        totalInterest: Math.round(totInt),
        frontEndDTI,
        backEndDTI,
        rate: annualRatePct,
        isFHA,
        wasLimitCapped,
        loanLimitForProgram: loanLimit,
        locationLabel,
    };
}

export function calcAffordability(input: AffordabilityInput): AffordabilityResult {
    const {
        annualIncome,
        savings,
        monthlyDebts = 0,
        annualRatePct,
        downPctOverride,
        propertyTaxRate = TAX_RATE_DEFAULT,
        fhaLoanLimit = FHA_FLOOR_2026,
        confLoanLimit = CONF_STANDARD,
        locationLabel = '',
    } = input;

    const scenarios: AffordabilityScenario[] = [];

    if (downPctOverride !== undefined) {
        const pct = downPctOverride * 100;
        const isFHAPct = downPctOverride <= 0.035;
        const prog: 'FHA' | 'Conventional' = isFHAPct ? 'FHA' : 'Conventional';
        const limit = isFHAPct ? fhaLoanLimit : confLoanLimit;
        scenarios.push(calcAffordabilityScenario(annualIncome, savings, monthlyDebts, annualRatePct, pct, prog, limit, propertyTaxRate, locationLabel));
        scenarios.push(calcAffordabilityScenario(annualIncome, savings, monthlyDebts, annualRatePct, 20, 'Conventional', confLoanLimit, propertyTaxRate, locationLabel));
        if (!isFHAPct) {
            scenarios.push(calcAffordabilityScenario(annualIncome, savings, monthlyDebts, annualRatePct, 3.5, 'FHA', fhaLoanLimit, propertyTaxRate, locationLabel));
        }
    } else {
        scenarios.push(calcAffordabilityScenario(annualIncome, savings, monthlyDebts, annualRatePct, 3.5, 'FHA', fhaLoanLimit, propertyTaxRate, locationLabel));
        scenarios.push(calcAffordabilityScenario(annualIncome, savings, monthlyDebts, annualRatePct, 3.0, 'Conventional', confLoanLimit, propertyTaxRate, locationLabel));
        scenarios.push(calcAffordabilityScenario(annualIncome, savings, monthlyDebts, annualRatePct, 20.0, 'Conventional', confLoanLimit, propertyTaxRate, locationLabel));
    }

    return { scenarios, annualIncome, savings, monthlyDebts, rate: annualRatePct };
}

// ─────────────────────────────────────────────
// CALC: DSCR
// ─────────────────────────────────────────────

export function calcDSCR(input: DSCRInput): DSCRResult {
    const {
        purchasePrice,
        grossMonthlyRent,
        downPaymentPct = 25,
        annualRatePct,
        vacancyRate = 0,
        propertyTaxRate = TAX_RATE_DEFAULT * 100,
        annualInsurance = INS_ANNUAL_DEFAULT,
        hoaMonthly = 0,
    } = input;

    const downPayment = purchasePrice * (downPaymentPct / 100);
    const loanAmount = purchasePrice - downPayment;
    const termMo = 360;

    const mPI = monthlyPI(loanAmount, annualRatePct, termMo);
    const mTax = (purchasePrice * (propertyTaxRate / 100)) / 12;
    const mIns = annualInsurance / 12;
    const mHOA = hoaMonthly;
    const mPITIA = mPI + mTax + mIns + mHOA;

    const egi = grossMonthlyRent * (1 - vacancyRate);
    const dscr = mPITIA > 0 ? egi / mPITIA : 0;
    const monthlyCF = egi - mPITIA;
    const annualCF = monthlyCF * 12;
    const totInt = totalInterest(loanAmount, annualRatePct, termMo);

    let dscrStatus: DSCRResult['dscrStatus'];
    if (dscr >= 1.25) dscrStatus = 'excellent';
    else if (dscr >= 1.0) dscrStatus = 'qualifies';
    else if (dscr >= 0.75) dscrStatus = 'below_min';
    else dscrStatus = 'does_not_qualify';

    // Amortization snapshot
    const r = annualRatePct / 100 / 12;
    let bal = loanAmount;
    let cumPrincipal = 0;
    const snap: DSCRResult['amortSnap'] = [];
    const snapYears = new Set([1, 5, 10, 15, 20, 30]);
    for (let yr = 1; yr <= 30; yr++) {
        let yrP = 0, yrI = 0;
        for (let mo = 0; mo < 12; mo++) {
            const intPmt = bal * r;
            const prinPmt = mPI - intPmt;
            yrI += intPmt; yrP += prinPmt;
            bal = Math.max(0, bal - prinPmt);
        }
        cumPrincipal += yrP;
        if (snapYears.has(yr)) {
            snap.push({ year: yr, cumPrincipal: Math.round(cumPrincipal), yearInterest: Math.round(yrI), balance: Math.round(bal) });
        }
    }

    return {
        purchasePrice,
        grossMonthlyRent,
        downPaymentPct,
        annualRatePct,
        vacancyRate,
        downPayment: Math.round(downPayment),
        loanAmount: Math.round(loanAmount),
        monthlyPI: Math.round(mPI),
        monthlyTax: Math.round(mTax),
        monthlyInsurance: Math.round(mIns),
        monthlyHOA: Math.round(mHOA),
        monthlyPITIA: Math.round(mPITIA),
        effectiveGrossIncome: Math.round(egi),
        dscr: Math.round(dscr * 100) / 100,
        monthlyCashFlow: Math.round(monthlyCF),
        annualCashFlow: Math.round(annualCF),
        totalInterest: Math.round(totInt),
        dscrStatus,
        amortSnap: snap,
    };
}

// ─────────────────────────────────────────────
// BUILT-IN VERIFICATION TESTS
// Run these on deploy: import { runCalcTests } from 'lib/calcEngine'
// ─────────────────────────────────────────────

export interface CalcTestResult {
    passed: boolean;
    failures: string[];
}

export function runCalcTests(): CalcTestResult {
    const failures: string[] = [];
    const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

    // ── Primitive: monthlyPI ──
    // $300k at 6% for 30yr = $1,798.65
    const pi1 = monthlyPI(300000, 6.0, 360);
    if (!near(pi1, 1798.65, 0.50)) failures.push(`monthlyPI(300k,6%,360)=${pi1.toFixed(2)} expected ~1798.65`);

    // $500k at 7% for 15yr = $4,494.07
    const pi2 = monthlyPI(500000, 7.0, 180);
    if (!near(pi2, 4494.07, 1.00)) failures.push(`monthlyPI(500k,7%,180)=${pi2.toFixed(2)} expected ~4494.07`);

    // ── Conventional ──
    const conv = calcConventional({ purchasePrice: 850000, downPaymentPct: 20, annualRatePct: 6.5, termYears: 30 });
    if (conv.loanAmount !== 680000) failures.push(`conv loanAmount=${conv.loanAmount} expected 680000`);
    if (!near(conv.monthlyPI, 4298, 5)) failures.push(`conv monthlyPI=${conv.monthlyPI} expected ~4298`);
    if (conv.monthlyPMI !== 0) failures.push(`conv monthlyPMI=${conv.monthlyPMI} expected 0 at 20% down`);

    // ── FHA ──
    const fha = calcFHA({ purchasePrice: 750000, downPaymentPct: 3.5, annualRatePct: 6.0 });
    if (!near(fha.downPayment, 26250, 1)) failures.push(`fha downPayment=${fha.downPayment} expected 26250`);
    if (!near(fha.baseLoanAmount, 723750, 1)) failures.push(`fha baseLoan=${fha.baseLoanAmount} expected 723750`);
    if (!near(fha.ufmip, 12666, 5)) failures.push(`fha ufmip=${fha.ufmip} expected 12666`);
    if (!near(fha.totalLoanAmount, 736416, 10)) failures.push(`fha totalLoan=${fha.totalLoanAmount} expected 736416`);
    if (!near(fha.monthlyPI, 4415, 5)) failures.push(`fha monthlyPI=${fha.monthlyPI} expected 4415`);
    // MIP on BASE loan: 723750 * 0.0055 / 12 = 331.72 → rounded to 332
    if (!near(fha.monthlyMIP, 332, 2)) failures.push(`fha monthlyMIP=${fha.monthlyMIP} expected 332 (base loan)`);
    if (!near(fha.monthlyTax, 688, 2)) failures.push(`fha monthlyTax=${fha.monthlyTax} expected 688`);
    if (fha.mipDuration !== 'Life of loan') failures.push(`fha mipDuration=${fha.mipDuration} expected 'Life of loan'`);
    // FHA with 10% down → 11yr MIP
    const fha10 = calcFHA({ purchasePrice: 400000, downPaymentPct: 10, annualRatePct: 6.5 });
    if (fha10.mipDuration !== '11 years') failures.push(`fha10 mipDuration=${fha10.mipDuration} expected '11 years'`);

    // ── Refi ──
    const refi = calcRefi({ currentBalance: 650000, currentRatePct: 7.0, newRatePct: 6.0, remainingMonths: 360 });
    if (!near(refi.currentMonthlyPI, 4325, 5)) failures.push(`refi curPI=${refi.currentMonthlyPI} expected ~4325`);
    if (!near(refi.newMonthlyPI, 3898, 5)) failures.push(`refi newPI=${refi.newMonthlyPI} expected ~3898`);
    if (!near(refi.monthlyPISavings, 427, 5)) failures.push(`refi savings=${refi.monthlyPISavings} expected ~427`);
    if (refi.breakEvenYears === null) failures.push(`refi breakeven is null`);

    // ── DSCR ──
    const dscr = calcDSCR({ purchasePrice: 600000, grossMonthlyRent: 3800, downPaymentPct: 25, annualRatePct: 7.0 });
    if (!near(dscr.loanAmount, 450000, 1)) failures.push(`dscr loanAmount=${dscr.loanAmount} expected 450000`);
    if (dscr.dscr <= 0) failures.push(`dscr ratio=${dscr.dscr} should be positive`);

    return { passed: failures.length === 0, failures };
}

// version: (new)
// version: calcEngine-2026-03-08-01