import { VAResult, VAEntitlementResult } from '../calcEngine';
import { f$, fK, fPct, fPct1 } from '../formatting';
import { BuiltCard } from './types';

export interface VACountyData {
    countyName: string;
    stateAbbr: string;
    limit: number;
    isHighBalance: boolean;
}

export function buildVACard(
    r: VAResult,
    assumptions: string[] = [],
    fredRateStr?: string,
    countyData?: VACountyData,
): BuiltCard {
    const rateStr  = fPct(r.annualRatePct);
    const origRate = fPct(r.originalRatePct);
    const assumptionNote = assumptions.length
        ? assumptions.map(a => `> 💡 **Assumption:** ${a}`).join('\n') + '\n\n'
        : '';
    const fredNote = fredRateStr
        ? `\n> 📡 **Live FRED rate:** ${fredRateStr} (VA rates typically 0.25–0.5% below conventional)\n`
        : '';

    const ffRow = r.isExempt
        ? `| VA Funding Fee | **Exempt** (disability) |\n`
        : `| VA Funding Fee | ${f$(r.fundingFee)} (${fPct(r.fundingFeePct)} — rolled in) |\n`;

    const hoaRow = r.monthlyHOA > 0 ? `| HOA | ${f$(r.monthlyHOA)} |\n` : '';

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

    const savingsNote = r.vaSavingsVsConv > 0
        ? `\n> ✅ **VA saves ${f$(r.vaSavingsVsConv)}/mo vs conventional** — no PMI (${f$(r.convMonthlyPMI)}/mo avoided) + lower rate.\n`
        : r.vaSavingsVsConv <= 0
            ? `\n> ℹ️ VA monthly cost similar to conventional at this down payment — funding fee is the trade-off for no PMI.\n`
            : '';

    const countySection = countyData ? `
---

## 📍 ${countyData.countyName} County, ${countyData.stateAbbr} — 2026 Loan Limits

| | |
|--|--|
| 2026 Conforming Limit | ${f$(countyData.limit)}${countyData.isHighBalance ? ' *(high-balance county)*' : ''} |
| Your VA Loan | ${f$(r.totalLoanAmount)} — ${countyData.limit < r.totalLoanAmount ? `**VA Jumbo** (${Math.round((r.totalLoanAmount / countyData.limit - 1) * 100)}% above county limit)` : '✅ within county limit'} |
| Full Entitlement | ✅ No loan limit cap since Jan 2020 (Blue Water Navy Act) |
| VA Guaranty | 25% of ${f$(r.totalLoanAmount)} = **${f$(Math.round(r.totalLoanAmount * 0.25))}** |
| Seller Concession Cap | 4% max = **${f$(Math.round(r.purchasePrice * 0.04))}** toward closing costs |

${countyData.limit < r.totalLoanAmount ? `> ⚠️ **VA Jumbo:** Your loan exceeds the county conforming limit. VA still allows this with full entitlement — no down payment required. Lender may apply additional qualifying criteria.` : `> ✅ Your loan is within the county conforming limit — standard VA underwriting applies.`}
` : '';

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
${countySection}${buydownSection}${dtiSection}
---

**Next Steps:**
1. Request your COE at VA.gov or through your lender
2. Compare VA lenders — rates vary 0.25–0.5% between lenders
3. Factor in closing costs (~${fK(r.purchasePrice * 0.02)}) — seller can pay up to 4%`;

    const rateDown  = parseFloat((r.originalRatePct - 0.5).toFixed(2));
    const priceUp   = Math.round(r.purchasePrice * 1.1 / 10000) * 10000;
    const buydownRate = parseFloat((r.originalRatePct - 0.25).toFixed(2));

    const chips: BuiltCard['follow_up_chips'] = [
        {
            label: `I have an active VA loan — what's my down payment?`,
            seed: `VA subsequent use — ${fK(r.purchasePrice)} home at ${fPct(r.originalRatePct)}, prior VA balance $300,000`,
            paramOverrides: { purchasePrice: r.purchasePrice, priorLoanBalance: 300000, annualRatePct: r.originalRatePct, loanType: 'va' },
        },
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
            buydownType:     'none' as const,
        },
        vaSlider: {
            price:          r.purchasePrice,
            downPct:        r.downPaymentPct,
            rate:           r.originalRatePct,
            term:           r.termYears,
            taxRate:        r.purchasePrice > 0 ? (r.monthlyTax * 12) / r.purchasePrice : 0.012,
            insRate:        r.purchasePrice > 0 ? (r.monthlyInsurance * 12) / r.purchasePrice : 0.005,
            vaFundingFeePct: r.isExempt ? 0 : r.fundingFeePct,
        },
        lenderChecklist: {
            loanType: 'va',
            price: r.purchasePrice, loanAmount: r.totalLoanAmount,
            ltv: r.ltv, downPaymentPct: r.downPaymentPct,
            marketRate: r.annualRatePct,
            monthlyPITI: r.totalMonthly, termYears: r.termYears,
            isInvestment: false,
        },
    };
}

