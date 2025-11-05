import { NextResponse } from "next/server";

/* ------------------------ shared helpers ------------------------ */

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const isFiniteNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

type Core = { loanAmount?: number; annualRatePct?: number; termYears?: number };
type Extras = {
  purchasePrice?: number;
  downPercent?: number;
  taxesPct?: number;
  insuranceMonthly?: number;
  insPerYear?: number;
  hoaPerMonth?: number;
  miPct?: number;
};
type Parsed = Core & Extras;

type EngineResult = {
  name: "v2_context" | "v1_simple" | "numeric";
  parsed: Parsed;
  confidence: number;
  reason: string;
};

function monthlyPI(loanAmount: number, annualRatePct: number, termYears: number): number {
  const n = Math.round(termYears * 12);
  if (annualRatePct <= 0) return loanAmount / n;
  const i = (annualRatePct / 100) / 12;
  return loanAmount * (i / (1 - Math.pow(1 + i, -n)));
}

/** tolerate $, commas, %, spaces, and bare "k" */
function toNum(v: string | null): number | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  const m = s.match(/^([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+(?:\.[0-9]+)?)(?:\s*[kK])?$/);
  if (m) {
    const hasK = /[kK]\s*$/.test(s);
    const base = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(base)) return undefined;
    return hasK ? base * 1_000 : base;
  }
  const n = Number(s.replace(/[\s,$%]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

/* --------------------------- NLP bits --------------------------- */

type MoneyMention = { value: number; start: number; end: number; raw: string };

function extractAllMoney(text: string): MoneyMention[] {
  const out: MoneyMention[] = [];
  const re = /\$?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+(?:\.[0-9]+)?)(\s*[kK])?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const base = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(base)) continue;
    const val = m[2] ? base * 1_000 : base;
    out.push({ value: val, start: m.index, end: re.lastIndex, raw: m[0] });
  }
  return out;
}

function extractRatePct(text: string): number | undefined {
  const percentToken = /([0-9]+(?:\.[0-9]+)?)\s*%/g;
  const hits: { v: number; idx: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = percentToken.exec(text)) !== null) hits.push({ v: Number(m[1]), idx: m.index });
  if (!hits.length) {
    const w = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(percent|pct)\b/i);
    return w ? Number(w[1]) : undefined;
  }
  const kw = /(rate|interest|apr)/i;
  const window = 30;
  hits.sort((a, b) => {
    const aSlice = text.slice(Math.max(0, a.idx - window), Math.min(text.length, a.idx + window));
    const bSlice = text.slice(Math.max(0, b.idx - window), Math.min(text.length, b.idx + window));
    const aScore = kw.test(aSlice) ? 0 : 1;
    const bScore = kw.test(bSlice) ? 0 : 1;
    return aScore - bScore || a.idx - b.idx;
  });
  return hits[0]?.v;
}

function extractTaxesPct(text: string): number | undefined {
  const kw = /(property\s*tax|tax(es)?)/i;
  const pct = /([0-9]+(?:\.[0-9]+)?)\s*%/g;
  const window = 30;
  const hits: { v: number; idx: number; score: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = pct.exec(text)) !== null) {
    const idx = m.index;
    const slice = text.slice(Math.max(0, idx - window), Math.min(text.length, idx + window));
    hits.push({ v: Number(m[1]), idx, score: kw.test(slice) ? 0 : 1 });
  }
  hits.sort((a, b) => a.score - b.score || a.idx - b.idx);
  return hits[0]?.score === 0 ? hits[0].v : undefined;
}

function extractTermYears(text: string): number | undefined {
  const y = text.match(/\b([0-9]{1,2})\s*(years?|yrs?|y)\b/i);
  if (y) return Number(y[1]);
  const m = text.match(/\b([0-9]{2,3})\s*(months?|mos?)\b/i);
  if (m) return Number(m[1]) / 12;
  const bare = text.match(/\b([0-9]{1,2})\b/);
  if (bare && /\b(term|years?|yrs?)\b/i.test(text)) return Number(bare[1]);
  return undefined;
}

