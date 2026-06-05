// lib/cardBuilders/types.ts
// Shared BuiltCard interface — imported by all builder sub-files

export interface BuiltCard {
    answer: string;
    next_step: string;
    follow_up: string;
    follow_up_chips: Array<{ label: string; seed: string; paramOverrides?: Record<string, number | string | boolean>; changedKeys?: string[]; inputOnly?: boolean }>;
    confidence: string;
    memoryPayload?: {
        plain_english_summary: string;
        scenario_inputs: Record<string, any>;
        computed_financials: Record<string, any>;
        monthly_payment: number;
    };
    interactiveSlider?: {
        price: number;
        downPct: number;
        rate: number;
        term: number;
        taxRate: number;
        insRate: number;
        loanType: 'conventional' | 'fha' | 'va' | 'jumbo';
        vaFundingFeePct?: number;
        buydownType?: '2/1' | '1/0' | '3/2/1' | 'none';
        sellerCredit?: number;
    };
    convHBSlider?: {
        price: number;
        downPct: number;
        rate: number;
        term: number;
        taxRate: number;
        insRate: number;
        county?: string;
        countyLimit?: number;
    };
    incomeQualifySlider?: {
        price: number;
        downPct: number;
        rate: number;
        term: number;
        taxRate: number;
        insRate: number;
        loanType?: 'conventional' | 'fha' | 'jumbo';
    };
    fhaSlider?: {
        price: number;
        downPct: number;
        rate: number;
        term: number;
        taxRate: number;
        insRate: number;
    };
    jumboSlider?: {
        price:   number;
        downPct: number;
        rate:    number;
        term:    number;
        taxRate: number;
        insRate: number;
    } | null;
    affordabilitySlider?: {
        annualIncome: number;
        monthlyDebts: number;
        savings: number;
        downPct: number;
        rate: number;
        term: number;
        taxRate: number;
        insRate: number;
        loanType: 'conventional' | 'fha' | 'jumbo';
        fhaLoanLimit?: number;
        confLoanLimit?: number;
    };
    dscrSlider?: {
        price: number;
        rent: number;
        downPct: number;
        rate: number;
        vacancyRate: number;
        taxRate: number;
        insRate: number;
    };
    refiSlider?: {
        balance: number;
        currentRate: number;
        newRate: number;
        termMonths: number;
        closingCosts: number;
        propertyValue?: number;
    };
    refiIntelligenceCard?: {
        balance: number;
        currentRate: number;
        newRate: number;
        termMonths?: number;
        closingCosts?: number;
        remainingMonths?: number;
        address?: string;
        city?: string;
        state?: string;
        zip?: string;
        propertyValue?: number;
        origRateLabel?: string;
        fredDate?: string;
        sofr?: number;
    } | null;
    loanLimitsSlider?: {
        county: string;
        state?: string;
        stateName?: string;
        conformingLimit: number;
        nationalBaseline: number;
        price: number;
        downPct: number;
        taxRate: number;
        insRate: number;
        baseRate: number;
    };
    jumboAffordabilitySlider?: {
        price: number;
        downPct: number;
        baseRate: number;
        countyLimit: number;
        nationalBaseline: number;
        county?: string;
        taxRate: number;
        insRate: number;
    } | null;
    vaSlider?: {
        price: number;
        downPct: number;
        rate: number;
        term: number;
        taxRate: number;
        insRate: number;
        vaFundingFeePct: number;
    } | null;
    scenarioComparisonCard?: {
        tool: 'down_payment' | 'seller_credit' | 'term' | 'rent_buy';
        price: number;
        rate: number;
        downPct?: number;
        years?: number;
        credit?: number;
        rent?: number;
    } | null;
    lenderChecklist?: {
        loanType: 'conventional' | 'fha' | 'va' | 'jumbo' | 'dscr';
        price:       number;
        loanAmount:  number;
        ltv:         number;
        downPaymentPct?: number;
        marketRate:  number;
        monthlyPITI: number;
        termYears:   number;
        isInvestment: boolean;
        rent?:       number;
        vacancyRate?: number;
        taxRate?:    number;
        insRate?:    number;
        pdfType?:    'conventional' | 'fha' | 'va' | 'jumbo' | 'dscr' | 'refi' | 'affordability';
    };
}
