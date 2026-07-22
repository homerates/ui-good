import { f$, fPct, fMo, fYr } from '../formatting';
import { BuiltCard } from './types';

export interface ScenarioComparisonCardInput {
    tool: 'down_payment' | 'seller_credit' | 'term' | 'rent_buy' | 'conv_vs_jumbo' | 'conv_vs_fha';
    price?: number;
    rate?: number;
    downPct?: number;
    years?: number;
    credit?: number;
    rent?: number;
    jumboRatePremium?: number;
}

const TOOL_LABELS: Record<string, string> = {
    down_payment:  '5% vs 20% Down Payment',
    seller_credit: 'Rate Buydown vs Price Reduction',
    term:          '15-Year vs 30-Year',
    rent_buy:      'Rent vs Buy',
    conv_vs_jumbo: 'Conventional vs Jumbo',
    conv_vs_fha:   'Conventional vs FHA',
};

export function buildScenarioComparisonCard(inp: ScenarioComparisonCardInput): BuiltCard {
    const { tool } = inp;
    const label = TOOL_LABELS[tool] ?? tool;

    const defaults: Record<string, { price: number; rate: number; downPct: number; years: number; credit: number; rent: number; jumboRatePremium: number }> = {
        down_payment:  { price: 600_000,   rate: 6.75, downPct: 10, years: 7,  credit: 15_000, rent: 2_800, jumboRatePremium: 0.375 },
        seller_credit: { price: 650_000,   rate: 6.75, downPct: 10, years: 7,  credit: 15_000, rent: 2_800, jumboRatePremium: 0.375 },
        term:          { price: 600_000,   rate: 6.75, downPct: 20, years: 10, credit: 15_000, rent: 2_800, jumboRatePremium: 0.375 },
        rent_buy:      { price: 550_000,   rate: 6.75, downPct: 10, years: 7,  credit: 15_000, rent: 2_800, jumboRatePremium: 0.375 },
        conv_vs_jumbo: { price: 1_100_000, rate: 6.75, downPct: 20, years: 7,  credit: 15_000, rent: 2_800, jumboRatePremium: 0.375 },
        conv_vs_fha:   { price: 500_000,   rate: 6.75, downPct: 10, years: 7,  credit: 15_000, rent: 2_800, jumboRatePremium: 0.375 },
    };
    const d = defaults[tool];

    return {
        answer: `Here's a live **${label}** comparison. Adjust the sliders — all numbers update instantly.`,
        next_step: 'Move any slider to see how the math changes for your scenario.',
        follow_up: `Want me to run a deeper AI analysis on your specific numbers?`,
        // No follow_up_chips here — ScenarioComparisonCard.tsx already renders its own
        // "Run deeper AI analysis" button per tool, seeded live from the card's current
        // slider state (richer than this static price/rate-only seed would be). Populating
        // this array duplicated that exact action as a second, separate chat-level chip.
        follow_up_chips: [],
        confidence: 'high',
        scenarioComparisonCard: {
            tool,
            price:            inp.price            ?? d.price,
            rate:             inp.rate             ?? d.rate,
            downPct:          inp.downPct          ?? d.downPct,
            years:            inp.years            ?? d.years,
            credit:           inp.credit           ?? d.credit,
            rent:             inp.rent             ?? d.rent,
            jumboRatePremium: inp.jumboRatePremium ?? d.jumboRatePremium,
        },
    };
}

