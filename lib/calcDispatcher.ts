// lib/calcDispatcher.ts
// ============================================================
// HOMERATES CALC DISPATCHER — Single routing brain
//
// Replaces two competing routing systems in route.ts:
//   System 1: module = "refi" | "rate" | "qualify" ... (L1873)
//   System 2: mortgageAnswer, fhaAnswer, affordabilityAnswer ... (L3106)
//
// Priority order (highest → lowest):
//   1. refi      — refinance, break-even, loan balance
//   2. fha       — FHA loan, UFMIP, MIP
//   3. fha_vs_conv — explicit comparison
//   4. dscr      — investment property, rental, DSCR
//   5. conventional — purchase with price
//   6. affordability — income + savings → how much can I afford
//
// Returns: { type, params, confidence } — no markdown, no answer
// ============================================================

import {
    ConventionalInput,
    FHAInput,
    RefiInput,
    AffordabilityInput,
    DSCRInput,
    FHAvsConvInput,
    VAInput,
    JumboInput,
    VAEntitlementInput,
    FHA_FLOOR_2026,
    FHA_CEILING_2026,
    CONF_STANDARD,
    CONF_HIGH_BALANCE,
} from './calcEngine';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export type CalcType =
    | 'refi'
    | 'refi_20vs30'
    | 'extra_payment'
    | 'one_extra_payment_per_year'
    | 'refi_early_sale'
    | 'fha'
    | 'fha_vs_conv'
    | 'conventional'
    | 'affordability'
    | 'dscr'
    | 'refi_needs_input'
    | 'va'
    | 'va_needs_input'
    | 'va_entitlement'
    | 'va_entitlement_needs_input'
    | 'jumbo'
    | 'jumbo_needs_input'
    | 'fha_needs_input'
    | 'affordability_needs_input'
    | 'dscr_needs_input'
    | 'fha_equity_timeline'
    | 'mip_duration_knowledge'
    | 'loan_limits'
    | 'jumbo_affordability'
    | 'lab'
    | 'uw_starter'
    | 'about'
    | 'about_trust'
    | 'about_difference'
    | 'about_data'
    | 'about_founder'
    | 'how_it_works'
    | 'buydown'
    | 'seller_credit'
    | 'no_calc_match';

export interface DispatchResult {
    type: CalcType;
    params:
    | RefiInput
    | FHAInput
    | FHAvsConvInput
    | ConventionalInput
    | AffordabilityInput
    | DSCRInput
    | RefiNeedsInput
    | FHANeedsInput
    | VAEntitlementInput
    | { price: number | null; priorBalance: number | null }
    | null;
    confidence: number;  // 0–1
    assumptions: string[]; // list of defaults applied
}

export interface RefiNeedsInput {
    refiType: 'rate_term' | 'cash_out' | 'fha_to_conv' | 'arm_to_fixed' | 'streamline' | 'shorten';
    parsedBalance: number | null;
    parsedCurrentRate: number | null;
    parsedNewRate: number | null;
}

export interface FHANeedsInput {
    parsedPrice: number | null;
    parsedRate: number | null;
}

export interface BuydownInput {
    purchasePrice: number;
    loanAmount:    number;
    annualRatePct: number;
    buydownType:   '2/1' | '1/0' | '3/2/1';
    isVA:          boolean;
    sellerCredit?: number;
    annualTax?:    number;
    annualInsurance?: number;
}

export interface SellerCreditInput {
    purchasePrice: number;
    loanAmount:    number;
    sellerCredit:  number;
    annualRatePct: number;
    isVA:          boolean;
    annualTax?:    number;
    annualInsurance?: number;
}

// ─────────────────────────────────────────────
// LOAN LIMIT HELPERS
// ─────────────────────────────────────────────

export function detectLoanLimits(text: string): {
    fhaLimit: number;
    confLimit: number;
    locationLabel: string;
} {
    const t = text.toLowerCase();
    if (/san francisco|san jose|los angeles|seattle|new york|nyc|boston|miami|dc|washington.*dc|orange county|marin|santa clara|contra costa/i.test(t)) {
        return { fhaLimit: FHA_CEILING_2026, confLimit: CONF_HIGH_BALANCE, locationLabel: 'high-cost area' };
    }
    if (/sacramento|san diego|riverside|fresno|phoenix|denver|portland|austin|dallas|chicago|atlanta/i.test(t)) {
        return { fhaLimit: CONF_STANDARD, confLimit: CONF_STANDARD, locationLabel: 'mid-cost area' };
    }
    return { fhaLimit: FHA_FLOOR_2026, confLimit: CONF_STANDARD, locationLabel: '' };
}

// ─────────────────────────────────────────────
// PARAM EXTRACTORS — regex only, no LLM
// ─────────────────────────────────────────────

function extractPrice(text: string): number | undefined {
    const t = text.toLowerCase();
    // "$2M" / "$1.5M" / "$1.5m" / "$2.5m" — million shorthand
    const mMatch = text.match(/\$\s*([\d,]+(?:\.\d+)?)\s*[mM]\b/);
    if (mMatch) {
        const v = parseFloat(mMatch[1].replace(/,/g, '')) * 1_000_000;
        if (v >= 500_000 && v <= 50_000_000) return v;
    }
    // "1.5 million" / "2 million"
    const millionMatch = text.match(/([\d,]+(?:\.\d+)?)\s*million/i);
    if (millionMatch) {
        const v = parseFloat(millionMatch[1].replace(/,/g, '')) * 1_000_000;
        if (v >= 500_000 && v <= 50_000_000) return v;
    }
    // Full number: $515,000 or $14,595,000
    const fullMatch = text.match(/\$\s*([\d,]{6,})/);
    if (fullMatch) {
        const v = parseFloat(fullMatch[1].replace(/,/g, ''));
        if (v >= 50000 && v <= 50_000_000) return v;
    }
    // Bare $Xk — try this FIRST before context match to avoid grabbing rent amounts
    // e.g. "$450k investment property, $3,200/mo rent" — must return 450000 not 3200000
    const incomeRe = /(?:income|salary|earn|make|making)\s{0,5}\$[\d,]+\s*k\b|\$[\d,]+\s*k\s{0,5}(?:income|salary)\b/i;
    const bareMatches = Array.from(text.matchAll(/\$([\d,]+)\s*k\b/gi));
    const best = bareMatches.find(m => {
        const v = parseFloat(m[1].replace(/,/g, ''));
        if (v < 50) return false;
        const idx = m.index ?? 0;
        const surround = text.slice(Math.max(0, idx - 15), idx + m[0].length + 15);
        return !incomeRe.test(surround);
    });
    if (best) {
        const v = parseFloat(best[1].replace(/,/g, '')) * 1000;
        if (v >= 50000 && v <= 50_000_000) return v;
    }
    // Context-anchored fallback: "$500k home", "purchase price $500k", "$500K property"
    // [^$\n]{0,40} — tightly bounded, never spans past rent/mo signals
    const ctxMatch = text.match(/\$?\s*([\d,]+)k?\s*(?:home|house|property|purchase)/i) ||
        text.match(/(?:price|purchase|home|house|property)[^$\n]{0,40}\$?\s*([\d,]+)k?(?!\s*\/mo)/i);
    if (ctxMatch) {
        const v = parseFloat(ctxMatch[1].replace(/,/g, ''));
        const val = v < 10000 ? v * 1000 : v;
        if (val >= 50000 && val <= 50_000_000) return val;
    }
    return undefined;
}

