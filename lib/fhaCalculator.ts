// lib/fhaCalculator.ts
// Official FHA MIP rates (as of 2024, per HUD ML 2023-05)

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

/** 2024 FHA loan limit (national floor / ceiling varies by county) */
const FHA_LOAN_LIMIT_2024 = 498_257; // national floor; high-cost up to 1,149,825

/**
 * Get annual MIP rate based on loan term, LTV, and loan amount.
 * Source: HUD Mortgagee Letter 2023-05 (effective March 2023)
 */
function getAnnualMIPRate(
    loanTerm: number,
    ltvPct: number,
    loanAmount: number
): number {
    if (loanTerm > 15) {
        // 30-year
        if (loanAmount <= 726_200) {
            if (ltvPct <= 90) return 0.50;
            if (ltvPct <= 95) return 0.50;
            return 0.55; // LTV > 95%
        } else {
            // Jumbo FHA
            if (ltvPct <= 90) return 0.70;
            if (ltvPct <= 95) return 0.70;
            return 0.75;
        }
    } else {
        // 15-year
        if (loanAmount <= 726_200) {
            if (ltvPct <= 90) return 0.15;
            return 0.40;
        } else {
            if (ltvPct <= 78) return 0.15;
            if (ltvPct <= 90) return 0.40;
            return 0.65;
        }
    }
}

/**
 * MIP duration rules:
 * - 15-year: cancelled when LTV reaches 78% (regardless of when)
 * - 30-year with ≥10% down (LTV ≤ 90%): 11 years
 * - 30-year with <10% down (LTV > 90%): Life of loan
 */
function getMIPDuration(loanTerm: number, downPaymentPct: number): string {
    if (loanTerm <= 15) return "Cancelled at 78% LTV";
    if (downPaymentPct >= 10) return "11 years";
    return "Life of loan";
}

/** Monthly payment (P&I) */
function monthlyPI(principal: number, annualRate: number, termYears: number): number {
    const r = annualRate / 100 / 12;
    const n = termYears * 12;
    if (r === 0) return principal / n;
    return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

export function calculateFHA(input: FHAInput): FHAResult {
    const {
        purchasePrice,
        downPaymentPct,
        interestRate,
        creditScore,
        loanTerm,
        propertyTaxRate,
        homeInsuranceAnnual,
        hoaMonthly,
        annualIncome,
        monthlyDebts = 0,
    } = input;

    const downPayment = purchasePrice * (downPaymentPct / 100);
    const baseLoanAmount = purchasePrice - downPayment;
    const ltvPct = (baseLoanAmount / purchasePrice) * 100;

    // UFMIP: 1.75% of base loan
    const ufmip = baseLoanAmount * 0.0175;
    const totalLoanAmount = baseLoanAmount + ufmip;

    // Monthly MIP
    const annualMIPRate = getAnnualMIPRate(loanTerm, ltvPct, baseLoanAmount);
    const monthlyMIPValue = (totalLoanAmount * (annualMIPRate / 100)) / 12;
    const mipDuration = getMIPDuration(loanTerm, downPaymentPct);

    // Monthly P&I
    const piPayment = monthlyPI(totalLoanAmount, interestRate, loanTerm);

    // Monthly tax & insurance
    const monthlyTax = (purchasePrice * (propertyTaxRate / 100)) / 12;
    const monthlyInsurance = homeInsuranceAnnual / 12;

    const totalMonthly = piPayment + monthlyMIPValue + monthlyTax + monthlyInsurance + hoaMonthly;

    // DTI
    let frontEndDTI: number | undefined;
    let totalDTI: number | undefined;
    let qualifies: boolean | undefined;

    if (annualIncome && annualIncome > 0) {
        const monthlyIncome = annualIncome / 12;
        frontEndDTI = Math.round((totalMonthly / monthlyIncome) * 1000) / 10;
        totalDTI = Math.round(((totalMonthly + monthlyDebts) / monthlyIncome) * 1000) / 10;
        // FHA: front ≤ 31%, back ≤ 43% (up to 50% with compensating factors)
        qualifies = frontEndDTI <= 31 && totalDTI <= 43;
    }

    return {
        purchasePrice,
        downPayment: Math.round(downPayment),
        downPaymentPct,
        baseLoanAmount: Math.round(baseLoanAmount),
        ufmip: Math.round(ufmip),
        totalLoanAmount: Math.round(totalLoanAmount),
        annualMIPRate,
        monthlyMIP: Math.round(monthlyMIPValue),
        mipDuration,
        monthlyPI: Math.round(piPayment),
        monthlyTax: Math.round(monthlyTax),
        monthlyInsurance: Math.round(monthlyInsurance),
        monthlyHOA: hoaMonthly,
        totalMonthly: Math.round(totalMonthly),
        frontEndDTI,
        totalDTI,
        qualifies,
        fhaLoanLimit: FHA_LOAN_LIMIT_2024,
        withinLimits: baseLoanAmount <= FHA_LOAN_LIMIT_2024,
        meetsDownPaymentRequirement: downPaymentPct >= (creditScore >= 580 ? 3.5 : 10),
        meetsCreditRequirement: creditScore >= 500,
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
        homeInsuranceAnnual: 1200,
        hoaMonthly: 0,
        annualIncome,
        monthlyDebts,
    });

    // Conventional: 5% down, no UFMIP, PMI ~0.5-1%
    const convDownPct = 5;
    const convDown = purchasePrice * 0.05;
    const convLoan = purchasePrice - convDown;
    const convLTV = (convLoan / purchasePrice) * 100;
    const convPI = monthlyPI(convLoan, interestRate, 30);
    const convTax = (purchasePrice * (propertyTaxRate / 100)) / 12;
    const convInsurance = 1200 / 12;
    // PMI: ~0.65% for 95% LTV, 640 credit
    const convPMIRate = convLTV > 90 ? 0.0065 : 0.005;
    const convPMI = Math.round((convLoan * convPMIRate) / 12);
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
            miDuration: "Until 80% LTV (approx. 8-10 years)",
            fiveYearMI: convPMI * 60,
        },
    };
}
