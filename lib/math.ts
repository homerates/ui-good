/**
 * lib/math.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure mortgage math primitives.  No side effects, no imports, fully testable.
 *
 * These are the canonical implementations.  Import from here — do NOT
 * copy-paste into card components or route handlers.
 *
 * NOTE: calcEngine.ts exports monthlyPI(principal, annualRatePct, termMonths)
 * where termMonths is in MONTHS — used internally by the server calc engine.
 * calcPI() here uses termYears (more natural for UI code) and is the version
 * all card components should use.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Monthly principal + interest payment — standard amortization formula.
 *
 * @param principal  Loan amount in dollars
 * @param annualRate Annual interest rate as a percentage (e.g. 6.5 for 6.5%)
 * @param termYears  Loan term in years (e.g. 30)
 */
export function calcPI(
    principal: number,
    annualRate: number,
    termYears: number,
): number {
    if (principal <= 0) return 0;
    if (annualRate <= 0) return principal / (termYears * 12);
    const r = annualRate / 100 / 12;
    const n = termYears * 12;
    const pw = Math.pow(1 + r, n);
    return principal * (r * pw) / (pw - 1);
}

/**
 * Remaining loan balance after `monthsPaid` payments.
 */
export function calcRemainingBalance(
    principal: number,
    annualRate: number,
    termYears: number,
    monthsPaid: number,
): number {
    if (principal <= 0) return 0;
    if (annualRate <= 0) {
        return Math.max(0, principal - (principal / (termYears * 12)) * monthsPaid);
    }
    const r = annualRate / 100 / 12;
    const payment = calcPI(principal, annualRate, termYears);
    const pw = Math.pow(1 + r, monthsPaid);
    return principal * pw - payment * ((pw - 1) / r);
}

/**
 * Total interest paid over the full loan term.
 */
export function calcTotalInterest(
    principal: number,
    annualRate: number,
    termYears: number,
): number {
    if (principal <= 0) return 0;
    return calcPI(principal, annualRate, termYears) * termYears * 12 - principal;
}

/**
 * Years until loan-to-value reaches `targetLTVPct` (e.g. 80 for 80%).
 * Uses binary search — exact to within a day.
 */
export function calcYearsToLTV(
    principal: number,
    annualRate: number,
    termYears: number,
    currentValue: number,
    targetLTVPct: number,
): number {
    const targetBalance = currentValue * (targetLTVPct / 100);
    if (principal <= targetBalance) return 0;
    if (annualRate <= 0) {
        const moPayment = principal / (termYears * 12);
        return Math.max(0, (principal - targetBalance) / moPayment / 12);
    }
    const r = annualRate / 100 / 12;
    const payment = calcPI(principal, annualRate, termYears);
    let lo = 0, hi = termYears * 12;
    for (let i = 0; i < 64; i++) {
        const mid = (lo + hi) / 2;
        const pw = Math.pow(1 + r, mid);
        const bal = principal * pw - payment * ((pw - 1) / r);
        if (bal > targetBalance) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2 / 12;
}

/**
 * Break-even months for a refinance (closing costs ÷ monthly savings).
 */
export function calcRefiBreakEven(
    closingCosts: number,
    oldMonthlyPayment: number,
    newMonthlyPayment: number,
): number {
    const monthlySavings = oldMonthlyPayment - newMonthlyPayment;
    if (monthlySavings <= 0) return Infinity;
    return closingCosts / monthlySavings;
}

/**
 * Snap a numeric value to the nearest step, clamped to [min, max].
 * Used by slider components — lives here so it can be imported without React.
 */
export function snapToStep(value: number, step: number, min: number, max: number): number {
    const steps = Math.round((value - min) / step);
    const snapped = min + steps * step;
    const clamped = Math.max(min, Math.min(max, snapped));
    const dec = Math.max(0, Math.ceil(-Math.log10(step))) + 1;
    return parseFloat(clamped.toFixed(dec));
}