function extractDownPct(text: string): number | undefined {
    const m = text.match(/(\d+\.?\d*)\s*%\s*down/i) ||
        text.match(/down\s*(?:payment)?\s*(?:of\s*)?(\d+\.?\d*)\s*%/i) ||
        text.match(/(?:put|with)\s+(\d+\.?\d*)\s*%/i);
    return m ? parseFloat(m[1]) : undefined;
}

function extractRate(text: string): number | undefined {
    // Explicit "rate" keyword
    let m = text.match(/(?:rate|interest)\s*(?:of\s*)?(\d+\.?\d*)\s*%/i);
    if (m) { const v = parseFloat(m[1]); if (v >= 2 && v <= 15) return v; }
    // "at X%" or "at X.XX%" — exclude if followed by "down"
    m = text.match(/\bat\s+(\d+\.?\d*)\s*%(?!\s*down)/i);
    if (m) { const v = parseFloat(m[1]); if (v >= 2 && v <= 15) return v; }
    // "X.XX% rate/interest"
    m = text.match(/(\d+\.\d+)\s*%\s*(?:rate|interest|fixed|30.?year)/i);
    if (m) { const v = parseFloat(m[1]); if (v >= 2 && v <= 15) return v; }
    return undefined;
}

function extractIncome(text: string): number | undefined {
    const m = text.match(/(?:i\s+earn|i\s+make|we\s+make|make|earn)\s+[\$]?\s*([\d,]+)\s*k?\b/i) ||
        text.match(/[\$]\s*([\d,]+)\s*k?\s*(?:income|salary|a\s+year|per\s+year|annually|\/year)/i) ||
        text.match(/(?:salary|income)\s+(?:is\s+|of\s+)?[\$]?\s*([\d,]+)\s*k?\b/i);
    if (!m) return undefined;
    let v = parseFloat(m[1].replace(/,/g, ''));
    if (v < 1000) v *= 1000;
    return v >= 20000 && v <= 2000000 ? v : undefined;
}

function extractSavings(text: string): number | undefined {
    const m = text.match(/(?:have|saved|savings|got)\s+[\$]?\s*([\d,]+)\s*k?\s*(?:saved|in savings)?/i) ||
        text.match(/[\$]?\s*([\d,]+)\s*k?\s*(?:savings|saved|in savings|in the bank|available|liquid)/i);
    if (!m) return undefined;
    // Reject if the match is in a debt/payment context (e.g. "have $1,500 in monthly debt")
    const idx = m.index ?? 0;
    const surrounding = text.slice(Math.max(0, idx - 5), idx + m[0].length + 25);
    if (/\/mo|per month|monthly|in debt|in loan|car payment|student loan|debt payment/i.test(surrounding)) return undefined;
    let v = parseFloat(m[1].replace(/,/g, ''));
    if (v < 1000) v *= 1000;
    return v >= 1000 && v <= 10000000 ? v : undefined;
}

function extractMonthlyDebts(text: string): number {
    const m = text.match(/\$\s*(\d+)\s*(?:car|student|debt|loan)\s*payment/i) ||
        text.match(/(\d+)\s*(?:\/mo|per month|monthly)\s*(?:in\s*)?(?:debt|payments?)/i) ||
        text.match(/(?:car|student|debt|loan)\s*payment[^$]*\$?\s*(\d+)/i);
    return m ? parseFloat(m[1]) : 0;
}

function extractCreditScore(text: string): number | undefined {
    const m = text.match(/(?:credit score|fico|score)\s*(?:is\s*|of\s*)?(\d{3})/i);
    return m ? parseInt(m[1]) : undefined;
}

function extractTaxRate(text: string): number | undefined {
    const m = text.match(/(?:property tax|tax rate|tax)\s*(?:is\s*|of\s*)?(\d+\.?\d*)\s*%/i);
    return m ? parseFloat(m[1]) : undefined;
}

// Refi-specific extractors
function extractBalance(text: string): number | null {
    const m = text.match(/\$\s*([\d,]+(?:,\d{3})+)/i) ||
        text.match(/\$\s*(\d+(?:\.\d+)?)\s*[Mm]\b/) ||
        text.match(/\bon\s+(?:my\s+)?\$\s*(\d+(?:\.\d+)?)\s*k?\b/i) ||
        text.match(/\$\s*(\d+(?:\.\d+)?)\s*k\b/i);
    if (!m) return null;
    const raw = parseFloat(m[1].replace(/,/g, ''));
    const isMil = /\$\s*\d+(?:\.\d+)?\s*[Mm]\b/.test(text);
    const isK = /\$\s*\d+(?:\.\d+)?\s*k\b/i.test(m[0]);
    const val = isMil ? raw * 1_000_000 : isK ? raw * 1000 : raw;
    return val >= 50000 && val <= 10000000 ? val : null;
}

function extractCurrentRate(text: string): number | null {
    const m = text.match(/\b(?:current\s*rate|my\s*rate)\b\s*(?:is\s+)?(\d+\.?\d*)\s*%/i) ||
        text.match(/\bat\s+(\d+\.?\d*)\s*%/i) ||
        text.match(/(\d+\.?\d*)\s*%\s*(?:rate|interest|on\s*my|current)/i) ||
        (() => {
            const all = Array.from(text.matchAll(/(\d+\.?\d*)\s*%/g))
                .map(m => parseFloat(m[1])).filter(r => r > 1 && r < 20);
            return all.length >= 1 ? { 1: String(all[0]) } as any : null;
        })();
    if (!m) return null;
    const v = parseFloat(m[1]);
    return v >= 1 && v <= 20 ? v : null;
}

function extractNewRate(text: string): number | null {
    const m = text.match(/\b(?:refi(?:nance)?\s+(?:to|at|when)|new\s*rate)\s+(\d+\.?\d*)\s*%/i) ||
        text.match(/(?:go\s+(?:down\s+)?to|drop\s+to|hit|reach|down\s+to)\s*(\d+\.?\d*)\s*%/i) ||
        text.match(/(?:to|at)\s+(\d+\.?\d*)\s*%.*(?:refi|refinanc)/i);
    if (m) { const v = parseFloat(m[1]); if (v >= 1 && v <= 20) return v; }
    // Two decimal rates in question → second one is target
    const allRates = Array.from(text.matchAll(/(\d+\.\d+)\s*%/g))
        .map(m => parseFloat(m[1])).filter(r => r > 1 && r < 20);
    if (allRates.length >= 2) return allRates[1];
    return null;
}

function extractRemainingMonths(text: string): number {
    const yearsLeftM = text.match(/(\d+)\s*years?\s*left/i) ||
        text.match(/(\d+)\s*years?\s*remaining/i);
    if (yearsLeftM) return parseInt(yearsLeftM[1]) * 12;
    const yearsInM = text.match(/(\d+)\s*years?\s*(?:in|into|ago)/i) ||
        text.match(/(?:bought|purchased|got\s*(?:the\s*)?loan)\s*(\d+)\s*years?\s*ago/i);
    if (yearsInM) return (30 - parseInt(yearsInM[1])) * 12;
    return 360;
}

