import { JumboResult } from '../calcEngine';
import { f$, fK, fPct, fPct1 } from '../formatting';
import { BuiltCard } from './types';

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
        jumboSlider: {
            price:   r.purchasePrice,
            downPct: r.downPaymentPct,
            rate:    r.annualRatePct,
            term:    r.termYears,
            taxRate: r.purchasePrice > 0 ? (r.monthlyTax * 12) / r.purchasePrice : 0.011,
            insRate: r.purchasePrice > 0 ? (r.monthlyInsurance * 12) / r.purchasePrice : 0.005,
        },
        lenderChecklist: {
            loanType: 'jumbo',
            price: r.purchasePrice, loanAmount: r.loanAmount,
            ltv: r.ltv, downPaymentPct: r.downPaymentPct,
            marketRate: r.annualRatePct,
            monthlyPITI: r.totalMonthly, termYears: r.termYears,
            isInvestment: false,
        },
    };
}

export interface LoanLimitsCardInput {
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
    zip?: string;
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

// ── Private helpers for buildJumboAffordabilityCard ──────────────────────────

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
    const effectiveRate = baseRate;

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
        `| Rate (FRED 30yr) | **${_jFPct(baseRate)}** |`,
        `| Loan Zone | **${zoneLabel}** |`,
        zone !== 'conforming' ? `| Typical Zone Premium | +${_jFPct(spread)} (varies by lender) |` : '',
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
        jumboAffordabilitySlider: null,
        lenderChecklist: {
            loanType: 'jumbo',
            price,
            loanAmount: Math.round(loanAmount),
            ltv,
            downPaymentPct: downPct,
            marketRate: effectiveRate,
            monthlyPITI: Math.round(totalMonthly),
            termYears: 30,
            isInvestment: false,
        },
    };
}
