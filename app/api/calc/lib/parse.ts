// app/api/calc/lib/parse.ts
// Tiny tokenizer + deterministic rules for mortgage prompt parsing

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

type Tok =
    | { k: "KW_PRICE" | "KW_LOAN" | "KW_DOWN" | "KW_RATE" | "KW_INS" | "KW_HOA" | "AT" | "PERCENT" | "YRS" | "MOS" }
    | { k: "NUM"; v: number; raw: string }          // 1, 1.25, 900k, 1.2m -> v expanded
    | { k: "ZIP"; v: string }                       // 5-digit ZIP
    | { k: "PUNCT"; v: string }
    | { k: "TEXT"; v: string };

const NUM_RE = /(?:(?:\$)?\d[\d,]*\.?\d*)(?:[km])?/i;
const ZIP_RE = /\b\d{5}(?:-\d{4})?\b/;
const KW_RE =
    /\b(price|loan|down|rate|ins(?:urance)?|hoa|at|@|yrs?|years?|y|mos?|months?)\b/i;

function expandMoney(raw: string): number | undefined {
    if (!raw) return undefined;
    let s = raw.trim().toLowerCase().replace(/[\$,]/g, "");
    let mult = 1;
    if (s.endsWith("m")) { mult = 1_000_000; s = s.slice(0, -1); }
    else if (s.endsWith("k")) { mult = 1_000; s = s.slice(0, -1); }
    const n = Number(s);
    return isFinite(n) ? n * mult : undefined;
}

function toPercentExplicit(raw: string | undefined): number | undefined {
    if (!raw) return undefined;
    const s = raw.replace(/%/g, "");
    if (!s) return undefined;
    const n = Number(s);
    if (!isFinite(n)) return undefined;
    return n > 100 ? n / 100 : n;
}

function lex(input: string): Tok[] {
    const s = input.replace(/\s+/g, " ").trim();
    const out: Tok[] = [];
    let i = 0;

    while (i < s.length) {
        const tail = s.slice(i);

        // ZIP
        const mZip = tail.match(ZIP_RE);
        if (mZip && mZip.index === 0) {
            const z = mZip[0].slice(0, 5);
            out.push({ k: "ZIP", v: z });
            i += mZip[0].length;
            continue;
        }

        // Keywords / markers
        const mKw = tail.match(KW_RE);
        if (mKw && mKw.index === 0) {
            const kw = mKw[1].toLowerCase();
            switch (kw) {
                case "price": out.push({ k: "KW_PRICE" }); break;
                case "loan": out.push({ k: "KW_LOAN" }); break;
                case "down": out.push({ k: "KW_DOWN" }); break;
                case "rate": out.push({ k: "KW_RATE" }); break;
                case "ins":
                case "insurance": out.push({ k: "KW_INS" }); break;
                case "hoa": out.push({ k: "KW_HOA" }); break;
                case "at":
                case "@": out.push({ k: "AT" }); break;
                case "y":
                case "yr":
                case "yrs":
                case "year":
                case "years": out.push({ k: "YRS" }); break;
                case "mo":
                case "mos":
                case "month":
                case "months": out.push({ k: "MOS" }); break;
                default: out.push({ k: "TEXT", v: kw });
            }
            i += mKw[0].length;
            continue;
        }

        // Percent sign
        if (tail[0] === "%") {
            out.push({ k: "PERCENT" });
            i += 1;
            continue;
        }

        // Number / money-like
        const mNum = tail.match(NUM_RE);
        if (mNum && mNum.index === 0) {
            const raw = mNum[0];
            const val = expandMoney(raw);
            if (typeof val === "number") out.push({ k: "NUM", v: val, raw });
            i += raw.length;
            continue;
        }

        // Punctuation / other
        if (/^[,;:/\-()]/.test(tail)) {
            out.push({ k: "PUNCT", v: tail[0] });
            i += 1;
            continue;
        }

        // Eat one char as TEXT
        out.push({ k: "TEXT", v: tail[0] });
        i += 1;
    }

    return out;
}

function nearestLeftNumber(tokens: Tok[], untilIdx: number, range: [number, number]): number | undefined {
    const [lo, hi] = range;
    let bestIdx = -1;
    let bestVal: number | undefined = undefined;

    for (let i = 0; i < untilIdx; i++) {
        const t = tokens[i];
        if (t.k !== "NUM") continue;

        // Exclude if number touches time-units to the right
        const next = tokens[i + 1];
        if (next && (next.k === "YRS" || next.k === "MOS")) continue;

        // Exclude if forms a 5-digit ZIP (we already tokenize ZIPs, but be safe)
        if (String(Math.trunc((t as any).v)).length === 5 && (t as any).v >= 10000 && (t as any).v <= 99999) continue;

        if (t.v >= lo && t.v <= hi && i > bestIdx) {
            bestIdx = i;
            bestVal = t.v;
        }
    }
    return bestVal;
}