// v3 — explicit ordered patterns, no regex escaping ambiguity
function extractRentAmount(text: string): number | undefined {
    // Pattern 1: "rent $3,200" or "rental $3,200" — require digit before optional comma
    let m = text.match(/(?:rent(?:s?\s+for)?|rental)\s*\$?\s*(\d[\d,]*\d|\d+)k?/i);
    // Pattern 2: "$3,200/mo rent" — dollar amount before /mo then rent keyword
    if (!m) m = text.match(/\$([\d,]+)\s*\/mo\s+rent/i);
    // Pattern 3: "$3,200/mo" or "$3,200 per month" or "$3,200 monthly rent"
    if (!m) m = text.match(/\$([\d,]+)\s*(?:\/mo|per\s+month|monthly\s+rent)/i);
    // Pattern 4: "3200/mo" no dollar sign
    if (!m) m = text.match(/([\d,]+)\s*\/mo\b/i);
    if (!m) return undefined;
    let v = parseFloat(m[1].replace(/,/g, ''));
    if (v < 100) v *= 1000;
    return v >= 100 && v <= 100000 ? v : undefined;
}

// Pull from conversation history when current question lacks a value
function pullFromHistory(history: string, extractor: (t: string) => any) {
    if (!history) return undefined;
    // Only look in User: lines to avoid pulling from assistant examples
    const userLines = history.split('\n')
        .filter(l => /^\s*(?:User:|Turn \d+\nUser:|You:)/i.test(l.trim()) || l.trim().startsWith('User:'))
        .join(' ');
    return extractor(userLines) ?? extractor(history);
}

// ─────────────────────────────────────────────
// DETECTION FUNCTIONS
// ─────────────────────────────────────────────

export function isRefiQuestion(q: string): boolean {
    return /refinance|refi\b|closing costs?|break[- ]?even|loan balance|remaining.*(year|term|month)|years? left/i.test(q) ||
        // Rate-switch intent without the word "refi": "lower my rate", "drop to 5%", "switch to 5.5%", "afford to go from X% to Y%"
        /(?:lower|reduce|drop|switch|change|go from).{0,30}(?:my\s+)?(?:rate|mortgage|payment).{0,30}\d+\.?\d*\s*%/i.test(q) ||
        /\bfrom\s+\d+\.?\d*\s*%\s+to\s+\d+\.?\d*\s*%/i.test(q);
}

export function isFHAQuestion(q: string): boolean {
    return /\bfha\b|\bufmip\b|\bmip\b.*(?:fha|upfront)|fha.*(?:mip|loan|mortgage)/i.test(q);
}

export function isFHAvsConvQuestion(q: string): boolean {
    return /(?:fha|conventional).*(?:vs|versus|compare|comparison).*(?:conventional|fha)|compare.*(?:fha.*conv|conv.*fha)/i.test(q);
}

export function isDSCRQuestion(q: string): boolean {
    if (isFHAQuestion(q)) return false;
    if (isAffordabilityQuestion(q)) return false;
    return /dscr|debt.?service.?coverage|investment property|cash.?flow|gross rent|pitia/i.test(q) ||
        (/\brent/i.test(q) && /\$[\s\d,]+k?\b/i.test(q) && /home|house|property|loan|mortgage/i.test(q));
}

export function isVAQuestion(q: string): boolean {
    if (isFHAQuestion(q)) return false;
    if (isDSCRQuestion(q)) return false;
    return /\bva\s*(loan|mortgage|home\s*loan|purchase|benefit|entitlement|financing)\b/i.test(q) ||
        /\b(veteran|veterans?|military|service\s*member|active\s*duty|reservist|national\s*guard)\b.{0,40}\b(loan|mortgage|home|buy|purchase|payment)\b/i.test(q) ||
        /\bno\s*down\s*payment\b.{0,30}\b(va|veteran|military)\b/i.test(q) ||
        /\bfunding\s*fee\b/i.test(q) ||
        /\bva\b.{0,10}\b\$[\d,]+[kKmM]?\b/i.test(q);
}

export function isVAEntitlementQuestion(q: string): boolean {
    return /\b(?:still have|active|existing|current|prior|previous|second|another)\b.{0,30}\bva\s*(?:loan|mortgage)\b/i.test(q) ||
        /\bva\s*(?:loan|mortgage).{0,30}\b(?:still have|active|existing|second|another|prior)\b/i.test(q) ||
        /\b(?:two|2)\s*va\s*loans?\b/i.test(q) ||
        /\bsubsequent\s*(?:va\s*)?(?:use|loan|purchase)\b/i.test(q) ||
        /\bentitlement\s*(?:used|remaining|restored|left|available)\b/i.test(q) ||
        /\b(?:remaining|used|available|restore)\s*entitlement\b/i.test(q) ||
        /\bva\b.{0,20}\b(?:entitlement|down\s*payment\s*required|bonus\s*entitlement)\b/i.test(q) ||
        /\bsecond\s*(?:time\s*)?va\b/i.test(q);
}

export function isConventionalQuestion(q: string): boolean {
    if (isFHAQuestion(q)) return false;
    if (isAffordabilityQuestion(q)) return false;
    if (isDSCRQuestion(q)) return false;
    const hasPrice = /\$\s*[\d,]+k?\b/i.test(q);
    const hasMortgageCtx = /home|house|property|loan|mortgage|buying|purchase|condo|townhouse|payment|monthly|piti/i.test(q);
    const hasDown = /\d+\s*%\s*down|\bdown\s*payment\b/i.test(q);
    const isIncomeQualify = /how much income|what income|what salary|income.*(?:need|qualify|required?)|(?:need|qualify).{0,20}income/i.test(q);
    // Dollar amount is salary/income not price — route to affordability
    const isSalaryAmount = /(?:qualify|afford|make|earn|salary|income)\s+(?:on\s+)?\$[\d,]+k?\b|\$[\d,]+k?\s+(?:salary|income|a year|\/year)/i.test(q);
    if (isSalaryAmount) return false;
    const hasRate = /\d+\.\d+\s*%|(?:rate|at)\s+\d+/i.test(q);
    // If income question BUT has specific price + rate + down → route to conventional for income calc
    if (isIncomeQualify && hasPrice && hasRate && hasDown) return true;
    // Price + down% alone is sufficient for a mortgage calculation (no need for explicit loan-type word)
    if (hasPrice && hasDown && !isIncomeQualify) return true;
    return (hasPrice && hasMortgageCtx && !isIncomeQualify);
}

export function isJumboQuestion(q: string): boolean {
    if (isFHAQuestion(q)) return false;
    if (isDSCRQuestion(q)) return false;
    return /\bjumbo\s*(loan|mortgage|financing|purchase)\b/i.test(q) ||
        /\bnon.?conforming\b/i.test(q) ||
        (/\$\s*[\d,]+[kKmM]?\b/.test(q) && /\bjumbo\b/i.test(q));
}

