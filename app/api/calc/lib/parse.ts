// app/api/calc/lib/parse.ts
// Chevrotain used as a LEXER only; we walk tokens deterministically.

import { createToken, Lexer, IToken } from "chevrotain";

export type Inputs = {
    price?: number;
    downPercent?: number;
    loanAmount?: number;
    ratePct?: number;
    termMonths?: number;
    zip?: string;
    monthlyIns?: number;
    monthlyHOA?: number;
};

/* =======================
   Tokens
======================= */
const WhiteSpace = createToken({ name: "WhiteSpace", pattern: /[ \t\r\n]+/, group: Lexer.SKIPPED });
const Dollar = createToken({ name: "Dollar", pattern: /\$/ });
const At = createToken({ name: "At", pattern: /@|\bat\b/i });
const PercentSym = createToken({ name: "PercentSym", pattern: /%/ });
const PercentWord = createToken({ name: "PercentWord", pattern: /\b(percent|pct)\b/i });

const YearsWord = createToken({ name: "YearsWord", pattern: /\b(y|yr|yrs|year|years)\b/i });
const MonthsWord = createToken({ name: "MonthsWord", pattern: /\b(mo|mos|month|months)\b/i });

const KW_PRICE = createToken({ name: "KW_PRICE", pattern: /\bprice\b/i });
const KW_LOAN = createToken({ name: "KW_LOAN", pattern: /\bloan\b/i });
const KW_DOWN = createToken({ name: "KW_DOWN", pattern: /\bdown\b/i });
const KW_RATE = createToken({ name: "KW_RATE", pattern: /\brate\b/i });
const KW_INS = createToken({ name: "KW_INS", pattern: /\bins(?:urance)?\b/i });
const KW_HOA = createToken({ name: "KW_HOA", pattern: /\bhoa\b/i });

const ZIP = createToken({ name: "ZIP", pattern: /\b\d{5}(?:-\d{4})?\b/ });

// 900k, 1.2m, 480000, 6.25, 30
const NumWord = createToken({ name: "NumWord", pattern: /(?:\d[\d,]*\.?\d*)(?:[km])?/i });

// punctuation as soft separators
const Sep = createToken({ name: "Sep", pattern: /[,:;\-\(\)\/]/ });

const allTokens = [
    WhiteSpace,
    Dollar, At, PercentSym, PercentWord,
    YearsWord, MonthsWord,
    KW_PRICE, KW_LOAN, KW_DOWN, KW_RATE, KW_INS, KW_HOA,
    ZIP, NumWord, Sep
];

const lexer = new Lexer(allTokens);

/* =======================
   Helpers
======================= */
function expandMoney(raw: string): number {
    let s = raw.toLowerCase().replace(/[,]/g, "");
    let mult = 1;
    if (s.endsWith("m")) { mult = 1_000_000; s = s.slice(0, -1); }
    else if (s.endsWith("k")) { mult = 1_000; s = s.slice(0, -1); }
    return Number(s) * mult;
}
function asPct(n: number) { return n > 100 ? n / 100 : n; }

function nextNum(tokens: IToken[], idx: number): number | undefined {
    const t = nextNumTok(tokens, idx);
    return t ? expandMoney(t.image) : undefined;
}
function nextNumTok(tokens: IToken[], idx: number): IToken | undefined {
    for (let j = idx + 1; j < tokens.length; j++) {
        const t = tokens[j];
        if (t.tokenType === NumWord) return t;
        if (t.tokenType !== Sep && t.tokenType !== Dollar && t.tokenType !== WhiteSpace) break;
    }
    return undefined;
}
function firstTermIndex(tokens: IToken[]): number | undefined {
    for (let k = 0; k < tokens.length - 1; k++) {
        if (tokens[k].tokenType === NumWord && (tokens[k + 1].tokenType === YearsWord || tokens[k + 1].tokenType === MonthsWord)) {
            return k;
        }
    }
    return undefined;
}

