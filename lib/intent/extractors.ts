/**
 * lib/intent/extractors.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical regex-based param extractors for natural-language mortgage queries.
 *
 * Single source of truth — imported by calcDispatcher.ts, route.ts, and any
 * future handler modules.  No duplication.
 *
 * BUG FIX vs previous versions:
 *   extractMonthlyDebts() previously used (\d+) which stopped at commas,
 *   returning 550 for "$1,550/mo in existing debts".
 *   All patterns now use ([\d,]+) + replace(/,/g,'') to handle formatted numbers.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true when the user states a loan amount rather than a purchase price.
 * e.g. "$832,750 loan amount", "loan amount of $950k", "borrowing $800k"
 */
export function isLoanAmountInput(text: string): boolean {
    // Explicit loan amount keywords or L/A shorthand
    if (/\b(?:loan\s+amount|loan\s+of\s+\$|loan\s+size|borrow(?:ing)?|L\/A)\b/i.test(text)) return true;
    // Conforming/high-balance limit values — almost always referenced as loan amounts, not prices
    const m = text.match(/\$\s*([\d,]+)/);
    if (m) {
        const val = parseInt(m[1].replace(/,/g, ''), 10);
        if ([802_650, 832_750, 1_089_300, 1_149_825].includes(val)) return true;
    }
    return false;
}

/**
 * Pull a value from conversation history when the current question lacks it.
 * Only scans User: lines to avoid grabbing assistant example values.
 */
export function pullFromHistory(
    history: string,
    extractor: (t: string) => any,
): ReturnType<typeof extractor> {
    if (!history) return undefined;
    const userLines = history
        .split('\n')
        .filter(l => /^\s*(?:User:|Turn \d+\nUser:|You:)/i.test(l.trim()) || l.trim().startsWith('User:'))
        .join(' ');
    return extractor(userLines) ?? extractor(history);
}

// ── Purchase / Property ───────────────────────────────────────────────────────

export function extractPrice(text: string): number | undefined {
    // "$2M" / "$1.5M"
    const mMatch = text.match(/\$\s*([\d,]+(?:\.\d+)?)\s*[mM]\b/);
    if (mMatch) {
        const v = parseFloat(mMatch[1].replace(/,/g, '')) * 1_000_000;
        if (v >= 500_000 && v <= 50_000_000) return v;
    }
    // "1.5 million"
    const millionMatch = text.match(/([\d,]+(?:\.\d+)?)\s*million/i);
    if (millionMatch) {
        const v = parseFloat(millionMatch[1].replace(/,/g, '')) * 1_000_000;
        if (v >= 500_000 && v <= 50_000_000) return v;
    }
    // Full number: $515,000
    const fullMatch = text.match(/\$\s*([\d,]{6,})/);
    if (fullMatch) {
        const v = parseFloat(fullMatch[1].replace(/,/g, ''));
        if (v >= 50_000 && v <= 50_000_000) return v;
    }
    // Bare $Xk — exclude income context
    const incomeRe = /(?:income|salary|earn|make|making)\s{0,5}\$[\d,]+\s*k\b|\$[\d,]+\s*k(?:[\s\/](?:yr?|year))?\s{0,5}(?:income|salary)\b|\$[\d,]+\s*k\s*\/yr?\b/i;
    const bareMatches = Array.from(text.matchAll(/\$([\d,]+)\s*k\b/gi));
    const best = bareMatches.find(m => {
        const v = parseFloat(m[1].replace(/,/g, ''));
        if (v < 50) return false;
        const idx = m.index ?? 0;
        const surround = text.slice(Math.max(0, idx - 15), idx + m[0].length + 20);
        return !incomeRe.test(surround);
    });
    if (best) {
        const v = parseFloat(best[1].replace(/,/g, '')) * 1000;
        if (v >= 50_000 && v <= 50_000_000) return v;
    }
    // Context-anchored fallback
    const ctxMatch =
        text.match(/\$?\s*([\d,]+)k?\s*(?:home|house|property|purchase)/i) ||
        text.match(/(?:price|purchase|home|house|property)[^$\n]{0,40}\$?\s*([\d,]+)k?(?!\s*\/mo)/i);
    if (ctxMatch) {
        const v = parseFloat(ctxMatch[1].replace(/,/g, ''));
        const val = v < 10000 ? v * 1000 : v;
        if (val >= 50_000 && val <= 50_000_000) return val;
    }
    return undefined;
}

export function extractDownPct(text: string): number | undefined {
    const m =
        text.match(/(\d+\.?\d*)\s*%\s*down/i) ||
        text.match(/down\s*(?:payment)?\s*(?:of\s*)?(\d+\.?\d*)\s*%/i) ||
        text.match(/(?:put|with)\s+(\d+\.?\d*)\s*%/i);
    return m ? parseFloat(m[1]) : undefined;
}