export function isBuydownQuestion(q: string): boolean {
    if (isRefiQuestion(q)) return false;
    return /\bbuy[\s-]?down\b/i.test(q) ||
        /\b(?:2[\s\/\-]1|2-1)\s*(?:buydown|buy[\s-]?down)\b/i.test(q) ||
        /\b(?:1[\s\/]0)\s*(?:buydown|buy[\s-]?down)\b/i.test(q) ||
        /\b3[\s\/]2[\s\/]1\s*(?:buydown|buy[\s-]?down)\b/i.test(q) ||
        /\btemporary\s*(?:rate\s*)?(?:buydown|buy[\s-]?down|rate\s*reduction)\b/i.test(q) ||
        /\bpermanent\s*(?:rate\s*)?(?:buydown|buy[\s-]?down|points?)\b/i.test(q);
}

export function isSellerCreditQuestion(q: string): boolean {
    if (!/seller/i.test(q)) return false;
    return /seller\s*credit|seller\s*concession/i.test(q) ||
        (/seller.*(?:offering|giving|paying|contribut)/i.test(q) && /\$[\d,]+[kKmM]?\b/.test(q));
}

function extractSellerCredit(text: string): number | null {
    const m = text.match(/\$\s*([\d,]+)k?\s+seller\s*credit/i) ||
        text.match(/seller\s*credit\s*(?:of\s*)?\$?\s*([\d,]+)k?/i) ||
        text.match(/seller\s*(?:is\s*)?(?:giving|offering|paying|contribut\w+)\s*\$?\s*([\d,]+)k?/i) ||
        text.match(/\$\s*([\d,]+)k?\s*(?:seller\s*)?(?:credit|concession)\b/i);
    if (!m) return null;
    let v = parseFloat(m[1].replace(/,/g, ''));
    const isK = /\$\s*[\d,]+k\b/i.test(m[0]);
    if (isK && v < 1000) v *= 1000;
    return v >= 1000 && v <= 300000 ? v : null;
}

export type ScenarioComparisonTool = 'down_payment' | 'seller_credit' | 'term' | 'rent_buy';

export function isScenarioComparisonQuestion(q: string): ScenarioComparisonTool | null {
    // Bypass: seeds fired from the "deeper analysis" button are prefixed with [deep-analysis]
    if (/^\[deep-analysis\]/i.test(q)) return null;
    // 5% vs 20% down / down payment comparison
    // NOTE: avoid \b(5.*20) patterns — match "5" in "$1,500,000" as a false positive
    if (/(?:5\s*%|five\s*percent)\s*(?:vs|versus|or|compared\s*to)\s*(?:20\s*%|twenty\s*percent)/i.test(q) ||
        /(?:20\s*%|twenty\s*percent)\s*(?:vs|versus|or|compared\s*to)\s*(?:5\s*%|five\s*percent)/i.test(q) ||
        /compare\s+5\s*%?\s*(?:vs?|versus|or)\s*20\s*%/i.test(q) ||
        /compare\s+20\s*%?\s*(?:vs?|versus|or)\s*5\s*%/i.test(q) ||
        /\bdown\s*payment\s*(comparison|vs|versus)\b/i.test(q) ||
        /compare.*down\s*payment/i.test(q)) return 'down_payment';
    // Rate buydown vs price reduction / seller credit
    if (/\b(rate\s*buydown|buy\s*down\s*(the\s*)?rate|points?\s*vs|seller\s*credit)\b/i.test(q) &&
        /\b(vs|versus|or|price\s*reduction|compared)\b/i.test(q)) return 'seller_credit';
    if (/\b(seller\s*credit|seller\s*concession)\b/i.test(q) &&
        /\b(rate|buydown|points?|reduction)\b/i.test(q)) return 'seller_credit';
    // 15 vs 30 year
    if (/\b15\s*(yr|year).{0,20}(vs|versus|or|compared).{0,20}30\s*(yr|year)\b/i.test(q) ||
        /\b30\s*(yr|year).{0,20}(vs|versus|or|compared).{0,20}15\s*(yr|year)\b/i.test(q) ||
        /\b(15|fifteen)\s*year\s*(vs|versus|or)\s*(30|thirty)\s*year\b/i.test(q)) return 'term';
    // Rent vs buy
    if (/\b(rent\s*(vs|versus|or)\s*buy|buy\s*(vs|versus|or)\s*rent|should\s*i\s*(rent|buy))\b/i.test(q) ||
        /\b(renting\s*vs\s*buying|buying\s*vs\s*renting)\b/i.test(q)) return 'rent_buy';
    return null;
}

export function isLoanLimitsQuestion(q: string): boolean {
    return /\b(?:loan\s*limits?|conforming\s*limits?|high.?balance\s*limits?|jumbo\s*threshold|conforming\s*zone|high.?cost\s*area|fhfa\s*limits?)\b/i.test(q) ||
        /\b(?:stay\s+conforming|conforming\s+vs\s+jumbo|jumbo\s+vs\s+conforming)\b/i.test(q) ||
        /\b(?:ca|california)\s+(?:loan\s*limits?|conforming|high.?balance|jumbo\s+threshold)/i.test(q) ||
        /\b(?:loan\s*limits?|conforming\s*limits?)\s+(?:for|in)\b/i.test(q) ||
        /\bloan\s*limits?\s+for\s+\d{5}\b/i.test(q) ||
        /(?:what|show|look\s*up)\s+(?:are|is)\s+(?:the\s+)?(?:ca|california\s+)?(?:2026\s+)?loan\s+limits?/i.test(q) ||
        /(?:loanLimitsCounty)/i.test(q);
}

export function isAffordabilityQuestion(q: string): boolean {
    if (isFHAQuestion(q)) return false;
    if (isRefiQuestion(q)) return false;
    const triggers = [
        /what can i afford/i,
        // "can I afford" paired with home/property word
        /can i afford\b.{0,40}(?:home|house|property|to buy)/i,
        // "can I afford $650k" — price target without explicit home/house word
        /can i afford\b.{0,20}\$[\d,]+[kKmM]?\b/i,
        /how much (?:home|house|property) can i (?:afford|buy)/i,
        // "afford a $1.8M home" pattern
        /\bafford\b.{0,30}\$[\d,]+[kKmM]?.{0,20}(?:home|house|property)/i,
        /first.?time (?:buyer|home)/i,
        /(?:my|our) budget/i,
        /buying power/i,
        /qualify.*amount/i,
        /afford.*calculator/i,
        /how much (?:can i|do i) qualify/i,
    ];
    if (triggers.some(p => p.test(q))) return true;
    const hasIncome = extractIncome(q) !== undefined;
    const hasSavings = extractSavings(q) !== undefined;
    if (hasIncome && hasSavings) return true;
    // Income + price target is enough — "can I afford $650k on $120k salary"
    const hasPrice = /\$[\d,]+[kKmM]?\b/.test(q);
    if (hasIncome && hasPrice && /afford|qualify|buy|purchase/i.test(q)) return true;
    return false;
}

export function isMIPKnowledgeQuestion(q: string): boolean {
    return /(?:when|how long|does|will|would|can)\s+(?:my\s+)?(?:mip|mortgage insurance).{0,30}(?:drop|cancel|go away|end|expire|stop|remove)/i.test(q) ||
        /(?:get rid of|eliminate|remove)\s+(?:mip|fha mortgage insurance)/i.test(q);
}

