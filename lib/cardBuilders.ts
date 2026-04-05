// lib/cardBuilders.ts
// ============================================================
// HOMERATES CARD BUILDERS — One builder per calc type
//
// Input:  typed CalcEngine result + context (rate, chips config)
// Output: { answer, next_step, follow_up, follow_up_chips, confidence }
//         — identical shape as current Grok answer
//
// Rules:
//   - No math here — all numbers come pre-calculated from calcEngine
//   - No LLM involvement
//   - Every number formatted consistently
//   - Chips always relevant to the calc type shown
// ============================================================

import {
    ConventionalResult,
    FHAResult,
    RefiResult,
    AffordabilityResult,
    AffordabilityScenario,
    DSCRResult,
    FHAvsConvResult,
    Refi20vs30Result,
    ExtraPaymentResult,
    RefiEarlySaleResult,
    OneExtraPaymentPerYearResult,
    VAResult,
    JumboResult,
} from './calcEngine';
import { RefiNeedsInput, FHANeedsInput } from './calcDispatcher';
import { NATIONAL_CONFORMING_BASELINE } from './loanLimits2026';

// ─────────────────────────────────────────────
// FORMAT HELPERS
// ─────────────────────────────────────────────
const f$ = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fK = (n: number) => { const k = Math.round(n / 1000); return k >= 1000 ? `$${(k / 1000).toFixed(1).replace(/\.0$/, '')}M` : `$${k}k`; };
const fPct = (n: number) => `${n.toFixed(2)}%`;
const fPct1 = (n: number) => `${n.toFixed(1)}%`;
const fMo = (n: number) => `${Math.ceil(n)} months`;
const fYr = (n: number) => `${n.toFixed(1)} yrs`;