/* =======================
   Main
======================= */
export function parseQuery_toInputs(q: string): Inputs {
    const { tokens } = lexer.tokenize(q.trim());
    const res: Inputs = {};

    // Pass 1: keyed captures
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];

        if (t.tokenType === KW_PRICE) {
            const n = nextNum(tokens, i);
            if (n != null) res.price = n;
        }
        if (t.tokenType === KW_LOAN) {
            const n = nextNum(tokens, i);
            if (n != null) res.loanAmount = n;
        }
        if (t.tokenType === KW_INS) {
            const n = nextNum(tokens, i);
            if (n != null) res.monthlyIns = Math.max(0, Math.round(n));
        }
        if (t.tokenType === KW_HOA) {
            const n = nextNum(tokens, i);
            if (n != null) res.monthlyHOA = Math.max(0, Math.round(n));
        }
        if (t.tokenType === ZIP) {
            res.zip = (t.image || "").slice(0, 5);
        }
    }

    // Pass 2: down% (“down 20 %|percent” or “20 %|percent down”)
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.tokenType === KW_DOWN) {
            const nTok = nextNumTok(tokens, i);
            if (nTok) {
                const after = tokens[tokens.indexOf(nTok) + 1];
                if (after && (after.tokenType === PercentSym || after.tokenType === PercentWord)) {
                    res.downPercent = asPct(expandMoney(nTok.image));
                }
            }
        }
        if (t.tokenType === NumWord) {
            const next = tokens[i + 1], next2 = tokens[i + 2];
            if (next && (next.tokenType === PercentSym || next.tokenType === PercentWord) && next2 && next2.tokenType === KW_DOWN) {
                res.downPercent = asPct(expandMoney(t.image));
            }
        }
    }

    // Pass 3: explicit rate: "<num> %|percent" not touching 'down', or "rate <num>"
    for (let i = 0; i < tokens.length - 1; i++) {
        const a = tokens[i], b = tokens[i + 1];
        if (a.tokenType === NumWord && (b.tokenType === PercentSym || b.tokenType === PercentWord)) {
            const prev = tokens[i - 1], next = tokens[i + 2];
            const touchesDown = (prev && prev.tokenType === KW_DOWN) || (next && next.tokenType === KW_DOWN);
            if (!touchesDown) res.ratePct = asPct(expandMoney(a.image));
        }
    }
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].tokenType === KW_RATE) {
            const n = nextNum(tokens, i);
            if (n != null) res.ratePct = asPct(n);
        }
    }

    // Pass 4: “<num> @ <num>” = loan @ rate
    for (let i = 0; i < tokens.length - 2; i++) {
        const a = tokens[i], b = tokens[i + 1], c = tokens[i + 2];
        if (a.tokenType === NumWord && b.tokenType === At && c.tokenType === NumWord) {
            if (res.loanAmount == null) res.loanAmount = expandMoney(a.image);
            if (res.ratePct == null) res.ratePct = asPct(expandMoney(c.image));
        }
    }

    // Pass 5: term “NUM years” or “NUM months”
    for (let i = 0; i < tokens.length - 1; i++) {
        const a = tokens[i], b = tokens[i + 1];
        if (a.tokenType === NumWord && b.tokenType === YearsWord) {
            const years = expandMoney(a.image);
            if (isFinite(years) && years > 0) res.termMonths = Math.round(years * 12);
        }
        if (a.tokenType === NumWord && b.tokenType === MonthsWord) {
            const mos = expandMoney(a.image);
            if (isFinite(mos) && mos > 0) res.termMonths = Math.round(mos);
        }
    }

    // Derive loan from price+down
    if (res.loanAmount == null && res.price != null && res.downPercent != null) {
        res.loanAmount = res.price * (1 - res.downPercent / 100);
    }

    // Last-resort rate guess (avoid numbers followed by %/percent; prefer decimals or <=15; prefer right-most before term)
    if (res.ratePct == null) {
        const termIdx = firstTermIndex(tokens) ?? tokens.length;
        type Cand = { v: number; i: number; raw: string; isDec: boolean };
        const cands: Cand[] = [];
        for (let i = 0; i < termIdx; i++) {
            const t = tokens[i], nx = tokens[i + 1];
            if (t.tokenType !== NumWord) continue;
            if (nx && (nx.tokenType === PercentSym || nx.tokenType === PercentWord)) continue; // that’s a percent (often down)
            const v = expandMoney(t.image);
            if (v >= 0.1 && v <= 25) cands.push({ v, i, raw: t.image, isDec: /\./.test(t.image) });
        }
        if (cands.length === 1) res.ratePct = cands[0].v;
        else if (cands.length > 1) {
            const within15 = cands.filter(c => c.v <= 15);
            const pool = within15.length ? within15 : cands;
            const dec = pool.filter(c => c.isDec);
            const pickFrom = dec.length ? dec : pool;
            pickFrom.sort((a, b) => b.i - a.i);
            res.ratePct = pickFrom[0].v;
        }
    }

    // Defaults for UI expectations
    if (res.monthlyIns == null) res.monthlyIns = 100;
    if (res.monthlyHOA == null) res.monthlyHOA = 0;

    return res;
}
