// app/api/calc/lib/parse.ts
// Grammar-based parser using Chevrotain. Deterministic, avoids regex soup.

import {
    createToken, Lexer, CstParser, IToken
} from "chevrotain";

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

// ---------- Tokens ----------
const WhiteSpace = createToken({ name: "WhiteSpace", pattern: /[ \t\r\n]+/, group: Lexer.SKIPPED });

const Dollar = createToken({ name: "Dollar", pattern: /\$/ });
const At = createToken({ name: "At", pattern: /@|(?:\bat\b)/i });
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
const NumWord = createToken({
    name: "NumWord",
    pattern: /(?:\d[\d,]*\.?\d*)(?:[km])?/i
});

// Punctuation we can safely ignore as separators
const Sep = createToken({ name: "Sep", pattern: /[,:;\-\(\)\/]/ });

const allTokens = [
    WhiteSpace,
    Dollar, At, PercentSym, PercentWord,
    YearsWord, MonthsWord,
    KW_PRICE, KW_LOAN, KW_DOWN, KW_RATE, KW_INS, KW_HOA,
    ZIP, NumWord, Sep
];

const lexer = new Lexer(allTokens);

// ---------- helpers ----------
function expandMoney(raw: string): number {
    let s = raw.toLowerCase().replace(/[,]/g, "");
    let mult = 1;
    if (s.endsWith("m")) { mult = 1_000_000; s = s.slice(0, -1); }
    else if (s.endsWith("k")) { mult = 1_000; s = s.slice(0, -1); }
    return Number(s) * mult;
}

function asPct(n: number) {
    return n > 100 ? n / 100 : n;
}

// ---------- Parser ----------
class CalcParser extends CstParser {
    public result: Inputs = {};

    constructor() {
        super(allTokens, { recoveryEnabled: true });
        this.performSelfAnalysis();
    }