export interface BuiltCard {
    answer: string;
    next_step: string;
    follow_up: string;
    follow_up_chips: Array<{ label: string; seed: string; paramOverrides?: Record<string, number | string | boolean>; changedKeys?: string[] }>;
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
        vaFundingFeePct?: number;  // VA only — funding fee % (0 = exempt)
    };
    affordabilitySlider?: {
        annualIncome: number;
        monthlyDebts: number;
        savings: number;
        downPct: number;
        rate: number;
        term: number;
        taxRate: number;
        insRate: number;
        loanType: 'conventional' | 'fha';
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

// ─────────────────────────────────────────────
// CONVENTIONAL CARD
// ─────────────────────────────────────────────

export function buildConventionalCard(
    r: ConventionalResult,
    assumptions: string[] = [],
    fredRateStr?: string,
): BuiltCard {
    const priceK = Math.round(r.purchasePrice / 1000);
    const rateStr = fPct(r.annualRatePct);
    const assumptionNote = assumptions.length
        ? assumptions.map(a => `> 💡 **Assumption:** ${a}`).join('\n') + '\n\n'
        : '';
    const fredNote = fredRateStr
        ? `\n> 📡 **Live FRED rate:** ${fredRateStr}\n` : '';
    const pmiRow = r.monthlyPMI > 0
        ? `| PMI | ${f$(r.monthlyPMI)} |\n` : '';
    const hoaRow = r.monthlyHOA > 0
        ? `| HOA | ${f$(r.monthlyHOA)} |\n` : '';
    const pmiNote = r.monthlyPMI > 0 && r.pmiRemovalYears
        ? `\n> ⚠️ **PMI cancels** at 80% LTV — approximately **year ${r.pmiRemovalYears}** (~${f$(r.monthlyPMI * r.pmiRemovalYears * 12 / r.pmiRemovalYears)}/yr until removed).\n`
        : r.monthlyPMI === 0 ? `\n> ✅ **No PMI** — 20%+ down payment.\n` : '';
    const dtiSection = r.frontEndDTI !== null ? `
---

## 📈 DTI Analysis

| | |
|--|--|
| Front-end DTI | ${fPct1(r.frontEndDTI!)} *(guideline: ≤28%)* |
| Back-end DTI | ${fPct1(r.backEndDTI!)} *(guideline: ≤43%)* |
| Status | ${r.backEndDTI! <= 43 ? '✅ Within conventional guidelines' : r.backEndDTI! <= 50 ? '⚠️ High — may need compensating factors' : '❌ Exceeds standard guidelines'} |
` : '';

    const incomeSection = !r.frontEndDTI ? `
---

## 💰 Minimum Income to Qualify

| DTI Guideline | Required Annual Income |
|---------------|----------------------|
| Conservative (28% front-end) | ~${fK(r.totalMonthly / 0.28 * 12)}/year |
| Standard (43% back-end) | ~${fK(r.totalMonthly / 0.43 * 12)}/year |
| Max w/ compensating factors (50%) | ~${fK(r.totalMonthly / 0.50 * 12)}/year |
` : '';

    const answer = `**Conventional Loan Analysis**
${assumptionNote}${fredNote}
**${f$(r.purchasePrice)} purchase · ${r.downPaymentPct}% down · ${rateStr} · ${r.termYears}-year fixed**

---

## 🏠 Loan Structure

| | |
|--|--|
| Purchase Price | ${f$(r.purchasePrice)} |
| Down Payment | ${f$(r.downPayment)} (${r.downPaymentPct}%) |
| Loan Amount | **${f$(r.loanAmount)}** |
| LTV | ${fPct1(r.ltv * 100)} |

---

## 💰 Monthly Payment

| Component | Amount |
|-----------|--------|
| Principal & Interest | ${f$(r.monthlyPI)} |
| Property Taxes | ${f$(r.monthlyTax)} |
| Home Insurance | ${f$(r.monthlyInsurance)} |
${pmiRow}${hoaRow}| **Total Monthly (PITI${r.monthlyHOA > 0 ? 'A' : ''})** | **${f$(r.totalMonthly)}** |
${pmiNote}
---

## 📊 Lifetime Cost

| | |
|--|--|
| Total Interest | ${f$(r.totalInterest)} |
| Total Payments | ${f$(r.totalPayments)} |
| Loan Payoff | ${r.termYears} years |
${dtiSection}${incomeSection}
---

**Next Steps:**
1. Get pre-approval to lock your rate
2. Compare lenders — a 0.25% rate difference saves ~${f$(r.loanAmount * 0.0025 / 12)}/mo
3. Factor in closing costs (~${fK(r.purchasePrice * 0.025)})`;

    const priceUp = Math.round(r.purchasePrice * 1.1 / 10000) * 10000;
    const priceDown = Math.round(r.purchasePrice * 0.9 / 10000) * 10000;
    const rateDown = parseFloat((r.annualRatePct - 0.5).toFixed(2));
    const altDown = r.downPaymentPct < 20 ? 20 : r.downPaymentPct > 5 ? 5 : 10;

    const chips: BuiltCard['follow_up_chips'] = [
        {
            label: `Rate drops to ${rateDown}% — new payment?`,
            seed: `Same home, rate drops to ${rateDown}%`,
            paramOverrides: { annualRatePct: rateDown, purchasePrice: r.purchasePrice, downPaymentPct: r.downPaymentPct },
            changedKeys: ['annualRatePct'],
        },
        {
            label: altDown < r.downPaymentPct ? `${altDown}% down — what does PMI cost?` : `${altDown}% down — does PMI disappear?`,
            seed: `Same home with ${altDown}% down`,
            paramOverrides: { downPaymentPct: altDown, purchasePrice: r.purchasePrice, annualRatePct: r.annualRatePct },
            changedKeys: ['downPaymentPct'],
        },
        {
            label: `What if the home is ${fK(priceUp)}?`,
            seed: `Conventional loan on a ${fK(priceUp)} home with ${r.downPaymentPct}% down at ${rateStr}`,
            paramOverrides: { purchasePrice: priceUp, downPaymentPct: r.downPaymentPct, annualRatePct: r.annualRatePct },
            changedKeys: ['purchasePrice'],
        },
        {
            label: `1 extra payment/yr — how many years do I save?`,
            seed: `If I make 1 extra payment per year on a ${fK(r.loanAmount)} loan at ${fPct(r.annualRatePct)}, when do I pay it off?`,
            paramOverrides: { oneExtraPaymentBalance: r.loanAmount, oneExtraPaymentRate: r.annualRatePct } as Record<string, number>,
            changedKeys: ['oneExtraPaymentBalance'],
        },
    ];

    return {
        answer,
        next_step: `Get pre-approval at ${rateStr}. Your estimated payment is ${f$(r.totalMonthly)}/month.`,
        follow_up: chips[0].label,
        follow_up_chips: chips,
        confidence: '1.00 (calculated — no LLM)',
        memoryPayload: {
            plain_english_summary: `Conventional: ${f$(r.purchasePrice)} purchase, ${r.downPaymentPct}% down, ${rateStr}, ${r.termYears}yr fixed. Monthly P&I: ${f$(r.monthlyPI)}, total: ${f$(r.totalMonthly)}.`,
            scenario_inputs: { price: r.purchasePrice, down_payment_pct: r.downPaymentPct, loan_amount: r.loanAmount, rate_used_pct: r.annualRatePct, term_years: r.termYears },
            computed_financials: { monthly_pi: r.monthlyPI, monthly_pitia: r.totalMonthly },
            monthly_payment: r.totalMonthly,
        },
        interactiveSlider: {
            price: r.purchasePrice,
            downPct: r.downPaymentPct,
            rate: r.annualRatePct,
            term: r.termYears,
            taxRate: r.purchasePrice > 0 ? (r.monthlyTax * 12) / r.purchasePrice : 0.012,
            insRate: r.purchasePrice > 0 ? (r.monthlyInsurance * 12) / r.purchasePrice : 0.005,
            loanType: 'conventional',
        },
        lenderChecklist: {
            loanType: 'conventional',
            price: r.purchasePrice, loanAmount: r.loanAmount,
            ltv: r.ltv, marketRate: r.annualRatePct,
            monthlyPITI: r.totalMonthly, termYears: r.termYears,
            isInvestment: false,
        },
    };
}

// ─────────────────────────────────────────────
// FHA CARD
// ─────────────────────────────────────────────

export function buildFHACard(
    r: FHAResult,
    assumptions: string[] = [],
    comparison?: FHAvsConvResult,
    fredRateStr?: string,
): BuiltCard {
    const priceK = Math.round(r.purchasePrice / 1000);
    const rateStr = fPct(r.annualRatePct);
    const assumptionNote = assumptions.length
        ? assumptions.map(a => `> 💡 **Assumption:** ${a}`).join('\n') + '\n\n'
        : '';

    // Loan limit checklist row — smart: ⚠️ when unknown, ✅/❌ when known
    const limitRow = r.withinLimitStatus === 'within_range' || r.withinLimitStatus === 'below_floor'
        ? `✅ Loan amount within FHA limit`
        : r.withinLimitStatus === 'unknown'
            ? `⚠️ Loan limit varies by county — verify at [HUD limits lookup](https://www.hud.gov/program_offices/housing/sfh/lender/origination) (floor ${fK(541287)}, high-cost up to ${fK(1249125)})`
            : `❌ Loan amount exceeds county limit — check your county's limit`;

    const dtiSection = r.frontEndDTI !== null ? `
---

## 📈 DTI Analysis

| | |
|--|--|
| Front-end DTI | ${fPct1(r.frontEndDTI!)} *(FHA guideline: ≤31%)* |
| Back-end DTI | ${fPct1(r.backEndDTI!)} *(FHA max: ≤43%, up to 50% with compensating factors)* |
| Qualifies | ${r.qualifies ? '✅ Yes' : r.backEndDTI! <= 50 ? '⚠️ Borderline — needs compensating factors' : '❌ DTI too high'} |
` : '';

    const incomeSection = !r.frontEndDTI ? `
---

## 💰 Minimum Income to Qualify

| DTI Guideline | Required Income |
|---------------|----------------|
| Conservative (31% front-end) | ~${fK(r.totalMonthly / 0.31 * 12)}/year |
| Standard (43% back-end) | ~${fK(r.totalMonthly / 0.43 * 12)}/year |
| Max w/ compensating factors (50%) | ~${fK(r.totalMonthly / 0.50 * 12)}/year |
` : '';

    const compSection = comparison ? (() => {
        const conv = comparison.conv;
        const upfrontSave = comparison.upfrontDiff >= 0 ? `FHA saves ${f$(comparison.upfrontDiff)} upfront` : `Conventional saves ${f$(Math.abs(comparison.upfrontDiff))} upfront`;
        const monthlySave = comparison.monthlyDiff >= 0 ? `Conventional saves ${f$(comparison.monthlyDiff)}/mo` : `FHA saves ${f$(Math.abs(comparison.monthlyDiff))}/mo`;
        return `
---

## 🆚 FHA vs Conventional

| Feature | FHA (${r.downPaymentPct}% down) | Conventional (${conv.downPaymentPct}% down) |
|---------|-----------|--------------|
| Down payment | ${f$(r.downPayment)} | ${f$(conv.downPayment)} |
| Monthly payment | ${f$(r.totalMonthly)} | ${f$(conv.totalMonthly)} |
| Monthly insurance | MIP: ${f$(r.monthlyMIP)} | PMI: ${f$(conv.monthlyPMI)} |
| Insurance duration | ${r.mipDuration} | Until 80% LTV (auto-removes) |

**Bottom line:** ${upfrontSave}. ${monthlySave}.${comparison.breakEvenMonths ? ` Conventional breakeven: **${Math.round(comparison.breakEvenMonths / 12)} years**.` : ''}
`;
    })() : '';

    // Top-of-card alert when loan is above national FHA floor with no county specified
    // withinLimitStatus==='unknown' means: loan > $541k floor, county unknown — can't confirm pass/fail
    const limitAlertBanner = r.withinLimitStatus === 'unknown'
        ? `> ⚠️ **FHA Loan Limit — County Required:** Your base loan of ${f$(r.baseLoanAmount)} exceeds the national FHA floor (${fK(541287)}). In high-cost areas (e.g. Los Angeles, San Francisco, San Diego), FHA limits reach ${fK(1089300)}–${fK(1249125)} — you may still qualify. Share your county or ZIP for an exact check.\n\n`
        : r.withinLimitStatus === 'above_ceiling'
            ? `> ❌ **FHA Loan Limit Exceeded:** Your base loan of ${f$(r.baseLoanAmount)} exceeds the ${r.fhaLoanLimit ? `FHA limit of ${f$(r.fhaLoanLimit)} for this area` : 'FHA ceiling'}. This purchase would require conventional or jumbo financing.\n\n`
            : '';

    const answer = `**FHA Loan Analysis**
${limitAlertBanner}${assumptionNote}
**${f$(r.purchasePrice)} purchase · ${r.downPaymentPct}% down · ${rateStr} · ${r.termYears}-year fixed**

---

## 🏠 Loan Structure

| | |
|--|--|
| Purchase Price | ${f$(r.purchasePrice)} |
| Down Payment | ${f$(r.downPayment)} (${r.downPaymentPct}%) |
| Base Loan | ${f$(r.baseLoanAmount)} |
| UFMIP (1.75%) | ${f$(r.ufmip)} *(financed)* |
| **Total Loan** | **${f$(r.totalLoanAmount)}** |

---

## 💰 Monthly Payment

| Component | Amount |
|-----------|--------|
| Principal & Interest | ${f$(r.monthlyPI)} |
| Monthly MIP (${fPct(r.mipRate * 100)}/yr) | ${f$(r.monthlyMIP)} |
| Property Taxes | ${f$(r.monthlyTax)} |
| Home Insurance | ${f$(r.monthlyInsurance)} |
${r.monthlyHOA > 0 ? `| HOA | ${f$(r.monthlyHOA)} |\n` : ''}| **Total Monthly (PITI)** | **${f$(r.totalMonthly)}** |

---

## 📊 FHA Mortgage Insurance

| | |
|--|--|
| Upfront MIP (UFMIP) | ${f$(r.ufmip)} *(financed into loan)* |
| Monthly MIP | ${f$(r.monthlyMIP)}/mo |
| MIP Duration | **${r.mipDuration}** |
| Estimated total MIP | ${f$(r.totalMIPPaid)} |

${r.mipDuration === 'Life of loan'
            ? `> ⚠️ With ${r.downPaymentPct}% down, MIP lasts the **life of the loan**. To remove: put 10%+ down (MIP removes after 11 years) or refinance to conventional at 20% equity.`
            : `> ✅ MIP removes automatically after **11 years** (10%+ down).`}

---

## 📋 FHA Requirements

${r.meetsCreditRequirement ? '✅' : '❌'} Credit score ≥ 580 (for 3.5% down) or ≥ 500 (for 10% down)
${r.meetsDownPaymentRequirement ? '✅' : '❌'} Down payment ≥ 3.5%
${limitRow}
${dtiSection}${incomeSection}${compSection}
---

**FHA Advantages:** Low down payment · Flexible credit · Gift funds OK · Seller contributes up to 6% closing
**Considerations:** MIP ${r.mipDuration} · UFMIP adds to loan · Property must meet FHA standards`;

    const chips: BuiltCard['follow_up_chips'] = [
        {
            label: `10% down instead — does MIP disappear after 11 years?`,
            seed: `FHA loan on ${fK(r.purchasePrice)} home with 10% down at ${rateStr}`,
            paramOverrides: { downPaymentPct: 10, purchasePrice: r.purchasePrice, annualRatePct: r.annualRatePct, isFHA: true },
            changedKeys: ['downPaymentPct'],
        },
        comparison ? {
            label: `Conventional 20% down — skip PMI entirely?`,
            seed: `Conventional loan on ${fK(r.purchasePrice)} home with 20% down at ${rateStr}`,
            paramOverrides: { purchasePrice: r.purchasePrice, downPaymentPct: 20, annualRatePct: r.annualRatePct },
            changedKeys: ['downPaymentPct'],
        } : {
            label: `FHA vs conventional — which is cheaper over 7 years?`,
            seed: `Compare FHA ${r.downPaymentPct}% down vs conventional 5% down on ${fK(r.purchasePrice)} at ${rateStr}`
        },
        {
            label: `FHA → Conventional: when do I hit 80% LTV?`,
            seed: `FHA equity milestone on ${fK(r.purchasePrice)} home — when does my loan hit 80% LTV to switch to conventional?`,
            paramOverrides: {
                purchasePrice: r.purchasePrice,
                fhaTotalLoan: r.totalLoanAmount,
                annualRatePct: r.annualRatePct,
                monthlyPI: r.monthlyPI,
                monthlyMIP: r.monthlyMIP,
                fhaEquityMode: true,
            },
        },
        {
            label: `Rate drops to ${(r.annualRatePct - 0.5).toFixed(2)}% — new FHA payment?`,
            seed: `FHA loan on ${fK(r.purchasePrice)} home with ${r.downPaymentPct}% down at ${(r.annualRatePct - 0.5).toFixed(2)}%`,
            paramOverrides: { annualRatePct: parseFloat((r.annualRatePct - 0.5).toFixed(2)), purchasePrice: r.purchasePrice, downPaymentPct: r.downPaymentPct, isFHA: true },
            changedKeys: ['annualRatePct'],
        },
    ];

    return {
        answer,
        next_step: 'Get FHA pre-approval from an FHA-approved lender. Verify credit score and down payment source.',
        follow_up: chips[0].label,
        follow_up_chips: chips,
        confidence: '1.00 (calculated per HUD FHA guidelines — no LLM)',
        memoryPayload: {
            plain_english_summary: `FHA: ${f$(r.purchasePrice)} purchase, ${r.downPaymentPct}% down, ${rateStr}, ${r.termYears}yr fixed. Monthly P&I: ${f$(r.monthlyPI)}, total: ${f$(r.totalMonthly)}.`,
            scenario_inputs: { price: r.purchasePrice, down_payment_pct: r.downPaymentPct, loan_amount: r.baseLoanAmount, rate_used_pct: r.annualRatePct, term_years: r.termYears },
            computed_financials: { monthly_pi: r.monthlyPI, monthly_pitia: r.totalMonthly },
            monthly_payment: r.totalMonthly,
        },
        interactiveSlider: {
            price: r.purchasePrice,
            downPct: r.downPaymentPct,
            rate: r.annualRatePct,
            term: r.termYears,
            taxRate: r.purchasePrice > 0 ? (r.monthlyTax * 12) / r.purchasePrice : 0.012,
            insRate: r.purchasePrice > 0 ? (r.monthlyInsurance * 12) / r.purchasePrice : 0.005,
            loanType: 'fha',
        },
        lenderChecklist: {
            loanType: 'fha',
            price: r.purchasePrice, loanAmount: r.baseLoanAmount,
            ltv: r.ltv, marketRate: r.annualRatePct,
            monthlyPITI: r.totalMonthly, termYears: r.termYears,
            isInvestment: false,
        },
    };
}

// ─────────────────────────────────────────────
// FHA EQUITY TIMELINE CARD
// ─────────────────────────────────────────────

export function buildFHAEquityTimelineCard(
    homePrice: number,
    loanBalance: number,
    annualRatePct: number,
    monthlyPI: number,
    monthlyMIP: number,
    fredRate?: number,
): BuiltCard {
    const monthlyRate = annualRatePct / 100 / 12;
    const target80 = homePrice * 0.80;
    const startLTV = Math.round(loanBalance / homePrice * 1000) / 10;

    // Natural paydown to 80% LTV
    let bal = loanBalance;
    let naturalMonths = 0;
    while (bal > target80 && naturalMonths < 360) {
        const interest = bal * monthlyRate;
        const principal = monthlyPI - interest;
        if (principal <= 0) { naturalMonths = 999; break; }
        bal -= principal;
        naturalMonths++;
    }

    // Appreciation scenarios: 3%, 5%, 7%/yr
    const apprScenarios = [3, 5, 7].map(pctPerYear => {
        let b = loanBalance;
        let h = homePrice;
        const monthlyAppr = pctPerYear / 100 / 12;
        let mo = 0;
        while (b > h * 0.80 && mo < 360) {
            const interest = b * monthlyRate;
            const principal = monthlyPI - interest;
            if (principal <= 0) { mo = 999; break; }
            b -= principal;
            h *= (1 + monthlyAppr);
            mo++;
        }
        return { pct: pctPerYear, months: mo < 360 ? mo : null };
    });

    const formatMo = (mo: number | null): string => {
        if (mo === null || mo > 360) return 'Beyond 30yr term';
        const yr = Math.floor(mo / 12);
        const m = mo % 12;
        return `${yr > 0 ? `${yr}yr` : ''}${m > 0 ? ` ${m}mo` : ''}`.trim();
    };

    const targetYear = naturalMonths < 360
        ? new Date().getFullYear() + Math.floor((new Date().getMonth() + naturalMonths) / 12)
        : null;

    // Conventional payment at 80% LTV balance
    const convRate = fredRate ?? annualRatePct;
    const convTermMo = Math.max(360 - naturalMonths, 60);
    const mr = convRate / 100 / 12;
    const convPI = Math.round(target80 * (mr * Math.pow(1 + mr, convTermMo)) / (Math.pow(1 + mr, convTermMo) - 1));
    const monthlyTax = Math.round(homePrice * 0.011 / 12);
    const monthlyIns = 100;
    const convPITI = convPI + monthlyTax + monthlyIns;

    const apprRows = apprScenarios.map(s =>
        `| ${s.pct}%/yr home appreciation | ${formatMo(s.months)} |`
    ).join('\n');

    const answer = `## 🔄 FHA → Conventional Switch Point

**${f$(homePrice)} home · ${fPct(annualRatePct)} FHA rate · Starting LTV: ${startLTV}%**

To eliminate MIP you need to reach **80% LTV** (balance ≤ ${f$(target80)}).

---

## ⏱️ Time to 80% LTV

| Scenario | Time |
|--|--|
| Natural paydown only | ${formatMo(naturalMonths)}${targetYear ? ` (est. ${targetYear})` : ''} |
${apprRows}

> 💡 Home appreciation moves you to 80% LTV far faster than paydown alone. A new appraisal confirming the value lets you refi early — no waiting for paydown to catch up.

---

## 🏛️ Conventional Loan at 80% LTV

At ${f$(target80)} balance (${fPct(convRate)} est.):

| Component | Amount |
|-----------|--------|
| P&I | ${f$(convPI)}/mo |
| Taxes + Insurance | ${f$(monthlyTax + monthlyIns)}/mo |
| **Total PITI** | **${f$(convPITI)}/mo** |
| MIP | ❌ Gone |

${monthlyMIP > 0 ? `**MIP elimination alone saves ${f$(monthlyMIP)}/mo (${f$(monthlyMIP * 12)}/yr).**` : ''}

> ⚠️ Rate at time of refi will differ from today's ${fPct(convRate)} — use this as a planning benchmark, not a quote.`;

    const chips: BuiltCard['follow_up_chips'] = [
        {
            label: `10% down instead — MIP gone after 11 years`,
            seed: `FHA loan on ${fK(homePrice)} home with 10% down at ${fPct(annualRatePct)}`,
            paramOverrides: { downPaymentPct: 10, purchasePrice: homePrice, annualRatePct, isFHA: true },
            changedKeys: ['downPaymentPct'],
        },
        {
            label: `FHA vs conventional — total cost over 7 years`,
            seed: `Compare FHA 3.5% down vs conventional 5% down on ${fK(homePrice)} at ${fPct(annualRatePct)}`,
        },
        {
            label: `Rate drops to ${(annualRatePct - 0.5).toFixed(2)}% — new FHA payment?`,
            seed: `FHA loan on ${fK(homePrice)} home with 3.5% down at ${(annualRatePct - 0.5).toFixed(2)}%`,
            paramOverrides: { annualRatePct: parseFloat((annualRatePct - 0.5).toFixed(2)), purchasePrice: homePrice, downPaymentPct: 3.5, isFHA: true },
            changedKeys: ['annualRatePct'],
        },
    ];

    return {
        answer,
        next_step: `Get a home appraisal when you believe you're near 80% LTV — appreciation may get you there years ahead of paydown schedule.`,
        follow_up: chips[0].label,
        follow_up_chips: chips,
        confidence: `1.00 (amortization-based timeline — deterministic)`,
        memoryPayload: {
            plain_english_summary: `FHA equity timeline: ${f$(homePrice)} home at ${fPct(annualRatePct)}, natural paydown to 80% LTV: ${formatMo(naturalMonths)}.`,
            scenario_inputs: { home_price: homePrice, loan_balance: loanBalance, rate_pct: annualRatePct },
            computed_financials: { months_to_80pct_natural: naturalMonths, balance_at_80pct: target80, conv_piti: convPITI },
            monthly_payment: convPITI,
        },
    };
}

// ─────────────────────────────────────────────
// REFI CARD
// ─────────────────────────────────────────────

export function buildRefiCard(
    r: RefiResult,
    assumptions: string[] = [],
    fredRateStr?: string,
    refiType?: string,
    propertyValue?: number,
): BuiltCard {
    const verdictEmoji = {
        strong: '✅',
        good: '✅',
        marginal: '🟡',
        poor: '🔴',
        hold: '⛔',
        no_savings: '⛔',
    }[r.verdict];

    const verdictTitle = {
        strong: 'Strong refi — pull the trigger',
        good: 'Good refi — solid if staying 4+ years',
        marginal: 'Marginal — depends on your timeline',
        poor: 'Not worth it at this rate',
        hold: 'Hold — current rate is not better',
        no_savings: 'Payment rises — no savings',
    }[r.verdict];

    const fredNote = fredRateStr ? `\n> 📡 **Live FRED rate:** ${fredRateStr}\n` : '';
    const assumptionNote = assumptions.length
        ? assumptions.map(a => `> 💡 **Assumption:** ${a}`).join('\n') + '\n\n' : '';

    const mipSection = refiType === 'fha_to_conv' ? `
---

## 🎯 FHA → Conventional: The Real Play

This isn't just about the rate — it's about **permanently eliminating MIP**.

| | FHA (current) | Conventional (refi) |
|--|--|--|
| Monthly payment | ${f$(r.currentMonthlyPI)}/mo + MIP | ${f$(r.newMonthlyPI)}/mo |
| MIP | Ongoing | ❌ Gone |
| PMI | — | Cancels at 80% LTV |

> ✅ MIP removal changes the breakeven math entirely.
` : '';

    const resetSection = r.amortReset ? `
---

## ⚠️ Amortization Reset

You've built significant equity — a new 30-year term restarts the clock.

- **Extra interest from reset:** ~${f$(r.resetPenalty)}
- **Alternative:** A 20-year refi at ${fPct(r.newRatePct)} = ${f$(r.pi20yr)}/mo — *still lower than your current payment* — and saves ${f$(r.interest20yrSaved)} in interest vs a new 30yr.
` : '';

    // Trigger rate table is only meaningful when there are actual closing costs to recover
    const waitSection = r.closingCosts > 0 ? `
---

## 📡 Your Rate-Watch Trigger Points

| Target Breakeven | Rate You Need | Monthly Savings |
|--|--|--|
| 2-year breakeven | **${r.triggerRate2yr ? fPct(r.triggerRate2yr) : 'N/A'}** | ${r.triggerRate2yr ? f$(r.waitMonthlySavings05) + '/mo' : '—'} |
| 3-year breakeven | **${r.triggerRate3yr ? fPct(r.triggerRate3yr) : 'N/A'}** | ${r.triggerRate3yr ? f$(r.waitMonthlySavings05) + '/mo' : '—'} |
| 5-year breakeven | **${r.triggerRate5yr ? fPct(r.triggerRate5yr) : 'N/A'}** | ${r.triggerRate5yr ? f$(r.waitMonthlySavings10) + '/mo' : '—'} |
` : '';

    const answer = `## ${verdictEmoji} Refi Analysis — ${fPct(r.currentRatePct)} → ${fPct(r.newRatePct)}
${fredNote}${assumptionNote}
**Loan Balance: ${f$(r.currentBalance)}** · 30-year remaining term

---

## 💰 Monthly Savings

| | Current (${fPct(r.currentRatePct)}) | Refi to ${fPct(r.newRatePct)} | Change |
|--|--|--|--|
| P&I payment | ${f$(r.currentMonthlyPI)}/mo | ${f$(r.newMonthlyPI)}/mo | **${r.monthlyPISavings >= 0 ? '+' : ''}${f$(r.monthlyPISavings)}/mo** |
| Annual savings | — | — | **${f$(r.annualSavings)}/yr** |
| Closing costs | — | ~${f$(r.closingCosts)} | ~1% est. — get lender quotes |
| **Breakeven** | — | — | **${r.breakEvenMonths === 0 ? 'Immediate (no closing costs)' : r.breakEvenMonths != null ? `${r.breakEvenMonths} months (${fYr(r.breakEvenYears!)})` : 'N/A'}** |

---

## 🎯 ${verdictTitle}

${r.verdictReason}

---

## 📊 Net Savings Over Time

| Horizon | Net Savings (after closing costs) |
|--|--|
| 5 years | **${r.netSavings5yr >= 0 ? '+' : ''}${f$(r.netSavings5yr)}** |
| 10 years | **${r.netSavings10yr >= 0 ? '+' : ''}${f$(r.netSavings10yr)}** |
| Full term | **${f$(r.currentTotalInterest - r.newTotalInterest - r.closingCosts)}** |
${mipSection}${resetSection}${waitSection}
---

## 💬 Ask Your Lender

- **"What's the APR — not just the rate?"** APR folds in origination fees and points; that's the real number to compare across lenders.
- **"How many discount points are priced in?"** 1 point = 1% of the loan upfront. Removing points raises the rate but cuts your cash-to-close.
- **"What's your no-cost option?"** Ask for the rate where lender credits cover all fees — breakeven starts day 1, no math needed.
- **"Give me a Loan Estimate in writing."** Required by law within 3 business days — title, escrow, and origination fees vary $3k–$8k between lenders.
- **"What's the lock period and extension cost?"** Closings slip; know your exposure before you sign.
- ${r.verdict === 'poor' || r.verdict === 'hold' || r.verdict === 'no_savings' ? `**"Can you set up a rate alert for ${fPct(r.triggerRate3yr ?? parseFloat((r.currentRatePct - 0.5).toFixed(2)))}?"** Many lenders will call or text when your trigger rate is available.` : `**"Do you offer a float-down before closing?"** Some lenders let you drop to the day-of rate at no cost if rates fall before you close.`}`;

    const noCostRate = parseFloat((r.newRatePct + 0.25).toFixed(2));
    const rate20yrEstimate = parseFloat((r.newRatePct - 0.25).toFixed(2));
    const strikeRate = parseFloat((r.currentRatePct - 0.5).toFixed(2));
    const deeperRate = parseFloat((r.newRatePct - 0.5).toFixed(2));
    // No-cost chip only makes sense if the no-cost rate is below the current rate
    const showNoCostChip = noCostRate < r.currentRatePct;

    const rateDrop = r.currentRatePct - r.newRatePct;
    const thinSpread = rateDrop < 0.5;

    // Chip 2: strike rate if not yet reached; deeper drop if already past it
    const chip2 = r.newRatePct > strikeRate
        ? {
            label: `Strike rate ${fPct(strikeRate)} — industry trigger point`,
            seed: `Refi from ${fPct(r.currentRatePct)} to ${fPct(strikeRate)} on ${fK(r.currentBalance)} — full cost and breakeven`,
            paramOverrides: { newRatePct: strikeRate, currentBalance: r.currentBalance, currentRatePct: r.currentRatePct },
            changedKeys: ['newRatePct'],
        }
        : {
            label: `Rates drop to ${fPct(deeperRate)} — how much more do I save?`,
            seed: `Refi from ${fPct(r.currentRatePct)} to ${fPct(deeperRate)} on ${fK(r.currentBalance)}`,
            paramOverrides: { newRatePct: deeperRate, currentBalance: r.currentBalance, currentRatePct: r.currentRatePct },
            changedKeys: ['newRatePct'],
        };

    // Chip 3: trigger rate (thin spread) or sell-in-3yr (good spread)
    const chip3rate = r.triggerRate3yr ?? parseFloat((r.currentRatePct - 1).toFixed(2));
    const chip3 = thinSpread
        ? {
            label: `Trigger rate ${fPct(chip3rate)} — 3yr breakeven`,
            seed: `Refi ${fK(r.currentBalance)} at ${fPct(r.currentRatePct)} to ${fPct(chip3rate)} — full breakeven analysis`,
            paramOverrides: { newRatePct: chip3rate, currentBalance: r.currentBalance, currentRatePct: r.currentRatePct },
            changedKeys: ['newRatePct'],
        }
        : {
            label: `If I sell in 3 years — does this refi still pay off?`,
            seed: `If I refi ${fK(r.currentBalance)} from ${fPct(r.currentRatePct)} to ${fPct(r.newRatePct)} and sell in 3 years, am I ahead or behind?`,
            paramOverrides: {
                earlySaleBalance:      r.currentBalance,
                earlySaleCurrentRate:  r.currentRatePct,
                earlySaleNewRate:      r.newRatePct,
                earlySaleClosingCosts: r.closingCosts,
                earlySaleYears:        3,
            } as Record<string, number>,
            changedKeys: ['earlySaleYears'],
        };

    const chips: BuiltCard['follow_up_chips'] = [
        ...(showNoCostChip ? [{
            label: `No-cost refi at ${fPct(noCostRate)} — lender covers closing costs`,
            seed: `No-cost refi on ${fK(r.currentBalance)} from ${fPct(r.currentRatePct)} to ${fPct(noCostRate)} — lender covers all closing costs`,
            paramOverrides: { newRatePct: noCostRate, currentBalance: r.currentBalance, currentRatePct: r.currentRatePct, closingCosts: 0 },
            changedKeys: ['newRatePct', 'closingCosts'],
        }] : []),
        chip2,
        chip3,
        ...(r.verdict !== 'no_savings' ? [{
            label: `Compare 20yr at ${fPct(rate20yrEstimate)} vs 30yr at ${fPct(r.newRatePct)} — which wins?`,
            seed: `Compare 20-year refi at ${fPct(rate20yrEstimate)} vs 30-year refi at ${fPct(r.newRatePct)} on ${fK(r.currentBalance)}`,
            paramOverrides: { rate20yr: rate20yrEstimate, rate30yr: parseFloat(r.newRatePct.toFixed(2)), balance20vs30: r.currentBalance },
            changedKeys: ['rate20yr', 'rate30yr'],
        }] : []),
    ];

    return {
        answer,
        next_step: "",
        follow_up: chips[0].label,
        follow_up_chips: chips,
        confidence: '1.00 (calculated — no LLM)',
        memoryPayload: {
            plain_english_summary: `Refi: ${f$(r.currentBalance)} balance, ${fPct(r.currentRatePct)} → ${fPct(r.newRatePct)}. New monthly P&I: ${f$(r.newMonthlyPI)}. Breakeven: ${r.breakEvenYears ? fYr(r.breakEvenYears) : 'n/a'}.`,
            scenario_inputs: { loan_amount: r.currentBalance, current_rate_pct: r.currentRatePct, rate_used_pct: r.newRatePct, term_years: 30 },
            computed_financials: { monthly_pi: r.newMonthlyPI, monthly_savings: r.monthlyPISavings, break_even_months: r.breakEvenMonths },
            monthly_payment: r.newMonthlyPI,
        },
        refiSlider: {
            balance: r.currentBalance,
            currentRate: r.currentRatePct,
            newRate: r.newRatePct,
            termMonths: r.refiTermMonths,
            closingCosts: r.closingCosts,
            ...(propertyValue != null && { propertyValue }),
        },
        lenderChecklist: {
            loanType: 'conventional' as const,
            price: propertyValue ?? r.currentBalance * 1.25,
            loanAmount: r.currentBalance,
            ltv: propertyValue ? r.currentBalance / propertyValue : 0.75,
            marketRate: r.newRatePct,
            monthlyPITI: r.newMonthlyPI,
            termYears: Math.round(r.refiTermMonths / 12),
            isInvestment: false,
        },
    };
}

// ─────────────────────────────────────────────
// REFI 20yr vs 30yr COMPARISON CARD
// ─────────────────────────────────────────────

export function buildRefi20vs30Card(r: Refi20vs30Result, fredRateStr?: string): BuiltCard {
    const fredNote = fredRateStr ? `\n> 📡 **Today's 30yr market rate: ${fredRateStr}** (FRED, live)\n` : '';

    const answer = `## 🔢 20-Year vs 30-Year Refi — ${fPct(r.rate20yr)} vs ${fPct(r.rate30yr)}
${fredNote}
**Loan Balance: ${f$(r.balance)}**

---

## 💰 Side-by-Side Comparison

| | 30-Year at ${fPct(r.rate30yr)} | 20-Year at ${fPct(r.rate20yr)} | Difference |
|--|--|--|--|
| Monthly P&I | ${f$(r.pi30)}/mo | ${f$(r.pi20)}/mo | **+${f$(r.extraMonthly)}/mo** |
| Total interest | ${f$(r.totalInt30)} | ${f$(r.totalInt20)} | **Save ${f$(r.interestSaved)}** |
| Loan term | 30 years | 20 years | **10 years sooner** |

---

## 🎯 The Trade-Off

Pay **${f$(r.extraMonthly)}/mo more** on the 20-year to eliminate **${f$(r.interestSaved)} in total interest** and be mortgage-free 10 years sooner.

---

## 💬 Ask Your Lender

- **"What's the actual 20yr rate today?"** The 20yr is typically 0.2–0.35% below the 30yr — confirm the spread before you decide.
- **"Can I make extra principal payments on the 30yr instead?"** You get flexibility, but a shorter term forces the discipline.
- **"What's the APR on each?"** APR includes fees — compare APR across both options, not just rate.`;

    const chips: BuiltCard['follow_up_chips'] = [
        {
            label: `30yr at ${fPct(r.rate30yr)} — full refi analysis`,
            seed: `Refi ${fK(r.balance)} to 30-year at ${fPct(r.rate30yr)} — breakeven and net savings`,
            paramOverrides: { newRatePct: r.rate30yr, currentBalance: r.balance, currentRatePct: parseFloat((r.rate30yr + 0.5).toFixed(2)) },
            changedKeys: ['newRatePct'],
        },
        {
            label: `1 extra payment/yr on the 30yr — how much sooner?`,
            seed: `If I make 1 extra payment per year on ${fK(r.balance)} at ${fPct(r.rate30yr)}, when do I pay it off and how much do I save?`,
            paramOverrides: { oneExtraPaymentBalance: r.balance, oneExtraPaymentRate: r.rate30yr } as Record<string, number>,
            changedKeys: ['oneExtraPaymentBalance'],
        },
        {
            label: `Extra payments on 30yr to pay off in 20 — how much extra/mo?`,
            seed: `If I take 30yr refi at ${fPct(r.rate30yr)} on ${fK(r.balance)} and want to pay it off in 20 years, how much extra per month do I need?`,
            paramOverrides: { extraPaymentBalance: r.balance, extraPaymentRate: r.rate30yr, extraPaymentTargetYears: 20 },
            changedKeys: ['extraPaymentTargetYears'],
        },
        {
            label: `No-cost refi option — what rate does that get me?`,
            seed: `What's the no-cost refi rate on ${fK(r.balance)} if the 30yr is ${fPct(r.rate30yr)}?`,
        },
    ];

    return {
        answer,
        next_step: '',
        follow_up: chips[0].label,
        follow_up_chips: chips,
        confidence: '1.00 (calculated — no LLM)',
        memoryPayload: {
            plain_english_summary: `20yr vs 30yr refi on ${f$(r.balance)}: 30yr at ${fPct(r.rate30yr)} = ${f$(r.pi30)}/mo, 20yr at ${fPct(r.rate20yr)} = ${f$(r.pi20)}/mo. Extra ${f$(r.extraMonthly)}/mo saves ${f$(r.interestSaved)} total interest.`,
            scenario_inputs: { loan_amount: r.balance, rate_20yr: r.rate20yr, rate_30yr: r.rate30yr },
            computed_financials: { monthly_pi_30yr: r.pi30, monthly_pi_20yr: r.pi20, interest_saved: r.interestSaved, extra_monthly: r.extraMonthly },
            monthly_payment: r.pi30,
        },
    };
}

// ─────────────────────────────────────────────
// REFI EARLY SALE CARD
// ─────────────────────────────────────────────

export function buildRefiEarlySaleCard(r: RefiEarlySaleResult, fredRateStr?: string): BuiltCard {
    const fredNote = fredRateStr ? `\n> 📡 **Today's market rate: ${fredRateStr}** (FRED, live)\n` : '';
    const verdict = r.isAhead ? '✅ Yes — you come out ahead' : '⚠️ No — you\'re still underwater at sale';
    const shortfall = r.isAhead ? null : Math.abs(r.trueNet);
    const noCostRefi = r.closingCosts === 0;

    const breakEvenLine = r.beMonths
        ? `**Breakeven: ${r.beMonths} months (${(r.beMonths / 12).toFixed(1)} yrs)** · Sale at **${r.saleMonths} months** — you're **${r.saleMonths >= r.beMonths ? `${r.saleMonths - r.beMonths} months past breakeven` : `${r.beMonths - r.saleMonths} months short`}**`
        : noCostRefi ? '**No-cost refi — breakeven is instant**' : '';

    const answer = `## ⏱️ Sell in ${r.saleYears} Years — Does the Refi Still Win?
${fredNote}
**${fPct(r.currentRatePct)} → ${fPct(r.newRatePct)} on ${f$(r.balance)}**

${breakEvenLine}

---

## 💰 At Sale (${r.saleYears} years)

| | Amount |
|--|--|
| Monthly savings | ${f$(r.monthlySavings)}/mo |
| Total cash saved over ${r.saleYears} yrs | ${f$(r.totalSavings)} |
| Closing costs | ${r.closingCosts > 0 ? `−${f$(r.closingCosts)}` : 'No-cost refi ($0)'} |
| **Net cash at sale** | **${r.netCashAtSale >= 0 ? '+' : ''}${f$(r.netCashAtSale)}** |
| Extra equity (lower-rate paydown) | +${f$(r.principalDiff)} |
| **True net at sale** | **${r.trueNet >= 0 ? '+' : ''}${f$(r.trueNet)}** |

---

## 🎯 ${verdict}

${r.isAhead
    ? `Even selling in ${r.saleYears} years, you net **+${f$(r.trueNet)}** after costs — cash savings plus the extra principal your lower rate paid down.`
    : `At ${r.saleYears} years you're **${f$(shortfall!)} short** of recovering closing costs. ${r.beMonths ? `Stay **${r.beMonths - r.saleMonths} more months** (${((r.beMonths - r.saleMonths) / 12).toFixed(1)} yrs) to break even.` : ''}`
}`;

    const chips: BuiltCard['follow_up_chips'] = [
        {
            label: `If I sell in 5 years instead`,
            seed: `If I refi ${fK(r.balance)} from ${fPct(r.currentRatePct)} to ${fPct(r.newRatePct)} and sell in 5 years, am I ahead?`,
            paramOverrides: {
                earlySaleBalance:      r.balance,
                earlySaleCurrentRate:  r.currentRatePct,
                earlySaleNewRate:      r.newRatePct,
                earlySaleClosingCosts: r.closingCosts,
                earlySaleYears:        5,
            } as Record<string, number>,
            changedKeys: ['earlySaleYears'],
        },
        {
            label: `Full refi analysis — ${fPct(r.currentRatePct)} → ${fPct(r.newRatePct)}`,
            seed: `Refi ${fK(r.balance)} from ${fPct(r.currentRatePct)} to ${fPct(r.newRatePct)} — full breakeven and savings`,
            paramOverrides: { newRatePct: r.newRatePct, currentBalance: r.balance, currentRatePct: r.currentRatePct },
            changedKeys: ['newRatePct'],
        },
        {
            label: `Compare 20yr vs 30yr at ${fPct(r.newRatePct)}`,
            seed: `Compare 20yr vs 30yr refi on ${fK(r.balance)} at ${fPct(r.newRatePct)}`,
            paramOverrides: {
                rate20yr:     parseFloat((r.newRatePct - 0.25).toFixed(2)),
                rate30yr:     r.newRatePct,
                balance20vs30: r.balance,
            },
            changedKeys: ['rate20yr'],
        },
    ];

    return {
        answer,
        next_step: '',
        follow_up: chips[0].label,
        follow_up_chips: chips,
        confidence: '1.00 (calculated — no LLM)',
        memoryPayload: {
            plain_english_summary: `Early sale in ${r.saleYears}yr: ${fPct(r.currentRatePct)}→${fPct(r.newRatePct)} on ${f$(r.balance)}. True net at sale: ${r.isAhead ? '+' : ''}${f$(r.trueNet)} (cash + equity).`,
            scenario_inputs: { loan_amount: r.balance, current_rate: r.currentRatePct, new_rate: r.newRatePct, sale_years: r.saleYears },
            computed_financials: { monthly_savings: r.monthlySavings, net_cash_at_sale: r.netCashAtSale, true_net: r.trueNet },
            monthly_payment: r.piNew,
        },
    };
}

// ─────────────────────────────────────────────
// EXTRA PAYMENT CARD
// ─────────────────────────────────────────────

export function buildExtraPaymentCard(r: ExtraPaymentResult, fredRateStr?: string): BuiltCard {
    const fredNote = fredRateStr ? `\n> 📡 **Today's 30yr market rate: ${fredRateStr}** (FRED, live)\n` : '';

    const answer = `## 💳 Extra Payments to Pay Off in ${r.targetYears} Years — ${fPct(r.ratePct)} Rate
${fredNote}
**Loan Balance: ${f$(r.balance)}**

---

## 📊 Breakdown

| | Standard 30yr | Pay Off in ${r.targetYears}yr | Difference |
|--|--|--|--|
| Monthly P&I | ${f$(r.piOriginal)}/mo | ${f$(r.piTarget)}/mo | **+${f$(r.extraMonthly)}/mo extra** |
| Total interest | ${f$(r.totalInt30)} | ${f$(r.totalIntTarget)} | **Save ${f$(r.interestSaved)}** |
| Payoff | 30 years | ${r.targetYears} years | **${30 - r.targetYears} years sooner** |

---

## 🎯 The Bottom Line

Add **${f$(r.extraMonthly)}/mo** to your regular payment and you'll pay off ${f$(r.balance)} in **${r.targetYears} years** instead of 30, saving **${f$(r.interestSaved)} in total interest**.

> Tip: Even paying half that extra (${f$(Math.round(r.extraMonthly / 2))}/mo) shaves several years off your loan.`;

    const chips: BuiltCard['follow_up_chips'] = [
        {
            label: `Full 30yr refi analysis at ${fPct(r.ratePct)}`,
            seed: `Refi to 30-year at ${fPct(r.ratePct)} on ${fK(r.balance)} — breakeven and net savings`,
            paramOverrides: { newRatePct: r.ratePct, currentBalance: r.balance, currentRatePct: parseFloat((r.ratePct + 0.5).toFixed(2)) },
            changedKeys: ['newRatePct'],
        },
        {
            label: `1 extra payment/yr instead — how much does that save?`,
            seed: `If I make 1 extra payment per year on ${fK(r.balance)} at ${fPct(r.ratePct)}, when do I pay it off?`,
            paramOverrides: { oneExtraPaymentBalance: r.balance, oneExtraPaymentRate: r.ratePct } as Record<string, number>,
            changedKeys: ['oneExtraPaymentBalance'],
        },
        {
            label: `20yr vs 30yr refi comparison`,
            seed: `Compare 20yr vs 30yr refi on ${fK(r.balance)} — 20yr at ${fPct(parseFloat((r.ratePct - 0.25).toFixed(2)))} vs 30yr at ${fPct(r.ratePct)}`,
            paramOverrides: { rate20yr: parseFloat((r.ratePct - 0.25).toFixed(2)), rate30yr: r.ratePct, balance20vs30: r.balance },
            changedKeys: ['rate20yr'],
        },
    ];

    return {
        answer,
        next_step: '',
        follow_up: chips[0].label,
        follow_up_chips: chips,
        confidence: '1.00 (calculated — no LLM)',
        memoryPayload: {
            plain_english_summary: `Extra payment calc on ${f$(r.balance)} at ${fPct(r.ratePct)}: +${f$(r.extraMonthly)}/mo pays off in ${r.targetYears}yr, saves ${f$(r.interestSaved)} vs 30yr.`,
            scenario_inputs: { loan_amount: r.balance, rate_pct: r.ratePct, target_years: r.targetYears },
            computed_financials: { extra_monthly: r.extraMonthly, interest_saved: r.interestSaved, pi_original: r.piOriginal, pi_target: r.piTarget },
            monthly_payment: r.piOriginal,
        },
    };
}

