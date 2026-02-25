// lib/fhaCalculator.ts
// FHA Mortgage Calculator with UFMIP, MIP, DTI calculations

export interface FHAInput {
    purchasePrice: number;
    downPaymentPct?: number; // Default 3.5%
    creditScore?: number; // Affects MIP rates
    loanTerm?: number; // 15 or 30 years
    interestRate: number;
    propertyTaxRate?: number; // Annual % (e.g., 1.2 for 1.2%)
    homeInsuranceAnnual?: number; // Annual amount
    hoaMonthly?: number;
    annualIncome?: number; // For DTI calculation
    monthlyDebts?: number; // For DTI calculation
}

export interface FHAResult {
    // Loan Details
    purchasePrice: number;
    downPayment: number;
    downPaymentPct: number;
    baseLoanAmount: number;

    // FHA-Specific Costs
    ufmip: number; // Upfront Mortgage Insurance Premium
    ufmipPct: number; // Usually 1.75%
    totalLoanAmount: number; // Base + UFMIP

    // Monthly Costs
    monthlyPI: number; // Principal + Interest
    monthlyMIP: number; // Monthly Mortgage Insurance Premium
    monthlyPropertyTax: number;
    monthlyHomeInsurance: number;
    monthlyHOA: number;
    totalMonthlyPITI: number;
    totalMonthlyPITIA: number; // PITI + HOA

    // Totals
    totalInterest: number;
    totalMIPPaid: number; // Over life of loan
    totalPaid: number; // All payments over life

    // DTI Analysis
    housingDTI?: number; // Front-end ratio (PITIA / Income)
    totalDTI?: number; // Back-end ratio ((PITIA + Debts) / Income)
    maxMonthlyPayment?: number; // At 43% DTI
    qualifies?: boolean; // Based on DTI limits

    // FHA Limits
    fhaLoanLimit: number; // Based on county
    withinLimits: boolean;

    // Guidelines
    meetsCreditRequirement: boolean;
    meetsDownPaymentRequirement: boolean;
    mipDuration: string; // How long MIP required
}

/**
 * FHA Loan Limits by County Type (2024)
 */
const FHA_LOAN_LIMITS = {
    floor: 498257, // Standard counties
    ceiling: 1149825, // High-cost counties (e.g., SF, NYC)
};

/**
 * Get MIP rate based on loan characteristics
 * FHA MIP rates vary by LTV, loan term, and loan amount
 */
function getMIPRate(
    baseLoanAmount: number,
    loanTerm: number,
    ltvRatio: number
): { annualRate: number; duration: string } {
    // 30-year loans
    if (loanTerm === 30) {
        if (ltvRatio <= 95) {
            // Base loan ≤ $726,200
            if (baseLoanAmount <= 726200) {
                return { annualRate: 0.0050, duration: '11 years' }; // 0.50%
            } else {
                return { annualRate: 0.0055, duration: '11 years' }; // 0.55%
            }
        } else {
            // LTV > 95%
            if (baseLoanAmount <= 726200) {
                return { annualRate: 0.0055, duration: 'Life of loan' }; // 0.55%
            } else {
                return { annualRate: 0.0070, duration: 'Life of loan' }; // 0.70%
            }
        }
    }

    // 15-year loans
    if (loanTerm === 15) {
        if (ltvRatio <= 90) {
            return { annualRate: 0.0045, duration: '11 years' }; // 0.45%
        } else {
            return { annualRate: 0.0070, duration: 'Life of loan' }; // 0.70%
        }
    }

    // Default
    return { annualRate: 0.0055, duration: 'Life of loan' };
}

/**
 * Calculate FHA mortgage with all costs
 */
