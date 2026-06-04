import { RefiResult, Refi20vs30Result, RefiEarlySaleResult, ExtraPaymentResult, OneExtraPaymentPerYearResult } from '../calcEngine';
import { RefiNeedsInput } from '../calcDispatcher';
import { f$, fK, fPct, fPct1, fMo, fYr } from '../formatting';
import { BuiltCard } from './types';

export function buildRefiCard(
    r: RefiResult,
    assumptions: string[] = [],
    fredRateStr?: string,
    refiType?: string,
    propertyValue?: number,
    ctx?: {
        fredDate?: string;
        sofr?: number;
        address?: string;
        city?: string;
        state?: string;
        zip?: string;
        origRateLabel?: string;
    },
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
    const showNoCostChip = noCostRate < r.currentRatePct;

    const rateDrop = r.currentRatePct - r.newRatePct;
    const thinSpread = rateDrop < 0.5;

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
        refiIntelligenceCard: {
            balance: r.currentBalance,
            currentRate: r.currentRatePct,
            newRate: r.newRatePct,
            termMonths: r.refiTermMonths,
            closingCosts: r.closingCosts,
            remainingMonths: r.remainingMonths,
            ...(propertyValue != null && { propertyValue }),
            ...(ctx?.address    && { address: ctx.address }),
            ...(ctx?.city       && { city: ctx.city }),
            ...(ctx?.state      && { state: ctx.state }),
            ...(ctx?.zip        && { zip: ctx.zip }),
            ...(ctx?.origRateLabel && { origRateLabel: ctx.origRateLabel }),
            ...(ctx?.fredDate   && { fredDate: ctx.fredDate }),
            ...(ctx?.sofr != null && { sofr: ctx.sofr }),
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