export function buildVAEntitlementCard(r: VAEntitlementResult): BuiltCard {
    const dpRow = r.downPaymentNeeded > 0
        ? `| **Down Payment Required** | **${f$(r.downPaymentNeeded)} (${r.downPaymentPct.toFixed(1)}% of purchase price)** |`
        : `| **Down Payment Required** | **$0 — full coverage within remaining entitlement** |`;

    const jumboNote = r.isJumboVA
        ? `\n> ⚠️ **VA Jumbo:** Your base loan (${f$(r.baseLoan)}) exceeds the county conforming limit (${f$(r.countyLimit)}). VA still allows this loan with full entitlement — standard VA Jumbo underwriting applies.`
        : `\n> ✅ Your loan is within the county conforming limit — standard VA underwriting applies.`;

    const ffRow = r.isExempt
        ? `| VA Funding Fee | **Exempt** (disability) |`
        : `| VA Funding Fee | ${f$(r.fundingFee)} (${fPct(r.fundingFeePct)} subsequent use — rolled in) |`;

    const answer = `**VA Entitlement — Subsequent Use Analysis**

**${f$(r.purchasePrice)} purchase · prior VA loan balance ${f$(r.priorLoanBalance)} · ${fPct(r.annualRatePct)} · ${r.termYears}-year fixed**

---

## 📊 Entitlement Breakdown

| | |
|--|--|
| 2026 County Conforming Limit | ${f$(r.countyLimit)} |
| Total Entitlement (25% of limit) | ${f$(r.totalEntitlement)} |
| Entitlement Used (25% × prior balance) | ${f$(r.entitlementUsed)} |
| **Remaining Entitlement** | **${f$(r.remainingEntitlement)}** |
| Max Loan at $0 Down | ${f$(r.maxZeroDownLoan)} |
${dpRow}

${jumboNote}

---

## 🏠 Loan Structure

| | |
|--|--|
| Purchase Price | ${f$(r.purchasePrice)} |
| Down Payment | ${r.downPaymentNeeded > 0 ? f$(r.downPaymentNeeded) : '**$0**'} |
| Base Loan | ${f$(r.baseLoan)} |
${ffRow}
| **Total Loan** | **${f$(r.totalLoan)}** |

---

## 💰 Monthly Payment

| Component | Amount |
|-----------|--------|
| Principal & Interest | ${f$(r.monthlyPI)} |
| Property Taxes | ${f$(r.monthlyTax)} |
| Home Insurance | ${f$(r.monthlyInsurance)} |
| **Total Monthly (PITI)** | **${f$(r.totalMonthly)}** |

> ✅ **No PMI** — VA loans never require private mortgage insurance regardless of down payment.

---

## 🏅 Subsequent Use Notes

- Funding fee for subsequent use with <5% down: **3.3%** (vs 2.15% first use)
- If you sell your prior home and pay off the VA loan, entitlement restores fully — $0 down available again
- Partial entitlement can also be used if you're keeping both properties (investment/rental exception applies)
- Check your exact entitlement balance on your COE at [VA.gov](https://www.va.gov/housing-assistance/home-loans/certificate-of-eligibility/)

> ⚠️ *Check with your lender — underwriting guidelines and entitlement restoration timelines vary.*`;

    const priceUp = Math.round(r.purchasePrice * 1.1 / 10000) * 10000;
    const priceDown = Math.round(r.purchasePrice * 0.9 / 10000) * 10000;
    const chips: BuiltCard['follow_up_chips'] = [
        {
            label: `What if I pay off the prior loan first — $0 down?`,
            seed: `VA loan on a ${fK(r.purchasePrice)} home at ${fPct(r.annualRatePct)}, prior VA loan paid off, full entitlement restored`,
            paramOverrides: { purchasePrice: r.purchasePrice, annualRatePct: r.annualRatePct, downPaymentPct: 0, loanType: 'va' },
        },
        {
            label: `What if home price is ${fK(priceDown)} instead?`,
            seed: `VA subsequent use — ${fK(priceDown)} home at ${fPct(r.annualRatePct)}, prior VA balance ${fK(r.priorLoanBalance)}`,
            paramOverrides: { purchasePrice: priceDown, annualRatePct: r.annualRatePct, priorLoanBalance: r.priorLoanBalance, loanType: 'va' },
        },
        {
            label: `What if home price is ${fK(priceUp)}?`,
            seed: `VA subsequent use — ${fK(priceUp)} home at ${fPct(r.annualRatePct)}, prior VA balance ${fK(r.priorLoanBalance)}`,
            paramOverrides: { purchasePrice: priceUp, annualRatePct: r.annualRatePct, priorLoanBalance: r.priorLoanBalance, loanType: 'va' },
        },
        {
            label: `Run full VA payment breakdown`,
            seed: `VA loan on a ${fK(r.purchasePrice)} home with ${r.downPaymentPct.toFixed(1)}% down at ${fPct(r.annualRatePct)}`,
            paramOverrides: { purchasePrice: r.purchasePrice, downPaymentPct: r.downPaymentPct, annualRatePct: r.annualRatePct, loanType: 'va' },
        },
    ];

    return {
        answer,
        next_step: `Down payment needed: ${r.downPaymentNeeded > 0 ? f$(r.downPaymentNeeded) + ` (${r.downPaymentPct.toFixed(1)}%)` : '$0'}. Monthly PITI: ${f$(r.totalMonthly)}.`,
        follow_up: chips[0].label,
        follow_up_chips: chips,
        confidence: '1.00 (calculated — no LLM)',
        memoryPayload: {
            plain_english_summary: `VA subsequent use: ${f$(r.purchasePrice)} purchase, prior balance ${f$(r.priorLoanBalance)}, remaining entitlement ${f$(r.remainingEntitlement)}, down payment needed ${f$(r.downPaymentNeeded)}.`,
            scenario_inputs: { price: r.purchasePrice, prior_balance: r.priorLoanBalance, county_limit: r.countyLimit, rate: r.annualRatePct },
            computed_financials: { down_payment_needed: r.downPaymentNeeded, remaining_entitlement: r.remainingEntitlement, monthly_pitia: r.totalMonthly },
            monthly_payment: r.totalMonthly,
        },
    };
}