export function extractRate(text: string): number | undefined {
    let m = text.match(/(?:rate|interest)\s*(?:of\s*)?(\d+\.?\d*)\s*%/i);
    if (m) { const v = parseFloat(m[1]); if (v >= 2 && v <= 15) return v; }
    m = text.match(/\bat\s+(\d+\.?\d*)\s*%(?!\s*down)/i);
    if (m) { const v = parseFloat(m[1]); if (v >= 2 && v <= 15) return v; }
    m = text.match(/(\d+\.\d+)\s*%\s*(?:rate|interest|fixed|30.?year)/i);
    if (m) { const v = parseFloat(m[1]); if (v >= 2 && v <= 15) return v; }
    return undefined;
}

export function extractIncome(text: string): number | undefined {
    const m =
        text.match(/(?:i\s+earn|i\s+make|we\s+make|make|earn)\s+[\$]?\s*([\d,]+)\s*k?\b/i) ||
        text.match(/[\$]\s*([\d,]+)\s*k?\s*(?:\/yr?|\/year|income|salary|a\s+year|per\s+year|annually)/i) ||
        text.match(/(?:salary|income)\s+(?:is\s+|of\s+)?[\$]?\s*([\d,]+)\s*k?\b/i) ||
        text.match(/[\$]\s*([\d,]+)\s*k\s*\/yr?\b/i);
    if (!m) return undefined;
    let v = parseFloat(m[1].replace(/,/g, ''));
    if (v < 1000) v *= 1000;
    return v >= 20_000 && v <= 2_000_000 ? v : undefined;
}

export function extractSavings(text: string): number | undefined {
    const m =
        text.match(/(?:have|saved|savings|got)\s+[\$]?\s*([\d,]+)\s*k?\s*(?:saved|in savings)?/i) ||
        text.match(/[\$]?\s*([\d,]+)\s*k?\s*(?:savings|saved|in savings|in the bank|available|liquid)/i);
    if (!m) return undefined;
    const idx = m.index ?? 0;
    const surrounding = text.slice(Math.max(0, idx - 5), idx + m[0].length + 25);
    if (/\/mo|per month|monthly|in debt|in loan|car payment|student loan|debt payment/i.test(surrounding)) {
        return undefined;
    }
    let v = parseFloat(m[1].replace(/,/g, ''));
    if (v < 1000) v *= 1000;
    return v >= 1000 && v <= 10_000_000 ? v : undefined;
}

/**
 * Extract monthly debt obligation.
 *
 * FIX: previous versions used (\d+) which stopped at commas.
 * "$1,550/mo in existing debts" returned 550 instead of 1550.
 * All patterns now use ([\d,]+) + parseFloat(...replace(/,/g,'')) to handle
 * formatted numbers.
 */
export function extractMonthlyDebts(text: string): number {
    const m =
        // "$1,550 car payment" / "$800 debt payment"
        text.match(/\$\s*([\d,]+)\s*(?:car|student|debt|loan)\s*payment/i) ||
        // "$1,550/mo in existing debts" — dollar-prefixed, /mo, then debt context
        text.match(/\$\s*([\d,]+)\s*\/mo\s+in\s+(?:\w+\s+)?(?:debt|obligation|payment)/i) ||
        // "$1,550/mo" followed anywhere by debt keyword (bounded to 40 chars)
        text.match(/\$\s*([\d,]+)\s*(?:\/mo|per month|monthly).{0,40}(?:debt|car|student|obligation)/i) ||
        // bare number before /mo + debt context
        text.match(/([\d,]+)\s*(?:\/mo|per month|monthly)\s*(?:in\s*)?(?:debt|payments?)/i) ||
        // debt/loan keyword before number
        text.match(/(?:car|student|debt|loan)\s*payment[^$\n]*\$?\s*([\d,]+)/i) ||
        // "$800 car payment" compound phrase
        text.match(/\$\s*([\d,]+)\s*(?:car payment|student loan|debt payment|loan payment)/i);
    return m ? parseFloat(m[1].replace(/,/g, '')) : 0;
}

export function extractCreditScore(text: string): number | undefined {
    const m = text.match(/(?:credit score|fico|score)\s*(?:is\s*|of\s*)?(\d{3})/i);
    return m ? parseInt(m[1]) : undefined;
}

export function extractTaxRate(text: string): number | undefined {
    const m = text.match(/(?:property tax|tax rate|tax)\s*(?:is\s*|of\s*)?(\d+\.?\d*)\s*%/i);
    return m ? parseFloat(m[1]) : undefined;
}

// ── Refi-specific ─────────────────────────────────────────────────────────────