// ─────────────────────────────────────────────
// ONE EXTRA PAYMENT PER YEAR CARD
// ─────────────────────────────────────────────

export function buildOneExtraPaymentPerYearCard(r: OneExtraPaymentPerYearResult, fredRateStr?: string): BuiltCard {
    const fredNote = fredRateStr ? `\n> 📡 **Today's 30yr market rate: ${fredRateStr}** (FRED, live)\n` : '';
    const payoffYrs = Math.floor(r.payoffMonths / 12);
    const payoffMo  = r.payoffMonths % 12;
    const payoffStr = payoffMo > 0 ? `${payoffYrs} yrs ${payoffMo} mo` : `${payoffYrs} years`;

    const answer = `## 💡 1 Extra Payment Per Year — ${fPct(r.ratePct)} · ${f$(r.balance)}
${fredNote}
**One extra payment/year = your regular payment (${f$(r.piOriginal)}) sent once per year as pure principal.**

---

## 📊 Impact

| | Standard ${r.termYears}yr | With 1 Extra/yr | Difference |
|--|--|--|--|
| Payoff | ${r.termYears} years | **${payoffStr}** | **${r.yearsSaved} years sooner** |
| Total interest | ${f$(r.interestStandard)} | ${f$(r.interestWithExtra)} | **Save ${f$(r.interestSaved)}** |
| Monthly payment | ${f$(r.piOriginal)}/mo | ${f$(r.piOriginal)}/mo | No change |

---

## 🎯 The Bottom Line

Pay **${f$(r.piOriginal)} extra once a year** — same as your regular monthly payment — and save **${f$(r.interestSaved)} in total interest** while becoming mortgage-free **${r.yearsSaved} years sooner**.

> Tip: Set a January calendar reminder. One extra mortgage payment per year is the highest-ROI financial move most homeowners never make.`;

    const chips: BuiltCard['follow_up_chips'] = [
        {
            label: `Extra payments to pay off in 20yr — how much/mo?`,
            seed: `Extra monthly payment on ${fK(r.balance)} at ${fPct(r.ratePct)} to pay off in 20 years`,
            paramOverrides: { extraPaymentBalance: r.balance, extraPaymentRate: r.ratePct, extraPaymentTargetYears: 20 } as Record<string, number>,
            changedKeys: ['extraPaymentTargetYears'],
        },
        {
            label: `Full refi analysis at ${fPct(r.ratePct)}`,
            seed: `Refi to 30-year at ${fPct(r.ratePct)} on ${fK(r.balance)} — breakeven and net savings`,
            paramOverrides: { newRatePct: r.ratePct, currentBalance: r.balance, currentRatePct: parseFloat((r.ratePct + 0.5).toFixed(2)) },
            changedKeys: ['newRatePct'],
        },
        {
            label: `Compare 20yr vs 30yr at ${fPct(r.ratePct)}`,
            seed: `Compare 20yr vs 30yr refi on ${fK(r.balance)} at ${fPct(r.ratePct)}`,
            paramOverrides: { rate20yr: parseFloat((r.ratePct - 0.25).toFixed(2)), rate30yr: r.ratePct, balance20vs30: r.balance },
            changedKeys: ['rate20yr'],
        },
    ];

    return {
        answer,
        next_step: '',
        follow_up: chips[0].label,
        follow_up_chips: chips,
        confidence: '1.00 (calculated — no LLM)',
        memoryPayload: {
            plain_english_summary: `1 extra payment/yr on ${f$(r.balance)} at ${fPct(r.ratePct)}: payoff in ${payoffStr} vs ${r.termYears}yr standard, saves ${f$(r.interestSaved)}.`,
            scenario_inputs: { loan_amount: r.balance, rate_pct: r.ratePct, term_years: r.termYears },
            computed_financials: { payoff_months: r.payoffMonths, months_saved: r.monthsSaved, interest_saved: r.interestSaved },
            monthly_payment: r.piOriginal,
        },
    };
}

// ─────────────────────────────────────────────
// REFI NEEDS INPUT CARD
// ─────────────────────────────────────────────

export function buildRefiNeedsInputCard(
    parsed: RefiNeedsInput,
    fredRate?: number,
    fredAsOf?: string,
    snapshotBalance?: number,
    snapshotCurrentRate?: number,
): BuiltCard {
    const marketNote = fredRate
        ? `\n\n> 📡 **Today's market rate: ${fPct(fredRate)}** (FRED, live ${fredAsOf ?? ''})`
        : '';

    const isFHAtoConv = parsed.refiType === 'fha_to_conv';
    const isARMtoFixed = parsed.refiType === 'arm_to_fixed';
    const isCashOut = parsed.refiType === 'cash_out';

    const chips: BuiltCard['follow_up_chips'] = isFHAtoConv
        ? [
            { label: 'FHA→conv to kill MIP — show me the math', seed: `I have an FHA loan at 6.5% on a $450k home — is it worth refinancing to conventional to remove MIP?` },
            { label: 'How much equity do I need to remove MIP?', seed: 'How much equity do I need to refinance FHA to conventional and remove MIP?' },
        ]
        : isARMtoFixed
            ? [
                { label: 'ARM reset worst-case — show me the numbers', seed: `My 7/1 ARM is resetting — what's my worst-case payment if rates stay at 6.5%?` },
                { label: 'Lock to fixed now vs ride out the ARM', seed: `Should I lock my 5/1 ARM at ${fredRate ? fPct(fredRate) : '6.5%'} to a 30yr fixed, or ride it out?` },
            ]
            : [
                { label: `Tell me when to refi — what's my trigger rate?`, seed: `What rate would I need to refi my ${parsed.parsedBalance ? fK(parsed.parsedBalance) : snapshotBalance ? fK(snapshotBalance) : '$650k'} mortgage at ${parsed.parsedCurrentRate ? fPct(parsed.parsedCurrentRate) : snapshotCurrentRate ? fPct(snapshotCurrentRate) : '6.5%'}?` },
                { label: 'Refi now vs wait for a better rate', seed: `Compare refinancing my ${parsed.parsedBalance ? fK(parsed.parsedBalance) : snapshotBalance ? fK(snapshotBalance) : '$650k'} balance to ${fredRate ? fPct(fredRate) : '5.99%'} now vs waiting for a lower rate` },
                { label: 'Extra payments vs refi — what wins?', seed: `Compare making $500/mo extra payments vs refinancing my ${parsed.parsedBalance ? fK(parsed.parsedBalance) : snapshotBalance ? fK(snapshotBalance) : '$650k'} mortgage` },
            ];

    const answer = `## 🏦 Refi Advisor — What's Your Situation?${marketNote}

To calculate your breakeven and verdict, I need:

- **Current loan balance** (e.g. $650,000)
- **Your current interest rate** (e.g. 6.5%)
- **Target rate or timeframe** you're considering

**Optional but powerful:**
- Years you've been in the loan (amortization reset analysis)
- Home value (needed for FHA→conventional or cash-out)
- Closing cost quote (default: 2% of balance)
- How long you plan to stay

**Example:** *"Balance $780k at 6.75%, want to refi to 5.99%, bought 3 years ago, plan to stay 7 more years"*`;

    return {
        answer,
        next_step: 'Share your balance and current rate and I\'ll calculate your breakeven, savings, and verdict.',
        follow_up: chips[0].label,
        follow_up_chips: chips,
        confidence: 'needs_input',
    };
}

// ─────────────────────────────────────────────
// FHA NEEDS INPUT CARD
// ─────────────────────────────────────────────

export function buildFHANeedsInputCard(parsed: FHANeedsInput, fredRate?: number): BuiltCard {
    const rateHint = fredRate ? ` (or I'll use the current FRED rate: ${fPct(fredRate)})` : '';
    const chips: BuiltCard['follow_up_chips'] = [
        { label: 'FHA loan on $300k home at 6.5%', seed: 'FHA loan on a $300k home at 6.5%' },
        { label: 'FHA with 3.5% down, $75k income', seed: 'I make $75k and have $15k saved — can I get an FHA loan?' },
        { label: 'FHA vs conventional — compare both', seed: 'Compare FHA 3.5% down vs conventional 5% down on a $350k home' },
    ];
    const answer = `**FHA Loan Calculator**

I can calculate FHA costs including UFMIP, monthly MIP, DTI qualification, and FHA vs conventional comparison.

**To calculate, I need:**
- Purchase price
- Interest rate${rateHint}

**Optional:**
- Your income (for DTI qualification)
- Monthly debts (car, student loans, etc.)
- Credit score
- Property tax rate in your area

**Examples:**
- "FHA loan on $300k home at 6.5%"
- "I make $75k, want FHA loan on $280k house, $400 car payment"
- "FHA with 3.5% down on $350k, credit score 620, property tax 1.5%"`;

    return {
        answer,
        next_step: 'Share purchase price and rate to get your full FHA breakdown.',
        follow_up: chips[0].label,
        follow_up_chips: chips,
        confidence: 'needs_input',
    };
}

// ─────────────────────────────────────────────
// AFFORDABILITY CARD
// ─────────────────────────────────────────────

// Taglines matching production card style per scenario
function scenarioTagline(s: AffordabilityScenario): string {
    if (s.isFHA) return '⭐ Lowest barrier to entry';
    if (s.downPaymentPct >= 20) return '🛡️ No PMI — best long-term rate';
    return '🎯 Lowest conventional entry';
}