export function buildVAEntitlementNeedsInputCard(price: number | null, priorBalance: number | null): BuiltCard {
    const hasPrior = priorBalance !== null;
    const hasPrice = price !== null;
    const question = !hasPrice && !hasPrior
        ? `What's the purchase price of the home you're buying, and what's the remaining balance on your current VA loan?`
        : !hasPrice
        ? `Got it — prior VA balance is ${f$(priorBalance!)}. What's the purchase price of the new home?`
        : `Got the price (${f$(price!)}). What's the remaining balance on your current VA loan? (Or provide the entitlement used from your COE.)`;

    const answer = `**VA Subsequent Use — Entitlement Calculator**

To calculate your down payment and remaining entitlement, I need two numbers:

| | |
|--|--|
| New Home Purchase Price | ${hasPrice ? `✅ ${f$(price!)}` : '❓ Not provided yet'} |
| Prior VA Loan Balance | ${hasPrior ? `✅ ${f$(priorBalance!)}` : '❓ Not provided yet'} |

**${question}**

> 💡 Your prior VA loan balance is the current payoff amount — not the original loan. You can find it on your mortgage statement or by calling your servicer.
>
> You can also provide the **entitlement charged** amount directly from your COE (Certificate of Eligibility).`;

    return {
        answer,
        next_step: question,
        follow_up: question,
        follow_up_chips: [
            { label: 'What is VA entitlement?', seed: 'Explain VA entitlement — what is it, how does subsequent use work, and when does it restore?' },
            { label: 'How do I get my COE?', seed: 'How do I get my VA Certificate of Eligibility (COE) and what does it show?' },
        ],
        confidence: '0.00 (needs_input)',
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