export function parseQuery_toInputs(q: string): Inputs {
    const tokens = lex(q.toLowerCase());

    const inputs: Inputs = {};
    let lastNumIdx = -1;

    // Helper: peek numeric after a given position
    const numAfter = (idx: number): { v: number; j: number } | undefined => {
        for (let j = idx + 1; j < tokens.length; j++) {
            const t = tokens[j];
            if (t.k === "NUM") return { v: (t as any).v, j };
            if (t.k !== "PUNCT" && t.k !== "TEXT") break;
        }
        return undefined;
    };

    // First pass: capture explicit keyed values
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];

        if (t.k === "KW_PRICE") {
            const n = numAfter(i);
            if (n) inputs.price = n.v;
        }

        if (t.k === "KW_LOAN") {
            const n = numAfter(i);
            if (n) inputs.loanAmount = n.v;
        }

        if (t.k === "KW_INS") {
            const n = numAfter(i);
            if (n) inputs.monthlyIns = Math.max(0, Math.round(n.v));
        }

        if (t.k === "KW_HOA") {
            const n = numAfter(i);
            if (n) inputs.monthlyHOA = Math.max(0, Math.round(n.v));
        }

        if (t.k === "ZIP") {
            inputs.zip = t.v;
        }

        if (t.k === "NUM") lastNumIdx = i;
    }

    // Down percent: “down 20%” or “20% down”
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.k === "KW_DOWN") {
            const n = numAfter(i);
            if (n) {
                // Look for a following percent sign
                const next = tokens[n.j + 1];
                if (next && next.k === "PERCENT") inputs.downPercent = toPercentExplicit("" + (n.v))!;
            }
        }
        if (t.k === "NUM") {
            const next = tokens[i + 1];
            const next2 = tokens[i + 2];
            if (next && next.k === "PERCENT" && next2 && next2.k === "KW_DOWN") {
                inputs.downPercent = toPercentExplicit("" + (t as any).v)!;
            }
        }
    }

    // Term: look for “NUM yrs” / “NUM y/yr/years” or “NUM mo/months”
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.k === "NUM") {
            const next = tokens[i + 1];
            if (next && next.k === "YRS") {
                const years = (t as any).v;
                if (isFinite(years) && years > 0) inputs.termMonths = Math.round(years * 12);
            }
            if (next && next.k === "MOS") {
                const mos = (t as any).v;
                if (isFinite(mos) && mos > 0) inputs.termMonths = Math.round(mos);
            }
        }
    }

    // Rate: explicit % or “rate <num>” or “at/@ <num>”
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];

        // % directly after number
        if (t.k === "NUM") {
            const nxt = tokens[i + 1];
            if (nxt && nxt.k === "PERCENT") {
                const v = (t as any).v;
                inputs.ratePct = v > 100 ? v / 100 : v;
            }
        }

        // rate <num>
        if (t.k === "KW_RATE") {
            const n = numAfter(i);
            if (n) {
                const v = n.v;
                inputs.ratePct = v > 100 ? v / 100 : v;
            }
        }

        // at/@ <num> (not followed by time-unit)
        if (t.k === "AT") {
            const n = numAfter(i);
            if (n) {
                const after = tokens[n.j + 1];
                if (!(after && (after.k === "YRS" || after.k === "MOS"))) {
                    const v = n.v;
                    inputs.ratePct = v > 100 ? v / 100 : v;
                }
            }
        }
    }

    // Derive loan from price+down%
    if (inputs.price != null && inputs.downPercent != null && inputs.loanAmount == null) {
        inputs.loanAmount = inputs.price * (1 - inputs.downPercent / 100);
    }

    // Bare-loan: number followed by at/@ <rate>
    if (inputs.loanAmount == null && inputs.price == null) {
        for (let i = 0; i < tokens.length - 2; i++) {
            const a = tokens[i], b = tokens[i + 1], c = tokens[i + 2];
            if (a.k === "NUM" && b.k === "AT" && c.k === "NUM") {
                inputs.loanAmount = (a as any).v;
                break;
            }
        }
    }

    // If we still don’t have rate but we have term:
    // choose the nearest decimal/percent-like number (0.1–25) before the term marker.
    if (inputs.ratePct == null && inputs.termMonths) {
        // find index of the first time-unit token we used
        let termIdx = tokens.length;
        for (let i = 0; i < tokens.length - 1; i++) {
            const a = tokens[i], b = tokens[i + 1];
            if (a.k === "NUM" && (b.k === "YRS" || b.k === "MOS")) { termIdx = i; break; }
        }
        const pick = nearestLeftNumber(tokens, termIdx, [0.1, 25]);
        if (typeof pick === "number") inputs.ratePct = pick;
    }

    // Last-ditch: if we have price+down+term and exactly one candidate 0.1–25 anywhere, take it as rate
    if (inputs.ratePct == null && inputs.price != null && inputs.downPercent != null && inputs.termMonths != null) {
        const candidates: number[] = [];
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            if (t.k !== "NUM") continue;
            // ignore if next is time unit
            const nxt = tokens[i + 1];
            if (nxt && (nxt.k === "YRS" || nxt.k === "MOS")) continue;
            // ignore if it visually looks like a ZIP (safety)
            if (String(Math.trunc((t as any).v)).length === 5) continue;
            const v = (t as any).v;
            if (v >= 0.1 && v <= 25) candidates.push(v);
        }
        if (candidates.length === 1) inputs.ratePct = candidates[0];
    }

    // Default ins/hoa if still absent (UI uses these)
    if (inputs.monthlyIns == null) inputs.monthlyIns = 100;
    if (inputs.monthlyHOA == null) inputs.monthlyHOA = 0;

    return inputs;
}