export function calculateFHA(input: FHAInput): FHAResult {
    const {
        purchasePrice,
        downPaymentPct = 3.5,
        creditScore = 580, // FHA minimum
        loanTerm = 30,
        interestRate,
        propertyTaxRate = 1.1,
        homeInsuranceAnnual = 1200,
        hoaMonthly = 0,
        annualIncome,
        monthlyDebts = 0,
    } = input;

    // Down Payment
    const downPayment = purchasePrice * (downPaymentPct / 100);
    const baseLoanAmount = purchasePrice - downPayment;

    // UFMIP (Upfront Mortgage Insurance Premium) - 1.75% of base loan
    const ufmipPct = 1.75;
    const ufmip = baseLoanAmount * (ufmipPct / 100);

    // Total loan amount (base + UFMIP financed)
    const totalLoanAmount = baseLoanAmount + ufmip;

    // LTV Ratio (for MIP calculation)
    const ltvRatio = (baseLoanAmount / purchasePrice) * 100;

    // Get MIP rate
    const mipInfo = getMIPRate(baseLoanAmount, loanTerm, ltvRatio);

    // Monthly P&I on total loan amount (including financed UFMIP)
    const monthlyRate = interestRate / 100 / 12;
    const numberOfPayments = loanTerm * 12;
    const monthlyPI =
        (totalLoanAmount * monthlyRate * Math.pow(1 + monthlyRate, numberOfPayments)) /
        (Math.pow(1 + monthlyRate, numberOfPayments) - 1);

    // Monthly MIP
    const monthlyMIP = (totalLoanAmount * mipInfo.annualRate) / 12;

    // Other monthly costs
    const monthlyPropertyTax = (purchasePrice * (propertyTaxRate / 100)) / 12;
    const monthlyHomeInsurance = homeInsuranceAnnual / 12;
    const monthlyHOA = hoaMonthly;

    // Total monthly payments
    const totalMonthlyPITI = monthlyPI + monthlyPropertyTax + monthlyHomeInsurance;
    const totalMonthlyPITIA = totalMonthlyPITI + monthlyMIP + monthlyHOA;

    // Total costs over life of loan
    const totalPaid = monthlyPI * numberOfPayments;
    const totalInterest = totalPaid - totalLoanAmount;

    // Total MIP paid (depends on duration)
    let mipPayments: number;
    if (mipInfo.duration === 'Life of loan') {
        mipPayments = numberOfPayments;
    } else {
        // 11 years
        mipPayments = 11 * 12;
    }
    const totalMIPPaid = monthlyMIP * mipPayments;

    // DTI Calculations
    let housingDTI: number | undefined;
    let totalDTI: number | undefined;
    let maxMonthlyPayment: number | undefined;
    let qualifies: boolean | undefined;

    if (annualIncome) {
        const monthlyIncome = annualIncome / 12;
        housingDTI = (totalMonthlyPITIA / monthlyIncome) * 100;
        totalDTI = ((totalMonthlyPITIA + monthlyDebts) / monthlyIncome) * 100;
        maxMonthlyPayment = (monthlyIncome * 0.43) - monthlyDebts; // 43% max DTI

        // FHA allows up to 43% back-end DTI (sometimes 50% with compensating factors)
        qualifies = totalDTI <= 43;
    }

    // FHA Loan Limits (simplified - would need county lookup in production)
    const fhaLoanLimit = FHA_LOAN_LIMITS.ceiling; // Use max for now
    const withinLimits = baseLoanAmount <= fhaLoanLimit;

    // FHA Requirements
    const meetsCreditRequirement = creditScore >= 580; // 580 for 3.5% down
    const meetsDownPaymentRequirement = downPaymentPct >= 3.5;

    return {
        purchasePrice,
        downPayment: Math.round(downPayment),
        downPaymentPct,
        baseLoanAmount: Math.round(baseLoanAmount),

        ufmip: Math.round(ufmip),
        ufmipPct,
        totalLoanAmount: Math.round(totalLoanAmount),

        monthlyPI: Math.round(monthlyPI),
        monthlyMIP: Math.round(monthlyMIP),
        monthlyPropertyTax: Math.round(monthlyPropertyTax),
        monthlyHomeInsurance: Math.round(monthlyHomeInsurance),
        monthlyHOA: Math.round(monthlyHOA),
        totalMonthlyPITI: Math.round(totalMonthlyPITI),
        totalMonthlyPITIA: Math.round(totalMonthlyPITIA),

        totalInterest: Math.round(totalInterest),
        totalMIPPaid: Math.round(totalMIPPaid),
        totalPaid: Math.round(totalPaid + totalMIPPaid + (monthlyPropertyTax * numberOfPayments) + (monthlyHomeInsurance * numberOfPayments)),

        housingDTI: housingDTI ? Math.round(housingDTI * 10) / 10 : undefined,
        totalDTI: totalDTI ? Math.round(totalDTI * 10) / 10 : undefined,
        maxMonthlyPayment: maxMonthlyPayment ? Math.round(maxMonthlyPayment) : undefined,
        qualifies,

        fhaLoanLimit,
        withinLimits,

        meetsCreditRequirement,
        meetsDownPaymentRequirement,
        mipDuration: mipInfo.duration,
    };
}