function classifyMoney(text: string, monies: MoneyMention[]) {
  const W = 24;
  const kw = {
    loan: /(loan|principal|mortgage|amount|balance)/i,
    price: /(purchase|price|home|house|value)/i,
    ins: /(insurance|hazard|premium)/i,
    hoa: /\bHOA\b/i,
    down: /(down\s*payment|down|dp)/i,
    tax: /(tax|property\s*tax)/i,
    perYear: /(per\s*year|annual|yr)/i,
    perMonth: /(per\s*month|monthly|mo)/i,
  };

  let loanAmount: number | undefined;
  let purchasePrice: number | undefined;
  let insuranceMonthly: number | undefined;
  let insuranceAnnual: number | undefined;
  let hoaPerMonth: number | undefined;

  const candidates = monies
    .map(m => {
      const s = Math.max(0, m.start - W);
      const e = Math.min(text.length, m.end + W);
      const ctx = text.slice(s, e);
      const tags = {
        isLoanish: kw.loan.test(ctx),
        isPriceish: kw.price.test(ctx),
        isIns: kw.ins.test(ctx),
        isHOA: kw.hoa.test(ctx),
        isDown: kw.down.test(ctx),
        isTax: kw.tax.test(ctx),
        perYear: kw.perYear.test(ctx),
        perMonth: kw.perMonth.test(ctx),
      };
      return { ...m, ctx, tags };
    })
    .sort((a, b) => b.value - a.value); // largest first

  for (const c of candidates) {
    if (c.tags.isIns) {
      if (c.tags.perYear || c.value >= 5000) insuranceAnnual = c.value;
      else insuranceMonthly = c.value;
      continue;
    }
    if (c.tags.isHOA) {
      hoaPerMonth = c.value;
      continue;
    }
    if (!purchasePrice && c.tags.isPriceish && c.value >= 30_000) {
      purchasePrice = c.value;
      continue;
    }
    if (c.tags.isDown) continue;
    if (!loanAmount && c.value >= 30_000) {
      loanAmount = c.value;
      if (c.tags.isLoanish) break;
    }
  }

  if (!loanAmount) {
    const big = candidates.find(c => c.value >= 30_000 && !c.tags.isDown && !c.tags.isIns && !c.tags.isHOA);
    if (big) loanAmount = big.value;
  }

  return { loanAmount, purchasePrice, insuranceMonthly, insuranceAnnual, hoaPerMonth };
}

/* --------------------------- engines --------------------------- */

function engineV2(q: string, sp: URLSearchParams): EngineResult {
  const parsed: Parsed = {};
  const qTrim = q.trim();

  parsed.annualRatePct = toNum(sp.get("annualRatePct")) ?? undefined;
  parsed.termYears = toNum(sp.get("termYears")) ?? undefined;

  if (qTrim) {
    parsed.annualRatePct ??= extractRatePct(qTrim);
    parsed.termYears ??= extractTermYears(qTrim);
    parsed.taxesPct = toNum(sp.get("taxesPct")) ?? extractTaxesPct(qTrim) ?? undefined;

    const monies = extractAllMoney(qTrim);
    if (monies.length) {
      const cls = classifyMoney(qTrim, monies);
      parsed.loanAmount = toNum(sp.get("loanAmount")) ?? cls.loanAmount ?? undefined;
      parsed.purchasePrice = toNum(sp.get("purchasePrice")) ?? cls.purchasePrice ?? undefined;
      parsed.insuranceMonthly = toNum(sp.get("insuranceMonthly")) ?? cls.insuranceMonthly ?? undefined;
      parsed.insPerYear = toNum(sp.get("insPerYear")) ?? cls.insuranceAnnual ?? undefined;
      parsed.hoaPerMonth = toNum(sp.get("hoaPerMonth")) ?? cls.hoaPerMonth ?? undefined;
    }
  }

  let conf = 0;
  if (isFiniteNum(parsed.loanAmount)) conf += 0.45;
  if (isFiniteNum(parsed.annualRatePct)) conf += 0.30;
  if (isFiniteNum(parsed.termYears)) conf += 0.25;

  const goodLoan = isFiniteNum(parsed.loanAmount) && parsed.loanAmount! >= 30_000;
  const goodRate = isFiniteNum(parsed.annualRatePct) && parsed.annualRatePct! >= 0 && parsed.annualRatePct! <= 25;
  const goodTerm = isFiniteNum(parsed.termYears) && parsed.termYears! >= 5 && parsed.termYears! <= 40;
  if (goodLoan && goodRate && goodTerm) conf += 0.1;
  if (isFiniteNum(parsed.loanAmount) && parsed.loanAmount! < 5_000) conf -= 0.3;

  return { name: "v2_context", parsed, confidence: clamp(conf, 0, 1), reason: "context-aware classification" };
}

function engineV1(q: string): EngineResult {
  const parsed: Parsed = {};
  const qTrim = q.trim();

  if (qTrim) {
    const monies = extractAllMoney(qTrim).sort((a, b) => b.value - a.value);
    parsed.loanAmount = monies.find(m => m.value >= 30_000)?.value ?? monies[0]?.value;
    parsed.annualRatePct = extractRatePct(qTrim);
    parsed.termYears = extractTermYears(qTrim);
  }

  let conf = 0;
  if (isFiniteNum(parsed.loanAmount)) conf += 0.45;
  if (isFiniteNum(parsed.annualRatePct)) conf += 0.30;
  if (isFiniteNum(parsed.termYears)) conf += 0.25;

  const goodLoan = isFiniteNum(parsed.loanAmount) && parsed.loanAmount! >= 30_000;
  const goodRate = isFiniteNum(parsed.annualRatePct) && parsed.annualRatePct! >= 0 && parsed.annualRatePct! <= 25;
  const goodTerm = isFiniteNum(parsed.termYears) && parsed.termYears! >= 5 && parsed.termYears! <= 40;
  if (goodLoan && goodRate && goodTerm) conf += 0.05;

  return { name: "v1_simple", parsed, confidence: clamp(conf, 0, 1), reason: "simple $, %, years extraction" };
}