export function buildBuydownCard(
    params: {
        purchasePrice:    number;
        loanAmount:       number;
        annualRatePct:    number;
        buydownType:      '2/1' | '1/0' | '3/2/1';
        isVA:             boolean;
        isJumbo?:         boolean;
        sellerCredit?:    number;
        annualTax?:       number;
        annualInsurance?: number;
        downPaymentPct?:  number;
    },
    assumptions: string[] = [],
    fredRateStr?: string,
): BuiltCard {
    const { purchasePrice, loanAmount, annualRatePct, buydownType, isVA, isJumbo, sellerCredit, annualTax, annualInsurance, downPaymentPct } = params;
    const _effLoanType = isVA ? 'va' : isJumbo ? 'jumbo' : 'conventional';

    const pi = (loan: number, rate: number): number => {
        const r = rate / 100 / 12, n = 360;
        if (r <= 0) return loan / n;
        return loan * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    };

    const piNote     = pi(loanAmount, annualRatePct);
    const moTax      = (annualTax      ?? purchasePrice * 0.011) / 12;
    const moIns      = (annualInsurance ?? purchasePrice * 0.005) / 12;

    interface BDRow { label: string; rate: number; pi: number; piti: number; subsidy: number; }
    const rows: BDRow[] = [];
    const addRow = (label: string, rateDrop: number, final = false) => {
        const r = final ? annualRatePct : annualRatePct - rateDrop;
        const p = pi(loanAmount, r);
        rows.push({ label, rate: r, pi: p, piti: Math.round(p + moTax + moIns), subsidy: final ? 0 : (piNote - p) * 12 });
    };
    if (buydownType === '3/2/1') {
        addRow('Year 1', 3); addRow('Year 2', 2); addRow('Year 3', 1); addRow('Year 4+', 0, true);
    } else if (buydownType === '1/0') {
        addRow('Year 1', 1); addRow('Year 2+', 0, true);
    } else {
        addRow('Year 1', 2); addRow('Year 2', 1); addRow('Year 3+', 0, true);
    }
    const buydownCost    = Math.round(rows.reduce((s, r) => s + r.subsidy, 0));
    const yr1Savings     = Math.round(piNote - rows[0].pi);

    const ptCost     = loanAmount / 100;
    const ptsPossible = buydownCost / ptCost;
    const rateRed    = ptsPossible * 0.25;
    const permRate   = Math.max(annualRatePct - rateRed, 2.5);
    const piPerm     = pi(loanAmount, permRate);
    const permSavMo  = Math.round(piNote - piPerm);
    const permBE     = permSavMo > 0 ? Math.ceil(buydownCost / permSavMo) : null;

    const creditNote = sellerCredit
        ? sellerCredit >= buydownCost
            ? `> ✅ **Seller credit ${f$(sellerCredit)} covers this buydown** — ${f$(sellerCredit - buydownCost)} left for closing costs\n\n`
            : `> ⚠️ **Seller credit ${f$(sellerCredit)} is ${f$(buydownCost - sellerCredit)} short** of the full buydown cost\n\n`
        : '';
    const vaCapNote = isVA
        ? `> ℹ️ **VA 4% concession cap: ${f$(Math.round(purchasePrice * 0.04))}** on this purchase — buydown ${buydownCost <= purchasePrice * 0.04 ? '✅ within cap' : '❌ exceeds cap'}\n\n`
        : '';
    const assumptionNote = assumptions.length ? assumptions.map(a => `> 💡 **Assumption:** ${a}`).join('\n') + '\n\n' : '';
    const fredNote = fredRateStr ? `> 📡 **Live FRED rate:** ${fredRateStr}\n\n` : '';

    const schedTable = rows.map(r =>
        `| ${r.label} | ${fPct(r.rate)} | ${f$(Math.round(r.pi))}/mo | ${f$(r.piti)}/mo | ${r.subsidy > 0 ? `**-${f$(Math.round(piNote - r.pi))}/mo**` : 'Base'} |`
    ).join('\n');

    const answer = `## 🏡 ${buydownType} Buydown Analysis
${assumptionNote}${fredNote}${creditNote}${vaCapNote}**${f$(purchasePrice)} purchase · ${f$(loanAmount)} loan · ${fPct(annualRatePct)} note rate**

---

## 📅 Year-by-Year Payment Schedule

| Period | Rate | P&I | PITI | vs Full Rate |
|--------|------|-----|------|-------------|
${schedTable}

**Buydown cost: ${f$(buydownCost)}**${sellerCredit ? ` · Seller credit: ${f$(sellerCredit)}` : ''}

---

## 🔄 Permanent Buydown Alternative (same ${f$(buydownCost)})

| | |
|--|--|
| Points Purchased | ${ptsPossible.toFixed(2)} pts |
| Rate Reduction | ~${fPct(rateRed)} |
| Permanent Rate | **${fPct(permRate)}** |
| Monthly PITI | ${f$(Math.round(piPerm + moTax + moIns))}/mo |
| Monthly Savings | **${f$(permSavMo)}/mo** (forever) |
| Break-even | ${permBE ? `**${fMo(permBE)} (${fYr(permBE / 12)})**` : 'N/A'} |

---

## 🎯 Which Strategy Wins?

| Scenario | ${buydownType} Buydown | Permanent Points |
|----------|---------------------|-----------------|
| Year 1 savings | **${f$(yr1Savings)}/mo** | ${f$(permSavMo)}/mo |
| After buydown period | Resets to ${fPct(annualRatePct)} | ${fPct(permRate)} forever |
| Refi before break-even | **${buydownType} wins** | Points wasted |
| No refi, stay ${permBE ? `${Math.ceil(permBE / 12)}+` : '5+'} yrs | Permanent wins | **Permanent wins** |
| Rate environment bet | Rates drop → refi upside | Rates flat/rise |

> 💡 **In a declining rate environment:** ${buydownType} buydown is typically the stronger play — you get ${rows.length - 1} year${rows.length > 2 ? 's' : ''} of lower payments AND preserve the option to refi when rates fall. Permanent points only win if rates stay above ${fPct(permRate)} for ${permBE ? `${Math.ceil(permBE / 12)}+ years` : 'the life of the loan'}.

---

## 💬 Ask Your Lender

- **"Can the seller fund the buydown escrow at closing?"** — Yes; ${isVA ? 'VA allows seller concessions up to 4% of purchase price' : 'lender will confirm allowable amount'}
- **"Provide the exact buydown cost on the Loan Estimate"** — Required by law within 3 business days
- **"If I refi in year 2, do unused buydown funds transfer?"** — Typically no; ask about refundability before signing
- **"What's the note rate without any buydown?"** — Always benchmark the base rate first`;

    return {
        answer,
        next_step: 'Get a written Loan Estimate with the buydown option priced out before committing.',
        follow_up: `Compare ${buydownType} buydown vs permanent points`,
        follow_up_chips: [
            {
                label: `Permanent buydown breakeven`,
                seed: `Permanent rate buydown on ${f$(purchasePrice)} ${isVA ? 'VA ' : ''}purchase at ${fPct(annualRatePct)} — how many years to break even?`,
                paramOverrides: { purchasePrice, loanAmount, annualRatePct, buydownType: '2/1' as const, loanType: _effLoanType, isVA, sellerCredit: sellerCredit ?? 0 },
            },
            ...(sellerCredit ? [{
                label: `Allocate ${f$(sellerCredit)} seller credit — all options`,
                seed: `Seller credit allocator: ${f$(sellerCredit)} on ${f$(purchasePrice)} ${isVA ? 'VA ' : ''}purchase at ${fPct(annualRatePct)}`,
                paramOverrides: { purchasePrice, loanAmount, sellerCredit, annualRatePct, loanType: _effLoanType, isVA },
            }] : []),
            {
                label: `What if rates drop to 5.25% — refi analysis`,
                seed: `Refi analysis: ${f$(loanAmount)} loan at ${fPct(annualRatePct)} → 5.25%`,
                paramOverrides: { currentBalance: loanAmount, currentRatePct: annualRatePct, newRatePct: 5.25 },
            },
            {
                label: `Full ${isVA ? 'VA ' : ''}purchase payment breakdown`,
                seed: `Full ${isVA ? 'VA ' : ''}mortgage PITI breakdown for ${f$(purchasePrice)} at ${fPct(annualRatePct)}`,
                paramOverrides: { purchasePrice, annualRatePct, loanType: _effLoanType, isVA, downPaymentPct: isVA ? 0 : isJumbo ? 20 : 20 },
            },
        ],
        confidence: '0.99 (calculated — deterministic buydown math)',
        interactiveSlider: {
            price:       purchasePrice,
            downPct:     downPaymentPct ?? 0,
            rate:        annualRatePct,
            term:        30,
            taxRate:     annualTax     ? annualTax     / purchasePrice : 0.011,
            insRate:     annualInsurance ? annualInsurance / purchasePrice : 0.005,
            loanType:    _effLoanType,
            ...(isVA ? { vaFundingFeePct: 0 } : {}),
            buydownType: buydownType,
            sellerCredit: sellerCredit ?? 0,
        },
    };
}

