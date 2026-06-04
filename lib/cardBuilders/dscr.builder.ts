import { DSCRResult } from '../calcEngine';
import { f$, fK, fPct } from '../formatting';
import { BuiltCard } from './types';

export interface DSCRGeo {
    county_name: string | null;
    state_abbr: string | null;
    fmr_1br: number | null;
    fmr_2br: number | null;
    fmr_3br: number | null;
    fmr_4br: number | null;
    insurance_pressure: string | null;
    insurance_est_low: number | null;
    insurance_est_high: number | null;
    fema_dominant_hazard: string | null;
}

export function buildDSCRCard(r: DSCRResult, assumptions: string[] = [], geo?: DSCRGeo | null): BuiltCard {
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
- Maintenance/CapEx (1–2%/yr) not included${(() => {
        if (!geo) return '';
        const lines: string[] = [];
        const areaLabel = geo.county_name && geo.state_abbr ? `${geo.county_name}, ${geo.state_abbr}` : '';

        const fmrForRent = geo.fmr_2br ?? geo.fmr_3br ?? geo.fmr_1br;
        if (fmrForRent && safeRent) {
            const diff = safeRent - fmrForRent;
            const pct = Math.round(Math.abs(diff) / fmrForRent * 100);
            const vs = diff >= 0
                ? `${pct}% above HUD FMR — strong rent assumption`
                : `${pct}% below HUD FMR — conservative; upside possible`;
            lines.push(`\n\n---\n\n## 📍 Local Market Intelligence${areaLabel ? ` — ${areaLabel}` : ''}\n\n**HUD Fair Market Rents (FY2025):** 1BR ${f$(geo.fmr_1br ?? 0)} | 2BR ${f$(geo.fmr_2br ?? 0)} | 3BR ${f$(geo.fmr_3br ?? 0)}\nYour rent estimate of ${f$(safeRent)}/mo is **${vs}**. DSCR at HUD FMR: **${(fmrForRent / r.monthlyPITIA).toFixed(2)}x**`);
        } else if (fmrForRent) {
            lines.push(`\n\n---\n\n## 📍 Local Rent Benchmark${areaLabel ? ` — ${areaLabel}` : ''}\n\n**HUD Fair Market Rents (FY2025):** 1BR ${f$(geo.fmr_1br ?? 0)} | 2BR ${f$(geo.fmr_2br ?? 0)} | 3BR ${f$(geo.fmr_3br ?? 0)}\nDSCR at 2BR FMR: **${(fmrForRent / r.monthlyPITIA).toFixed(2)}x**`);
        }

        if (geo.insurance_pressure && geo.insurance_pressure !== 'low' && geo.insurance_est_low !== null && geo.insurance_est_high !== null) {
            const hazard = geo.fema_dominant_hazard ? ` (dominant: ${geo.fema_dominant_hazard.replace('_', ' ')})` : '';
            lines.push(`⚠️ **Insurance pressure: ${geo.insurance_pressure.replace('_', ' ').toUpperCase()}${hazard}** — budget +$${geo.insurance_est_low}–$${geo.insurance_est_high}/mo above national average. This impacts your PITIA and DSCR.\n\n_Source: HUD FY2025 FMR, FEMA NRI 2024_`);
        } else if (lines.length) {
            lines.push(`_Source: HUD FY2025 Fair Market Rents_`);
        }

        return lines.join('\n\n');
    })()}`;

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
            downPaymentPct: r.downPaymentPct,
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

export function buildDSCRNeedsInputCard(fredRate?: number, purchasePrice?: number, downPaymentPct?: number, annualRatePct?: number): BuiltCard {
    const rateHint = fredRate ? ` (or I'll use FRED avg: ${fPct(fredRate)})` : '';
    const rate = annualRatePct ?? fredRate;

    if (purchasePrice && purchasePrice > 0) {
        const priceFmt = purchasePrice >= 1_000_000
            ? `$${(purchasePrice / 1_000_000).toFixed(purchasePrice % 1_000_000 === 0 ? 0 : 2).replace(/\.?0+$/, '')}M`
            : `$${Math.round(purchasePrice / 1000)}k`;
        const downPct = downPaymentPct ?? 25;
        const downAmt = Math.round(purchasePrice * downPct / 100);
        const downFmt = downAmt >= 1_000_000 ? `$${(downAmt / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M` : `$${Math.round(downAmt / 1000)}k`;
        const rentExamples = [
            Math.round(purchasePrice * 0.006 / 100) * 100,
            Math.round(purchasePrice * 0.008 / 100) * 100,
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