function engineNumeric(sp: URLSearchParams): EngineResult {
  const parsed: Parsed = {
    loanAmount: toNum(sp.get("loanAmount")) ?? toNum(sp.get("amount")) ?? toNum(sp.get("price")),
    annualRatePct: toNum(sp.get("annualRatePct")) ?? toNum(sp.get("rate")),
    termYears: toNum(sp.get("termYears")) ?? toNum(sp.get("term")),
    purchasePrice: toNum(sp.get("purchasePrice")),
    downPercent: toNum(sp.get("downPercent")),
    taxesPct: toNum(sp.get("taxesPct")),
    insPerYear: toNum(sp.get("insPerYear")),
    insuranceMonthly: toNum(sp.get("insuranceMonthly")) ?? toNum(sp.get("insPerMonth")),
    hoaPerMonth: toNum(sp.get("hoaPerMonth")) ?? toNum(sp.get("hoaMonthly")),
    miPct: toNum(sp.get("miPct")),
  };

  if ((!parsed.loanAmount || parsed.loanAmount <= 0) && isFiniteNum(parsed.purchasePrice)) {
    const dp = parsed.downPercent ?? 0;
    const derived = parsed.purchasePrice * (1 - dp / 100);
    if (derived > 0) parsed.loanAmount = derived;
  }

  let conf = 0;
  if (isFiniteNum(parsed.loanAmount)) conf += 0.45;
  if (isFiniteNum(parsed.annualRatePct)) conf += 0.30;
  if (isFiniteNum(parsed.termYears)) conf += 0.25;
  const goodLoan = isFiniteNum(parsed.loanAmount) && parsed.loanAmount! >= 30_000;
  const goodRate = isFiniteNum(parsed.annualRatePct) && parsed.annualRatePct! >= 0 && parsed.annualRatePct! <= 25;
  const goodTerm = isFiniteNum(parsed.termYears) && parsed.termYears! >= 5 && parsed.termYears! <= 40;
  if (goodLoan && goodRate && goodTerm) conf += 0.15;

  return { name: "numeric", parsed, confidence: clamp(conf, 0, 1), reason: "strict numeric params" };
}

/* --------------------------- validator -------------------------- */

function validateCore(p: Parsed) {
  const problems: string[] = [];
  const okLoan = isFiniteNum(p.loanAmount) && p.loanAmount! >= 1_000 && p.loanAmount! <= 50_000_000;
  const okRate = isFiniteNum(p.annualRatePct) && p.annualRatePct! >= 0 && p.annualRatePct! <= 25;
  const okTerm = isFiniteNum(p.termYears) && p.termYears! >= 5 && p.termYears! <= 40;

  if (!okLoan) problems.push("loanAmount missing/out-of-range");
  if (!okRate) problems.push("annualRatePct missing/out-of-range");
  if (!okTerm) problems.push("termYears missing/out-of-range");

  return { ok: problems.length === 0, problems };
}

