// lib/fhaCalculator.ts
//
// LEGACY COMPATIBILITY WRAPPER -- as of the Priority Corrective Workstream
// "Canonical Deterministic Mortgage Math Integrity" (2026-09-10), this file
// no longer computes FHA math itself. It previously computed monthly MIP on
// the TOTAL loan (base + UFMIP) instead of the base loan HUD's own spec
// requires, used a stale 2024 national loan-limit floor, and its sibling
// compareFHAvsConventional() never zeroed conventional PMI at <=80% LTV --
// three confirmed, real numeric divergences from lib/calcEngine.ts's
// calcFHA(), tracked as DEBT-01 in DEBT_REGISTER.md (2026-06-11) and
// re-confirmed by this workstream's forensic audit.
//
// Per DEBT-01's own prescribed fix ("re-point ... at calcFHA() ... then
// delete lib/fhaCalculator.ts") and this workstream's Phase 13 guidance
// ("legacy wrappers may temporarily remain, but they should call canonical
// primitives rather than independently calculate the same values"), this
// file keeps its exact external function names/signatures/field names (its
// one remaining live caller, app/api/answers/route.ts, reads fields like
// `totalDTI` and `qualifies` that differ in name/meaning from calcEngine's
// FHAResult) but every number now comes from calcEngine.ts's calcFHA() /
// monthlyPMI(). Do not add new FHA math here -- extend lib/calcEngine.ts
// instead, and this wrapper will pick it up automatically.

import { calcFHA, monthlyPMI, FHA_FLOOR_2026 } from './calcEngine';

export interface FHAInput {
    purchasePrice: number;
    downPaymentPct: number;        // e.g. 3.5
    interestRate: number;          // e.g. 6.5
    creditScore: number;           // e.g. 640
    loanTerm: number;              // 15 or 30
    propertyTaxRate: number;       // e.g. 1.1 (percent)
    homeInsuranceAnnual: number;   // e.g. 1200
    hoaMonthly: number;
    annualIncome?: number;
    monthlyDebts?: number;
}

export interface FHAResult {
    purchasePrice: number;
    downPayment: number;
    downPaymentPct: number;
    baseLoanAmount: number;
    ufmip: number;                 // Upfront MIP (1.75%)
    totalLoanAmount: number;       // Base + UFMIP
    annualMIPRate: number;         // e.g. 0.55
    monthlyMIP: number;
    mipDuration: string;           // "11 years" or "Life of loan"
    monthlyPI: number;
    monthlyTax: number;
    monthlyInsurance: number;
    monthlyHOA: number;
    totalMonthly: number;          // PITI + MIP + HOA
    // DTI
    frontEndDTI?: number;
    totalDTI?: number;
    qualifies?: boolean;
    // Loan limits
    fhaLoanLimit: number;
    withinLimits: boolean;
    meetsDownPaymentRequirement: boolean;
    meetsCreditRequirement: boolean;
}

export function calculateFHA(input: FHAInput): FHAResult {
    const r = calcFHA({
        purchasePrice: input.purchasePrice,
        downPaymentPct: input.downPaymentPct,
        annualRatePct: input.interestRate,
        termYears: input.loanTerm,
        creditScore: input.creditScore,
        propertyTaxRate: input.propertyTaxRate,
        // Only pass a real annualInsurance override when the caller actually
        // has one -- omitting it lets calcFHA apply its own canonical
        // percentage-based default (INS_RATE_DEFAULT) rather than a flat
        // dollar figure that doesn't scale with purchase price.
        annualInsurance: input.homeInsuranceAnnual > 0 ? input.homeInsuranceAnnual : undefined,
        hoaMonthly: input.hoaMonthly,
        monthlyDebts: input.monthlyDebts,
        annualIncome: input.annualIncome,
    });

    return {
        purchasePrice: r.purchasePrice,
        downPayment: r.downPayment,
        downPaymentPct: r.downPaymentPct,
        baseLoanAmount: r.baseLoanAmount,
        ufmip: r.ufmip,
        totalLoanAmount: r.totalLoanAmount,
        annualMIPRate: r.mipRate * 100,
        monthlyMIP: r.monthlyMIP,
        mipDuration: r.mipDuration,
        monthlyPI: r.monthlyPI,
        monthlyTax: r.monthlyTax,
        monthlyInsurance: r.monthlyInsurance,
        monthlyHOA: r.monthlyHOA,
        totalMonthly: r.totalMonthly,
        frontEndDTI: r.frontEndDTI ?? undefined,
        totalDTI: r.backEndDTI ?? undefined,
        qualifies: r.qualifies ?? undefined,
        fhaLoanLimit: FHA_FLOOR_2026,
        withinLimits: r.baseLoanAmount <= FHA_FLOOR_2026,
        meetsDownPaymentRequirement: r.meetsDownPaymentRequirement,
        meetsCreditRequirement: r.meetsCreditRequirement,
    };
}