export function isLabQuestion(q: string): boolean {
    return /show\s+me\s+the\s+homerates\s+lab/i.test(q);
}

function isUWStarterQuestion(q: string): boolean {
    return /^show\s+me\s+(the\s+)?ask\s+underwriting|^ask\s+underwriting\s+starter|^open\s+(ask\s+underwriting|the\s+homerates\s+underwriting)/i.test(q.trim());
}

function isHowItWorksQuestion(q: string): boolean {
    return /^(how (does |do )?homerates|how it works|how does this work|show me how|tips for|first.time|getting started|what can (i|you) ask|how (do i|should i) use)/i.test(q.trim());
}

function isAboutQuestion(q: string): boolean {
    return /^(what is homerates|heard about homerates|who built homerates|who created homerates|who made homerates|founder of homerates|what makes you different|tell me about this site)/i.test(q.trim());
}

function isAboutTrustQuestion(q: string): boolean {
    return /^about homerates:.*trust|^about homerates:.*conflicting|^about homerates:.*hard to trust/i.test(q.trim());
}

function isAboutDifferenceQuestion(q: string): boolean {
    return /^about homerates:.*different|^about homerates:.*lender|^about homerates:.*chatgpt/i.test(q.trim());
}

function isAboutDataQuestion(q: string): boolean {
    return /^about homerates:.*data|^about homerates:.*fred|^about homerates:.*sources/i.test(q.trim());
}

function isAboutFounderQuestion(q: string): boolean {
    return /^about homerates:.*founder|^about homerates:.*who is|^about homerates:.*built/i.test(q.trim());
}
// ─────────────────────────────────────────────
// MAIN DISPATCHER
// ─────────────────────────────────────────────

