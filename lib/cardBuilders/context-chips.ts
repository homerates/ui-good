import { f$, fK, fPct, fPct1 } from '../formatting';
import { BuiltCard } from './types';

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
        const downPct = Number(sDown ?? 15);
        const altDown = downPct < 20 ? 20 : 10;
        return [
            { label: downPct < 20 ? `What if I put 20% down?` : `What if I put 10% down?`, seed: `Conventional loan on a ${priceLabel} home with ${altDown}% down at ${fPct(Number(sRate))}`, paramOverrides: { downPaymentPct: altDown, purchasePrice: Number(sPrice), annualRatePct: Number(sRate) }, changedKeys: ['downPaymentPct'] },
            { label: `What income do I need for ${priceLabel}?`, seed: `How much income do I need to qualify for a ${priceLabel} home with ${downPct}% down?` },
            { label: `FHA vs conventional on ${priceLabel}`, seed: `Compare FHA 3.5% down vs conventional ${downPct}% down on a ${priceLabel} home at ${fPct(Number(sRate))}` },
        ];
    }

    // ── FHA / FHA vs Conv ──
    if ((snapshotLoanType === 'calcEngine-fha' || snapshotLoanType === 'calcEngine-fha_vs_conv') && sPrice && sRate) {
        const downPct = Number(sDown ?? 3.5);
        return [
            { label: `What if I put 10% down?`, seed: `FHA loan on ${priceLabel} home with 10% down at ${fPct(Number(sRate))}`, paramOverrides: { downPaymentPct: 10, purchasePrice: Number(sPrice), annualRatePct: Number(sRate), isFHA: true }, changedKeys: ['downPaymentPct'] },
            { label: `When can I remove FHA MIP?`, seed: `Ask Underwriting: when can I remove FHA MIP on a ${priceLabel} home with ${downPct}% down?` },
            { label: `FHA vs conventional on ${priceLabel}`, seed: `Compare FHA ${downPct}% down vs conventional 5% down on a ${priceLabel} home at ${fPct(Number(sRate))}` },
        ];
    }

    // ── DSCR ──
    if (snapshotLoanType === 'calcEngine-dscr' && sPrice && sRent) {
        const rentUp = Math.round(Number(sRent) + 200);
        const rentDown = Math.round(Number(sRent) - 200);
        const rateDown = sRate ? parseFloat((Number(sRate) - 0.5).toFixed(2)) : null;
        const downPct = Number(sDown ?? 25);
        return [
            { label: `Rent increases to ${f$(rentUp)}/mo`, seed: `DSCR loan on ${priceLabel} rental property, ${downPct}% down, rent increases to $${rentUp}/month at ${fPct(Number(sRate ?? 7))}`, paramOverrides: { grossMonthlyRent: rentUp, purchasePrice: Number(sPrice), annualRatePct: Number(sRate ?? 7) }, changedKeys: ['grossMonthlyRent'] },
            { label: `Rent drops to ${f$(rentDown)}/mo — still cash flows?`, seed: `DSCR loan on ${priceLabel} rental property, ${downPct}% down, rent drops to $${rentDown}/month at ${fPct(Number(sRate ?? 7))}`, paramOverrides: { grossMonthlyRent: rentDown, purchasePrice: Number(sPrice), annualRatePct: Number(sRate ?? 7) }, changedKeys: ['grossMonthlyRent'] },
            ...(rateDown ? [{ label: `Rate drops to ${fPct(rateDown)} — new DSCR?`, seed: `DSCR loan on ${priceLabel} rental property, ${downPct}% down, $${Number(sRent)}/mo rent, rate drops to ${rateDown}%`, paramOverrides: { annualRatePct: rateDown, purchasePrice: Number(sPrice), grossMonthlyRent: Number(sRent) }, changedKeys: ['annualRatePct'] }] : []),
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
            { label: `What if rate drops to ${fPct(rateDown)}?`, seed: `Refi ${balLabel} from ${fPct(currentRate)} to ${rateDown}% — full breakeven and savings`, paramOverrides: { newRatePct: rateDown, currentBalance: bal, currentRatePct: currentRate }, changedKeys: ['newRatePct'] },
            { label: `How long to break even on closing costs?`, seed: `How long to break even on refi closing costs for a ${balLabel} loan from ${fPct(currentRate)} to ${fPct(newRate)}?` },
            { label: `Extra payments vs refi — which wins?`, seed: `Compare making $500/mo extra payments vs refinancing my ${balLabel} mortgage from ${fPct(currentRate)} to ${fPct(newRate)}` },
            { label: `Cash-out refi — how much equity can I pull?`, seed: `How much equity can I pull out via refi on a ${balLabel} mortgage at ${fPct(currentRate)}?` },
        ];
    }

    // ── Affordability ──
    if (snapshotLoanType === 'calcEngine-affordability') {
        const sPiti = snapshotJson.computed_financials?.monthly_pitia ?? snapshotJson.monthly_payment;
        const sIncome = snapshotJson.scenario_inputs?.annual_income ?? snapshotJson.annual_income;
        const sSavings = snapshotJson.scenario_inputs?.savings ?? snapshotJson.savings;
        const incomeLabel = sIncome ? `$${Math.round(Number(sIncome) / 1000)}k income` : 'my income';
        const savingsLabel = sSavings ? `, $${Math.round(Number(sSavings) / 1000)}k saved` : '';
        if (sPiti) return [
            { label: `With $500/mo in debts — what changes?`, seed: `What can I afford with $500/month in other debts — I make ${incomeLabel.replace('$','').replace(' income','')}${savingsLabel}`, paramOverrides: { monthlyDebt: 500 } },
            { label: `What if I put 20% down?`, seed: `Affordability with 20% down — I make ${incomeLabel.replace('$','').replace(' income','')}${savingsLabel}`, paramOverrides: { downPctOverride: 20 } },
            { label: `Show FHA option on max price`, seed: `What's the FHA loan option for someone with ${incomeLabel}${savingsLabel}?` },
            { label: `What income do I need to qualify?`, seed: `How much income do I need to qualify for a conventional home purchase?` },
        ];
    }

    return null;
}