    // Entry: we just scan the token stream, applying small rules. Order matters.
    public query = this.RULE("query", () => {
        // We make a single pass and collect facts.
        const toks = this.LA(1); // just to force init

        // Use manual loop—Chevrotain allows direct token reading via this.LA/CONSUME.
        let i = 1; // 1-based lookahead index
        const take = () => {
            const t = this.LA(1);
            this.CONSUME1((t as any).tokenType ?? NumWord); // generic consume
            return t;
        };

        // Not using a strict grammar tree; we’ll iterate and apply patterns:
        const buf: IToken[] = [];
        while (this.LA(1).tokenType !== (this.tokensMap as any).EOF) {
            buf.push(take());
        }

        // Pass 1: direct keyed captures
        for (let k = 0; k < buf.length; k++) {
            const t = buf[k];

            // price <num>
            if (t.tokenType === KW_PRICE) {
                const n = nextNum(buf, k);
                if (n) this.result.price = n;
            }

            // loan <num>  OR  <num> @ <num> (sets loan + rate)
            if (t.tokenType === KW_LOAN) {
                const n = nextNum(buf, k);
                if (n) this.result.loanAmount = n;
            }

            // rate <num> or % after number
            if (t.tokenType === KW_RATE) {
                const n = nextNum(buf, k);
                if (n != null) this.result.ratePct = asPct(n);
            }

            // ins <num>, hoa <num>
            if (t.tokenType === KW_INS) {
                const n = nextNum(buf, k);
                if (n != null) this.result.monthlyIns = Math.max(0, Math.round(n));
            }
            if (t.tokenType === KW_HOA) {
                const n = nextNum(buf, k);
                if (n != null) this.result.monthlyHOA = Math.max(0, Math.round(n));
            }

            // ZIP
            if (t.tokenType === ZIP) {
                this.result.zip = (t.image || "").slice(0, 5);
            }
        }

        // Pass 2: down%   ("down 20 %|percent") OR ("20 %|percent down")
        for (let k = 0; k < buf.length; k++) {
            const t = buf[k];

            if (t.tokenType === KW_DOWN) {
                const nTok = nextNumTok(buf, k);
                if (nTok) {
                    const after = buf[nTok.idx + 1];
                    if (after && (after.tokenType === PercentSym || after.tokenType === PercentWord)) {
                        this.result.downPercent = asPct(expandMoney(nTok.raw));
                    }
                }
            }

            if (t.tokenType === NumWord) {
                const next = buf[k + 1], next2 = buf[k + 2];
                if (
                    next &&
                    (next.tokenType === PercentSym || next.tokenType === PercentWord) &&
                    next2 && next2.tokenType === KW_DOWN
                ) {
                    this.result.downPercent = asPct(expandMoney(t.image));
                }
            }
        }

        // Pass 3: explicit percent after a number means RATE if not used for down
        for (let k = 0; k < buf.length - 1; k++) {
            const a = buf[k], b = buf[k + 1];
            if (a.tokenType === NumWord && (b.tokenType === PercentSym || b.tokenType === PercentWord)) {
                // If this pair is immediately followed/preceded by "down", skip (that's down%)
                const prev = buf[k - 1], next = buf[k + 2];
                const touchesDown = (prev && prev.tokenType === KW_DOWN) || (next && next.tokenType === KW_DOWN);
                if (!touchesDown) {
                    this.result.ratePct = asPct(expandMoney(a.image));
                }
            }
        }

        // Pass 4: at/@ relation: <num> @ <num>  (loan @ rate)
        for (let k = 0; k < buf.length - 2; k++) {
            const a = buf[k], b = buf[k + 1], c = buf[k + 2];
            if (a.tokenType === NumWord && b.tokenType === At && c.tokenType === NumWord) {
                if (this.result.loanAmount == null) this.result.loanAmount = expandMoney(a.image);
                if (this.result.ratePct == null) this.result.ratePct = asPct(expandMoney(c.image));
            }
        }

        // Pass 5: term — "NUM years" or "NUM months"
        for (let k = 0; k < buf.length - 1; k++) {
            const a = buf[k], b = buf[k + 1];
            if (a.tokenType === NumWord && b.tokenType === YearsWord) {
                const years = Number(expandMoney(a.image));
                if (isFinite(years) && years > 0) this.result.termMonths = Math.round(years * 12);
            }
            if (a.tokenType === NumWord && b.tokenType === MonthsWord) {
                const mos = Number(expandMoney(a.image));
                if (isFinite(mos) && mos > 0) this.result.termMonths = Math.round(mos);
            }
        }

        // Derive loan from price+down
        if (this.result.loanAmount == null && this.result.price != null && this.result.downPercent != null) {
            this.result.loanAmount = this.result.price * (1 - (this.result.downPercent / 100));
        }

        // Last-resort rate guess (avoid grabbing down%): pick a decimal 0.1–25 that is NOT followed by %/percent,
        // prefer <=15 (mortgage-ish), prefer decimals, prefer right-most before term marker.
        if (this.result.ratePct == null) {
            const termIdx = firstTermIndex(buf) ?? buf.length;
            type Cand = { v: number; i: number; raw: string; isDecimal: boolean; };
            const cands: Cand[] = [];
            for (let i = 0; i < termIdx; i++) {
                const t = buf[i], nx = buf[i + 1];
                if (t.tokenType !== NumWord) continue;
                if (nx && (nx.tokenType === PercentSym || nx.tokenType === PercentWord)) continue; // that's a percent, skip
                const v = expandMoney(t.image);
                if (v >= 0.1 && v <= 25) {
                    cands.push({ v, i, raw: t.image, isDecimal: /\./.test(t.image) });
                }
            }
            if (cands.length === 1) this.result.ratePct = cands[0].v;
            else if (cands.length > 1) {
                const within15 = cands.filter(c => c.v <= 15);
                const pool = within15.length ? within15 : cands;
                const dec = pool.filter(c => c.isDecimal);
                const pickFrom = dec.length ? dec : pool;
                pickFrom.sort((a, b) => b.i - a.i);
                this.result.ratePct = pickFrom[0].v;
            }
        }

        // Defaults for UI expectations
        if (this.result.monthlyIns == null) this.result.monthlyIns = 100;
        if (this.result.monthlyHOA == null) this.result.monthlyHOA = 0;
    });
}

function nextNum(tokens: IToken[], idx: number): number | undefined {
    const n = nextNumTok(tokens, idx);
    return n ? expandMoney(n.raw) : undefined;
}
function nextNumTok(tokens: IToken[], idx: number): { raw: string; idx: number } | undefined {
    for (let j = idx + 1; j < tokens.length; j++) {
        const t = tokens[j];
        if (t.tokenType === NumWord) return { raw: t.image, idx: j };
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

// ---------- public API ----------
export function parseQuery_toInputs(q: string): Inputs {
    const lexRes = lexer.tokenize(q.trim());
    const parser = new CalcParser();
    // feed tokens
    (parser as any).input = lexRes.tokens;
    parser.query();

    return parser.result;
}