export function dispatch(
    question: string,
    conversationHistory: string = '',
    fredRate?: number,
): DispatchResult {
    const q = question;
    const hist = conversationHistory;
    const assumptions: string[] = [];
    const fallbackRate = fredRate ?? 6.5;

    // ── -1. LAB CARD ──
    if (isLabQuestion(q)) {
        return { type: 'lab', params: null, confidence: 1, assumptions: [] };
    }
    if (isHowItWorksQuestion(q)) {
        return { type: 'how_it_works', params: null, confidence: 1, assumptions: [] };
    }
    if (isUWStarterQuestion(q)) {
        return { type: 'uw_starter', params: null, confidence: 1, assumptions: [] };
    }
    if (isAboutQuestion(q)) {
        return { type: 'about', params: null, confidence: 1, assumptions: [] };
    }
    if (isAboutTrustQuestion(q)) {
        return { type: 'about_trust', params: null, confidence: 1, assumptions: [] };
    }
    if (isAboutDifferenceQuestion(q)) {
        return { type: 'about_difference', params: null, confidence: 1, assumptions: [] };
    }
    if (isAboutDataQuestion(q)) {
        return { type: 'about_data', params: null, confidence: 1, assumptions: [] };
    }
    if (isAboutFounderQuestion(q)) {
        return { type: 'about_founder', params: null, confidence: 1, assumptions: [] };
    }
    // ── 0. FOLLOW-UP GUARD ──
    // Questions like "what if price is $450k", "what if rate drops", "same but 10% down"
    // have no explicit loan type — let Grok handle with thread memory context.
    const isFollowUpPhrasing =
        /\bwhat\s+if\b/i.test(q) ||
        /\bwhat\s+about\b/i.test(q) ||
        /\bprice\s+is\s+now\b/i.test(q) ||
        /\bnow\s+\$[\d,]+[kKmM]?\b/i.test(q) ||
        /\binstead\b/i.test(q) ||
        /\bsame\s+(property|home|house|but|scenario)\b/i.test(q) ||
        /\bif\s+(?:i|the|rates?|price)\b.{0,30}\b(?:drop|goes?|change|lower|higher|was|were)\b/i.test(q);

    const hasExplicitLoanType = /\bfha\b|\bconventional\b|\bva\b|\busda\b|\bjumbo\b|\bdscr\b/i.test(q);

    if (isFollowUpPhrasing && !hasExplicitLoanType) {
        // Try to identify prior loan type from history and re-run with merged params
        const histLower = hist.toLowerCase();
        const priorIsRefi = /refi\b|refinanc/.test(histLower);
        const priorIsDSCR = /\bdscr\b|investment property|pitia|dscr.*rent|rent.*dscr/.test(histLower) ||
            (/rent/i.test(histLower) && /pitia|dscr|investment/i.test(histLower));
        const priorIsFHA = !priorIsDSCR && /\bfha\b|\bufmip\b|\bmip\b/.test(histLower);
        const priorIsConventional = !priorIsDSCR && !priorIsFHA && /conventional/.test(histLower);

        // Extract what changed in the follow-up question
        const newPrice = extractPrice(q);
        const newRate = extractRate(q);
        const newDown = extractDownPct(q);
        const newRent = extractRentAmount(q);

        // Pull baseline values from history
        const histPrice = pullFromHistory(hist, extractPrice);
        const histRate = pullFromHistory(hist, extractRate);
        const histDown = extractDownPct(hist);
        const histRent = pullFromHistory(hist, extractRentAmount);

        const mergedPrice = newPrice ?? histPrice;
        const mergedRate = newRate ?? histRate ?? fallbackRate;
        const mergedDown = newDown ?? histDown;
        const mergedRent = newRent ?? histRent;

        if (!mergedPrice && !priorIsRefi) {
            return { type: 'no_calc_match' as CalcType, params: null, confidence: 0, assumptions: [] };
        }

        if (newRate && newRate !== histRate) assumptions.push(`rate updated to ${newRate}%`);
        if (newPrice && newPrice !== histPrice) assumptions.push(`price updated to $${newPrice.toLocaleString()}`);
        if (newDown && newDown !== histDown) assumptions.push(`down payment updated to ${newDown}%`);

        if (priorIsRefi) {
            return {
                type: 'dscr',
                params: {
                    purchasePrice: mergedPrice,
                    grossMonthlyRent: mergedRent,
                    downPaymentPct: mergedDown ?? 25,
                    annualRatePct: mergedRate,
                    vacancyRate: 0,
                } as DSCRInput,
                confidence: 0.9,
                assumptions,
            };
        }

        if (priorIsFHA && mergedPrice) {
            return {
                type: 'fha',
                params: {
                    purchasePrice: mergedPrice,
                    downPaymentPct: mergedDown ?? 3.5,
                    annualRatePct: mergedRate,
                } as FHAInput,
                confidence: 0.9,
                assumptions,
            };
        }

        if (mergedPrice) {
            return {
                type: 'conventional',
                params: {
                    purchasePrice: mergedPrice,
                    downPaymentPct: mergedDown ?? 20,
                    annualRatePct: mergedRate,
                } as ConventionalInput,
                confidence: 0.9,
                assumptions,
            };
        }

        return { type: 'no_calc_match' as CalcType, params: null, confidence: 0, assumptions: [] };
    }

    // ── 0. HOMEOWNER ANALYSIS — broad multi-factor query, always route to web/Grok ──
    if (/homeowner analysis|run a complete.*analysis.*for|complete homeowner/i.test(q)) {
        return { type: 'no_calc_match' as CalcType, params: null, confidence: 0, assumptions: [] };
    }

    // ── 0a. HOMEOWNER EQUITY / PAYOFF CONTEXT — seeded from my-home milestones/equity CTAs ──
    // These queries contain dollar amounts that are equity/balance figures, NOT purchase prices.
    // Must be caught before extractPrice() runs or they dispatch as conventional purchase loans.

    // "HELOC on <address/property> — property value $X, balance $Y, max line $Z"
    // Seeded from RefiIntelligenceCard HELOC chip — dollar amounts are equity figures, NOT purchase prices.
    // Must intercept before extractPrice() grabs $2.3M as a jumbo purchase.
    if (/^heloc\s+on\b/i.test(q)) {
        return { type: 'no_calc_match' as CalcType, params: null, confidence: 0, assumptions: [] };
    }

    // Payoff trajectory / HELOC comparison / rate impact — pure Grok analysis
    if (
        /payoff.*(?:plan|trajectory|acceleration|milestones)|wealth.?building milestones/i.test(q) ||
        /equity trajectory|current equity.*(?:mortgage|payoff|balance)/i.test(q) ||
        /(?:heloc|cash.?out).*(compare|vs|versus).*refi|refi.*(compare|vs|versus).*(?:heloc|cash.?out)/i.test(q) ||
        /how do (?:rates?|current).+(?:affect|impact).*(?:refi|heloc|equity|options)/i.test(q)
    ) {
        return { type: 'no_calc_match' as CalcType, params: null, confidence: 0, assumptions: [] };
    }

    // "Equity options for <address>: value X, balance Y ... HELOC, cash-out refi, or sell?"
    // Route to refi card (cash-out) with balance pre-filled from seed — avoids Grok asking for data already provided
    if (/equity options.*(?:heloc|cash.?out|sell)/i.test(q)) {
        const balance = extractBalance(q) ?? null;
        return {
            type: 'refi_needs_input' as CalcType,
            params: { refiType: 'cash_out', parsedBalance: balance, parsedCurrentRate: null, parsedNewRate: null } as RefiNeedsInput,
            confidence: 0,
            assumptions: balance ? [`Balance $${balance.toLocaleString()} extracted from equity seed`] : [],
        };
    }

    // ── 1. REFI (highest priority — must run before affordability/conventional) ──
    if (isRefiQuestion(q)) {
        const balance = extractBalance(q) ?? extractBalance(hist) ?? null;
        const currentRate = extractCurrentRate(q) ?? null;
        const newRate = extractNewRate(q) ?? null;
        const remaining = extractRemainingMonths(q);
        const costs = q.match(/(?:costs?|closing costs?|fees?)\s*\$?\s*([\d,]+)/i)
            ? parseFloat(q.match(/(?:costs?|closing costs?|fees?)\s*\$?\s*([\d,]+)/i)![1].replace(/,/g, ''))
            : undefined;
        const isFHAtoConv = /fha.{0,20}(?:conventional|conv)|remove\s*mip|drop\s*mip/i.test(q);

        if (!balance || !currentRate) {
            const refiType = /cash.?out/i.test(q) ? 'cash_out'
                : isFHAtoConv ? 'fha_to_conv'
                    : /arm|5\/1|7\/1|10\/1|adjustable/i.test(q) ? 'arm_to_fixed'
                        : /streamline|irrrl/i.test(q) ? 'streamline'
                            : /shorten|15.year|20.year/i.test(q) ? 'shorten'
                                : 'rate_term';
            return {
                type: 'refi_needs_input',
                params: { refiType, parsedBalance: balance, parsedCurrentRate: currentRate, parsedNewRate: newRate } as RefiNeedsInput,
                confidence: 0,
                assumptions: [],
            };
        }

        const effNewRate = newRate ?? (fredRate ? Math.max(fredRate - 0.001, currentRate - 0.5) : currentRate - 0.5);
        if (effNewRate !== newRate) assumptions.push(`target rate assumed ${effNewRate.toFixed(2)}% (FRED - 0.5%)`);
        if (remaining === 360) assumptions.push('term assumed 30yr remaining');

        return {
            type: 'refi',
            params: {
                currentBalance: balance,
                currentRatePct: currentRate,
                newRatePct: effNewRate,
                remainingMonths: remaining,
                closingCosts: costs,
                isFHAtoConv,
            } as RefiInput,
            confidence: newRate ? 1.0 : 0.85,
            assumptions,
        };
    }

    // ── 2. FHA vs CONVENTIONAL ──
    if (isFHAvsConvQuestion(q)) {
        const price = extractPrice(q) ?? pullFromHistory(hist, extractPrice);
        if (!price) {
            return { type: 'fha_needs_input', params: { parsedPrice: null, parsedRate: null }, confidence: 0, assumptions: [] };
        }
        const rate = extractRate(q) ?? pullFromHistory(hist, extractRate) ?? fallbackRate;
        const fhaDown = extractDownPct(q) ?? 3.5;
        const convDown = q.match(/conventional\s+(\d+)\s*%\s*down/i)
            ? parseFloat(q.match(/conventional\s+(\d+)\s*%\s*down/i)![1]) : 5;
        const allRates = Array.from(q.matchAll(/(\d+\.\d+)\s*%/g)).map(m => parseFloat(m[1])).filter(r => r > 2 && r < 15);
        const convRate = allRates.length > 1 ? allRates[1] : rate;
        const { fhaLimit, confLimit } = detectLoanLimits(q + ' ' + hist);
        if (rate === fallbackRate) assumptions.push(`rate assumed ${fallbackRate}% (FRED avg)`);

        return {
            type: 'fha_vs_conv',
            params: {
                purchasePrice: price,
                annualRatePct: rate,
                fhaDownPct: fhaDown,
                convDownPct: convDown,
                convRatePct: convRate,
                annualIncome: extractIncome(q) ?? pullFromHistory(hist, extractIncome),
                monthlyDebts: extractMonthlyDebts(q),
            } as FHAvsConvInput,
            confidence: 1.0,
            assumptions,
        };
    }

    // ── 3. FHA ──
    if (isFHAQuestion(q) && !isLoanLimitsQuestion(q)) {
        // Income-needed queries ("what income do I need for FHA?") — reverse-calc lives in route.ts
        // affordability path; must NOT be handled by the FHA payment calc here.
        const _isIncomeNeeded = /(?:what|how much)\s+income.{0,30}(?:need|qualify|required)/i.test(q) ||
            /(?:what|how much)\s+salary.{0,30}(?:need|qualify|required)/i.test(q) ||
            /income.{0,20}(?:need|required).{0,20}(?:qualify|home|house|mortgage)/i.test(q);
        if (_isIncomeNeeded) return { type: 'no_calc_match' as CalcType, params: null, confidence: 0, assumptions: [] };

        // MIP duration knowledge question — no calc needed
        if (isMIPKnowledgeQuestion(q)) {
            return { type: 'mip_duration_knowledge', params: null, confidence: 1.0, assumptions: [] };
        }

        let price = extractPrice(q);
        if (!price) price = pullFromHistory(hist, extractPrice);
        if (!price) {
            return { type: 'fha_needs_input', params: { parsedPrice: null, parsedRate: extractRate(q) ?? null } as FHANeedsInput, confidence: 0, assumptions: [] };
        }

        let rate = extractRate(q);
        if (!rate) rate = pullFromHistory(hist, extractRate);
        if (!rate) { rate = fallbackRate; assumptions.push(`rate assumed ${fallbackRate}% (FRED avg)`); }

        let downPct = extractDownPct(q) ?? extractDownPct(hist) ?? 3.5;
        if (downPct === 3.5) assumptions.push('down payment assumed 3.5% (FHA minimum)');

        const { fhaLimit } = detectLoanLimits(q + ' ' + hist);

        return {
            type: 'fha',
            params: {
                purchasePrice: price,
                downPaymentPct: downPct,
                annualRatePct: rate,
                creditScore: extractCreditScore(q) ?? extractCreditScore(hist),
                propertyTaxRate: extractTaxRate(q) ?? extractTaxRate(hist),
                annualIncome: extractIncome(q) ?? pullFromHistory(hist, extractIncome),
                monthlyDebts: extractMonthlyDebts(q),
                fhaLoanLimit: fhaLimit,
            } as FHAInput,
            confidence: 1.0,
            assumptions,
        };
    }

    // ── 4. DSCR / INVESTMENT ──
    if (isDSCRQuestion(q)) {
        const price = extractPrice(q);
        const rent = extractRentAmount(q);
        if (!price || !rent) {
            return { type: 'dscr_needs_input', params: null, confidence: 0, assumptions: [] };
        }
        const _dscrExtractedRate = extractRate(q);
        const _dscrFallback = fredRate != null
            ? parseFloat((fredRate + 0.5).toFixed(2))
            : parseFloat((fallbackRate + 0.5).toFixed(2));
        const rate = _dscrExtractedRate ?? _dscrFallback;
        const downPct = extractDownPct(q) ?? 25;
        const taxRate = extractTaxRate(q);
        if (_dscrExtractedRate == null) assumptions.push(`rate ${rate}% (FRED 30yr avg + 0.5% DSCR premium)`);
        if (downPct === 25) assumptions.push('down payment assumed 25% (DSCR standard)');

        return {
            type: 'dscr',
            params: {
                purchasePrice: price,
                grossMonthlyRent: rent,
                downPaymentPct: downPct,
                annualRatePct: rate,
                vacancyRate: 0,
                propertyTaxRate: taxRate ? taxRate : undefined,
            } as DSCRInput,
            confidence: 1.0,
            assumptions,
        };
    }

    // ── 4b. SELLER CREDIT ALLOCATOR — before VA so "VA purchase with $55K seller credit" routes here ──
    if (isSellerCreditQuestion(q) && !isAffordabilityQuestion(q) && !isRefiQuestion(q)) {
        const price  = extractPrice(q) ?? pullFromHistory(hist, extractPrice) ?? null;
        const credit = extractSellerCredit(q) ?? extractSellerCredit(hist) ?? null;
        const rate   = extractRate(q) ?? pullFromHistory(hist, extractRate) ?? fallbackRate;
        const vaHint = isVAQuestion(q) || /\bva\b.*(?:loan|purchase)|veteran/i.test(hist);
        const downPct = extractDownPct(q) ?? (vaHint ? 0 : 20);
        const loanAmt = price ? Math.round(price * (1 - downPct / 100) * (vaHint ? 1.0215 : 1.0)) : null;
        if (price && credit && loanAmt) {
            if (rate === fallbackRate) assumptions.push(`rate assumed ${fallbackRate}% (FRED avg)`);
            if (vaHint) assumptions.push('VA loan — 2.15% funding fee financed into loan amount');
            return {
                type: 'seller_credit',
                params: {
                    purchasePrice: price,
                    loanAmount:    loanAmt,
                    sellerCredit:  credit,
                    annualRatePct: rate,
                    isVA:          vaHint,
                    annualTax:     price * 0.011,
                    annualInsurance: price * 0.005,
                } as SellerCreditInput,
                confidence: 0.95,
                assumptions,
            };
        }
    }

    // ── 4c. BUYDOWN ANALYZER — before VA so "VA 2/1 buydown" routes here ──
    if (isBuydownQuestion(q) && !isAffordabilityQuestion(q) && !isRefiQuestion(q)) {
        const price  = extractPrice(q) ?? pullFromHistory(hist, extractPrice) ?? null;
        const rate   = extractRate(q) ?? pullFromHistory(hist, extractRate) ?? fallbackRate;
        const credit = extractSellerCredit(q) ?? extractSellerCredit(hist) ?? undefined;
        const vaHint = isVAQuestion(q) || /\bva\b.*(?:loan|purchase)|veteran/i.test(hist);
        const downPct = extractDownPct(q) ?? (vaHint ? 0 : 20);
        const loanAmt = price ? Math.round(price * (1 - downPct / 100) * (vaHint ? 1.0215 : 1.0)) : null;
        if (price && loanAmt) {
            if (rate === fallbackRate) assumptions.push(`rate assumed ${fallbackRate}% (FRED avg)`);
            if (vaHint) assumptions.push('VA loan — 2.15% funding fee financed into loan amount');
            return {
                type: 'buydown',
                params: {
                    purchasePrice: price,
                    loanAmount:    loanAmt,
                    annualRatePct: rate,
                    buydownType:   /3[\s\/]2[\s\/]1/i.test(q) ? '3/2/1' : /\b1[\s\/]0\b/i.test(q) ? '1/0' : '2/1',
                    isVA:          vaHint,
                    sellerCredit:  credit,
                    annualTax:     price * 0.011,
                    annualInsurance: price * 0.005,
                } as BuydownInput,
                confidence: 0.95,
                assumptions,
            };
        }
    }

    // ── 5a. VA ENTITLEMENT (subsequent use) — must precede generic VA ──
    if (isVAEntitlementQuestion(q)) {
        const price  = extractPrice(q) ?? pullFromHistory(hist, extractPrice);
        const rate   = extractRate(q) ?? pullFromHistory(hist, extractRate) ?? fallbackRate;
        // Extract prior balance from text: "prior balance of $500k", "still owe $400k", "balance of $X"
        const priorMatch = q.match(/(?:prior|previous|existing|current|owe|balance|outstanding)[^\d$]*\$?\s*([\d,]+)\s*[kKmM]?/i)
            ?? q.match(/\$\s*([\d,]+)\s*[kKmM]?\s*(?:balance|remaining|outstanding|left|owed)/i);
        const priorRaw = priorMatch ? parseFloat(priorMatch[1].replace(/,/g, '')) : null;
        const priorMult = priorMatch?.[0]?.match(/[kK]/) ? 1000 : priorMatch?.[0]?.match(/[mM]/) ? 1000000 : 1;
        const priorBalance = priorRaw ? priorRaw * priorMult : null;

        if (!price || priorBalance === null) {
            return { type: 'va_entitlement_needs_input', params: { price: price ?? null, priorBalance }, confidence: 0, assumptions: [] };
        }
        if (rate === fallbackRate) assumptions.push(`rate assumed ${fallbackRate}% (FRED avg)`);

        return {
            type: 'va_entitlement',
            params: { purchasePrice: price, priorLoanBalance: priorBalance, annualRatePct: rate },
            confidence: 0.95,
            assumptions,
        };
    }

    // ── 5. VA ──
    if (isVAQuestion(q)) {
        const price = extractPrice(q) ?? pullFromHistory(hist, extractPrice);
        if (!price) {
            return { type: 'va_needs_input', params: null, confidence: 0, assumptions: [] };
        }
        const rate    = extractRate(q) ?? pullFromHistory(hist, extractRate) ?? fallbackRate;
        const downPct = extractDownPct(q) ?? 0;
        const exempt  = /exempt|disability|disabled/i.test(q);
        if (rate === fallbackRate) assumptions.push(`rate assumed ${fallbackRate}% (FRED avg)`);
        if (downPct === 0) assumptions.push('no down payment (VA default)');

        return {
            type: 'va',
            params: {
                purchasePrice:     price,
                downPaymentPct:    downPct,
                annualRatePct:     rate,
                fundingFeeExempt:  exempt,
                annualIncome:      extractIncome(q) ?? pullFromHistory(hist, extractIncome),
                monthlyDebts:      extractMonthlyDebts(q),
                propertyTaxRate:   extractTaxRate(q) ?? extractTaxRate(hist),
            } as VAInput,
            confidence: 1.0,
            assumptions,
        };
    }

    // ── 6. LOAN LIMITS (CA 2026) ──
    if (isLoanLimitsQuestion(q)) {
        return { type: 'loan_limits', params: null, confidence: 1.0, assumptions: [] };
    }

    // ── 7. JUMBO ──
    if (isJumboQuestion(q) && !isAffordabilityQuestion(q)) {
        const price = extractPrice(q) ?? pullFromHistory(hist, extractPrice);
        if (!price) {
            return { type: 'jumbo_needs_input', params: null, confidence: 0, assumptions: [] };
        }
        const _jumboExtractedRate = extractRate(q) ?? pullFromHistory(hist, extractRate);
        const rate    = _jumboExtractedRate ?? fallbackRate;
        const downPct = Math.max(20, extractDownPct(q) ?? 20);
        const loanAmt = price * (1 - downPct / 100);
        // If loan is conforming, fall through to conventional even if user said "jumbo".
        // Above $832,750 with explicit "jumbo" keyword → honour the request and route to jumbo card.
        if (loanAmt <= 832_750) {
            // fall through to conventional path
        } else {
            if (_jumboExtractedRate == null) assumptions.push(`rate assumed ${rate}% (FRED 30yr avg)`);
            if (downPct === 20) assumptions.push('down payment assumed 20% (jumbo minimum)');

            return {
                type: 'jumbo',
                params: {
                    purchasePrice:   price,
                    downPaymentPct:  downPct,
                    annualRatePct:   rate,
                    termYears:       30,
                    annualIncome:    extractIncome(q) ?? pullFromHistory(hist, extractIncome),
                    monthlyDebts:    extractMonthlyDebts(q),
                    propertyTaxRate: extractTaxRate(q) ?? extractTaxRate(hist),
                } as JumboInput,
                confidence: 1.0,
                assumptions,
            };
        }
    }

    // ── 7. IMPLICIT JUMBO — must run BEFORE conventional so high-price questions
    //    like "$1.5M, 25% down" don't fall into the conventional path first.
    //    Guard: skip if this is an affordability question — "can I afford $1.8M?" should
    //    route to affordability, not jumbo.
    //    Guard: loan must exceed the CA high-balance ceiling ($1,249,125) to be true jumbo.
    //    Loans in the $832k–$1.249M range may qualify as High Balance in many CA counties —
    //    route those to conventional (convHBSlider) so the card can prompt for county.
    if (!isAffordabilityQuestion(q)) {
        const _impliedPrice = extractPrice(q) ?? pullFromHistory(hist, extractPrice);
        if (_impliedPrice && _impliedPrice > 833_000) {
            const _impliedDown = Math.max(20, extractDownPct(q) ?? 20);
            const _impliedLoan = _impliedPrice * (1 - _impliedDown / 100);
            if (_impliedLoan > 1_249_125) {
                const _iRate = extractRate(q) ?? pullFromHistory(hist, extractRate) ?? fallbackRate;
                if (_iRate === fallbackRate) assumptions.push(`rate assumed ${fallbackRate}% (FRED avg)`);
                return {
                    type: 'jumbo',
                    params: {
                        purchasePrice:   _impliedPrice,
                        downPaymentPct:  _impliedDown,
                        annualRatePct:   _iRate,
                        termYears:       30,
                        annualIncome:    extractIncome(q) ?? pullFromHistory(hist, extractIncome),
                        monthlyDebts:    extractMonthlyDebts(q),
                        propertyTaxRate: extractTaxRate(q) ?? extractTaxRate(hist),
                    } as JumboInput,
                    confidence: 0.9,
                    assumptions,
                };
            }
        }
    }

    // ── 8. CONVENTIONAL ──
    if (isConventionalQuestion(q)) {
        const price = extractPrice(q);
        if (!price) return { type: 'conventional' as CalcType, params: null, confidence: 0, assumptions: [] };
        const rate = extractRate(q) ?? fallbackRate;
        const downPct = extractDownPct(q) ?? 20;
        if (rate === downPct ? false : rate === fallbackRate) assumptions.push(`rate assumed ${fallbackRate}% (FRED avg)`);
        if (downPct === 20) assumptions.push('down payment assumed 20%');

        return {
            type: 'conventional',
            params: {
                purchasePrice: price,
                downPaymentPct: downPct,
                annualRatePct: rate,
                annualIncome: extractIncome(q),
                monthlyDebts: extractMonthlyDebts(q),
                propertyTaxRate: extractTaxRate(q),
            } as ConventionalInput,
            confidence: 1.0,
            assumptions,
        };
    }

    // ── 8. AFFORDABILITY ──
    if (isAffordabilityQuestion(q)) {
        const income = extractIncome(q);
        const savings = extractSavings(q);
        if (!income && !savings) {
            return { type: 'affordability_needs_input', params: null, confidence: 0, assumptions: [] };
        }
        const rate = extractRate(q) ?? fallbackRate;
        const downOverride = extractDownPct(q);
        const { fhaLimit, confLimit, locationLabel } = detectLoanLimits(q + ' ' + hist);
        if (rate === fallbackRate) assumptions.push(`rate assumed ${fallbackRate}% (FRED avg)`);

        return {
            type: 'affordability',
            params: {
                annualIncome: income ?? 0,
                savings: savings ?? 0,
                monthlyDebts: extractMonthlyDebts(q),
                annualRatePct: rate,
                downPctOverride: downOverride ? downOverride / 100 : undefined,
                fhaLoanLimit: fhaLimit,
                confLoanLimit: confLimit,
                locationLabel,
            } as AffordabilityInput,
            confidence: income ? 1.0 : 0.7,
            assumptions,
        };
    }

    // No calc type matched — let UW / Grok handle it
    return { type: 'no_calc_match' as CalcType, params: null, confidence: 0, assumptions: [] };
}

// version: (new)
// version: calcDispatcher-2026-03-08-01