export function buildAffordabilityCard(
    r: AffordabilityResult,
    assumptions: string[] = [],
): BuiltCard {
    const mGross = r.annualIncome / 12;
    const assumptionNote = assumptions.length
        ? assumptions.map(a => `> 💡 **Assumption:** ${a}`).join('\n') + '\n\n' : '';

    // ── ANCHOR LINE (production signature) ─────────────────────────────────
    const debtClause = r.monthlyDebts > 0
        ? ` | ${f$(r.monthlyDebts)}/mo existing debt factored in`
        : '';
    const anchorLine = `**${f$(r.annualIncome)}/year = ${f$(Math.round(mGross))}/mo gross** | Rate: ${fPct(r.rate)}${debtClause}`;

    // ── SUMMARY CALLOUT ─────────────────────────────────────────────────────
    const summaryNote = `> 💡 Home prices below are based on what your **income qualifies for** at 43% DTI. Savings gap is shown separately — you may have more savings than listed, or can save toward the gap.`;

    // ── PER-SCENARIO DETAIL BLOCKS (production-style self-contained tables) ─
    const detailBlocks = r.scenarios.map((s) => {
        const mipLabel = s.isFHA ? 'FHA MIP' : 'PMI';
        const mipRow = s.monthlyMI > 0
            ? `| ${mipLabel} (${s.isFHA ? '0.55%' : '~0.5%'}/yr) | ${f$(s.monthlyMI)}/mo |\n`
            : '';
        const mipNote = s.isFHA
            ? `\n> ⚠️ **FHA MIP never cancels** on loans with <10% down. At your income, refinancing to conventional once you hit 20% equity saves ~${f$(s.monthlyMI)}/mo.\n`
            : s.monthlyMI > 0
                ? `\n> 💡 **PMI cancels** at 80% LTV — saves you ${f$(s.monthlyMI)}/mo when it drops off.\n`
                : `\n> ✅ **No PMI** — 20% down eliminates mortgage insurance entirely.\n`;
        const ufmipRow = s.isFHA
            ? `| + UFMIP (1.75%, financed) | +${f$(s.ufmip)} |\n` : '';
        const gapLine = s.savingsGap > 0
            ? `💰 **Cash needed:** ${f$(s.totalCashNeeded)} (down + closing) | You have ${f$(r.savings)} | **Need ${f$(s.savingsGap)} more**`
            : `💰 **Cash needed:** ${f$(s.totalCashNeeded)} | ✅ ${f$(s.savingsAfterClose)} left after close`;
        const dtiLine = `- DTI: **${fPct1(s.frontEndDTI)}** housing${r.monthlyDebts > 0 ? ` + ${f$(r.monthlyDebts)}/mo debt = **${fPct1(s.backEndDTI)} back-end**` : ''} of ${f$(Math.round(mGross))}/mo gross`;
        const interestLine = `- Total interest over 30yr: **${f$(s.totalInterest)}**`;

        return `
## ${s.icon} ${s.label} — ${scenarioTagline(s)}

| | |
|--|--|
| **Max Home Price** | **${f$(s.homePrice)}** |
| Down Payment (${s.downPaymentPct}%) | ${f$(s.downPaymentAmount)} |
| Base Loan Amount | ${f$(s.baseLoanAmount)} |
${ufmipRow}| **Total Loan Amount** | **${f$(s.loanAmount)}** |
| Closing Costs (~${s.isFHA ? '3' : '2.5'}%) | ${f$(s.closingCosts)} |

**Monthly Payment:**
| Component | Amount |
|-----------|--------|
| Principal & Interest | ${f$(s.monthlyPI)} |
| Property Taxes (est.) | ${f$(s.monthlyTax)} |
| Home Insurance | ${f$(s.monthlyInsurance)} |
${mipRow}| **Total PITI${s.monthlyMI > 0 ? (s.isFHA ? ' + MIP' : ' + PMI') : ''}** | **${f$(s.totalMonthly)}/mo** |
${mipNote}
${dtiLine}
${interestLine}
${gapLine}`;
    }).join('\n\n---\n');

    // ── SIDE-BY-SIDE COMPARISON TABLE ───────────────────────────────────────
    const s = r.scenarios;
    const compRows = s.map(sc =>
        `| ${sc.icon} ${sc.label} | ${f$(sc.homePrice)} | ${f$(sc.totalCashNeeded)} | ${f$(r.savings)} | ${sc.savingsGap > 0 ? `**${f$(sc.savingsGap)} more**` : `✅ Covered`} | ${f$(sc.totalMonthly)}/mo | ${sc.monthlyMI > 0 ? (sc.isFHA ? 'MIP (life of loan)' : 'PMI → cancels 80% LTV') : '❌ None'} |`
    ).join('\n');

    // ── DEBT / PATH FORWARD NOTE ────────────────────────────────────────────
    const debtNote = r.monthlyDebts > 200
        ? `\n💳 **Your ${f$(r.monthlyDebts)}/mo in debt is costing you buying power.** Paying it off would add ~${f$(Math.round(r.monthlyDebts * 220))} to your max home price.\n`
        : '';

    // ── PATH FORWARD ─────────────────────────────────────────────────────────
    const s0 = r.scenarios[0]; // first scenario (FHA or lowest down)
    const sFast = r.scenarios.reduce((best, sc) =>
        sc.savingsGap < best.savingsGap ? sc : best, r.scenarios[0]);
    const fastestPath = sFast.savingsGap <= 0
        ? `✅ You can close on **${sFast.label}** today with your current savings.`
        : `⚡ **You need ${f$(sFast.savingsGap)} more to close on ${sFast.label}** — the fastest path to homeownership on your income.\n- At $500/mo savings: **${Math.ceil(sFast.savingsGap / 500)} months** to closing-ready\n- At $1,000/mo savings: **${Math.ceil(sFast.savingsGap / 1000)} months** to closing-ready\n- Alternative: Ask about **gift funds** — FHA allows 100% of down payment as a gift from family`;

    const answer = `**What You Can Afford — Income-Based Analysis**
${assumptionNote}
${anchorLine}

${summaryNote}

---
${detailBlocks}

---

## 📊 Side-by-Side Comparison

| | Max Home | Cash Needed | You Have | Gap | Monthly PITI | PMI/MIP |
|--|--|--|--|--|--|--|
${compRows}

---

## 💡 Your Best Path Forward

${fastestPath}
${debtNote}${r.monthlyDebts === 0 ? `_Add your monthly debts (car, student loans, credit cards) and I'll show how they shift your numbers._` : ''}`;

    // ── CHIPS — specific to actual numbers in this result ───────────────────
    const fhaS = r.scenarios.find(sc => sc.isFHA) ?? r.scenarios[0];
    const convS = r.scenarios.find(sc => !sc.isFHA && sc.downPaymentPct < 15) ?? r.scenarios[1];
    const conv20 = r.scenarios.find(sc => sc.downPaymentPct >= 20);

    const chips: BuiltCard['follow_up_chips'] = [];

    // Chip 1: fastest path chip — either "buy now" or savings timeline
    if (sFast.savingsGap > 0) {
        const savingsPerMo = 1500;
        const months = Math.ceil(sFast.savingsGap / savingsPerMo);
        chips.push({
            label: `Save $1,500/mo — ready in ${months} months for ${sFast.label}`,
            seed: `How long until I can buy if I save $1,500/month? I need ${f$(sFast.savingsGap)} more for ${sFast.label} closing on a ${fK(sFast.homePrice)} home`,
        });
    } else {
        chips.push({
            label: `Show me FHA on ${fK(fhaS.homePrice)} — full monthly breakdown`,
            seed: `FHA loan on a ${fK(fhaS.homePrice)} home at ${fPct(r.rate)} with ${fPct1(fhaS.downPaymentPct)} down — full breakdown including MIP, DTI, and checklist`,
        });
    }

    // Chip 2: gift funds (FHA only) if there's a gap, otherwise rate sensitivity
    if (sFast.savingsGap > 0) {
        if (sFast.isFHA) {
            chips.push({
                label: `Can gift funds cover my ${f$(sFast.savingsGap)} gap?`,
                seed: `Can gift funds cover my FHA down payment? I need ${f$(sFast.savingsGap)} more with ${f$(r.annualIncome)} income`,
            });
        } else {
            chips.push({
                label: `Rate drops to ${fPct(r.rate - 0.5)} — how much does that help?`,
                seed: `What can I afford at ${fPct(r.rate - 0.5)} rate? I make ${f$(r.annualIncome)} and have ${f$(r.savings)} saved`,
                paramOverrides: {
                    annualIncome: r.annualIncome,
                    savings: r.savings,
                    monthlyDebts: r.monthlyDebts,
                    annualRatePct: Math.round((r.rate - 0.5) * 100) / 100,
                },
                changedKeys: ['annualRatePct'],
            });
        }
    } else {
        chips.push({
            label: `What if rates drop to ${fPct(r.rate - 0.5)}?`,
            seed: `What happens to my affordability if rates drop to ${fPct(r.rate - 0.5)}? I make ${f$(r.annualIncome)} and have ${f$(r.savings)} saved`,
            paramOverrides: {
                annualIncome: r.annualIncome,
                savings: r.savings,
                monthlyDebts: r.monthlyDebts,
                annualRatePct: Math.round((r.rate - 0.5) * 100) / 100,
            },
            changedKeys: ['annualRatePct'],
        });
    }

    // Chip 3: debt payoff if there's meaningful debt, otherwise 20% path
    if (r.monthlyDebts > 200) {
        chips.push({
            label: `Pay off ${f$(r.monthlyDebts)}/mo debt first — how much more home?`,
            seed: `What can I afford if I pay off my ${f$(r.monthlyDebts)}/mo debt? I make ${f$(r.annualIncome)}/yr and have ${f$(r.savings)} saved at ${fPct(r.rate)}`,
            paramOverrides: {
                annualIncome: r.annualIncome,
                savings: r.savings,
                monthlyDebts: 0,
                annualRatePct: r.rate,
            },
            changedKeys: ['monthlyDebts'],
        });
    } else if (conv20 && conv20.savingsGap > 0) {
        chips.push({
            label: `How long to save for 20% down on ${fK(conv20.homePrice)}?`,
            seed: `How long will it take me to save for 20% down on a ${fK(conv20.homePrice)} home? I make ${f$(r.annualIncome)} and currently have ${f$(r.savings)} saved`,
        });
    } else {
        chips.push({
            label: `Conventional vs FHA — total cost over 7 years`,
            seed: `Compare total cost of FHA vs conventional on a ${fK(fhaS.homePrice)} home at ${fPct(r.rate)} over 7 years — I make ${f$(r.annualIncome)}`,
        });
    }
    return {
        answer,
        next_step: sFast.savingsGap <= 0
            ? `Get pre-approved with 2–3 lenders to confirm your qualification range and lock a rate.`
            : `Open a high-yield savings account and automate ${f$(Math.min(sFast.savingsGap, 1500))}/mo transfers — you'll be closing-ready in ${Math.ceil(sFast.savingsGap / 1000)} months at $1k/mo savings.`,
        follow_up: chips[0].label,
        follow_up_chips: chips,
        confidence: `1.00 (calculated using verified mortgage formulas + Fannie Mae DTI guidelines)`,
        memoryPayload: {
            plain_english_summary: `Affordability: ${f$(r.annualIncome)}/yr income, ${f$(r.savings)} saved, ${f$(r.monthlyDebts)}/mo debts, ${fPct(r.rate)} rate. Max home (FHA): ${f$(r.scenarios[0]?.homePrice ?? 0)}. Monthly PITI: ${f$(r.scenarios[0]?.totalMonthly ?? 0)}.`,
            scenario_inputs: {
                annual_income: r.annualIncome,
                savings: r.savings,
                monthly_debts: r.monthlyDebts,
                rate_used_pct: r.rate,
            },
            computed_financials: {
                max_home_price_fha: r.scenarios[0]?.homePrice ?? 0,
                monthly_piti_fha: r.scenarios[0]?.totalMonthly ?? 0,
            },
            monthly_payment: r.scenarios[0]?.totalMonthly ?? 0,
        },
        affordabilitySlider: (() => {
            const sc0 = r.scenarios[0];
            const sc = r.scenarios.find(s => !s.isFHA) ?? sc0;
            const refPrice = sc?.homePrice ?? sc0?.homePrice ?? 300000;
            return {
                annualIncome: r.annualIncome,
                monthlyDebts: r.monthlyDebts,
                savings: r.savings,
                downPct: sc0?.isFHA ? (sc0?.downPaymentPct ?? 3.5) : (sc?.downPaymentPct ?? 5),
                rate: r.rate,
                term: 30,
                taxRate: refPrice > 0 ? ((sc?.monthlyTax ?? sc0?.monthlyTax ?? 300) * 12) / refPrice : 0.012,
                insRate: refPrice > 0 ? ((sc?.monthlyInsurance ?? sc0?.monthlyInsurance ?? 125) * 12) / refPrice : 0.005,
                loanType: sc0?.isFHA ? 'fha' : 'conventional',
            };
        })(),
        lenderChecklist: (() => {
            const sc0 = r.scenarios[0];
            if (!sc0) return undefined;
            return {
                loanType: (sc0.isFHA ? 'fha' : 'conventional') as 'fha' | 'conventional',
                pdfType: 'affordability' as const,
                price: sc0.homePrice,
                loanAmount: sc0.loanAmount,
                ltv: sc0.homePrice > 0 ? sc0.loanAmount / sc0.homePrice : 0.965,
                marketRate: r.rate,
                monthlyPITI: sc0.totalMonthly,
                termYears: 30,
                isInvestment: false,
            };
        })(),
    };
}

// ─────────────────────────────────────────────
// AFFORDABILITY NEEDS INPUT CARD
// ─────────────────────────────────────────────

export function buildAffordabilityNeedsInputCard(fredRate?: number): BuiltCard {
    const chips: BuiltCard['follow_up_chips'] = [
        { label: 'I make $95k/year and have $40k saved', seed: 'I make $95k/year and have $40k saved' },
        { label: 'I make $120k, $20k saved, $300/mo car payment', seed: 'I make $120k/year, have $20k saved, and pay $300/month in car payments' },
        { label: 'I make $75k/year and have $25k saved', seed: 'I make $75k/year and have $25k saved' },
    ];
    const answer = `**Let's figure out what you can afford!**

To show you 3 scenarios (FHA, Conventional 3%, Conventional 20%), I need:
- **Annual income** (salary before taxes)
- **Savings** (available for down payment + closing)

**Optional:**
- Monthly debt payments (car, student loans, credit cards)
- Target location (for tax estimates)

**Example:** *"I make $95k/year and have $40k saved"*`;

    return {
        answer,
        next_step: 'Share your income and savings and I\'ll show you 3 affordability scenarios.',
        follow_up: chips[0].label,
        follow_up_chips: chips,
        confidence: 'needs_input',
    };
}

// ─────────────────────────────────────────────
// DSCR CARD
// ─────────────────────────────────────────────

export function buildDSCRCard(r: DSCRResult, assumptions: string[] = []): BuiltCard {
    const priceK = Math.round(r.purchasePrice / 1000);
    const rateStr = fPct(r.annualRatePct);
    const assumptionNote = assumptions.length
        ? assumptions.map(a => `> 💡 **Assumption:** ${a}`).join('\n') + '\n\n' : '';

    const dscrStatusText = {
        excellent: '✅ **Excellent** — most lenders approve at 1.25x+',
        qualifies: '✅ **Qualifies** — meets minimum 1.0x (some lenders require 1.25x)',
        below_min: '⚠️ **Below 1.0x** — select lenders allow 0.75x+ with reserves',
        does_not_qualify: '❌ **Does not qualify** — DSCR too low for standard programs',
    }[r.dscrStatus];

    const vacancyRow = r.vacancyRate > 0
        ? `| Vacancy Loss (${(r.vacancyRate * 100).toFixed(0)}%) | -${f$(r.grossMonthlyRent * r.vacancyRate)} |\n| **Effective Gross Income** | **${f$(r.effectiveGrossIncome)}** |\n`
        : '';
    const hoaRow = r.monthlyHOA > 0 ? `| HOA | ${f$(r.monthlyHOA)} |\n` : '';

    const rentNeeded100 = Math.ceil(r.monthlyPITIA * 1.0);
    const rentNeeded125 = Math.ceil(r.monthlyPITIA * 1.25);
    const safeRent = (Number.isFinite(r.grossMonthlyRent) && r.grossMonthlyRent > 0) ? r.grossMonthlyRent : null;
    const rent90 = safeRent ? Math.round(safeRent * 0.9) : null;


    const snapRows = r.amortSnap
        .map(s => `| ${s.year} | ${f$(s.cumPrincipal)} | ${f$(s.yearInterest)} | ${f$(s.balance)} |`)
        .join('\n');

    const answer = `**DSCR Investment Property Analysis**
${assumptionNote}
**${f$(r.purchasePrice)} · ${r.downPaymentPct}% down · ${safeRent ? f$(safeRent) + '/mo rent' : 'rent TBD'} · ${rateStr}**

---

## 🏠 Loan Structure

| | |
|--|--|
| Purchase Price | ${f$(r.purchasePrice)} |
| Down Payment | ${f$(r.downPayment)} (${r.downPaymentPct}%) |
| Loan Amount | ${f$(r.loanAmount)} |
| Total Interest | ${f$(r.totalInterest)} |

---

## 💰 Monthly PITIA

| Component | Amount |
|-----------|--------|
| Principal & Interest | ${f$(r.monthlyPI)} |
| Property Taxes | ${f$(r.monthlyTax)} |
| Insurance | ${f$(r.monthlyInsurance)} |
${hoaRow}| **Total PITIA** | **${f$(r.monthlyPITIA)}** |

---

## 📊 DSCR Analysis

| Metric | Value |
|--------|-------|
| Gross Monthly Rent | ${safeRent ? f$(safeRent) : '—'} |
${vacancyRow}| Monthly PITIA | ${f$(r.monthlyPITIA)} |
| **DSCR (Rent ÷ PITIA)** | **${r.dscr.toFixed(2)}x** |
| Monthly Cash Flow | ${r.monthlyCashFlow >= 0 ? '+' : ''}${f$(r.monthlyCashFlow)} |
| Annual Cash Flow | ${r.annualCashFlow >= 0 ? '+' : ''}${f$(r.annualCashFlow)} |

${dscrStatusText}

**Rent needed for 1.0x DSCR:** ${f$(rentNeeded100)}/mo  
**Rent needed for 1.25x DSCR:** ${f$(rentNeeded125)}/mo

---

## 📈 Amortization Snapshot

| Year | Cum. Principal | Yr Interest | Balance |
|------|----------------|-------------|---------|
${snapRows}

---

## ⚠️ Key Risks

${r.dscr < 1.0 ? '- **Negative cash flow** — PITIA exceeds rent; reserves required\n' : ''}${r.downPaymentPct < 20 ? '- **<20% down** — most DSCR programs require 20–25% minimum\n' : ''}- Vacancy (5–10% typical) reduces effective DSCR
- Maintenance/CapEx (1–2%/yr) not included`;


    const chipRentStr = safeRent ? `, rent ${f$(safeRent)}/mo` : '';
    const chips: BuiltCard['follow_up_chips'] = [
        ...(safeRent && rent90 ? [{
            label: `What if rent drops to ${f$(rent90)}/mo?`,
            seed: `DSCR on ${fK(r.purchasePrice)} investment property, rent drops to ${f$(rent90)}/mo, ${r.downPaymentPct}% down, ${rateStr}`,
            paramOverrides: { grossMonthlyRent: rent90, purchasePrice: r.purchasePrice, downPaymentPct: r.downPaymentPct, annualRatePct: r.annualRatePct }
        }] : []),
        {
            label: `What if rate goes to ${(r.annualRatePct + 0.5).toFixed(2)}%?`,
            seed: `DSCR investment property ${fK(r.purchasePrice)}, ${r.downPaymentPct}% down${chipRentStr}, rate goes to ${(r.annualRatePct + 0.5).toFixed(2)}%`,
            paramOverrides: { annualRatePct: parseFloat((r.annualRatePct + 0.5).toFixed(2)), purchasePrice: r.purchasePrice, ...(safeRent ? { grossMonthlyRent: safeRent } : {}), downPaymentPct: r.downPaymentPct }
        },
        r.downPaymentPct < 30
            ? {
                label: `What if I put 30% down — does cash flow turn positive?`,
                seed: `DSCR on ${fK(r.purchasePrice)} investment property, 30% down${chipRentStr}, ${rateStr} — does cash flow turn positive?`,
                paramOverrides: { downPaymentPct: 30, purchasePrice: r.purchasePrice, ...(safeRent ? { grossMonthlyRent: safeRent } : {}), annualRatePct: r.annualRatePct }
            }
            : r.downPaymentPct < 35
            ? {
                label: `What if I put 35% down — how much does DSCR improve?`,
                seed: `DSCR on ${fK(r.purchasePrice)} investment property, 35% down${chipRentStr}, ${rateStr} — DSCR and cash flow`,
                paramOverrides: { downPaymentPct: 35, purchasePrice: r.purchasePrice, ...(safeRent ? { grossMonthlyRent: safeRent } : {}), annualRatePct: r.annualRatePct }
            }
            : {
                label: `Compare 25% down vs 35% down — leverage vs. cash flow`,
                seed: `DSCR on ${fK(r.purchasePrice)} investment property, 25% down${chipRentStr}, ${rateStr} — compare leverage vs cash flow`,
                paramOverrides: { downPaymentPct: 25, purchasePrice: r.purchasePrice, ...(safeRent ? { grossMonthlyRent: safeRent } : {}), annualRatePct: r.annualRatePct }
            },
        {
            label: `What rent do I need for 1.25x DSCR — lender approval threshold?`,
            seed: `What monthly rent do I need for 1.25x DSCR on a ${fK(r.purchasePrice)} investment property at ${rateStr} with ${r.downPaymentPct}% down?`
        },
    ];

    return {
        answer,
        next_step: r.dscr >= 1.0
            ? `DSCR is ${r.dscr.toFixed(2)}x — get quotes from DSCR lenders: LoanDepot, Griffin, JMAC.`
            : `Rent needs to be ${f$(rentNeeded100)}/mo to hit 1.0x DSCR. Is that achievable in your market?`,
        follow_up: chips[0].label,
        follow_up_chips: chips,
        confidence: '1.00 (calculated — no LLM)',
        memoryPayload: {
            plain_english_summary: `DSCR: ${f$(r.purchasePrice)} property, ${r.downPaymentPct}% down, ${f$(r.grossMonthlyRent)}/mo rent, ${rateStr}. DSCR: ${r.dscr.toFixed(2)}x. Monthly PITIA: ${f$(r.monthlyPITIA)}.`,
            scenario_inputs: { price: r.purchasePrice, down_payment_pct: r.downPaymentPct, loan_amount: r.loanAmount, rate_used_pct: r.annualRatePct, rent_monthly: r.grossMonthlyRent },
            computed_financials: { monthly_pi: r.monthlyPI, monthly_pitia: r.monthlyPITIA, dscr_gross: r.dscr, monthly_cash_flow: r.monthlyCashFlow },
            monthly_payment: r.monthlyPITIA,
        },
        dscrSlider: {
            price: r.purchasePrice,
            rent: r.grossMonthlyRent,
            downPct: r.downPaymentPct,
            rate: r.annualRatePct,
            vacancyRate: r.vacancyRate,
            taxRate: r.purchasePrice > 0 ? (r.monthlyTax * 12) / r.purchasePrice : 0.011,
            insRate: r.purchasePrice > 0 ? (r.monthlyInsurance * 12) / r.purchasePrice : 0.005,
        },
        lenderChecklist: {
            loanType: 'dscr' as const,
            price: r.purchasePrice,
            loanAmount: r.loanAmount,
            ltv: r.purchasePrice > 0 ? r.loanAmount / r.purchasePrice : 0.75,
            marketRate: r.annualRatePct,
            monthlyPITI: r.monthlyPITIA,
            termYears: 30,
            isInvestment: true,
            rent: r.grossMonthlyRent,
            vacancyRate: r.vacancyRate,
            taxRate: r.purchasePrice > 0 ? (r.monthlyTax * 12) / r.purchasePrice : 0.011,
            insRate: r.purchasePrice > 0 ? (r.monthlyInsurance * 12) / r.purchasePrice : 0.005,
        },
    };
}

// ─────────────────────────────────────────────
// DSCR NEEDS INPUT CARD
// ─────────────────────────────────────────────

export function buildDSCRNeedsInputCard(fredRate?: number, purchasePrice?: number, downPaymentPct?: number, annualRatePct?: number): BuiltCard {
    const rateHint = fredRate ? ` (or I'll use FRED avg: ${fPct(fredRate)})` : '';
    const rate = annualRatePct ?? fredRate;

    if (purchasePrice && purchasePrice > 0) {
        // Price is known — only rent is missing
        const priceFmt = purchasePrice >= 1_000_000
            ? `$${(purchasePrice / 1_000_000).toFixed(purchasePrice % 1_000_000 === 0 ? 0 : 2).replace(/\.?0+$/, '')}M`
            : `$${Math.round(purchasePrice / 1000)}k`;
        const downPct = downPaymentPct ?? 25;
        const downAmt = Math.round(purchasePrice * downPct / 100);
        const downFmt = downAmt >= 1_000_000 ? `$${(downAmt / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M` : `$${Math.round(downAmt / 1000)}k`;
        const rentExamples = [
            Math.round(purchasePrice * 0.006 / 100) * 100,  // ~0.6% of price/mo
            Math.round(purchasePrice * 0.008 / 100) * 100,  // ~0.8% of price/mo
        ];
        const chips: BuiltCard['follow_up_chips'] = [
            { label: `$${rentExamples[0].toLocaleString()}/mo rent — run DSCR`, seed: `DSCR on ${priceFmt} property, ${downPct}% down${rate ? ` at ${rate}%` : ''}, $${rentExamples[0].toLocaleString()} gross monthly rent`, paramOverrides: { purchasePrice, downPaymentPct: downPct, annualRatePct: rate ?? 7, grossMonthlyRent: rentExamples[0] } },
            { label: `$${rentExamples[1].toLocaleString()}/mo rent — run DSCR`, seed: `DSCR on ${priceFmt} property, ${downPct}% down${rate ? ` at ${rate}%` : ''}, $${rentExamples[1].toLocaleString()} gross monthly rent`, paramOverrides: { purchasePrice, downPaymentPct: downPct, annualRatePct: rate ?? 7, grossMonthlyRent: rentExamples[1] } },
            { label: 'What DSCR lenders approve <1.0x?', seed: 'Which DSCR lenders approve below 1.0x DSCR?' },
        ];
        const answer = `**DSCR Analysis — ${priceFmt} Property**

**Property loaded:** ${priceFmt} purchase · ${downPct}% down (${downFmt})${rate ? ` · ${rate}% rate` : ''}

**Just need monthly rent to run the full DSCR analysis.**

Enter the expected gross monthly rent — I'll calculate DSCR ratio, cash flow, PITIA, and break-even rent:`;

        return {
            answer,
            next_step: `What is the expected gross monthly rent for this property?`,
            follow_up: chips[0].label,
            follow_up_chips: chips,
            confidence: 'needs_input',
        };
    }

    // Generic — no price known
    const chips: BuiltCard['follow_up_chips'] = [
        { label: '$450k property, $3,200/mo rent at 7%', seed: '$450k investment property, $3,200/mo rent, 25% down at 7%' },
        { label: '$600k rental, $3,800 rent, 7.25%', seed: '$600k investment property, 25% down, $3,800 rent, 7.25%' },
        { label: 'What DSCR lenders approve <1.0x?', seed: 'Which DSCR lenders approve below 1.0x DSCR?' },
    ];
    const answer = `**DSCR Investment Property Calculator**

I can calculate DSCR, monthly PITIA, cash flow, and amortization.

**To calculate, I need:**
- Purchase price
- Gross monthly rent
- Interest rate${rateHint}

**Optional:**
- Down payment % (default 25% for DSCR)
- Vacancy rate
- Property tax rate
- HOA

**Examples:**
- "$450k property, rents for $3,200/mo at 7%"
- "$600k investment property, 25% down, $3,800 rent, 7.25%"`;

    return {
        answer,
        next_step: 'Share purchase price and monthly rent and I\'ll calculate your full DSCR analysis.',
        follow_up: chips[0].label,
        follow_up_chips: chips,
        confidence: 'needs_input',
    };
}