/* ----------------------------- route ---------------------------- */

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || searchParams.get("query") || "").trim();
  const forced = (searchParams.get("engine") || "auto").toLowerCase(); // v2 | v1 | num | auto
  const minConfidence = toNum(searchParams.get("minConfidence")) ?? 0.65;

  const chain: Array<{ engine: EngineResult["name"]; confidence: number; reason: string; valid: boolean; problems?: string[] }> = [];

  const tryEngine = (er: EngineResult) => {
    const { ok, problems } = validateCore(er.parsed);
    chain.push({ engine: er.name, confidence: er.confidence, reason: er.reason, valid: ok, problems: ok ? undefined : problems });
    if (!ok) return undefined;
    if (er.confidence < minConfidence) return undefined;
    return er.parsed;
  };

  let picked: { engine: EngineResult["name"]; parsed: Parsed } | undefined;

  if (forced === "v2") {
    const v2 = engineV2(q, searchParams);
    const pass = tryEngine(v2);
    if (pass) picked = { engine: v2.name, parsed: pass };
  } else if (forced === "v1") {
    const v1 = engineV1(q);
    const pass = tryEngine(v1);
    if (pass) picked = { engine: v1.name, parsed: pass };
  } else if (forced === "num") {
    const num = engineNumeric(searchParams);
    const pass = tryEngine(num);
    if (pass) picked = { engine: num.name, parsed: pass };
  } else {
    const v2 = engineV2(q, searchParams);
    const v2pass = tryEngine(v2);
    if (v2pass) picked = { engine: v2.name, parsed: v2pass };
    if (!picked) {
      const v1 = engineV1(q);
      const v1pass = tryEngine(v1);
      if (v1pass) picked = { engine: v1.name, parsed: v1pass };
    }
    if (!picked) {
      const num = engineNumeric(searchParams);
      const numpass = tryEngine(num);
      if (numpass) picked = { engine: num.name, parsed: numpass };
    }
  }

  if (!picked) {
    return NextResponse.json(
      {
        error: "Could not confidently parse inputs. Try adding $, %, and years.",
        inputEcho: { q },
        fallbackChain: chain,
        meta: { path: "calc", tag: "calc-router-fail", usedFRED: false as const, at: new Date().toISOString() },
      },
      { status: 400 }
    );
  }

  let { loanAmount, annualRatePct, termYears, taxesPct, purchasePrice, insuranceMonthly, insPerYear, hoaPerMonth, miPct, downPercent } = picked.parsed;

  loanAmount = clamp(loanAmount!, 1_000, 50_000_000);
  annualRatePct = clamp(annualRatePct!, 0, 25);
  termYears = clamp(termYears!, 5, 40);

  if ((!loanAmount || loanAmount <= 0) && isFiniteNum(purchasePrice)) {
    const dp = downPercent ?? 0;
    const derived = purchasePrice * (dp >= 0 ? (1 - dp / 100) : 1);
    if (derived > 0) loanAmount = derived;
  }

  const pi = monthlyPI(loanAmount!, annualRatePct!, termYears!);
  const minus025 = monthlyPI(loanAmount!, Math.max(annualRatePct! - 0.25, 0), termYears!);
  const plus025 = monthlyPI(loanAmount!, annualRatePct! + 0.25, termYears!);

  const monthlyTax = taxesPct && purchasePrice ? (purchasePrice * (taxesPct / 100)) / 12 : 0;
  const monthlyIns = insuranceMonthly != null ? insuranceMonthly : insPerYear != null ? insPerYear / 12 : 0;
  const monthlyHOA = hoaPerMonth ?? 0;
  const monthlyMI = miPct ? (loanAmount! * (miPct / 100)) / 12 : 0;

  const monthlyTotalPITI = Number((pi + monthlyTax + monthlyIns + monthlyHOA + monthlyMI).toFixed(2));

  const payload = {
    meta: {
      path: "calc",
      tag: "calc-router",
      engineUsed: picked.engine,
      usedFRED: false as const,
      at: new Date().toISOString(),
    },
    tldr: "Principal & Interest with ±0.25% rate sensitivity.",

    // ===== NEW: legacy top-level mirrors for the UI =====
    loanAmount: loanAmount!,                      // mirror of answer.loanAmount
    monthlyPI: Number(pi.toFixed(2)),             // mirror of answer.monthlyPI
    monthlyTax: Number(monthlyTax.toFixed(2)),    // mirror of answer.monthlyTax
    monthlyIns: Number(monthlyIns.toFixed(2)),    // mirror of answer.monthlyIns
    monthlyHOA: Number(monthlyHOA.toFixed(2)),    // mirror of answer.monthlyHOA
    monthlyMI: Number(monthlyMI.toFixed(2)),      // mirror of answer.monthlyMI
    monthlyTotalPITI,                             // mirror of answer.monthlyTotalPITI
    sensitivities: [
      { rate: (annualRatePct! - 0.25) / 100, pi: Number(minus025.toFixed(2)) },
      { rate: (annualRatePct! + 0.25) / 100, pi: Number(plus025.toFixed(2)) },
    ],
    // ===== END legacy mirrors =====

    // canonical shape the API will keep evolving
    answer: {
      loanAmount: loanAmount!,
      monthlyPI: Number(pi.toFixed(2)),
      sensitivities: [
        { rate: (annualRatePct! - 0.25) / 100, pi: Number(minus025.toFixed(2)) },
        { rate: (annualRatePct! + 0.25) / 100, pi: Number(plus025.toFixed(2)) },
      ],
      monthlyTax: Number(monthlyTax.toFixed(2)),
      monthlyIns: Number(monthlyIns.toFixed(2)),
      monthlyHOA: Number(monthlyHOA.toFixed(2)),
      monthlyMI: Number(monthlyMI.toFixed(2)),
      monthlyTotalPITI,
    },
    inputEcho: {
      q,
      engine: picked.engine,
      parsed: picked.parsed,
    },
    fallbackChain: chain,
  };

  return NextResponse.json(payload, { status: 200 });

}
