import { FHAResult, FHAvsConvResult } from '../calcEngine';
import { FHANeedsInput } from '../calcDispatcher';
import { f$, fK, fPct, fPct1 } from '../formatting';
import { BuiltCard } from './types';

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
        fhaSlider: {
            price: r.purchasePrice,
            downPct: r.downPaymentPct,
            rate: r.annualRatePct,
            term: r.termYears,
            taxRate: r.purchasePrice > 0 ? (r.monthlyTax * 12) / r.purchasePrice : 0.012,
            insRate: r.purchasePrice > 0 ? (r.monthlyInsurance * 12) / r.purchasePrice : 0.005,
        },
        lenderChecklist: {
            loanType: 'fha',
            price: r.purchasePrice, loanAmount: r.baseLoanAmount,
            ltv: r.ltv, downPaymentPct: r.downPaymentPct,
            marketRate: r.annualRatePct,
            monthlyPITI: r.totalMonthly, termYears: r.termYears,
            isInvestment: false,
        },
    };
}

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

    let bal = loanBalance;
    let naturalMonths = 0;
    while (bal > target80 && naturalMonths < 360) {
        const interest = bal * monthlyRate;
        const principal = monthlyPI - interest;
        if (principal <= 0) { naturalMonths = 999; break; }
        bal -= principal;
        naturalMonths++;
    }

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

export function buildFHANeedsInputCard(parsed: FHANeedsInput, fredRate?: number): BuiltCard {
    const rateHint = fredRate ? ` (or I'll use the current FRED rate: ${fPct(fredRate)})` : '';
    const chips: BuiltCard['follow_up_chips'] = [
        { label: 'FHA loan on $300k home at 6.5%', seed: 'FHA loan on a $300k home at 6.5%' },
        { label: 'FHA with 3.5% down, $75k income', seed: 'FHA loan on a $300k home with 3.5% down at current rates — does $75k income qualify?' },
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