// ─────────────────────────────────────────────
// MIP DURATION KNOWLEDGE CARD (no calc needed)
// ─────────────────────────────────────────────

export function buildMIPDurationCard(conversationHistory: string = ''): BuiltCard {
    const hadLowDown = /3\.5%|3\.5 percent/i.test(conversationHistory);
    const had10Down = /10%|10 percent/i.test(conversationHistory);

    const lowDownAnswer = `**FHA MIP Duration**

With **3.5% down** (the minimum), FHA MIP lasts for the **life of the loan** — it never automatically cancels.

**To remove MIP:**
1. **Refinance to conventional** once you reach 20% equity (most common — typically 7–10 years of payments)
2. **Make extra principal payments** to reach 20% equity faster, then refinance

**Why FHA doesn't cancel MIP automatically:**
FHA changed the rules in 2013 — loans with <10% down now carry MIP for the full 30 years (vs. conventional PMI which cancels at 80% LTV by law).

> 💡 **Rule of thumb:** If your credit score is 680+ and you have 20% equity, refinancing to conventional is usually worth it.`;

    const highDownAnswer = `**FHA MIP Duration**

| Down Payment | MIP Duration |
|--|--|
| **≥10% down** | Cancels after **11 years** (132 payments) |
| **<10% down** | Lasts the **life of the loan** (never cancels automatically) |

To remove MIP before 11 years: refinance to conventional once you reach 20% equity.`;

    const chips: BuiltCard['follow_up_chips'] = [
        { label: 'When do I hit 20% equity?', seed: 'When will I reach 20% equity and what\'s the refinance break-even point?' },
        { label: 'FHA→conventional refi — is it worth it?', seed: 'Is it worth refinancing from FHA to conventional to remove MIP?' },
    ];

    return {
        answer: (hadLowDown || !had10Down) ? lowDownAnswer : highDownAnswer,
        next_step: 'To exit FHA MIP, refinance to conventional at 20% LTV.',
        follow_up: chips[0].label,
        follow_up_chips: chips,
        confidence: '1.00 (FHA MIP policy per HUD guidelines)',
    };
}

// ─────────────────────────────────────────────
// UW / GENERAL KNOWLEDGE CARD
// ─────────────────────────────────────────────
// Called from the answers route after the AI generates a UW answer.
// Ensures consistent card format + produces topic-specific follow-up chips
// (never generic) based on what the user actually asked about.
// ─────────────────────────────────────────────

export interface UWCardInput {
    question: string;          // original user question (for chip detection)
    answerMarkdown: string;    // AI-generated answer from UW guidelines path
    source?: string;           // optional canonical source name
    sourceUrl?: string;        // optional canonical source URL
    elapsedMs?: number;
}

// ── Topic detectors (mirrors route.ts generateUWChips but richer) ──────────
function uwTopic(q: string) {
    const t = q.toLowerCase();
    return {
        isMIP: /\bmip\b|ufmip|mortgage insurance premium/i.test(q),
        isFHA: /\bfha\b/i.test(q),
        isConv: /conventional|fannie|freddie/i.test(q),
        isVA: /\bva\b|veteran|funding fee|coe\b|entitlement/i.test(q),
        isUSDA: /\busda\b|rural development/i.test(q),
        isDSCR: /\bdscr\b|debt service/i.test(q),
        isDTI: /\bdti\b|debt.to.income/i.test(q),
        isCredit: /credit score|fico/i.test(q),
        isDown: /down payment|ltv|loan.to.value/i.test(q),
        isPMI: /\bpmi\b/i.test(q),
        isPMICancel: /cancel|remov|drop|stop|go away|78|80/i.test(q) && /\bpmi\b/i.test(q),
        isMIPCancel: /remov|cancel|get rid|eliminate/i.test(q) && /\bmip\b/i.test(q),
        isLimits: /loan limit|conforming|jumbo|high.balance/i.test(q),
        isReserves: /reserve|months of/i.test(q),
        isGift: /gift fund/i.test(q),
        isSelfEmp: /self.employ/i.test(q),
        isJumbo: /jumbo|non.?conforming/i.test(q),
        isFHAvsConv: /fha.{0,20}conven|conven.{0,20}fha/i.test(q),
        isEmploy: /employment|work history|job/i.test(q),
        isAppraisal: /apprais/i.test(q),
        isEscrow: /escrow/i.test(q),
        isClosing: /closing cost|closing disclosure|cd\b|settlement/i.test(q),
        isLockRate: /rate lock|lock.{0,10}rate/i.test(q),
        isRefi: /refinanc|refi/i.test(q),
        isWaiting: /waiting period|after bankruptcy|after foreclosure/i.test(q),
        isManualUW: /manual underwriting|aus\b|du\b|lp\b|automated/i.test(q),
        isIncome: /income.{0,20}(doc|qualify|calculat)/i.test(q),
    };
}

function generateUWFollowUpChips(q: string): Array<{ label: string; seed: string }> {
    const tp = uwTopic(q);

    // ── FHA vs Conventional comparison ──────────────────────────────────────
    if (tp.isFHAvsConv) return [
        { label: 'FHA vs conventional loan limits in 2026', seed: 'Ask Underwriting: what are the FHA and conventional conforming loan limits for 2026?' },
        { label: 'FHA gift funds vs conventional — which is more flexible?', seed: 'Ask Underwriting: compare gift fund rules for FHA vs conventional loans — who is more flexible?' },
        { label: 'How does self-employed income differ for FHA vs conventional?', seed: 'Ask Underwriting: how does self-employed income documentation differ between FHA and conventional?' },
        { label: 'FHA vs conventional DTI limits — complete comparison', seed: 'Ask Underwriting: compare DTI limits across FHA and conventional — what compensating factors help?' },
    ];

    // ── PMI cancellation ────────────────────────────────────────────────────
    if (tp.isPMICancel) return [
        { label: 'Can a new appraisal remove PMI early?', seed: 'Ask Underwriting: can a new appraisal help me remove PMI before 78% LTV on a conventional loan?' },
        { label: 'PMI vs FHA MIP — total cost over 7 years', seed: 'Ask Underwriting: how does total conventional PMI cost compare to FHA MIP over 5 and 10 years?' },
        { label: 'What is lender-paid PMI and when does it make sense?', seed: 'Ask Underwriting: what is lender-paid PMI vs borrower-paid PMI — when does each make sense?' },
        { label: 'Automatic PMI removal — what triggers it?', seed: 'Ask Underwriting: when does PMI automatically cancel vs when must I request it on a conventional loan?' },
    ];

    // ── FHA MIP cancellation ────────────────────────────────────────────────
    if (tp.isMIPCancel) return [
        { label: 'Refinance FHA → conventional to kill MIP', seed: 'Ask Underwriting: when can I refinance from FHA to conventional to permanently eliminate MIP?' },
        { label: 'What LTV do I need to remove FHA MIP?', seed: 'Ask Underwriting: what LTV is required to remove MIP on an FHA loan — does it differ by origination date?' },
        { label: 'FHA MIP vs conventional PMI — total cost comparison', seed: 'Ask Underwriting: compare the total cost of FHA MIP vs conventional PMI over 5 and 10 years' },
        { label: 'Extra payments to hit 20% equity faster', seed: 'Ask Underwriting: how do extra principal payments help me exit FHA MIP sooner?' },
    ];

    // ── FHA (general) ────────────────────────────────────────────────────────
    if (tp.isMIP || (tp.isFHA && !tp.isConv)) return [
        { label: 'FHA MIP vs conventional PMI — which costs more?', seed: 'Ask Underwriting: how does FHA MIP compare to conventional PMI — rates, duration, and cancellation?' },
        { label: 'What credit score do I need for FHA 3.5% down?', seed: 'Ask Underwriting: what credit score is required for FHA 3.5% down — and what happens at 580 vs 640?' },
        { label: 'FHA after bankruptcy — what are the waiting periods?', seed: 'Ask Underwriting: what are the FHA waiting period requirements after Chapter 7 vs Chapter 13 bankruptcy?' },
        { label: 'FHA loan limits for 2026 — floor and ceiling', seed: 'Ask Underwriting: what are the FHA loan limits for 2026 — national floor, ceiling, and high-cost areas?' },
    ];

    // ── Gift funds — must come before generic PMI/Conv branch ───────────────
    if (tp.isGift) return [
        { label: 'Gift fund rules — FHA vs conventional vs VA', seed: 'Ask Underwriting: compare gift fund rules across FHA, conventional, VA, and USDA loans' },
        { label: 'Can gift funds be used for investment properties?', seed: 'Ask Underwriting: are gift funds allowed for investment property down payments on any loan type?' },
        { label: 'What documentation is required for gift funds?', seed: 'Ask Underwriting: what documentation is required to use gift funds — gift letter, bank statements, transfers?' },
        { label: 'Gift fund seasoning — how long must funds be in account?', seed: 'Ask Underwriting: do gift funds need to be seasoned before closing on FHA or conventional?' },
    ];

    // ── PMI / Conventional (general) ────────────────────────────────────────
    if (tp.isPMI || (tp.isConv && !tp.isFHA)) return [
        { label: 'Can appreciation help remove PMI early?', seed: 'Ask Underwriting: can a new appraisal help me cancel PMI before 78% LTV on a conventional loan?' },
        { label: 'What DTI limits apply to conventional loans?', seed: 'Ask Underwriting: what are the DTI limits for conventional — and what compensating factors allow higher DTI?' },
        { label: 'Conventional gift fund rules by property type', seed: 'Ask Underwriting: what are the gift fund rules for conventional loans — primary vs second home vs investment?' },
        { label: 'Conventional loan limits for 2026', seed: 'Ask Underwriting: what are the 2026 conventional conforming loan limits including high-balance counties?' },
    ];

    // ── VA ───────────────────────────────────────────────────────────────────
    if (tp.isVA) return [
        { label: 'VA funding fee — who is exempt?', seed: 'Ask Underwriting: explain the VA funding fee — rates, exemptions, and when it applies for first vs subsequent use' },
        { label: 'How does VA entitlement work — first and subsequent use?', seed: 'Ask Underwriting: how does VA loan entitlement work, including restoration after selling?' },
        { label: 'VA vs conventional — key underwriting differences', seed: 'Ask Underwriting: what are the main underwriting differences between VA and conventional loans?' },
        { label: 'Can I use VA if I still have a VA loan?', seed: 'Ask Underwriting: can I use VA loan eligibility if I already have an active VA mortgage?' },
    ];

    // ── USDA ─────────────────────────────────────────────────────────────────
    if (tp.isUSDA) return [
        { label: 'How do USDA income limits work?', seed: 'Ask Underwriting: how are USDA income limits calculated — and where do I check my household eligibility?' },
        { label: 'USDA vs FHA — total costs and eligibility', seed: 'Ask Underwriting: compare USDA and FHA loan total costs, fees, and eligibility requirements' },
        { label: 'What properties qualify for USDA?', seed: 'Ask Underwriting: how do I determine if a property location qualifies for a USDA loan?' },
        { label: 'USDA guarantee fee — upfront and annual', seed: 'Ask Underwriting: what is the USDA guarantee fee — upfront and annual amounts for 2026?' },
    ];

    // ── DSCR ─────────────────────────────────────────────────────────────────
    if (tp.isDSCR) return [
        { label: 'What DSCR ratio do most lenders require?', seed: 'Ask Underwriting: what DSCR ratio is typically required and how does it affect rate and terms?' },
        { label: 'How is DSCR income calculated — what counts?', seed: 'Ask Underwriting: how is DSCR calculated — what income counts and does vacancy factor in?' },
        { label: 'DSCR vs conventional investment loan — key differences', seed: 'Ask Underwriting: what are the underwriting differences between DSCR and conventional investment property loans?' },
        { label: 'DSCR reserve requirements — how many months?', seed: 'Ask Underwriting: how many months of reserves are required for DSCR loans vs conventional investment loans?' },
    ];

    // ── DTI ──────────────────────────────────────────────────────────────────
    if (tp.isDTI) return [
        { label: 'DTI limits across all loan types — complete table', seed: 'Ask Underwriting: compare DTI limits for FHA, conventional, VA, and USDA — front-end and back-end' },
        { label: 'What debts count in DTI — and what is excluded?', seed: 'Ask Underwriting: what monthly debts are included in DTI calculation — and what is excluded?' },
        { label: 'Compensating factors that allow higher DTI', seed: 'Ask Underwriting: what compensating factors allow DTI above 45% for conventional loan approval?' },
        { label: 'How is DTI calculated for self-employed borrowers?', seed: 'Ask Underwriting: how is DTI calculated differently for self-employed borrowers on FHA and conventional?' },
    ];

    // ── Credit score ─────────────────────────────────────────────────────────
    if (tp.isCredit) return [
        { label: 'Credit score minimums by loan type — full table', seed: 'Ask Underwriting: what are the minimum credit score requirements for FHA, conventional, VA, and USDA?' },
        { label: 'How does credit score affect mortgage rate?', seed: 'Ask Underwriting: how does credit score affect mortgage rate and terms across FHA, conventional, and VA?' },
        { label: 'What is manual underwriting — when is it required?', seed: 'Ask Underwriting: what is manual underwriting and when does a lender require it instead of AUS?' },
        { label: 'FHA at 580 vs 620 vs 640 — rate and term impact', seed: 'Ask Underwriting: how does credit score affect FHA rate and terms at 580 vs 620 vs 640?' },
    ];

    // ── Loan limits ──────────────────────────────────────────────────────────
    if (tp.isLimits || tp.isJumbo) return [
        { label: '2026 conforming loan limits by county type', seed: 'Ask Underwriting: what are the 2026 conventional conforming loan limits — standard, high-balance, and by state?' },
        { label: 'FHA loan limits for 2026 — floor and ceiling', seed: 'Ask Underwriting: what are the FHA loan limits for 2026 nationally and in high-cost areas?' },
        { label: 'Jumbo loan requirements — credit, DTI, reserves', seed: 'Ask Underwriting: what are the typical credit score, DTI, and reserve requirements for jumbo loans?' },
        { label: 'High-balance vs standard conforming — how do they differ?', seed: 'Ask Underwriting: what is the difference between a high-balance conforming loan and a standard conforming loan?' },
    ];

    // ── Reserves ─────────────────────────────────────────────────────────────
    if (tp.isReserves) return [
        { label: 'Reserve requirements by property type', seed: 'Ask Underwriting: how do reserve requirements differ for primary, second home, and investment properties?' },
        { label: 'What assets count as mortgage reserves?', seed: 'Ask Underwriting: what types of assets count as mortgage reserves in underwriting — 401k, stocks, savings?' },
        { label: 'DSCR loans — how many months reserves required?', seed: 'Ask Underwriting: compare reserve requirements for DSCR vs conventional investment loans' },
        { label: 'Multiple financed properties — reserve rules', seed: 'Ask Underwriting: what are the reserve requirements when you have multiple financed properties?' },
    ];

    // ── Gift funds ───────────────────────────────────────────────────────────
    // ── Self-employed ────────────────────────────────────────────────────────
    if (tp.isSelfEmp) return [
        { label: 'How is self-employed income calculated for mortgage?', seed: 'Ask Underwriting: how do lenders calculate qualifying income for self-employed borrowers — 1040s, write-offs?' },
        { label: 'What documents does a self-employed borrower need?', seed: 'Ask Underwriting: what documentation is required for self-employed mortgage applicants — tax returns, P&L, bank statements?' },
        { label: 'Bank statement loans vs full-doc — when to use each?', seed: 'Ask Underwriting: how does bank statement loan underwriting work vs full-doc for self-employed borrowers?' },
        { label: 'Does business debt count against personal DTI?', seed: 'Ask Underwriting: does business debt count in DTI for a self-employed borrower on a conventional loan?' },
    ];

    // ── Employment history ───────────────────────────────────────────────────
    if (tp.isEmploy) return [
        { label: 'New job before closing — does it disqualify me?', seed: 'Ask Underwriting: can I change jobs before closing and still qualify — what are the employment history rules?' },
        { label: 'Employment gaps — how do lenders view them?', seed: 'Ask Underwriting: how long of an employment gap requires explanation for FHA and conventional loans?' },
        { label: 'How is part-time income documented for mortgage?', seed: 'Ask Underwriting: how do lenders count part-time income for mortgage qualification?' },
        { label: 'How long must bonus/overtime income be documented?', seed: 'Ask Underwriting: how long do bonus or overtime earnings need to be documented to count in mortgage income?' },
    ];

    // ── Waiting periods ──────────────────────────────────────────────────────
    if (tp.isWaiting) return [
        { label: 'Waiting periods after bankruptcy — all loan types', seed: 'Ask Underwriting: what are the mortgage waiting periods after Chapter 7 and Chapter 13 bankruptcy for FHA, conventional, VA?' },
        { label: 'Waiting period after foreclosure or short sale', seed: 'Ask Underwriting: what are the waiting periods after foreclosure or short sale for FHA, conventional, VA, and USDA?' },
        { label: 'Can extenuating circumstances shorten waiting periods?', seed: 'Ask Underwriting: what counts as extenuating circumstances that shorten mortgage waiting periods after foreclosure?' },
        { label: 'Credit score recovery — what score do I need by when?', seed: 'Ask Underwriting: after bankruptcy or foreclosure, what credit score do I need and how fast can it recover?' },
    ];

    // ── Refinancing (guideline version, not calc) ────────────────────────────
    if (tp.isRefi) return [
        { label: 'Cash-out refi — how much equity can I take?', seed: 'Ask Underwriting: what are the LTV limits for cash-out refinancing on conventional, FHA, and VA loans?' },
        { label: 'Streamline refi — FHA and VA eligibility rules', seed: 'Ask Underwriting: what are the rules for FHA Streamline and VA IRRRL refinance — eligibility and requirements?' },
        { label: 'Waiting period to refi after purchase', seed: 'Ask Underwriting: how long do I have to wait before I can refinance a recently purchased home?' },
        { label: 'No-cash-out vs cash-out refi — guideline differences', seed: 'Ask Underwriting: what is the difference in underwriting requirements between a rate-term and cash-out refinance?' },
    ];

    // ── Closing costs / disclosures ──────────────────────────────────────────
    if (tp.isClosing) return [
        { label: 'Loan Estimate vs Closing Disclosure — key differences', seed: 'Ask Underwriting: what is the difference between a Loan Estimate and Closing Disclosure under TRID?' },
        { label: 'What closing costs can be rolled into the loan?', seed: 'Ask Underwriting: which closing costs can be financed or rolled into the loan on FHA, VA, and conventional?' },
        { label: 'Seller concessions — how much can seller pay?', seed: 'Ask Underwriting: what are the seller concession limits by loan type — FHA, conventional, VA, USDA?' },
        { label: 'Can closing costs be gifted?', seed: 'Ask Underwriting: can closing costs be covered by gift funds or grants on FHA or conventional loans?' },
    ];

    // ── Rate lock ────────────────────────────────────────────────────────────
    if (tp.isLockRate) return [
        { label: 'Float-down option — how does it work?', seed: 'Ask Underwriting: what is a float-down rate lock option and when should I use it?' },
        { label: 'What happens if my loan doesn\'t close before lock expires?', seed: 'Ask Underwriting: what happens if my mortgage rate lock expires before closing?' },
        { label: 'Extended rate locks — cost and when to use', seed: 'Ask Underwriting: when does it make sense to pay for an extended rate lock of 60 or 90 days?' },
        { label: 'Lock after clear to close vs at application', seed: 'Ask Underwriting: when is the best time to lock my mortgage rate — at application or closer to closing?' },
    ];

    // ── Manual underwriting / AUS ────────────────────────────────────────────
    if (tp.isManualUW) return [
        { label: 'What credit score triggers manual underwriting?', seed: 'Ask Underwriting: what credit score or scenario causes a loan to require manual underwriting on FHA?' },
        { label: 'Manual UW compensating factors — full list', seed: 'Ask Underwriting: what compensating factors are recognized in FHA and conventional manual underwriting?' },
        { label: 'DU vs LP — key differences for borrowers', seed: 'Ask Underwriting: what is the difference between Fannie Mae DU and Freddie Mac LP automated underwriting systems?' },
        { label: 'Can I get approved manually after AUS denial?', seed: 'Ask Underwriting: if DU or LP issues a refer, can the loan still be manually underwritten and approved?' },
    ];

    // ── Down payment / LTV ───────────────────────────────────────────────────
    if (tp.isDown) return [
        { label: 'Down payment minimums by loan type — complete table', seed: 'Ask Underwriting: what are the minimum down payment requirements for FHA, conventional, VA, and USDA?' },
        { label: 'Down payment assistance programs — how do they work?', seed: 'Ask Underwriting: how do down payment assistance programs work — can they be used with FHA and conventional?' },
        { label: 'LTV limits for investment properties', seed: 'Ask Underwriting: what are the LTV and down payment requirements for investment property conventional and DSCR loans?' },
        { label: 'Second home vs primary — down payment difference', seed: 'Ask Underwriting: what is the minimum down payment for a second home vs primary residence on conventional?' },
    ];

    // ── Generic fallback — broad mortgage knowledge ──────────────────────────
    return [
        { label: 'FHA vs conventional — full underwriting comparison', seed: 'Ask Underwriting: what are the main underwriting differences between FHA and conventional loans?' },
        { label: 'Credit score minimums by loan type', seed: 'Ask Underwriting: what are the minimum credit score requirements for FHA, conventional, VA, and USDA?' },
        { label: 'DTI limits — FHA, conventional, VA, USDA compared', seed: 'Ask Underwriting: compare DTI limits across all major loan types including compensating factors' },
        { label: 'Reserve requirements for investment properties', seed: 'Ask Underwriting: what are the reserve requirements for investment property and DSCR loans?' },
    ];
}

