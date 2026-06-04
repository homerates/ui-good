import { AffordabilityResult, AffordabilityScenario } from '../calcEngine';
import { f$, fK, fPct, fPct1 } from '../formatting';
import { BuiltCard } from './types';

function scenarioTagline(s: AffordabilityScenario): string {
    if (s.isFHA) return '⭐ Lowest barrier to entry';
    if (s.downPaymentPct >= 20) return '🛡️ No PMI — best long-term rate';
    return '🎯 Lowest conventional entry';
}

export interface AffordabilityGeo {
    county_name: string | null;
    state_abbr: string | null;
    ami_4person: number | null;
    ami_pct_of_income: number | null;
    dpa_likely: boolean;
    dpa_tier: string | null;
    ami_120pct: number | null;
    insurance_pressure: string | null;
    insurance_est_low: number | null;
    insurance_est_high: number | null;
    fema_dominant_hazard: string | null;
    fema_risk_label: string | null;
}

export function buildAffordabilityCard(
    r: AffordabilityResult,
    assumptions: string[] = [],
    geo?: AffordabilityGeo | null,
): BuiltCard {
    const mGross = r.annualIncome / 12;
    const assumptionNote = assumptions.length
        ? assumptions.map(a => `> 💡 **Assumption:** ${a}`).join('\n') + '\n\n' : '';

    const debtClause = r.monthlyDebts > 0
        ? ` | ${f$(r.monthlyDebts)}/mo existing debt factored in`
        : '';
    const anchorLine = `**${f$(r.annualIncome)}/year = ${f$(Math.round(mGross))}/mo gross** | Rate: ${fPct(r.rate)}${debtClause}`;

    const summaryNote = `> 💡 Home prices below are based on what your **income qualifies for** at 43% DTI. Savings gap is shown separately — you may have more savings than listed, or can save toward the gap.`;

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

    const s = r.scenarios;
    const compRows = s.map(sc =>
        `| ${sc.icon} ${sc.label} | ${f$(sc.homePrice)} | ${f$(sc.totalCashNeeded)} | ${f$(r.savings)} | ${sc.savingsGap > 0 ? `**${f$(sc.savingsGap)} more**` : `✅ Covered`} | ${f$(sc.totalMonthly)}/mo | ${sc.monthlyMI > 0 ? (sc.isFHA ? 'MIP (life of loan)' : 'PMI → cancels 80% LTV') : '❌ None'} |`
    ).join('\n');

    const s0 = r.scenarios[0];
    const debtMultiplier = s0.totalMonthly > 0 ? s0.homePrice / s0.totalMonthly : 130;
    const debtNote = r.monthlyDebts > 200
        ? `\n💳 **Your ${f$(r.monthlyDebts)}/mo in debt is costing you buying power.** Paying it off would add ~${f$(Math.round(r.monthlyDebts * debtMultiplier))} to your max home price.\n`
        : '';
    const sFast = r.scenarios.reduce((best, sc) =>
        sc.savingsGap < best.savingsGap ? sc : best, r.scenarios[0]);
    const fastestPath = sFast.savingsGap <= 0
        ? `✅ You can close on **${sFast.label}** today with your current savings.`
        : `⚡ **You need ${f$(sFast.savingsGap)} more to close on ${sFast.label}** — the fastest path to homeownership on your income.\n- At $500/mo savings: **${Math.ceil(sFast.savingsGap / 500)} months** to closing-ready\n- At $1,000/mo savings: **${Math.ceil(sFast.savingsGap / 1000)} months** to closing-ready\n- Alternative: Ask about **gift funds** — FHA allows 100% of down payment as a gift from family`;

    let geoBlock = '';
    if (geo) {
        const geoLines: string[] = [];
        const areaLabel = geo.county_name && geo.state_abbr
            ? `${geo.county_name}, ${geo.state_abbr}`
            : geo.state_abbr ?? '';

        if (geo.dpa_likely && geo.ami_4person) {
            const pctLabel = geo.ami_pct_of_income !== null
                ? ` (you're at ${geo.ami_pct_of_income}% of AMI)`
                : '';
            geoLines.push(`🏠 **Down Payment Assistance likely available${areaLabel ? ` in ${areaLabel}` : ''}**${pctLabel} — income under 120% AMI (${f$(geo.ami_120pct ?? 0)}) qualifies for most state and county DPA programs. Ask me about specific programs for your area.`);
        }

        if (geo.insurance_pressure && geo.insurance_pressure !== 'low' && geo.insurance_est_low !== null && geo.insurance_est_high !== null) {
            const hazardNote = geo.fema_dominant_hazard
                ? ` (dominant risk: ${geo.fema_dominant_hazard.replace('_', ' ')})`
                : '';
            const pressureLabel = geo.insurance_pressure.replace('_', ' ').toUpperCase();
            geoLines.push(`⚠️ **Insurance pressure: ${pressureLabel}${hazardNote}** — budget an additional **$${geo.insurance_est_low}–$${geo.insurance_est_high}/mo** above national average for homeowner's insurance. This changes your real all-in payment.`);
        }

        if (geoLines.length) {
            geoBlock = `\n\n---\n\n## 📍 Local Market Intelligence\n\n${geoLines.join('\n\n')}\n\n_Source: HUD FY2025 Income Limits, FEMA NRI 2024_`;
        }
    }

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
${debtNote}${r.monthlyDebts === 0 ? `_Add your monthly debts (car, student loans, credit cards) and I'll show how they shift your numbers._` : ''}${geoBlock}`;

    const fhaS = r.scenarios.find(sc => sc.isFHA) ?? r.scenarios[0];
    const convS = r.scenarios.find(sc => !sc.isFHA && sc.downPaymentPct < 15) ?? r.scenarios[1];
    const conv20 = r.scenarios.find(sc => sc.downPaymentPct >= 20);

    const chips: BuiltCard['follow_up_chips'] = [];

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

    if (sFast.savingsGap > 0) {
        if (sFast.isFHA) {
            chips.push({
                label: `Can gift funds cover my ${f$(sFast.savingsGap)} gap?`,
                seed: `Can gift funds cover my FHA down payment? I need ${f$(sFast.savingsGap)} more with ${f$(r.annualIncome)} income`,
            });
        } else {
            chips.push({
                label: `Rate drops to ${fPct(r.rate - 0.5)} — how much does that help?`,
                seed: `What can I afford at ${fPct(r.rate - 0.5)} rate? I make ${f$(r.annualIncome)} and have ${f$(r.savings)} saved`,
                paramOverrides: {
                    annualIncome: r.annualIncome,
                    savings: r.savings,
                    monthlyDebts: r.monthlyDebts,
                    annualRatePct: Math.round((r.rate - 0.5) * 100) / 100,
                },
                changedKeys: ['annualRatePct'],
            });
        }
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
        affordabilitySlider: (() => {
            const sc0 = r.scenarios[0];
            const sc = r.scenarios.find(s => !s.isFHA) ?? sc0;
            const fhaSc  = r.scenarios.find(s => s.isFHA);
            const convSc = r.scenarios.find(s => !s.isFHA);
            const refPrice = sc?.homePrice ?? sc0?.homePrice ?? 300000;
            const isJumboScenario = sc0?.program === 'Jumbo' || sc?.program === 'Jumbo';
            return {
                annualIncome: r.annualIncome,
                monthlyDebts: r.monthlyDebts,
                savings: r.savings,
                downPct: sc0?.isFHA ? (sc0?.downPaymentPct ?? 3.5) : (sc?.downPaymentPct ?? 20),
                rate: r.rate,
                term: 30,
                taxRate: refPrice > 0 ? ((sc?.monthlyTax ?? sc0?.monthlyTax ?? 300) * 12) / refPrice : 0.012,
                insRate: refPrice > 0 ? ((sc?.monthlyInsurance ?? sc0?.monthlyInsurance ?? 125) * 12) / refPrice : 0.005,
                loanType: sc0?.isFHA ? 'fha' : isJumboScenario ? 'jumbo' : 'conventional',
                fhaLoanLimit:  fhaSc?.loanLimitForProgram  ?? 541_287,
                confLoanLimit: convSc?.loanLimitForProgram ?? 832_750,
            };
        })(),
        lenderChecklist: (() => {
            const sc0 = r.scenarios[0];
            if (!sc0) return undefined;
            const isJumboSc = sc0?.program === 'Jumbo';
            return {
                loanType: (sc0.isFHA ? 'fha' : isJumboSc ? 'jumbo' : 'conventional') as 'fha' | 'conventional' | 'jumbo',
                pdfType: 'affordability' as const,
                price: sc0.homePrice,
                loanAmount: sc0.loanAmount,
                ltv: sc0.homePrice > 0 ? sc0.loanAmount / sc0.homePrice : 0.965,
                downPaymentPct: sc0?.isFHA ? (sc0?.downPaymentPct ?? 3.5) : (sc0?.downPaymentPct ?? 5),
                marketRate: r.rate,
                monthlyPITI: sc0.totalMonthly,
                termYears: 30,
                isInvestment: false,
            };
        })(),
    };
}

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
