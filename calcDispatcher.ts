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
    | 'fha'
    | 'fha_vs_conv'
    | 'conventional'
    | 'affordability'
    | 'dscr'
    | 'refi_needs_input'
    | 'fha_needs_input'
    | 'affordability_needs_input'
    | 'dscr_needs_input'
    | 'mip_duration_knowledge';

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
        return { fhaLimit: 832750, confLimit: 832750, locationLabel: 'mid-cost area' };
    }
    return { fhaLimit: FHA_FLOOR_2026, confLimit: CONF_STANDARD, locationLabel: '' };
}

// ─────────────────────────────────────────────
// PARAM EXTRACTORS — regex only, no LLM
// ─────────────────────────────────────────────

function extractPrice(text: string): number | undefined {
    const t = text.toLowerCase();
    // Full number: $515,000 or $1,200,000
    const fullMatch = text.match(/\$\s*([\d,]{6,})/);
    if (fullMatch) {
        const v = parseFloat(fullMatch[1].replace(/,/g, ''));
        if (v >= 50000 && v <= 10000000) return v;
    }
    // Context-anchored: "$500k home", "purchase price $500k", "$500K property"
    const ctxMatch = text.match(/\$?\s*([\d,]+)k?\s*(?:home|house|property|purchase)/i) ||
        text.match(/(?:price|purchase|home|house|property)[^$]*\$?\s*([\d,]+)k?/i);
    if (ctxMatch) {
        const v = parseFloat(ctxMatch[1].replace(/,/g, ''));
        const val = v < 10000 ? v * 1000 : v;
        if (val >= 50000 && val <= 10000000) return val;
    }
    // Bare $Xk — only if >= $50k and not income context
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
        if (v >= 50000 && v <= 10000000) return v;
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
    // Decimal "at X.XX%" — decimals only (whole numbers are usually down pcts)
    m = text.match(/\bat\s+(\d+\.\d+)\s*%(?!\s*down)/i);
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
        text.match(/[\$]?\s*([\d,]+)\s*k?\s*(?:saved|in savings|in the bank|available|liquid)/i);
    if (!m) return undefined;
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

function extractRentAmount(text: string): number | undefined {
    const m = text.match(/(?:rent(?:s?\s+for)?|rental)\s*\$?\s*([\d,]+)k?/i) ||
        text.match(/\$?\s*([\d,]+)\s*k?\s*(?:\/mo|per month|monthly rent|rent)/i);
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
    return /refinance|refi\b|closing costs?|break[- ]?even|loan balance|remaining.*(year|term|month)|years? left/i.test(q);
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
        (/rent/i.test(q) && /\$[\s\d,]+k?\b/i.test(q) && /home|house|property|loan|mortgage/i.test(q));
}

export function isConventionalQuestion(q: string): boolean {
    if (isFHAQuestion(q)) return false;
    if (isAffordabilityQuestion(q)) return false;
    if (isDSCRQuestion(q)) return false;
    const hasPrice = /\$\s*[\d,]+k?\b/i.test(q);
    const hasMortgageCtx = /home|house|property|loan|mortgage|buying|purchase|condo|townhouse/i.test(q);
    const isIncomeQualify = /how much income|what income|what salary|income.*(?:need|qualify|required?)/i.test(q);
    return (hasPrice && hasMortgageCtx && !isIncomeQualify);
}

export function isAffordabilityQuestion(q: string): boolean {
    if (isFHAQuestion(q)) return false;
    if (isRefiQuestion(q)) return false;
    const triggers = [
        /what can i afford/i,
        /how much (?:home|house|property) can i (?:afford|buy)/i,
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
    return hasIncome && hasSavings;
}

export function isMIPKnowledgeQuestion(q: string): boolean {
    return /(?:when|how long|does|will|would|can)\s+(?:my\s+)?(?:mip|mortgage insurance).{0,30}(?:drop|cancel|go away|end|expire|stop|remove)/i.test(q) ||
        /(?:get rid of|eliminate|remove)\s+(?:mip|fha mortgage insurance)/i.test(q);
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
    if (isFHAQuestion(q) || (
        // FHA follow-up: prior conversation was FHA + current question adjusts down pct
        /\b(\d+)\s*%\s*down\b|show me.*down|down payment/i.test(q) &&
        /\bfha\b|\bmip\b|\bufmip\b/i.test(hist)
    )) {
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
        const rate = extractRate(q) ?? fallbackRate;
        const downPct = extractDownPct(q) ?? 25;
        const taxRate = extractTaxRate(q);
        if (rate === fallbackRate) assumptions.push(`rate assumed ${fallbackRate}% (FRED avg)`);
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

    // ── 5. CONVENTIONAL ──
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

    // ── 6. AFFORDABILITY ──
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

    // No calc type matched
    return { type: 'affordability_needs_input' as CalcType, params: null, confidence: 0, assumptions: [] };
}

// version: (new)
// version: calcDispatcher-2026-03-08-01