export function buildUWCard(input: UWCardInput): BuiltCard {
    const { question, answerMarkdown, source, sourceUrl, elapsedMs } = input;
    const chips = generateUWFollowUpChips(question);

    // Determine a logical next_step based on topic
    const tp = uwTopic(question);
    let nextStep = 'Verify current guidelines with your lender or at the official source.';
    if (tp.isFHA || tp.isMIP) nextStep = 'Confirm FHA guidelines at hud.gov or with an FHA-approved lender.';
    if (tp.isConv || tp.isPMI) nextStep = 'Confirm conventional guidelines at fanniemae.com or with your lender.';
    if (tp.isVA) nextStep = 'Verify VA entitlement and eligibility at va.gov/housing-assistance.';
    if (tp.isUSDA) nextStep = 'Check USDA property and income eligibility at rd.usda.gov.';
    if (tp.isDSCR) nextStep = 'Get DSCR quotes from: LoanDepot, Griffin Funding, JMAC, Angel Oak.';
    if (tp.isSelfEmp) nextStep = 'Work with a loan officer experienced in bank-statement or self-employed loans.';
    if (tp.isCredit) nextStep = 'Pull your full tri-merge credit report before applying — dispute errors early.';

    // Build a source footer if provided
    const sourceFooter = source && sourceUrl
        ? `\n\n---\n\n## 📎 Source\n[${source}](${sourceUrl})`
        : source
            ? `\n\n---\n\n## 📎 Source\n${source}`
            : '';

    const answer = `${answerMarkdown}${sourceFooter}`;

    return {
        answer,
        next_step: nextStep,
        follow_up: chips[0].label,
        follow_up_chips: chips,
        confidence: '1.00 (sourced from official guidelines database)',
    };
}

// version: cardBuilders-2026-03-08-01
// version: cardBuilders-2026-03-08-02

export function buildLabCard(): BuiltCard {
    const modules = [
        { label: 'Home Purchase', desc: '$832,750 · 10% down · 6.5%', seed: 'Conventional loan $832,750 home 10% down at 6.5%' },
        { label: 'FHA Loan', desc: '$541,287 · 3.5% down · 6.25%', seed: 'FHA loan $541,287 home 3.5% down at 6.25%' },
        { label: 'Rental Property', desc: '$750k · 25% down · rent $4,800/mo', seed: 'DSCR loan $750,000 rental property 25% down 7.25% rate rent $4,800/mo' },
        { label: 'Refinance', desc: '$750k balance · 7.75% → 6.75%', seed: 'Refinance $750,000 balance from 7.75% down to 6.75%' },
        { label: 'Affordability', desc: '$200k income · $100k savings', seed: 'How much home can I afford on $200,000 income $100,000 savings' },
    ];

    const rows = modules.map(m =>
        `| **${m.label}** | ${m.desc} |`
    ).join('\n');

    const answer = `## 🧪 HomeRates Lab\n\nRun any scenario. Get instant answers.\n\n| Module | Example scenario |\n|--------|------------------|\n${rows}\n\n> Pro tip — click any module below to run the example, then click the result chips or type your own numbers to keep going.`;

    const follow_up_chips = modules.map(m => ({
        label: m.label,
        seed: m.seed,
    }));

    return {
        answer,
        next_step: 'Select a module below to run an instant scenario.',
        follow_up: follow_up_chips[0].label,
        follow_up_chips,
        confidence: '1.00 (HomeRates Lab — module picker)',
    };
}


export function buildAboutCard(): BuiltCard {
    const answer = `## 🏦 About HomeRates.ai

**The first of its kind.** HomeRates.ai is the first AI-powered mortgage intelligence platform built specifically to empower homeowners, first-time home buyers, renters, and home investors — not lenders.

**The problem.** Buying a home is the biggest financial decision most people make — yet the system is stacked against them. Lenders quote selectively, rates are opaque, and every "advisor" has a product to sell. Borrowers end up confused, overpaying, or paralyzed.

**The solution.** HomeRates.ai is zero-sales, real-time mortgage intelligence built to fix lending confusion. No commissions. No affiliate links. No products to push. Just transparent data on rates, guidelines, and market signals so you can negotiate from strength.

**How it works.** Every answer draws from live FRED data (Freddie Mac PMMS, 10Y Treasury, Fed funds rate), official agency underwriting guidelines (Fannie Mae, Freddie Mac, FHA, VA, USDA), and lender overlays — updated continuously.

**Who built it.** Rayaan Arif — serial entrepreneur and mortgage industry veteran who watched borrowers repeatedly get burned by a system designed for lenders, not buyers. He built HomeRates.ai to give every borrower access to the same quality of analysis that institutional players have.

> *"Borrowers deserve the same clarity institutional investors get. We built HomeRates.ai to close that gap."*
> — Rayaan Arif, Founder

---
*Educational only — not financial or legal advice. Eligibility and rates vary by profile and lender.*`;

    const follow_up_chips = [
        {
            label: 'Why is mortgage info so hard to trust?',
            seed: 'About HomeRates: why is mortgage information so hard to trust — why do borrowers get conflicting quotes and advice from lenders?',
        },
        {
            label: 'What does HomeRates.ai do differently?',
            seed: 'About HomeRates: how is HomeRates.ai different from a lender, broker, or generic AI tool like ChatGPT for mortgage questions?',
        },
        {
            label: 'What live data does HomeRates.ai use?',
            seed: 'About HomeRates: what live data sources does HomeRates.ai use — FRED, Freddie Mac, underwriting guidelines — and how does it stay current?',
        },
        {
            label: 'Who built this and why?',
            seed: 'About HomeRates: who is the founder and what problem were they trying to solve for borrowers?',
        },
        {
            label: 'Show me what it can do',
            seed: 'Show me the HomeRates Lab',
        },
    ];

    return {
        answer,
        next_step: 'Try a scenario — ask about your home purchase, refi, or affordability.',
        follow_up: follow_up_chips[0].label,
        follow_up_chips,
        confidence: '1.00 (HomeRates.ai — static about card)',
    };
}

const ABOUT_CHIPS = [
    {
        label: 'Why is mortgage info so hard to trust?',
        seed: 'About HomeRates: why is mortgage information so hard to trust — why do borrowers get conflicting quotes and advice from lenders?',
    },
    {
        label: 'What does HomeRates.ai do differently?',
        seed: 'About HomeRates: how is HomeRates.ai different from a lender, broker, or generic AI tool like ChatGPT for mortgage questions?',
    },
    {
        label: 'What live data does HomeRates.ai use?',
        seed: 'About HomeRates: what live data sources does HomeRates.ai use — FRED, Freddie Mac, underwriting guidelines — and how does it stay current?',
    },
    {
        label: 'Who built this and why?',
        seed: 'About HomeRates: who is the founder and what problem were they trying to solve for borrowers?',
    },
    {
        label: 'Show me what it can do',
        seed: 'Show me the HomeRates Lab',
    },
];

export function buildAboutTrustCard(): BuiltCard {
    const answer = `## ❓ Why Is Mortgage Info So Hard to Trust?

**The incentive problem.** Every lender, broker, and mortgage website has a financial incentive to get you to their product. That means the "information" you receive is filtered through a sales lens — not an objective one.

**How conflicting quotes happen.** For the exact same borrower profile, lenders can legally quote rates 0.25–0.50% apart. Here's why:

| Factor | What lenders control | Impact on your quote |
|---|---|---|
| Yield spread premium | Lender marks up rate above par | +0.125–0.375% hidden in rate |
| Lender overlays | Stricter DTI/credit rules than guidelines require | May disqualify or reprice you |
| Lock period | 30 vs 45 vs 60 day lock | +0.125–0.25% per tier |
| Points/credits | Lender buries costs in rate | Rate looks low, fees are high |

**Regulation Z (TILA)** requires lenders to disclose APR and fees — but it does not require them to show you the best rate they could offer. They show you what they want you to see.

**What this means for you.** The only defense is independent data. When you know the FRED benchmark (30Y fixed avg), the Fannie Mae/Freddie Mac guideline DTI limits, and current lender overlays — you can spot an inflated quote in 60 seconds.

---
*Educational only — not financial or legal advice. Rates and eligibility vary by lender and profile.*`;

    return {
        answer,
        next_step: 'Ask HomeRates.ai to check your scenario against current rate benchmarks.',
        follow_up: ABOUT_CHIPS[1].label,
        follow_up_chips: ABOUT_CHIPS,
        confidence: '1.00 (HomeRates.ai — static trust card)',
    };
}

export function buildAboutDifferenceCard(): BuiltCard {
    const answer = `## HomeRates.ai vs ChatGPT — What's the Real Difference?

ChatGPT gives confident mortgage answers. Often wrong. Here's why it matters.

---

**"What is my real monthly payment?"**
- **ChatGPT:** Estimates principal + interest only. Forgets taxes, insurance, and PMI.
- **HomeRates.ai:** Calculates full PITI — Principal, Interest, Taxes, Insurance, and PMI — using live rates.
- 💡 The difference can be $400–$800/mo on a $400k home.

**"What are mortgage rates today?"**
- **ChatGPT:** Quotes rates from its training data — often 12–24 months out of date.
- **HomeRates.ai:** Pulls live rates from FRED (Freddie Mac weekly average) every time you ask.
- 💡 A 1% rate difference on $400k = $240/mo and $86k over 30 years.

**"How much house can I afford?"**
- **ChatGPT:** Uses national rules of thumb. Doesn't know your DTI or 2026 loan limits.
- **HomeRates.ai:** Works backward from your income and debts using current DTI guidelines and 2026 conforming limits.
- 💡 Generic rules can over- or underestimate your ceiling by $50–$100k.

**"Do I need PMI and when does it go away?"**
- **ChatGPT:** Often confuses PMI (conventional) with MIP (FHA). Gets cancellation rules wrong.
- **HomeRates.ai:** Calculates your exact PMI cost, the LTV threshold to cancel it, and how long you'll pay it.
- 💡 PMI is $100–$300/mo. Knowing when it ends changes your long-term plan.

**"Should I do 15-year or 30-year?"**
- **ChatGPT:** Gives a general answer. Can't show a live side-by-side with your actual numbers.
- **HomeRates.ai:** Runs both scenarios with live rates and your loan amount. Shows monthly difference and total interest saved.
- 💡 15yr saves $150k+ in interest but costs $600+/mo more. You need real numbers to decide.

**"Does this rental property cash flow?"**
- **ChatGPT:** May not know current DSCR lender requirements. Will approximate.
- **HomeRates.ai:** Calculates DSCR ratio, monthly cash flow, and lender qualification using live rates.
- 💡 Wrong DSCR analysis on a $500k investment property is a very expensive mistake.

---

**Why this is built for borrowers, not lenders:**
No lead forms. No rate quote pages that capture your number before giving you an answer. No lender partnerships. No commission.

> *Ask your first question — no account required.*

---
*Educational purposes only — not financial advice. Verify all numbers with a licensed lender before making decisions.*`;

    return {
        answer,
        next_step: 'Try a scenario — see the difference in action.',
        follow_up: ABOUT_CHIPS[2].label,
        follow_up_chips: ABOUT_CHIPS,
        confidence: '1.00 (HomeRates.ai — static difference card)',
    };
}

export function buildAboutDataCard(): BuiltCard {
    const answer = `## 📡 What Live Data Does HomeRates.ai Use?

HomeRates.ai pulls from primary sources — not aggregators, not scrapers.

**Rate data (FRED — Federal Reserve Economic Data)**

| Series | What it measures | Updates |
|---|---|---|
| MORTGAGE30US | 30Y fixed avg (Freddie Mac PMMS) | Weekly (Thu) |
| MORTGAGE15US | 15Y fixed avg | Weekly (Thu) |
| MORTGAGE5US | 5/1 ARM avg | Weekly (Thu) |
| DGS10 | 10Y Treasury yield | Daily |
| DGS2 | 2Y Treasury yield | Daily |
| T10Y2Y | Yield curve (10Y minus 2Y) | Daily |
| FEDFUNDS | Federal funds rate | Monthly |
| SOFR | Secured overnight rate (ARM index) | Daily |

**Economic context (FRED)**

| Series | What it measures | Updates |
|---|---|---|
| CPIAUCSL | Consumer price index (inflation) | Monthly |
| PCEPILFE | Core PCE — Fed's inflation target | Monthly |
| UNRATE | Unemployment rate | Monthly |
| MSPUS | Median US home sales price | Quarterly |
| HOUST | Housing starts | Monthly |

**Underwriting guidelines (direct from agencies)**
- Fannie Mae Selling Guide (singlefamily.fanniemae.com)
- Freddie Mac Seller/Servicer Guide (guide.freddiemac.com)
- FHA Handbook 4000.1 (hud.gov)
- VA Lenders Handbook (benefits.va.gov)
- USDA HB-1-3555 (rd.usda.gov)

**Lender overlays** tracked from LoanDepot, UWM, Pennymac, Fairway, Angel Oak, Acra, Citadel, and Newrez public bulletins.

---
*Educational only — not financial or legal advice. Rates and eligibility vary by lender and profile.*`;

    return {
        answer,
        next_step: 'Ask about current rates — HomeRates.ai will pull live FRED data for your answer.',
        follow_up: ABOUT_CHIPS[3].label,
        follow_up_chips: ABOUT_CHIPS,
        confidence: '1.00 (HomeRates.ai — static data card)',
    };
}

export function buildAboutFounderCard(): BuiltCard {
    const answer = `## 👤 Who Built HomeRates.ai and Why?

**Rayaan Arif** — Founder

**The problem he kept seeing.** As a serial entrepreneur and mortgage industry veteran, Rayaan watched the same story play out repeatedly: borrowers making the biggest financial decision of their lives with incomplete, biased, or conflicting information. Lenders had every incentive to obscure pricing. Borrowers had no independent anchor.

**The gap.** Institutional investors — hedge funds, REITs, private equity — have access to Bloomberg terminals, agency data feeds, and dedicated analysts to evaluate mortgage instruments. Individual borrowers get a sales call and a rate sheet.

**The mission.** Close that gap. Give every borrower — first-time buyer, seasoned investor, or anyone in between — access to the same quality of analysis that institutional players have. No commissions. No conflicts. No confusion.

> *"Borrowers deserve the same clarity institutional investors get. We built HomeRates.ai to close that gap."*
> — Rayaan Arif, Founder

**What HomeRates.ai is not.** It is not a lender, broker, or lead generation platform. It will never quote you a rate to earn a commission, refer you to a lender for a fee, or filter information to favor a product.

---
*Educational only — not financial or legal advice. Rates and eligibility vary by lender and profile.*`;

    return {
        answer,
        next_step: 'Test-drive HomeRates.ai on your own scenario.',
        follow_up: ABOUT_CHIPS[0].label,
        follow_up_chips: ABOUT_CHIPS,
        confidence: '1.00 (HomeRates.ai — static founder card)',
    };
}



export function buildUWStarterCard(): BuiltCard {
    const topics = [
        { label: 'DTI limits by loan type', desc: 'FHA, conventional, VA, USDA — max ratios + compensating factors', seed: 'Ask Underwriting: what are the DTI limits for FHA, conventional, VA, and USDA loans including compensating factors?' },
        { label: 'Credit score minimums', desc: 'Minimum FICO by program — 500, 580, 620, 640', seed: 'Ask Underwriting: what are the minimum credit score requirements for FHA, conventional, VA, and USDA?' },
        { label: 'Gift fund rules', desc: 'Who allows gifts, what docs are required', seed: 'Ask Underwriting: can gift funds be used for a down payment on FHA and conventional loans — what are the rules and documentation required?' },
        { label: 'Self-employed income', desc: 'How lenders calculate qualifying income', seed: 'Ask Underwriting: how is self-employed income calculated for mortgage qualification — what documents are required?' },
        { label: 'Reserve requirements', desc: 'Months of PITIA required by loan type', seed: 'Ask Underwriting: what are the reserve requirements for conventional, FHA, and investment property loans?' },
    ];

    const rows = topics.map(t =>
        `| **${t.label}** | ${t.desc} |`
    ).join('\n');

    const answer = `## 📋 Ask Underwriting\n\nGet instant answers from agency guidelines — Fannie Mae, FHA, VA, USDA, and lender overlays.\n\n| Topic | What it covers |\n|-------|----------------|\n${rows}\n\n> Ask any underwriting question in plain English. Answers cite the exact guideline source.`;

    const follow_up_chips = topics.map(t => ({
        label: t.label,
        seed: t.seed,
    }));

    return {
        answer,
        next_step: 'Select a topic below or type your own underwriting question.',
        follow_up: follow_up_chips[0].label,
        follow_up_chips,
        confidence: '1.00 (HomeRates.ai — UW starter card)',
    };
}


// ─────────────────────────────────────────────
// CONTEXT CHIPS — single source of truth
// Called by route.ts chip IIFE when no calcCard chips available
// ─────────────────────────────────────────────

type FredForChips = { mort30Avg: number | null; mort15Avg: number | null; spread: number | null; t10y2y: number | null; medianHomePrice: number | null; fedFunds: number | null; cpi: number | null; unemployment: number | null };

export function getContextChips(
    snapshotLoanType: string | null,
    snapshotJson: any,
    snapshotText: string,
    fred: FredForChips
): BuiltCard['follow_up_chips'] | null {
    if (!snapshotLoanType || !snapshotJson) return null;

    const si = snapshotJson.scenario_inputs ?? {};
    const sPrice = si.price ?? si.purchasePrice;
    const sDown = si.down_payment_pct ?? si.downPaymentPct;
    const sRate = si.rate_used_pct ?? si.annualRatePct;
    const sTerm = si.term_years ?? 30;
    const sRent = si.rent_monthly;
    const priceLabel = sPrice ? fK(Number(sPrice)) : null;

    // ── Conventional ──
    if (snapshotLoanType === 'calcEngine-conventional' && sPrice && sRate) {
        const rateDown = parseFloat((Number(sRate) - 0.5).toFixed(2));
        const downPct = Number(sDown ?? 15);
        return [
            { label: `Rate drops to ${fPct(rateDown)} — new payment?`, seed: `Same home, rate drops to ${rateDown}%`, paramOverrides: { annualRatePct: rateDown, purchasePrice: Number(sPrice), downPaymentPct: downPct }, changedKeys: ['annualRatePct'] },
            { label: downPct < 20 ? `What if I put 20% down?` : `What if I put 10% down?`, seed: downPct < 20 ? `Same home with 20% down` : `Same home with 10% down`, paramOverrides: { downPaymentPct: downPct < 20 ? 20 : 10, purchasePrice: Number(sPrice), annualRatePct: Number(sRate) }, changedKeys: ['downPaymentPct'] },
            { label: `What income do I need for ${priceLabel}?`, seed: `How much income do I need to qualify for this home?` },
            { label: `FHA vs conventional on ${priceLabel}`, seed: `Compare FHA 3.5% down vs conventional ${downPct}% down on a ${priceLabel} home at ${fPct(Number(sRate))}` },
        ];
    }

    // ── FHA / FHA vs Conv ──
    if ((snapshotLoanType === 'calcEngine-fha' || snapshotLoanType === 'calcEngine-fha_vs_conv') && sPrice && sRate) {
        const rateDown = parseFloat((Number(sRate) - 0.5).toFixed(2));
        const downPct = Number(sDown ?? 3.5);
        return [
            { label: `Rate drops to ${fPct(rateDown)} — new payment?`, seed: `Same FHA loan, rate drops to ${rateDown}%`, paramOverrides: { annualRatePct: rateDown, purchasePrice: Number(sPrice), downPaymentPct: downPct, isFHA: true }, changedKeys: ['annualRatePct'] },
            { label: `What if I put 10% down?`, seed: `Same FHA loan with 10% down`, paramOverrides: { downPaymentPct: 10, purchasePrice: Number(sPrice), annualRatePct: Number(sRate), isFHA: true }, changedKeys: ['downPaymentPct'] },
            { label: `When can I remove FHA MIP?`, seed: `Ask Underwriting: when can I remove FHA MIP on a ${priceLabel} home with ${downPct}% down?` },
            { label: `FHA vs conventional on ${priceLabel}`, seed: `Compare FHA ${downPct}% down vs conventional 5% down on a ${priceLabel} home at ${fPct(Number(sRate))}` },
        ];
    }

    // ── DSCR ──
    if (snapshotLoanType === 'calcEngine-dscr' && sPrice && sRent) {
        const rentUp = Math.round(Number(sRent) + 200);
        const rentDown = Math.round(Number(sRent) - 200);
        const rateDown = sRate ? parseFloat((Number(sRate) - 0.5).toFixed(2)) : null;
        return [
            { label: `Rent increases to ${f$(rentUp)}/mo`, seed: `Same property, rent increases to $${rentUp}/month`, paramOverrides: { grossMonthlyRent: rentUp, purchasePrice: Number(sPrice), annualRatePct: Number(sRate ?? 7) }, changedKeys: ['grossMonthlyRent'] },
            { label: `Rent drops to ${f$(rentDown)}/mo — still cash flows?`, seed: `Same property, rent drops to $${rentDown}/month`, paramOverrides: { grossMonthlyRent: rentDown, purchasePrice: Number(sPrice), annualRatePct: Number(sRate ?? 7) }, changedKeys: ['grossMonthlyRent'] },
            ...(rateDown ? [{ label: `Rate drops to ${fPct(rateDown)} — new DSCR?`, seed: `Same rental property, rate drops to ${rateDown}%`, paramOverrides: { annualRatePct: rateDown, purchasePrice: Number(sPrice), grossMonthlyRent: Number(sRent) }, changedKeys: ['annualRatePct'] }] : []),
            { label: `What DSCR do lenders require?`, seed: `Ask Underwriting: what minimum DSCR ratio do lenders require for investment property loans?` },
        ];
    }

    // ── Refi ──
    if (snapshotLoanType === 'refi_advisor_v2' && snapshotJson.loan_amount) {
        const bal = Number(snapshotJson.loan_amount);
        const currentRate = Number(snapshotJson.current_rate_pct);
        const newRate = Number(snapshotJson.rate_used_pct);
        const rateDown = parseFloat((newRate - 0.5).toFixed(2));
        const balLabel = fK(bal);
        return [
            { label: `What if rate drops to ${fPct(rateDown)}?`, seed: `Same refi, rate drops to ${rateDown}%`, paramOverrides: { newRatePct: rateDown, currentBalance: bal, currentRatePct: currentRate }, changedKeys: ['newRatePct'] },
            { label: `How long to break even on closing costs?`, seed: `How long to break even on refi closing costs for a ${balLabel} loan from ${fPct(currentRate)} to ${fPct(newRate)}?` },
            { label: `Extra payments vs refi — which wins?`, seed: `Compare making $500/mo extra payments vs refinancing my ${balLabel} mortgage from ${fPct(currentRate)} to ${fPct(newRate)}` },
            { label: `Cash-out refi — how much can I pull out?`, seed: `How much equity can I cash out on a ${balLabel} mortgage at ${fPct(currentRate)}?` },
        ];
    }

    // ── Affordability ──
    if (snapshotLoanType === 'calcEngine-affordability') {
        const sPiti = snapshotJson.computed_financials?.monthly_pitia ?? snapshotJson.monthly_payment;
        if (sPiti) return [
            { label: `With $500/mo in debts — what changes?`, seed: `Same affordability scenario with $500/month in other debts`, paramOverrides: { monthlyDebt: 500 } },
            { label: `What if I put 20% down?`, seed: `Same scenario with 20% down payment`, paramOverrides: { downPctOverride: 20 } },
            { label: `Show FHA option on max price`, seed: `What's the FHA loan option on my maximum affordable home price?` },
            { label: `What income do I need to qualify?`, seed: `How much income do I need to qualify for this home?` },
        ];
    }



    return null;
}

