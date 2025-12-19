// Run: node tools/scenario-validator-selftest.mjs
// Purpose: regression test for the exact $650k rental scenario.

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function round2(n) { return Math.round(n * 100) / 100; }

function calcMonthlyPI(loanAmount, annualRatePct, termYears) {
    const r = (annualRatePct / 100) / 12;
    const n = termYears * 12;
    if (!Number.isFinite(r) || r <= 0) return loanAmount / n;
    const pow = Math.pow(1 + r, n);
    return loanAmount * (r * pow) / (pow - 1);
}

function calcBaseline(inputs, annualRatePct) {
    const termYears = inputs.term_years ?? 30;
    const downPct = clamp(inputs.down_payment_pct / 100, 0, 0.99);
    const loanAmount = inputs.price * (1 - downPct);

    const effectiveRent = inputs.rent_monthly * (1 - clamp(inputs.vacancy_pct / 100, 0, 0.9));
    const maintMonthly = (inputs.price * (inputs.maintenance_pct / 100)) / 12;
    const taxMonthly = (inputs.price * (inputs.property_tax_pct / 100)) / 12;
    const insMonthly = (inputs.price * (inputs.insurance_pct / 100)) / 12;

    const monthlyPI = calcMonthlyPI(loanAmount, annualRatePct, termYears);
    const PITIA = monthlyPI + taxMonthly + insMonthly;
    const operating = maintMonthly;

    const monthlyCashFlow = effectiveRent - operating - PITIA;
    const dscr = PITIA > 0 ? (effectiveRent / PITIA) : null;

    return {
        monthlyPI: round2(monthlyPI),
        PITIA: round2(PITIA),
        effectiveRent: round2(effectiveRent),
        monthlyCashFlow: round2(monthlyCashFlow),
        annualCashFlow: round2(monthlyCashFlow * 12),
        dscr: dscr == null ? null : round2(dscr),
    };
}

const inputs = {
    rent_monthly: 3600,
    price: 650000,
    down_payment_pct: 25,
    vacancy_pct: 7,
    maintenance_pct: 1,
    property_tax_pct: 1.2,
    insurance_pct: 0.5,
    term_years: 30,
};

const rate = 6.21;
const base = calcBaseline(inputs, rate);

// Gold expectations (loose bounds to avoid rounding drift)
// Expect negative cash flow (but magnitude depends on rate rounding + amort calc)
if (!(base.monthlyCashFlow < 0)) {
    throw new Error(`Expected negative monthly cash flow. Got ${base.monthlyCashFlow}`);
}

// DSCR should be < 1 for this scenario (rent does not cover PITIA)
if (!(base.dscr != null && base.dscr < 1.0)) {
    throw new Error(`Expected DSCR < 1. Got ${base.dscr}`);
}

// Optional sanity range: should land around -$700 to -$1,600/mo for 6.21%
// (kept wide so rounding won’t flake)
if (!(base.monthlyCashFlow <= -700 && base.monthlyCashFlow >= -1600)) {
    throw new Error(`Monthly cash flow out of expected range (-700..-1600). Got ${base.monthlyCashFlow}`);
}


console.log("PASS");
console.log({ rate, ...base });
