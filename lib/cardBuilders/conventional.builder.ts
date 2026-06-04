import { ConventionalResult } from '../calcEngine';
import { NATIONAL_CONFORMING_BASELINE } from '../loanLimits2026';
import { f$, fK, fPct, fPct1 } from '../formatting';
import { BuiltCard } from './types';

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
        convHBSlider: {
            price: r.purchasePrice,
            downPct: r.downPaymentPct,
            rate: r.annualRatePct,
            term: r.termYears,
            taxRate: r.purchasePrice > 0 ? (r.monthlyTax * 12) / r.purchasePrice : 0.012,
            insRate: r.purchasePrice > 0 ? (r.monthlyInsurance * 12) / r.purchasePrice : 0.005,
        },
        lenderChecklist: {
            loanType: 'conventional',
            price: r.purchasePrice, loanAmount: r.loanAmount,
            ltv: r.ltv, downPaymentPct: r.downPaymentPct,
            marketRate: r.annualRatePct,
            monthlyPITI: r.totalMonthly, termYears: r.termYears,
            isInvestment: false,
        },
    };
}