export interface FHAvsConventionalComparison {
    fha: {
        downPayment: number;
        downPaymentPct: number;
        upfrontCost: number; // down + UFMIP
        monthlyPayment: number;
        monthlyMI: number;
        miDuration: string;
        fiveYearMI: number;
    };
    conventional: {
        downPayment: number;
        downPaymentPct: number;
        monthlyPayment: number;
        monthlyMI: number; // PMI
        miDuration: string;
        fiveYearMI: number;
    };
}

export function compareFHAvsConventional(
    purchasePrice: number,
    interestRate: number,
    annualIncome: number,
    monthlyDebts: number,
    propertyTaxRate: number
): FHAvsConventionalComparison {
    // FHA: 3.5% down
    const fhaResult = calculateFHA({
        purchasePrice,
        downPaymentPct: 3.5,
        interestRate,
        creditScore: 640,
        loanTerm: 30,
        propertyTaxRate,
        homeInsuranceAnnual: 0, // let calcFHA apply its own canonical default
        hoaMonthly: 0,
        annualIncome,
        monthlyDebts,
    });

    // Conventional: 5% down, no UFMIP. PMI now uses the SAME canonical,
    // LTV-tiered rate table as lib/calcEngine.ts's monthlyPMI() -- the prior
    // inline ladder here (0.65%/0.50%) never zeroed PMI at <=80% LTV, a
    // confirmed divergence from every other conventional PMI calculation in
    // the codebase.
    const convDownPct = 5;
    const convDown = purchasePrice * 0.05;
    const convLoan = purchasePrice - convDown;
    const convLTV = convLoan / purchasePrice;
    const convPI = (() => {
        const monthlyRate = interestRate / 100 / 12;
        const n = 360;
        if (monthlyRate === 0) return convLoan / n;
        return (convLoan * monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
    })();
    const convTax = (purchasePrice * (propertyTaxRate / 100)) / 12;
    const convInsurance = 1200 / 12; // matches calcEngine's INS_ANNUAL_DEFAULT legacy flat figure for this illustrative comparison
    const convPMI = Math.round(monthlyPMI(convLoan, convLTV));
    const convTotal = Math.round(convPI + convPMI + convTax + convInsurance);

    return {
        fha: {
            downPayment: fhaResult.downPayment,
            downPaymentPct: 3.5,
            upfrontCost: fhaResult.downPayment + fhaResult.ufmip,
            monthlyPayment: fhaResult.totalMonthly,
            monthlyMI: fhaResult.monthlyMIP,
            miDuration: fhaResult.mipDuration,
            fiveYearMI: fhaResult.monthlyMIP * 60,
        },
        conventional: {
            downPayment: Math.round(convDown),
            downPaymentPct: convDownPct,
            monthlyPayment: convTotal,
            monthlyMI: convPMI,
            miDuration: convPMI > 0 ? "Until 80% LTV (approx. 8-10 years)" : "None (20%+ down)",
            fiveYearMI: convPMI * 60,
        },
    };
}