export function extractBalance(text: string): number | null {
    const m =
        text.match(/\$\s*([\d,]+(?:,\d{3})+)/i) ||
        text.match(/\$\s*(\d+(?:\.\d+)?)\s*[Mm]\b/) ||
        text.match(/\bon\s+(?:my\s+)?\$\s*(\d+(?:\.\d+)?)\s*k?\b/i) ||
        text.match(/\$\s*(\d+(?:\.\d+)?)\s*k\b/i);
    if (!m) return null;
    const raw = parseFloat(m[1].replace(/,/g, ''));
    const isMil = /\$\s*\d+(?:\.\d+)?\s*[Mm]\b/.test(text);
    const isK   = /\$\s*\d+(?:\.\d+)?\s*k\b/i.test(m[0]);
    const val = isMil ? raw * 1_000_000 : isK ? raw * 1000 : raw;
    return val >= 50_000 && val <= 10_000_000 ? val : null;
}

export function extractCurrentRate(text: string): number | null {
    const m =
        text.match(/\b(?:current\s*rate|my\s*rate)\b\s*(?:is\s+)?(\d+\.?\d*)\s*%/i) ||
        text.match(/\bat\s+(\d+\.?\d*)\s*%/i) ||
        text.match(/(\d+\.?\d*)\s*%\s*(?:rate|interest|on\s*my|current)/i) ||
        (() => {
            const all = Array.from(text.matchAll(/(\d+\.?\d*)\s*%/g))
                .map(m => parseFloat(m[1])).filter(r => r > 1 && r < 20);
            return all.length >= 1 ? { 1: String(all[0]) } as unknown as RegExpMatchArray : null;
        })();
    if (!m) return null;
    const v = parseFloat(m[1]);
    return v >= 1 && v <= 20 ? v : null;
}

export function extractNewRate(text: string): number | null {
    const m =
        text.match(/\b(?:refi(?:nance)?\s+(?:to|at|when)|new\s*rate)\s+(\d+\.?\d*)\s*%/i) ||
        text.match(/(?:go\s+(?:down\s+)?to|drop\s+to|hit|reach|down\s+to)\s*(\d+\.?\d*)\s*%/i) ||
        text.match(/(?:to|at)\s+(\d+\.?\d*)\s*%.*(?:refi|refinanc)/i);
    if (m) { const v = parseFloat(m[1]); if (v >= 1 && v <= 20) return v; }
    const allRates = Array.from(text.matchAll(/(\d+\.\d+)\s*%/g))
        .map(m => parseFloat(m[1])).filter(r => r > 1 && r < 20);
    return allRates.length >= 2 ? allRates[1] : null;
}

export function extractRemainingMonths(text: string): number {
    const yearsLeftM =
        text.match(/(\d+)\s*years?\s*left/i) ||
        text.match(/(\d+)\s*years?\s*remaining/i);
    if (yearsLeftM) return parseInt(yearsLeftM[1]) * 12;
    const yearsInM =
        text.match(/(\d+)\s*years?\s*(?:in|into|ago)/i) ||
        text.match(/(?:bought|purchased|got\s*(?:the\s*)?loan)\s*(\d+)\s*years?\s*ago/i);
    if (yearsInM) return (30 - parseInt(yearsInM[1])) * 12;
    return 360;
}

// ── DSCR ──────────────────────────────────────────────────────────────────────

export function extractRentAmount(text: string): number | undefined {
    let m = text.match(/(?:rent(?:s?\s+for)?|rental)\s*\$?\s*(\d[\d,]*\d|\d+)k?/i);
    if (!m) m = text.match(/\$([\d,]+)\s*\/mo\s+rent/i);
    if (!m) m = text.match(/\$([\d,]+)\s*(?:\/mo|per\s+month|monthly\s+rent)/i);
    if (!m) m = text.match(/([\d,]+)\s*\/mo\b/i);
    if (!m) return undefined;
    let v = parseFloat(m[1].replace(/,/g, ''));
    if (v < 100) v *= 1000;
    return v >= 100 && v <= 100_000 ? v : undefined;
}

// ── Seller credit / buydown ───────────────────────────────────────────────────

export function extractSellerCredit(text: string): number | null {
    const m =
        text.match(/\$\s*([\d,]+)k?\s+seller\s*credit/i) ||
        text.match(/seller\s*credit\s*(?:of\s*)?\$?\s*([\d,]+)k?/i) ||
        text.match(/seller\s*(?:is\s*)?(?:giving|offering|paying|contribut\w+)\s*\$?\s*([\d,]+)k?/i) ||
        text.match(/\$\s*([\d,]+)k?\s*(?:seller\s*)?(?:credit|concession)\b/i);
    if (!m) return null;
    let v = parseFloat(m[1].replace(/,/g, ''));
    const isK = /\$\s*[\d,]+k\b/i.test(m[0]);
    if (isK && v < 1000) v *= 1000;
    return v >= 1000 && v <= 300_000 ? v : null;
}
