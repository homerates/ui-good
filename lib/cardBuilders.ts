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
} from './calcEngine';
import { RefiNeedsInput, FHANeedsInput } from './calcDispatcher';

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
            label: `FHA vs conventional on ${fK(r.purchasePrice)}`,
            seed: `Compare FHA 3.5% down vs conventional ${r.downPaymentPct}% down on a ${fK(r.purchasePrice)} home at ${rateStr}`,
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

    const answer = `**FHA Loan Analysis**
${assumptionNote}
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
| Closing costs | — | ~${f$(r.closingCosts)} | ~2% estimate |
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
        {
            label: `20-year refi at ${fPct(r.newRatePct)} — total interest saved?`,
            seed: `Compare 20-year vs 30-year refi on ${fK(r.currentBalance)} at ${fPct(r.newRatePct)}`,
            paramOverrides: { newRatePct: r.newRatePct, currentBalance: r.currentBalance, currentRatePct: r.currentRatePct, refiTermMonths: 240 },
            changedKeys: ['refiTermMonths'],
        },
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

    // Chip 2: gift funds if there's a gap, otherwise rate sensitivity
    if (sFast.savingsGap > 0) {
        chips.push({
            label: `Can gift funds cover my ${f$(sFast.savingsGap)} gap?`,
            seed: `Can gift funds cover my FHA down payment? I need ${f$(sFast.savingsGap)} more with ${f$(r.annualIncome)} income`,
        });
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


    const chips: BuiltCard['follow_up_chips'] = [
        ...(safeRent && rent90 ? [{
            label: `What if rent drops to ${f$(rent90)}/mo?`,
            seed: `Same property, rent drops to ${f$(rent90)}/mo`,
            paramOverrides: { grossMonthlyRent: rent90, purchasePrice: r.purchasePrice, downPaymentPct: r.downPaymentPct, annualRatePct: r.annualRatePct }
        }] : []),
        {
            label: `What if rate goes to ${(r.annualRatePct + 0.5).toFixed(2)}%?`,
            seed: `Same DSCR deal at ${(r.annualRatePct + 0.5).toFixed(2)}%`,
            paramOverrides: { annualRatePct: parseFloat((r.annualRatePct + 0.5).toFixed(2)), purchasePrice: r.purchasePrice, ...(safeRent ? { grossMonthlyRent: safeRent } : {}), downPaymentPct: r.downPaymentPct }
        },
        {
            label: `What if I put 30% down — does cash flow turn positive?`,
            seed: `Same property with 30% down`,
            paramOverrides: { downPaymentPct: 30, purchasePrice: r.purchasePrice, ...(safeRent ? { grossMonthlyRent: safeRent } : {}), annualRatePct: r.annualRatePct }
        },
        {
            label: `What rent do I need for 1.25x DSCR — lender approval threshold?`,
            seed: `What monthly rent do I need for 1.25x DSCR on a ${fK(r.purchasePrice)} property at ${rateStr} with ${r.downPaymentPct}% down?`
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
    };
}

// ─────────────────────────────────────────────
// DSCR NEEDS INPUT CARD
// ─────────────────────────────────────────────

export function buildDSCRNeedsInputCard(fredRate?: number): BuiltCard {
    const rateHint = fredRate ? ` (or I'll use FRED avg: ${fPct(fredRate)})` : '';
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

**The problem.** Buying a home is the biggest financial decision most people make — yet the system is stacked against them. Lenders quote selectively, rates are opaque, and every "advisor" has a product to sell. Borrowers end up confused, overpaying, or paralyzed.

**The solution.** HomeRates.ai is zero-sales, real-time mortgage intelligence built to fix lending confusion. No commissions. No affiliate links. No products to push. Just transparent data on rates, guidelines, and market signals so you can negotiate from strength.

**How it works.** Every answer draws from live FRED data (Freddie Mac PMMS, 10Y Treasury, Fed funds rate), official agency underwriting guidelines (Fannie Mae, Freddie Mac, FHA, VA, USDA), and lender overlays — updated continuously.

**Who built it.** Rayaan Arif (NMLS #366082) — serial entrepreneur and licensed mortgage professional who watched borrowers repeatedly get burned by a system designed for lenders, not buyers. He built HomeRates.ai to give every borrower access to the same quality of analysis that institutional players have.

> *"Borrowers deserve the same clarity institutional investors get. We built HomeRates.ai to close that gap."*
> — Rayaan Arif, Founder

---
*Educational only — not financial advice. Eligibility and rates vary by profile and lender. Consult an NMLS-licensed loan consultant.*`;

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
*Educational only — not financial advice. Consult an NMLS-licensed loan consultant.*`;

    return {
        answer,
        next_step: 'Ask HomeRates.ai to check your scenario against current rate benchmarks.',
        follow_up: ABOUT_CHIPS[1].label,
        follow_up_chips: ABOUT_CHIPS,
        confidence: '1.00 (HomeRates.ai — static trust card)',
    };
}

export function buildAboutDifferenceCard(): BuiltCard {
    const answer = `## ⚡ What Makes HomeRates.ai Different?

**AI-curated. Unbiased. Built to inform.** HomeRates.ai uses artificial intelligence to synthesize primary mortgage data into clear, actionable answers — so borrowers arrive at every conversation better prepared and more confident.

**The informed borrower advantage.** When borrowers understand their numbers before the conversation starts, the entire process improves. They ask better questions, evaluate options more clearly, and make decisions with confidence rather than anxiety.

| | HomeRates.ai | Generic AI tools | Rate aggregators |
|---|---|---|---|
| Data source | Live FRED + agency guidelines directly | General web training data | Lender-submitted quotes |
| Calc accuracy | Deterministic — verified outputs | Generative — can vary | Static rate tables |
| Guideline depth | Fannie Mae, FHA, VA, USDA primary sources | Surface-level summaries | Not covered |
| Market context | FRED economic data — rates, spreads, housing | None | Rates only |
| Memory | Session + cross-session continuity | None | None |

**The calcEngine difference.** Every payment, MIP, DTI, and breakeven calculation runs through a deterministic engine — same inputs always produce the same verified output. No hallucinated numbers, no approximations.

**The curation difference.** Answers draw from the actual Fannie Mae Selling Guide, FHA Handbook 4000.1, VA Lenders Handbook, and live FRED economic data — primary sources synthesized by AI into plain language anyone can act on.

> *Better informed borrowers make better decisions. HomeRates.ai exists to make that happen.*

---
*Educational only — not financial advice. Consult an NMLS-licensed loan consultant.*`;

    return {
        answer,
        next_step: 'Run your own scenario — see the data in action.',
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
*Educational only — not financial advice. Consult an NMLS-licensed loan consultant.*`;

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

**Rayaan Arif** — Founder & CEO
**NMLS #366082** — Licensed mortgage professional

**The problem he kept seeing.** As a serial entrepreneur and licensed mortgage professional, Rayaan watched the same story play out repeatedly: borrowers making the biggest financial decision of their lives with incomplete, biased, or conflicting information. Lenders had every incentive to obscure pricing. Borrowers had no independent anchor.

**The gap.** Institutional investors — hedge funds, REITs, private equity — have access to Bloomberg terminals, agency data feeds, and dedicated analysts to evaluate mortgage instruments. Individual borrowers get a sales call and a rate sheet.

**The mission.** Close that gap. Give every borrower — first-time buyer, seasoned investor, or anyone in between — access to the same quality of analysis that institutional players have. No commissions. No conflicts. No confusion.

> *"Borrowers deserve the same clarity institutional investors get. We built HomeRates.ai to close that gap."*
> — Rayaan Arif, Founder

**What HomeRates.ai is not.** It is not a lender, broker, or lead generation platform. It will never quote you a rate to earn a commission, refer you to a lender for a fee, or filter information to favor a product.

---
*Educational only — not financial advice. Eligibility and rates vary by profile and lender. Consult an NMLS-licensed loan consultant.*`;

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
*Educational only — not financial advice. Consult an NMLS-licensed loan consultant.*`;

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