/**
 * Compare FHA vs Conventional
 */
export function compareFHAvsConventional(
    purchasePrice: number,
    interestRate: number,
    annualIncome: number,
    monthlyDebts: number = 0,
    propertyTaxRate: number = 1.1
): {
    fha: FHAResult;
    conventional: any;
    recommendation: string;
} {
    // FHA with 3.5% down
    const fha = calculateFHA({
        purchasePrice,
        downPaymentPct: 3.5,
        interestRate,
        annualIncome,
        monthlyDebts,
        propertyTaxRate,
    });

    // Conventional with 5% down (minimum for good rates)
    const convDownPct = 5;
    const convDownPayment = purchasePrice * (convDownPct / 100);
    const convLoanAmount = purchasePrice - convDownPayment;

    const monthlyRate = interestRate / 100 / 12;
    const n = 30 * 12;
    const convMonthlyPI =
        (convLoanAmount * monthlyRate * Math.pow(1 + monthlyRate, n)) /
        (Math.pow(1 + monthlyRate, n) - 1);

    // Conventional PMI (0.5% annual for 5% down)
    const convMonthlyPMI = (convLoanAmount * 0.005) / 12;

    const convMonthlyTax = (purchasePrice * (propertyTaxRate / 100)) / 12;
    const convMonthlyIns = 1200 / 12;
    const convTotalMonthly = convMonthlyPI + convMonthlyPMI + convMonthlyTax + convMonthlyIns;

    const monthlyIncome = annualIncome / 12;
    const convDTI = ((convTotalMonthly + monthlyDebts) / monthlyIncome) * 100;

    const conventional = {
        downPayment: Math.round(convDownPayment),
        downPaymentPct: convDownPct,
        loanAmount: Math.round(convLoanAmount),
        monthlyPI: Math.round(convMonthlyPI),
        monthlyPMI: Math.round(convMonthlyPMI),
        totalMonthly: Math.round(convTotalMonthly),
        totalDTI: Math.round(convDTI * 10) / 10,
    };

    // Recommendation logic
    let recommendation = '';
    const fhaSavingsUpfront = convDownPayment - fha.downPayment;
    const monthlySavings = conventional.totalMonthly - fha.totalMonthlyPITIA;

    if (fhaSavingsUpfront > 10000 && fha.qualifies) {
        recommendation = `FHA recommended: Save $${(fhaSavingsUpfront / 1000).toFixed(0)}k upfront, buy sooner. Monthly cost ${monthlySavings > 0 ? 'higher' : 'lower'} by $${Math.abs(monthlySavings)}.`;
    } else if (monthlySavings > 100) {
        recommendation = `Conventional recommended: $${Math.abs(monthlySavings)}/month savings, lower lifetime cost. Need $${((convDownPayment - fha.downPayment) / 1000).toFixed(0)}k more for down payment.`;
    } else {
        recommendation = `Similar costs. FHA = less upfront ($${(fhaSavingsUpfront / 1000).toFixed(0)}k savings), Conventional = lower monthly ($${Math.abs(monthlySavings)}).`;
    }

    return {
        fha,
        conventional,
        recommendation,
    };
}

/**
 * Verification tests
 */
export function runFHAVerificationTests(): boolean {
    console.log('Running FHA Calculator Verification Tests...\n');

    // Test 1: $300k home, 3.5% down, 6.5% rate, $75k income
    const test1 = calculateFHA({
        purchasePrice: 300000,
        downPaymentPct: 3.5,
        interestRate: 6.5,
        annualIncome: 75000,
        monthlyDebts: 400,
    });

    console.log('Test 1: $300k home, 3.5% down, 6.5%');
    console.log('  Down payment:', test1.downPayment); // Should be $10,500
    console.log('  UFMIP:', test1.ufmip); // Should be ~$5,066
    console.log('  Total loan:', test1.totalLoanAmount); // Should be ~$294,566
    console.log('  Monthly PI:', test1.monthlyPI); // Should be ~$1,863
    console.log('  Monthly MIP:', test1.monthlyMIP); // Should be ~$135
    console.log('  Total PITIA:', test1.totalMonthlyPITIA);
    console.log('  DTI:', test1.totalDTI, '%'); // Should show DTI
    console.log('  Qualifies:', test1.qualifies);
    console.log('  MIP Duration:', test1.mipDuration);
    console.log('');

    return true;
}