// ─────────────────────────────────────────────
// HOW IT WORKS CARD
// ─────────────────────────────────────────────

export function buildHowItWorksCard(): BuiltCard {
    const answer = `## 🧭 How HomeRates.ai Works

**What it is.** A real-time mortgage intelligence tool — not a lender, not a broker, not an AI chatbot guessing at numbers. Every calculation is deterministic: same inputs always produce the same output.

**How answers are built.**

| Layer | What it does |
|---|---|
| Calc engine | Computes payments, DTI, DSCR, MIP, PMI — no LLM involved |
| FRED live data | Pulls Freddie Mac rates, 10Y Treasury, Fed funds — updated weekly |
| UW guidelines | Fannie Mae, FHA, VA, USDA agency rules — cited by source |
| Grok AI | Explains results in plain language, answers follow-up questions |

**Chips — your fastest tool.** After every answer, chips appear below. Each one is pre-loaded with your exact scenario — click to instantly run a variation without retyping anything.

**Memory.** HomeRates.ai remembers your scenario within a session. Ask "what if rate drops to 6%?" after a calc and it knows what home, what down payment, what loan — no need to repeat yourself.

**What it can't do.** It cannot pull your credit, lock a rate, or submit an application. It gives you the analysis — you negotiate with lenders from strength.

---
💡 **First-timer tips:**
- Start with a real number: *"$650k home, 15% down, 6.75%"*
- Ask your county: *"FHA loan in Irvine"* → gets county-specific limits
- Compare programs: *"FHA vs conventional on $500k"*
- Ask income: *"What income do I need to qualify?"* after any calc

---
*Educational only — not financial or legal advice. Rates and eligibility vary by lender and profile.*`;

    const follow_up_chips = [
        {
            label: 'How are payments calculated?',
            seed: 'How it works: how does HomeRates.ai calculate mortgage payments — is it using real formulas or AI guessing?',
        },
        {
            label: 'Where do the rates come from?',
            seed: 'How it works: where does HomeRates.ai get its mortgage rate data — what is FRED and Freddie Mac PMMS?',
        },
        {
            label: 'How do chips work?',
            seed: 'How it works: what are the chips that appear after each answer and how do I use them to explore scenarios?',
        },
        {
            label: 'What can I ask it?',
            seed: 'How it works: what kinds of mortgage questions can HomeRates.ai answer — give me a full list of scenarios it handles',
        },
        {
            label: 'Run my first scenario',
            seed: 'Show me the HomeRates Lab',
        },
    ];

    return {
        answer,
        next_step: 'Try a scenario — type a home price, income, or refi balance to get started.',
        follow_up: follow_up_chips[0].label,
        follow_up_chips,
        confidence: '1.00 (HomeRates.ai — static how it works card)',
    };
}

// ─────────────────────────────────────────────
// VA LOAN CARD
// ─────────────────────────────────────────────

export function buildVACard(
    r: VAResult,
    assumptions: string[] = [],
    fredRateStr?: string,
): BuiltCard {
    const rateStr  = fPct(r.annualRatePct);
    const origRate = fPct(r.originalRatePct);
    const assumptionNote = assumptions.length
        ? assumptions.map(a => `> 💡 **Assumption:** ${a}`).join('\n') + '\n\n'
        : '';
    const fredNote = fredRateStr
        ? `\n> 📡 **Live FRED rate:** ${fredRateStr} (VA rates typically 0.25–0.5% below conventional)\n`
        : '';

    // Funding fee row
    const ffRow = r.isExempt
        ? `| VA Funding Fee | **Exempt** (disability) |\n`
        : `| VA Funding Fee | ${f$(r.fundingFee)} (${fPct(r.fundingFeePct)} — rolled in) |\n`;

    const hoaRow = r.monthlyHOA > 0 ? `| HOA | ${f$(r.monthlyHOA)} |\n` : '';

    // Buydown section — shown when points > 0
    const buydownSection = r.buydownPoints > 0 ? `
---

## 🎯 Rate Buydown (Seller Credit)

| | |
|--|--|
| Points Paid | ${r.buydownPoints} point${r.buydownPoints > 1 ? 's' : ''} |
| Buydown Cost | ${f$(r.buydownCost)} |
| Rate | ${origRate} → **${rateStr}** |
| Monthly Savings | **${f$(r.buydownMonthlySavings)}/mo** |
| Break-even | ${r.buydownBreakEvenMonths ? `${r.buydownBreakEvenMonths} months` : 'N/A'} |

> 💡 Ask the seller to cover this at closing. VA allows seller concessions up to 4% of the purchase price.
` : '';

    // VA vs conventional comparison
    const savingsNote = r.vaSavingsVsConv > 0
        ? `\n> ✅ **VA saves ${f$(r.vaSavingsVsConv)}/mo vs conventional** — no PMI (${f$(r.convMonthlyPMI)}/mo avoided) + lower rate.\n`
        : r.vaSavingsVsConv <= 0
            ? `\n> ℹ️ VA monthly cost similar to conventional at this down payment — funding fee is the trade-off for no PMI.\n`
            : '';

    // DTI / income section
    const dtiSection = r.frontEndDTI !== null ? `
---

## 📈 DTI Analysis

| | |
|--|--|
| Front-end DTI | ${fPct1(r.frontEndDTI!)} *(VA guideline: ≤41%)* |
| Back-end DTI | ${fPct1(r.backEndDTI!)} *(VA guideline: ≤41%)* |
| Status | ${r.backEndDTI! <= 41 ? '✅ Within VA guidelines' : r.backEndDTI! <= 50 ? '⚠️ High — residual income analysis may still approve' : '❌ Exceeds standard VA guidelines'} |
` : `
---

## 💰 Minimum Income to Qualify

| DTI Guideline | Required Annual Income |
|---------------|----------------------|
| Conservative (28% front-end) | ~${fK(r.totalMonthly / 0.28 * 12)}/year |
| VA Standard (41% back-end) | ~${fK(r.totalMonthly / 0.41 * 12)}/year |
| Max w/ compensating factors (50%) | ~${fK(r.totalMonthly / 0.50 * 12)}/year |
`;

    const answer = `**VA Loan Analysis**
${assumptionNote}${fredNote}
**${f$(r.purchasePrice)} purchase · ${r.downPaymentPct > 0 ? `${r.downPaymentPct}% down` : 'no down payment'} · ${rateStr} · ${r.termYears}-year fixed**

---

## 🏠 Loan Structure

| | |
|--|--|
| Purchase Price | ${f$(r.purchasePrice)} |
| Down Payment | ${r.downPaymentPct > 0 ? `${f$(r.downPayment)} (${r.downPaymentPct}%)` : '**$0 (none required)**'} |
| Base Loan | ${f$(r.baseLoanAmount)} |
${ffRow}| **Total Loan** | **${f$(r.totalLoanAmount)}** |
| LTV | ${fPct1(r.ltv * 100)} |

---

## 💰 Monthly Payment

| Component | Amount |
|-----------|--------|
| Principal & Interest | ${f$(r.monthlyPI)} |
| Property Taxes | ${f$(r.monthlyTax)} |
| Home Insurance | ${f$(r.monthlyInsurance)} |
${hoaRow}| **Total Monthly (PITI)** | **${f$(r.totalMonthly)}** |

> ✅ **No PMI** — VA loans never require private mortgage insurance.
${savingsNote}
---

## 📊 Lifetime Cost

| | |
|--|--|
| Total Interest | ${f$(r.totalInterest)} |
| Total Payments | ${f$(r.totalPayments)} |
| Loan Payoff | ${r.termYears} years |

---

## 🏅 VA Eligibility Checklist

- ✅ Active duty, veteran, or surviving spouse
- ✅ Certificate of Eligibility (COE) required — get it at [VA.gov](https://www.va.gov)
- ✅ Primary residence only
- ✅ VA appraisal required (lender arranges)
- ${r.isExempt ? '✅ Funding fee **exempt** — disability rating confirmed' : `ℹ️ Funding fee ${fPct(r.fundingFeePct)} (${f$(r.fundingFee)}) — rolled into loan, no cash needed`}
${buydownSection}${dtiSection}
---

**Next Steps:**
1. Request your COE at VA.gov or through your lender
2. Compare VA lenders — rates vary 0.25–0.5% between lenders
3. Factor in closing costs (~${fK(r.purchasePrice * 0.02)}) — seller can pay up to 4%`;

    // Chips
    const rateDown  = parseFloat((r.originalRatePct - 0.5).toFixed(2));
    const priceUp   = Math.round(r.purchasePrice * 1.1 / 10000) * 10000;
    const buydownRate = parseFloat((r.originalRatePct - 0.25).toFixed(2));

    const chips: BuiltCard['follow_up_chips'] = [
        {
            label: `Rate drops to ${fPct(rateDown)} — new payment?`,
            seed: `Same home, VA loan, rate drops to ${fPct(rateDown)}`,
            paramOverrides: { annualRatePct: rateDown, purchasePrice: r.purchasePrice, downPaymentPct: r.downPaymentPct, loanType: 'va' },
            changedKeys: ['annualRatePct'],
        },
        {
            label: `Seller buys down 1 point → ${fPct(buydownRate)}`,
            seed: `VA loan on a ${fK(r.purchasePrice)} home at ${fPct(r.originalRatePct)}, seller credits 1 point to buy down rate`,
            paramOverrides: { annualRatePct: r.originalRatePct, purchasePrice: r.purchasePrice, downPaymentPct: r.downPaymentPct, loanType: 'va', buydownPoints: 1 },
            changedKeys: ['buydownPoints'],
        },
        {
            label: `What if the home is ${fK(priceUp)}?`,
            seed: `VA loan on a ${fK(priceUp)} home at ${fPct(r.originalRatePct)}`,
            paramOverrides: { purchasePrice: priceUp, downPaymentPct: r.downPaymentPct, annualRatePct: r.originalRatePct, loanType: 'va' },
            changedKeys: ['purchasePrice'],
        },
        {
            label: `5% down instead — how does funding fee change?`,
            seed: `VA loan on a ${fK(r.purchasePrice)} home with 5% down at ${fPct(r.originalRatePct)}`,
            paramOverrides: { purchasePrice: r.purchasePrice, downPaymentPct: 5, annualRatePct: r.originalRatePct, loanType: 'va' },
            changedKeys: ['downPaymentPct'],
        },
    ];

    return {
        answer,
        next_step: `VA loan approved at ${rateStr} — no down payment, no PMI. Monthly PITI: ${f$(r.totalMonthly)}.`,
        follow_up: chips[0].label,
        follow_up_chips: chips,
        confidence: '1.00 (calculated — no LLM)',
        memoryPayload: {
            plain_english_summary: `VA loan: ${f$(r.purchasePrice)} purchase, ${r.downPaymentPct}% down, ${rateStr}, ${r.termYears}yr. Funding fee: ${f$(r.fundingFee)} (${r.isExempt ? 'exempt' : fPct(r.fundingFeePct)}). Monthly PITI: ${f$(r.totalMonthly)}.`,
            scenario_inputs: { price: r.purchasePrice, down_pct: r.downPaymentPct, loan_type: 'va', rate: r.annualRatePct, funding_fee_pct: r.fundingFeePct, buydown_points: r.buydownPoints },
            computed_financials: { monthly_pi: r.monthlyPI, monthly_pitia: r.totalMonthly, funding_fee: r.fundingFee, va_savings_vs_conv: r.vaSavingsVsConv },
            monthly_payment: r.totalMonthly,
        },
        interactiveSlider: {
            price: r.purchasePrice,
            downPct: r.downPaymentPct,
            rate: r.originalRatePct,
            term: r.termYears,
            taxRate:         r.purchasePrice > 0 ? (r.monthlyTax * 12) / r.purchasePrice : 0.012,
            insRate:         r.purchasePrice > 0 ? (r.monthlyInsurance * 12) / r.purchasePrice : 0.005,
            loanType:        'va' as const,
            vaFundingFeePct: r.isExempt ? 0 : r.fundingFeePct,
        },
        lenderChecklist: {
            loanType: 'va',
            price: r.purchasePrice, loanAmount: r.totalLoanAmount,
            ltv: r.ltv, marketRate: r.annualRatePct,
            monthlyPITI: r.totalMonthly, termYears: r.termYears,
            isInvestment: false,
        },
    };
}

export function buildVANeedsInputCard(fredRateStr?: string): BuiltCard {
    const fredNote = fredRateStr
        ? `\n> 📡 **Live rate:** ${fredRateStr} (VA rates typically run 0.25–0.5% below conventional)\n`
        : '';

    const answer = `**VA Loan — What's the Purchase Price?**
${fredNote}
VA loans offer three major advantages for eligible veterans and service members:

| Benefit | Detail |
|---------|--------|
| No down payment | 0% required (with full entitlement) |
| No PMI | Saves $150–$400/mo vs conventional |
| Competitive rates | Typically 0.25–0.5% below conventional |
| Funding fee | 2.15% (first use, < 5% down) — rolled into loan |
| Disability exempt | Funding fee waived with VA disability rating |

To run your VA loan estimate, share:
1. **Purchase price** (e.g. $450,000)
2. **Down payment %** (0% is fine — or enter an amount if you're putting something down)
3. **Rate** (optional — I'll use live FRED data if not provided)
4. **Disability exempt?** (skip funding fee if you receive VA disability compensation)`;

    const chips: BuiltCard['follow_up_chips'] = [
        {
            label: '$400k home, 0% down',
            seed: 'VA loan on a $400,000 home with no down payment',
            paramOverrides: { purchasePrice: 400000, downPaymentPct: 0, loanType: 'va' },
        },
        {
            label: '$600k home, 5% down',
            seed: 'VA loan on a $600,000 home with 5% down',
            paramOverrides: { purchasePrice: 600000, downPaymentPct: 5, loanType: 'va' },
        },
        {
            label: 'Disability exempt — $500k home',
            seed: 'VA loan on a $500,000 home, funding fee exempt (disability)',
            paramOverrides: { purchasePrice: 500000, downPaymentPct: 0, loanType: 'va', vaFundingFeeExempt: true },
        },
    ];

    return {
        answer,
        next_step: 'Share a purchase price to get your full VA loan breakdown.',
        follow_up: chips[0].label,
        follow_up_chips: chips,
        confidence: '1.00 (HomeRates.ai — needs input)',
    };
}

// ─────────────────────────────────────────────
// JUMBO LOAN CARD
// ─────────────────────────────────────────────

export function buildJumboCard(
    r: JumboResult,
    assumptions: string[] = [],
    fredRateStr?: string,
): BuiltCard {
    const rateStr = fPct(r.annualRatePct);
    const assumptionNote = assumptions.length
        ? assumptions.map(a => `> 💡 **Assumption:** ${a}`).join('\n') + '\n\n'
        : '';
    const fredNote = fredRateStr
        ? `\n> 📡 **Live FRED rate:** ${fredRateStr} (jumbo rates typically 0.25–0.5% above conforming)\n`
        : '';
    const hoaRow = r.monthlyHOA > 0 ? `| HOA | ${f$(r.monthlyHOA)} |\n` : '';

    const conformingNote = r.loanExceedsConforming
        ? `\n> ℹ️ **Jumbo loan** — exceeds 2026 conforming limit (${f$(r.conformingLimit)}). Portfolio lender or private jumbo product required.\n`
        : `\n> ℹ️ Loan is within conforming limits — consider a conventional loan for potentially lower rates.\n`;

    const dtiSection = r.frontEndDTI !== null ? `
---

## 📈 DTI Analysis

| | |
|--|--|
| Front-end DTI | ${fPct1(r.frontEndDTI!)} *(jumbo guideline: ≤38%)* |
| Back-end DTI | ${fPct1(r.backEndDTI!)} *(jumbo guideline: ≤43%)* |
| Status | ${r.backEndDTI! <= 43 ? '✅ Within jumbo guidelines' : r.backEndDTI! <= 50 ? '⚠️ High — may need compensating factors' : '❌ Exceeds standard guidelines'} |
` : `
---

## 💰 Minimum Income to Qualify

| DTI Guideline | Required Annual Income |
|---------------|----------------------|
| Conservative (38% front-end) | ~${fK(r.totalMonthly / 0.38 * 12)}/year |
| Standard (43% back-end) | ~${fK(r.totalMonthly / 0.43 * 12)}/year |
| Stretch (50% w/ strong assets) | ~${fK(r.totalMonthly / 0.50 * 12)}/year |
`;

    const answer = `**Jumbo Loan Analysis**
${assumptionNote}${fredNote}
**${f$(r.purchasePrice)} purchase · ${r.downPaymentPct}% down · ${rateStr} · ${r.termYears}-year fixed**

---

## 🏠 Loan Structure

| | |
|--|--|
| Purchase Price | ${f$(r.purchasePrice)} |
| Down Payment | ${f$(r.downPayment)} (${r.downPaymentPct}%) |
| Loan Amount | **${f$(r.loanAmount)}** |
| LTV | ${fPct1(r.ltv * 100)} |
| 2026 Conforming Limit | ${f$(r.conformingLimit)} |
${conformingNote}
---

## 💰 Monthly Payment

| Component | Amount |
|-----------|--------|
| Principal & Interest | ${f$(r.monthlyPI)} |
| Property Taxes | ${f$(r.monthlyTax)} |
| Home Insurance | ${f$(r.monthlyInsurance)} |
${hoaRow}| **Total Monthly (PITI)** | **${f$(r.totalMonthly)}** |

> ✅ **No PMI** — 20%+ down payment required for jumbo.

---

## 📊 Lifetime Cost

| | |
|--|--|
| Total Interest | ${f$(r.totalInterest)} |
| Total Payments | ${f$(r.totalPayments)} |
| Loan Payoff | ${r.termYears} years |

---

## 🏦 Jumbo Lender Requirements

| Requirement | Typical Threshold |
|-------------|------------------|
| Credit Score | 720+ (many lenders require 740+) |
| Down Payment | 20% minimum |
| DTI | ≤43% (stricter than conventional) |
| Reserves (6 mo) | ~${f$(r.reservesRequired6mo)} in liquid assets |
| Reserves (12 mo) | ~${f$(r.reservesRequired12mo)} for highest loan amounts |
| Appraisal | Typically 2 appraisals required above $2M |
${dtiSection}
---

**Next Steps:**
1. Shop portfolio lenders, private banks, and credit unions — jumbo rates vary more than conforming
2. Prepare 12–24 months bank statements and asset verification
3. Factor in closing costs (~${fK(r.purchasePrice * 0.015)}–${fK(r.purchasePrice * 0.025)})`;

    // Round to nearest $100k so fK() always produces clean X.XM labels (avoids "2.3M" for 2.25M drift)
    const priceUp   = Math.round(r.purchasePrice * 1.1 / 100_000) * 100_000;
    const priceDown = Math.round(r.purchasePrice * 0.9 / 100_000) * 100_000;
    const rateDown  = parseFloat((r.annualRatePct - 0.5).toFixed(2));
    const altDown   = r.downPaymentPct < 30 ? 30 : r.downPaymentPct > 20 ? 20 : 25;

    const chips: BuiltCard['follow_up_chips'] = [
        {
            label: `Rate drops to ${fPct(rateDown)} — new payment?`,
            seed: `Jumbo loan on a ${fK(r.purchasePrice)} home, rate drops to ${fPct(rateDown)}`,
            paramOverrides: { annualRatePct: rateDown, purchasePrice: r.purchasePrice, downPaymentPct: r.downPaymentPct, loanType: 'jumbo' },
            changedKeys: ['annualRatePct'],
        },
        {
            label: `${altDown}% down — how does payment change?`,
            seed: `Jumbo loan on a ${fK(r.purchasePrice)} home with ${altDown}% down at ${rateStr}`,
            paramOverrides: { downPaymentPct: altDown, purchasePrice: r.purchasePrice, annualRatePct: r.annualRatePct, loanType: 'jumbo' },
            changedKeys: ['downPaymentPct'],
        },
        {
            label: `What if the home is ${fK(priceUp)}?`,
            seed: `Jumbo loan on a ${fK(priceUp)} home with ${r.downPaymentPct}% down at ${rateStr}`,
            paramOverrides: { purchasePrice: priceUp, downPaymentPct: r.downPaymentPct, annualRatePct: r.annualRatePct, loanType: 'jumbo' },
            changedKeys: ['purchasePrice'],
        },
        {
            label: `What if the home is ${fK(priceDown)}?`,
            seed: `Jumbo loan on a ${fK(priceDown)} home with ${r.downPaymentPct}% down at ${rateStr}`,
            paramOverrides: { purchasePrice: priceDown, downPaymentPct: r.downPaymentPct, annualRatePct: r.annualRatePct, loanType: 'jumbo' },
            changedKeys: ['purchasePrice'],
        },
    ];

    return {
        answer,
        next_step: `Jumbo at ${rateStr} — no PMI, ${r.downPaymentPct}% down. Monthly PITI: ${f$(r.totalMonthly)}.`,
        follow_up: chips[0].label,
        follow_up_chips: chips,
        confidence: '1.00 (calculated — no LLM)',
        memoryPayload: {
            plain_english_summary: `Jumbo: ${f$(r.purchasePrice)} purchase, ${r.downPaymentPct}% down, ${rateStr}, ${r.termYears}yr fixed. No PMI. Monthly PITI: ${f$(r.totalMonthly)}.`,
            scenario_inputs: { price: r.purchasePrice, down_pct: r.downPaymentPct, loan_type: 'jumbo', rate: r.annualRatePct, term_years: r.termYears },
            computed_financials: { monthly_pi: r.monthlyPI, monthly_pitia: r.totalMonthly, loan_amount: r.loanAmount },
            monthly_payment: r.totalMonthly,
        },
        interactiveSlider: {
            price: r.purchasePrice,
            downPct: r.downPaymentPct,
            rate: r.annualRatePct,
            term: r.termYears,
            taxRate: r.purchasePrice > 0 ? (r.monthlyTax * 12) / r.purchasePrice : 0.012,
            insRate: r.purchasePrice > 0 ? (r.monthlyInsurance * 12) / r.purchasePrice : 0.005,
            loanType: 'jumbo' as const,
        },
        lenderChecklist: {
            loanType: 'jumbo',
            price: r.purchasePrice, loanAmount: r.loanAmount,
            ltv: r.ltv, marketRate: r.annualRatePct,
            monthlyPITI: r.totalMonthly, termYears: r.termYears,
            isInvestment: false,
        },
    };
}