export function buildSellerCreditCard(
    params: {
        purchasePrice:   number;
        loanAmount:      number;
        sellerCredit:    number;
        annualRatePct:   number;
        isVA:            boolean;
        annualTax?:      number;
        annualInsurance?: number;
    },
    assumptions: string[] = [],
    fredRateStr?: string,
): BuiltCard {
    const { purchasePrice, loanAmount, sellerCredit, annualRatePct, isVA, annualTax, annualInsurance } = params;

    const pi = (loan: number, rate: number): number => {
        const r = rate / 100 / 12, n = 360;
        if (r <= 0) return loan / n;
        return loan * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    };

    const piNote  = pi(loanAmount, annualRatePct);
    const moTax   = (annualTax      ?? purchasePrice * 0.011) / 12;
    const moIns   = (annualInsurance ?? purchasePrice * 0.005) / 12;
    const pitiBase = Math.round(piNote + moTax + moIns);

    const pi21y1   = pi(loanAmount, annualRatePct - 2);
    const pi21y2   = pi(loanAmount, annualRatePct - 1);
    const cost21   = Math.round((piNote - pi21y1) * 12 + (piNote - pi21y2) * 12);
    const has21    = sellerCredit >= cost21;
    const left21   = sellerCredit - cost21;
    const piti21y1 = Math.round(pi21y1 + moTax + moIns);
    const sav21y1  = Math.round(piNote - pi21y1);

    const ptCost    = loanAmount / 100;
    const maxPts    = sellerCredit / ptCost;
    const rateRedB  = maxPts * 0.25;
    const permRateB = Math.max(annualRatePct - rateRedB, 2.5);
    const piPermB   = pi(loanAmount, permRateB);
    const pitiPermB = Math.round(piPermB + moTax + moIns);
    const savPermB  = Math.round(piNote - piPermB);
    const beBPerm   = savPermB > 0 ? Math.ceil(sellerCredit / savPermB) : null;

    const estClose  = isVA ? Math.round(purchasePrice * 0.015) : Math.round(purchasePrice * 0.025);
    const coverPct  = Math.min(Math.round(sellerCredit / estClose * 100), 100);
    const leftClose = Math.max(0, sellerCredit - estClose);

    const cost1pt   = Math.round(ptCost);
    const rate1pt   = annualRatePct - 0.25;
    const pi1pt     = pi(loanAmount, rate1pt);
    const piti1pt   = Math.round(pi1pt + moTax + moIns);
    const sav1pt    = Math.round(piNote - pi1pt);
    const be1pt     = sav1pt > 0 ? Math.ceil(cost1pt / sav1pt) : null;
    const left1pt   = sellerCredit - cost1pt;

    const vaCap  = isVA ? Math.round(purchasePrice * 0.04) : null;
    const vaNote = vaCap
        ? `> ℹ️ **VA 4% concession cap: ${f$(vaCap)}** — ${sellerCredit <= vaCap ? `✅ ${f$(sellerCredit)} is within cap` : `❌ ${f$(sellerCredit)} exceeds cap by ${f$(sellerCredit - vaCap)} — renegotiate`}\n\n`
        : '';
    const assumptionNote = assumptions.length ? assumptions.map(a => `> 💡 **Assumption:** ${a}`).join('\n') + '\n\n' : '';
    const fredNote = fredRateStr ? `> 📡 **Live FRED rate:** ${fredRateStr}\n\n` : '';

    const rec = has21
        ? `**🏆 Path A (2/1 Buydown)** — Use ${f$(cost21)} for the buydown, keep ${f$(Math.max(0, left21))} for closing costs and reserves. Year 1 PITI drops to ${f$(piti21y1)}/mo (saves ${f$(sav21y1)}/mo). In today's rate environment with likely Fed rate cuts in 2026–2027, the 2/1 buydown gives you cheap payments AND a refi window — permanent points would be stranded if rates fall.\n\n> 💡 If you need more closing cost coverage, ask the seller to increase the credit to ${f$(cost21 + estClose)} to fund both.`
        : `**🏆 Path C (Closing Costs)** — ${f$(sellerCredit)} is ${f$(cost21 - sellerCredit)} short of a full 2/1 buydown (${f$(cost21)}). Best use: apply to closing costs/prepaids/impounds, maximize reserves.\n\n> 💡 **Counter-offer play:** Ask seller to increase credit to ${f$(cost21)} to unlock the 2/1 buydown. At ${f$(purchasePrice)}, that's only ${(cost21 / purchasePrice * 100).toFixed(1)}% of price — often within negotiating range.`;

    const answer = `## 💵 Seller Credit Allocator — ${f$(sellerCredit)} on ${f$(purchasePrice)}${isVA ? ' VA' : ''} Purchase
${assumptionNote}${fredNote}${vaNote}**Base PITI at ${fPct(annualRatePct)} (no buydown): ${f$(pitiBase)}/mo**

---

## 📊 Strategy Comparison

| Strategy | Credit Used | Yr 1 PITI | Mo Savings | Remaining | Best For |
|----------|-------------|-----------|------------|-----------|----------|
| **A · 2/1 Buydown** | ${f$(cost21)} | ${f$(piti21y1)}/mo | ${f$(sav21y1)}/mo | ${has21 ? f$(left21) : `⚠️ short ${f$(cost21 - sellerCredit)}`} | Rate drop likely |
| **B · Max Permanent** | ${f$(sellerCredit)} (all) | ${f$(pitiPermB)}/mo | ${f$(savPermB)}/mo | $0 | Stay ${beBPerm ? `${Math.ceil(beBPerm / 12)}+` : '5+'} yrs, no refi |
| **C · Closing Costs** | ${f$(Math.min(sellerCredit, estClose))} | ${f$(pitiBase)}/mo | — | ${f$(leftClose)} cash back | Maximize reserves |
| **D · 1 Pt + Costs** | ${f$(cost1pt)} pts | ${f$(piti1pt)}/mo | ${f$(sav1pt)}/mo | ${f$(left1pt)} for costs | Modest savings + costs covered |

---

## 🔍 Path Detail

**Path A — 2/1 Buydown (${f$(cost21)} cost)**
| Year | Rate | PITI | Savings vs Base |
|------|------|------|----------------|
| Year 1 | ${fPct(annualRatePct - 2)} | ${f$(piti21y1)}/mo | **-${f$(sav21y1)}/mo** |
| Year 2 | ${fPct(annualRatePct - 1)} | ${f$(Math.round(pi21y2 + moTax + moIns))}/mo | **-${f$(Math.round(piNote - pi21y2))}/mo** |
| Year 3+ | ${fPct(annualRatePct)} | ${f$(pitiBase)}/mo | Base |

${has21 ? `${f$(left21)} remaining after buydown for closing costs/prepaids` : `❌ Needs **${f$(cost21 - sellerCredit)} more** — negotiate credit to ${f$(cost21)} to enable`}

**Path B — Max Permanent Points (${maxPts.toFixed(2)} pts)**
- Rate: ${fPct(annualRatePct)} → **${fPct(permRateB)}** | Monthly savings: **${f$(savPermB)}/mo**
- Break-even: ${beBPerm ? `${beBPerm} months (${fYr(beBPerm / 12)})` : 'N/A'}
- Risk: rates drop to refi levels before break-even → points wasted

**Path C — Closing Costs Only (est. ${f$(estClose)})**
- Covers ~${coverPct}% of ${isVA ? 'VA' : ''} buyer-side closing costs${isVA ? ' (origination capped at 1% for VA)' : ''}
- ${leftClose > 0 ? `${f$(leftClose)} left over after closing costs` : 'Fully absorbed by closing costs'}
- No payment reduction — strongest when borrower is cash-constrained or rates are dropping

**Path D — 1 Point + Remaining for Costs**
- 1 point cost: ${f$(cost1pt)} → rate: ${fPct(annualRatePct)} → ${fPct(rate1pt)}
- Saves ${f$(sav1pt)}/mo · break-even ${be1pt ? `${be1pt} months` : 'N/A'}
- ${f$(left1pt)} remaining for closing costs/impounds

---

## 💡 Recommendation

${rec}`;

    return {
        answer,
        next_step: 'Get a Loan Estimate with the buydown option priced in — compare lender quotes before deciding.',
        follow_up: has21 ? 'Full 2/1 buydown analysis' : `Negotiate credit to ${f$(cost21)} for 2/1 buydown`,
        follow_up_chips: [
            {
                label: has21 ? `Full 2/1 buydown payment schedule` : `Negotiate to ${f$(cost21)} — 2/1 buydown`,
                seed: `2/1 buydown analysis on ${f$(purchasePrice)} ${isVA ? 'VA ' : ''}purchase at ${fPct(annualRatePct)} with ${f$(sellerCredit)} seller credit`,
                paramOverrides: { purchasePrice, loanAmount, annualRatePct, buydownType: '2/1' as const, isVA, sellerCredit },
            },
            {
                label: `If rates hit 5.25% — refi breakeven`,
                seed: `Refi from ${fPct(annualRatePct)} to 5.25% on ${f$(loanAmount)} loan — breakeven analysis`,
                paramOverrides: { currentBalance: loanAmount, currentRatePct: annualRatePct, newRatePct: 5.25 },
            },
            {
                label: `Full ${isVA ? 'VA ' : ''}purchase PITI breakdown`,
                seed: `Full ${isVA ? 'VA ' : ''}mortgage PITI breakdown for ${f$(purchasePrice)} at ${fPct(annualRatePct)}`,
                paramOverrides: { purchasePrice, annualRatePct, isVA, downPaymentPct: isVA ? 0 : 20 },
            },
        ],
        confidence: '0.99 (calculated — deterministic seller credit allocation math)',
    };
}