// ─────────────────────────────────────────────
// LOAN LIMITS CARD (Nationwide 2026)
// ─────────────────────────────────────────────

export interface LoanLimitsCardInput {
    county: string;
    state?: string;            // 2-letter state code — defaults to 'CA' for backward compat
    stateName?: string;        // human-readable state name (e.g. "Florida")
    conformingLimit: number;   // county Fannie/Freddie limit
    nationalBaseline: number;  // $832,750 (2026 FHFA baseline)
    price: number;             // purchase price
    downPct: number;           // down payment %
    taxRate: number;           // annual property tax rate as decimal
    insRate: number;           // annual insurance rate as decimal
    baseRate: number;          // conforming 30yr rate
    zip?: string;              // optional — shown in header
}

export function buildLoanLimitsCard(inp: LoanLimitsCardInput): BuiltCard {
    const { county, state = 'CA', stateName, conformingLimit, nationalBaseline, price, downPct, taxRate, insRate, baseRate } = inp;

    const loanAmt    = price * (1 - downPct / 100);
    const RATE_HB    = 0.30;
    const RATE_JUMBO = 0.50;

    let zone: 'standard_conforming' | 'high_balance' | 'jumbo';
    let effectiveRate: number;
    if (loanAmt <= nationalBaseline) {
        zone = 'standard_conforming';
        effectiveRate = baseRate;
    } else if (loanAmt <= conformingLimit) {
        zone = 'high_balance';
        effectiveRate = baseRate + RATE_HB;
    } else {
        zone = 'jumbo';
        effectiveRate = baseRate + RATE_JUMBO;
    }

    const zoneLabel = zone === 'standard_conforming' ? 'Standard Conforming'
        : zone === 'high_balance' ? 'High Balance'
        : 'Jumbo';

    const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
    const fmtRate = (r: number) => r.toFixed(3) + '%';

    const isHighBalanceCounty = conformingLimit > nationalBaseline;
    const countyDisplay = county.replace(/_/g, ' ').split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
    const stateLabel = stateName ?? state;
    const locationHeader = `${countyDisplay} County, ${stateLabel}`;

    // County-label for chips — use state-specific examples where relevant
    const isCA = state === 'CA';
    const relatedChip1 = isCA
        ? { label: 'LA County limits', seed: `California loan limits for Los Angeles County — 2026 conforming, high balance, and jumbo thresholds`, paramOverrides: { loanLimitsCounty: 'LOS ANGELES', loanLimitsState: 'CA' } as any }
        : { label: `${stateLabel} standard conforming`, seed: `What is the standard conforming loan limit in ${stateLabel} for 2026?`, paramOverrides: { loanLimitsState: state } as any };
    const relatedChip2 = isCA
        ? { label: 'San Diego County limits', seed: `California loan limits for San Diego County — 2026 conforming, high balance, and jumbo thresholds`, paramOverrides: { loanLimitsCounty: 'SAN DIEGO', loanLimitsState: 'CA' } as any }
        : { label: 'Nationwide loan limits explorer', seed: `Show me the nationwide 2026 conforming loan limits by state` };

    const answer = `**2026 Conforming Loan Limits — ${locationHeader}**

| Tier | Limit (1-unit) | Rate |
|------|---------------|------|
| ✅ Standard Conforming | ${fmt(nationalBaseline)} | ${fmtRate(baseRate)} (best) |${isHighBalanceCounty ? `
| ⚡ High Balance | up to ${fmt(conformingLimit)} | +${RATE_HB}% → ${fmtRate(baseRate + RATE_HB)} |` : ''}
| 🏛️ Jumbo | above ${fmt(isHighBalanceCounty ? conformingLimit : nationalBaseline)} | +${RATE_JUMBO}% → ${fmtRate(baseRate + RATE_JUMBO)} |

**Your scenario:** ${fmt(price)} purchase · ${downPct}% down · **${fmt(loanAmt)} loan → ${zoneLabel}** (${fmtRate(effectiveRate)})

> 📌 FHFA 2026 Fannie Mae/Freddie Mac conforming limits — effective Jan 1, 2026. National baseline: ${fmt(nationalBaseline)}.${isHighBalanceCounty ? ` ${countyDisplay} County is a high-cost area — GSE loans up to ${fmt(conformingLimit)} qualify; anything above is jumbo.` : ` ${countyDisplay} County uses the standard national baseline — no high-balance zone. Best rates apply to all GSE loans up to ${fmt(nationalBaseline)}.`}
>
> 💡 Rate premiums shown are typical mid-market estimates. Actual lender pricing varies.

Use the **Loan Limits Explorer** below to slide price and down payment — zones update instantly.`;

    const chips: BuiltCard['follow_up_chips'] = [
        {
            label: `${zoneLabel} payment breakdown`,
            seed: zone === 'jumbo'
                ? `Jumbo loan on a ${fmt(price)} home with ${downPct}% down at ${fmtRate(effectiveRate)}`
                : `Conventional loan on a ${fmt(price)} home with ${downPct}% down at ${fmtRate(effectiveRate)}`,
            paramOverrides: {
                purchasePrice: price,
                downPaymentPct: downPct,
                annualRatePct: effectiveRate,
                loanType: zone === 'jumbo' ? 'jumbo' : 'conventional',
            },
        },
        {
            label: `What down payment stays conforming in ${countyDisplay}?`,
            seed: `What down payment do I need to stay under the conforming loan limit in ${countyDisplay} County, ${stateLabel} for a ${fmt(price)} home?`,
        },
        relatedChip1,
        relatedChip2,
    ];

    return {
        answer,
        next_step: `${countyDisplay} County, ${stateLabel}: ${fmt(loanAmt)} loan → ${zoneLabel} @ ${fmtRate(effectiveRate)}.`,
        follow_up: chips[0].label,
        follow_up_chips: chips,
        confidence: '1.00 (FHFA 2026 data — no LLM)',
        memoryPayload: {
            plain_english_summary: `Loan limits: ${countyDisplay} County, ${stateLabel}, ${fmt(price)} purchase, ${downPct}% down, ${fmt(loanAmt)} loan → ${zoneLabel}.`,
            scenario_inputs: { county, state, price, down_pct: downPct, loan_amt: loanAmt, zone },
            computed_financials: { loan_amount: loanAmt, effective_rate: effectiveRate, zone },
            monthly_payment: 0,
        },
        loanLimitsSlider: {
            county,
            state,
            stateName: stateName ?? state,
            conformingLimit,
            nationalBaseline,
            price,
            downPct,
            taxRate,
            insRate,
            baseRate,
        },
    };
}
// ─────────────────────────────────────────────
// JUMBO AFFORDABILITY CARD
// ─────────────────────────────────────────────

function _jCalcPI(principal: number, annualRate: number, termYears = 30): number {
    if (principal <= 0 || annualRate <= 0) return 0;
    const r = annualRate / 100 / 12;
    const n = termYears * 12;
    return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

const _jFmt = (n: number) => {
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (abs >= 10_000)    return `${sign}$${Math.round(abs / 1000)}k`;
    return `${sign}$${Math.round(abs).toLocaleString()}`;
};
const _jFLong = (n: number) => '$' + Math.round(n).toLocaleString();
const _jFPct  = (n: number) => n.toFixed(2) + '%';

type _JZone = 'conforming' | 'high_balance' | 'jumbo';

const _JSPREADS: Record<_JZone, number> = {
    conforming: 0,
    high_balance: 0.25,
    jumbo: 0.40,
};
const _JRESERVES: Record<_JZone, number> = {
    conforming: 2,
    high_balance: 4,
    jumbo: 9,
};
const _JZONE_LABELS: Record<_JZone, string> = {
    conforming: 'Conforming',
    high_balance: 'High-Balance',
    jumbo: 'Jumbo',
};

export function buildJumboAffordabilityCard(params: {
    purchasePrice: number;
    downPaymentPct: number;
    annualRatePct: number;
    countyLimit: number;
    nationalBaseline: number;
    county?: string;
    taxRate: number;
    insRate: number;
    fredRateStr?: string;
}): BuiltCard {
    const {
        purchasePrice: price,
        downPaymentPct: downPct,
        annualRatePct: baseRate,
        countyLimit,
        nationalBaseline,
        county,
        taxRate,
        insRate,
        fredRateStr,
    } = params;

    const loanAmount = price * (1 - downPct / 100);
    const downAmount = price - loanAmount;
    const ltv        = loanAmount / price;

    const zone: _JZone =
        loanAmount <= nationalBaseline ? 'conforming' :
        loanAmount <= countyLimit      ? 'high_balance' :
        'jumbo';

    const spread        = _JSPREADS[zone];
    const reserveMos    = _JRESERVES[zone];
    const effectiveRate = baseRate + spread;

    const monthlyPI    = _jCalcPI(loanAmount, effectiveRate);
    const monthlyTax   = (price * taxRate) / 12;
    const monthlyIns   = (price * insRate) / 12;
    const monthlyPMI   = zone !== 'jumbo' && downPct < 20 ? (loanAmount * 0.008) / 12 : 0;
    const totalMonthly = monthlyPI + monthlyTax + monthlyIns + monthlyPMI;

    const incomeNeeded36 = (totalMonthly / 0.36) * 12;
    const incomeNeeded43 = (totalMonthly / 0.43) * 12;

    const reservesAmt   = totalMonthly * reserveMos;
    const closingCosts  = zone === 'jumbo' ? price * 0.02 : price * 0.025;
    const totalCash     = downAmount + closingCosts + reservesAmt;
    const totalInterest = monthlyPI * 360 - loanAmount;

    // Crossover math
    const downToHB =
        zone === 'jumbo'
            ? Math.max(0, ((loanAmount - countyLimit) / price) * 100)
            : 0;
    const downToConforming =
        zone !== 'conforming'
            ? Math.max(0, ((loanAmount - nationalBaseline) / price) * 100)
            : 0;

    const savingsHB =
        zone === 'jumbo'
            ? (countyLimit * (_JSPREADS.jumbo - _JSPREADS.high_balance) / 100) * 12
            : 0;
    const savingsConforming =
        zone !== 'conforming'
            ? (nationalBaseline * (spread - _JSPREADS.conforming) / 100) * 12
            : 0;

    const zoneLabel     = _JZONE_LABELS[zone];
    const countyDisplay = county
        ? county.charAt(0) + county.slice(1).toLowerCase().replace(/_/g, ' ') + ' County'
        : 'this area';
    void countyDisplay;

    const tierBadge = zone === 'conforming' ? '🟢' : zone === 'high_balance' ? '🟡' : '🔴';

    const crossoverLines: string[] = [];
    if (downToHB > 0)
        crossoverLines.push(
            `- **High-Balance crossover:** Add ${_jFPct(downToHB)} more down to reach high-balance — saves ~${_jFLong(Math.round(savingsHB))}/yr in interest.`
        );
    if (downToConforming > 0)
        crossoverLines.push(
            `- **Conforming crossover:** Add ${_jFPct(downToConforming)} more down to reach conforming — saves ~${_jFLong(Math.round(savingsConforming))}/yr in interest.`
        );

    const answer = [
        `## ${tierBadge} ${zoneLabel} Loan — ${_jFmt(price)} Purchase`,
        '',
        `| | |`,
        `|---|---|`,
        `| Purchase Price | ${_jFLong(price)} |`,
        `| Down Payment | ${downPct}% (${_jFLong(Math.round(downAmount))}) |`,
        `| Loan Amount | ${_jFLong(Math.round(loanAmount))} |`,
        `| LTV | ${_jFPct(ltv * 100)} |`,
        `| Loan Zone | **${zoneLabel}** |`,
        `| Base Rate | ${_jFPct(baseRate)} |`,
        `| Zone Spread | +${_jFPct(spread)} |`,
        `| Effective Rate | **${_jFPct(effectiveRate)}** |`,
        '',
        `### Monthly Payment`,
        '',
        `| | |`,
        `|---|---|`,
        `| Principal & Interest | ${_jFLong(Math.round(monthlyPI))} |`,
        `| Property Tax (${_jFPct(taxRate * 100)}) | ${_jFLong(Math.round(monthlyTax))} |`,
        `| Homeowner's Insurance | ${_jFLong(Math.round(monthlyIns))} |`,
        ...(monthlyPMI > 0 ? [`| PMI | ${_jFLong(Math.round(monthlyPMI))} |`] : []),
        `| **Total Monthly PITI** | **${_jFLong(Math.round(totalMonthly))}** |`,
        '',
        `### Annual Income Needed`,
        '',
        `| DTI | Annual Income |`,
        `|---|---|`,
        `| 36% (conservative) | ${_jFLong(Math.round(incomeNeeded36 / 1000) * 1000)} |`,
        `| **43% (standard)** | **${_jFLong(Math.round(incomeNeeded43 / 1000) * 1000)}** |`,
        '',
        `### Cash at Close`,
        '',
        `| | |`,
        `|---|---|`,
        `| Down Payment | ${_jFLong(Math.round(downAmount))} |`,
        `| Est. Closing Costs (${zone === 'jumbo' ? '2%' : '2.5%'}) | ${_jFLong(Math.round(closingCosts))} |`,
        `| ${reserveMos}-Month Reserves Required | ${_jFLong(Math.round(reservesAmt))} |`,
        `| **Total Cash Needed** | **${_jFLong(Math.round(totalCash))}** |`,
        '',
        crossoverLines.length > 0 ? `### Down Payment Crossovers\n\n${crossoverLines.join('\n')}` : '',
        '',
        `> **Est. total interest** over 30 years: ${_jFLong(Math.round(totalInterest))}`,
        fredRateStr ? `\n**FRED rate snapshot:** ${fredRateStr}` : '',
    ].filter(l => l !== undefined).join('\n').trim();

    const chips = [
        {
            label: `Rate −0.5% → ${_jFPct(effectiveRate - 0.5)} — how much do I save?`,
            seed: `Same ${_jFmt(price)} jumbo home but rate drops to ${_jFPct(effectiveRate - 0.5)} — what is the new monthly payment?`,
            paramOverrides: { purchasePrice: price, downPaymentPct: downPct, annualRatePct: effectiveRate - 0.5 },
        },
        ...(downToHB > 0 ? [{
            label: `${_jFPct(downToHB)} more down → High-Balance`,
            seed: `What if I put ${_jFPct(downToHB)} more down on my ${_jFmt(price)} home to stay under the high-balance limit?`,
            paramOverrides: { purchasePrice: price, downPaymentPct: Math.min(50, downPct + Math.ceil(downToHB)), annualRatePct: baseRate + _JSPREADS.high_balance },
        }] : []),
        ...(downPct < 20 ? [{
            label: `20% down scenario — ${_jFmt(price)}`,
            seed: `Run 20% down on a ${_jFmt(price)} ${zone} loan`,
            paramOverrides: { purchasePrice: price, downPaymentPct: 20, annualRatePct: baseRate + spread },
        }] : []),
        {
            label: `Income needed for ${_jFmt(price)} at 43% DTI`,
            seed: `What annual income do I need to qualify for a ${_jFmt(price)} home with ${downPct}% down at ${_jFPct(effectiveRate)}?`,
        },
    ];

    return {
        answer,
        next_step: `Get pre-approved with 2–3 jumbo lenders — rates vary significantly. Ask for APR, not just rate.`,
        follow_up: chips[0].label,
        follow_up_chips: chips,
        confidence: '1.00 (calculated — no LLM)',
        memoryPayload: {
            plain_english_summary: `Jumbo affordability: ${_jFmt(price)} purchase, ${downPct}% down, ${_jFPct(effectiveRate)} → ${zoneLabel}, ${_jFLong(Math.round(totalMonthly))}/mo.`,
            scenario_inputs: { price, down_pct: downPct, effective_rate: effectiveRate, zone, county },
            computed_financials: { loan_amount: loanAmount, total_monthly: totalMonthly, income_needed_43: incomeNeeded43, total_cash: totalCash },
            monthly_payment: Math.round(totalMonthly),
        },
        jumboAffordabilitySlider: {
            price,
            downPct,
            baseRate,
            countyLimit,
            nationalBaseline,
            county,
            taxRate,
            insRate,
        },
        lenderChecklist: {
            loanType: 'jumbo',
            price,
            loanAmount: Math.round(loanAmount),
            ltv,
            marketRate: effectiveRate,
            monthlyPITI: Math.round(totalMonthly),
            termYears: 30,
            isInvestment: false,
        },
    };
}

// ─────────────────────────────────────────────
// SCENARIO COMPARISON CARD
// ─────────────────────────────────────────────

export interface ScenarioComparisonCardInput {
    tool: 'down_payment' | 'seller_credit' | 'term' | 'rent_buy';
    price?: number;
    rate?: number;
    downPct?: number;
    years?: number;
    credit?: number;
    rent?: number;
}

const TOOL_LABELS: Record<string, string> = {
    down_payment:  '5% vs 20% Down Payment',
    seller_credit: 'Rate Buydown vs Price Reduction',
    term:          '15-Year vs 30-Year',
    rent_buy:      'Rent vs Buy',
};

export function buildScenarioComparisonCard(inp: ScenarioComparisonCardInput): BuiltCard {
    const { tool } = inp;
    const label = TOOL_LABELS[tool] ?? tool;

    const defaults: Record<string, { price: number; rate: number; downPct: number; years: number; credit: number; rent: number }> = {
        down_payment:  { price: 600_000, rate: 6.75, downPct: 10, years: 7,  credit: 15_000, rent: 2_800 },
        seller_credit: { price: 650_000, rate: 6.75, downPct: 10, years: 7,  credit: 15_000, rent: 2_800 },
        term:          { price: 600_000, rate: 6.75, downPct: 20, years: 10, credit: 15_000, rent: 2_800 },
        rent_buy:      { price: 550_000, rate: 6.75, downPct: 10, years: 7,  credit: 15_000, rent: 2_800 },
    };
    const d = defaults[tool];

    return {
        answer: `Here's a live **${label}** comparison. Adjust the sliders — all numbers update instantly.`,
        next_step: 'Move any slider to see how the math changes for your scenario.',
        follow_up: `Want me to run a deeper AI analysis on your specific numbers?`,
        follow_up_chips: [
            { label: `Run deeper AI analysis on this scenario`, seed: `Give me a full analysis of ${label.toLowerCase()} for a ${f$(inp.price ?? d.price)} home at ${fPct(inp.rate ?? d.rate)}` },
        ],
        confidence: 'high',
        scenarioComparisonCard: {
            tool,
            price:   inp.price   ?? d.price,
            rate:    inp.rate    ?? d.rate,
            downPct: inp.downPct ?? d.downPct,
            years:   inp.years   ?? d.years,
            credit:  inp.credit  ?? d.credit,
            rent:    inp.rent    ?? d.rent,
        },
    };
}
