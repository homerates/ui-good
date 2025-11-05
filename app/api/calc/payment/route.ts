/* === COPY START: app/api/calc/payment/route.ts === */
import { NextResponse } from "next/server";

/** ---------- helpers ---------- **/
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/** tolerate $, commas, %, spaces, and bare "k" */
function toNum(v: string | null): number | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  // allow 400k style
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

function extractMoneyLike(text: string): number | undefined {
  // $620,000  |  620,000  |  620000  |  620k
  const m = text.match(/\$?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+(?:\.[0-9]+)?)(\s*[kK])?/);
  if (!m) return undefined;
  const base = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(base)) return undefined;
  return m[2] ? base * 1_000 : base;
}

function extractPercent(text: string): number | undefined {
  const pctMark = text.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  if (pctMark) return Number(pctMark[1]);
  const pctWord = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(percent|pct)/i);
  if (pctWord) return Number(pctWord[1]);
  return undefined;
}

function extractTermYears(text: string): number | undefined {
  const y = text.match(/\b([0-9]{1,2})\s*(years?|yrs?|y)\b/i);
  if (y) return Number(y[1]);
  const m = text.match(/\b([0-9]{2,3})\s*(months?|mos?)\b/i);
  if (m) return Number(m[1]) / 12;
  // "30 term" / "term 30"
  const bare = text.match(/\b([0-9]{1,2})\b/);
  if (bare && /\b(term|years?|yrs?)\b/i.test(text)) return Number(bare[1]);
  return undefined;
}

/** amortized P&I; handles i=0 edge */
function monthlyPI(loanAmount: number, annualRatePct: number, termYears: number): number {
  const n = Math.round(termYears * 12);
  if (annualRatePct <= 0) return loanAmount / n;
  const i = (annualRatePct / 100) / 12;
  return loanAmount * (i / (1 - Math.pow(1 + i, -n)));
}

/** ---------- route ---------- **/
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  // Accept both literal numerics and natural language via q=
  const q = (searchParams.get("q") || searchParams.get("query") || "").trim();

  // Core fields (literal first)
  let loanAmount = toNum(searchParams.get("loanAmount"))
    ?? toNum(searchParams.get("amount"))
    ?? toNum(searchParams.get("price")); // legacy synonyms
  let annualRatePct = toNum(searchParams.get("annualRatePct"))
    ?? toNum(searchParams.get("rate"));
  let termYears = toNum(searchParams.get("termYears"))
    ?? toNum(searchParams.get("term"));

  // Purchase/Down fallback to derive loanAmount if needed
  const purchasePrice = toNum(searchParams.get("purchasePrice"));
  const downPercent = toNum(searchParams.get("downPercent"));

  // Optional PITI inputs (either monthly or annual forms)
  let taxesPct = toNum(searchParams.get("taxesPct")); // % of price (annual)
  const insPerYear = toNum(searchParams.get("insPerYear"));
  const insuranceMonthly = toNum(searchParams.get("insuranceMonthly")) ?? toNum(searchParams.get("insPerMonth"));
  const hoaPerMonth = toNum(searchParams.get("hoaPerMonth")) ?? toNum(searchParams.get("hoaMonthly"));
  const miPct = toNum(searchParams.get("miPct")); // % of loan (annual)

  // If literals are missing, try to parse from q=
  if (q) {
    if (!loanAmount) loanAmount = extractMoneyLike(q);
    if (!annualRatePct) annualRatePct = extractPercent(q);
    if (!termYears) termYears = extractTermYears(q);
  }

  // Derive loanAmount from purchase + down% if still missing
  if ((!loanAmount || loanAmount <= 0) && purchasePrice) {
    const dp = downPercent ?? 0;
    const derived = purchasePrice * (1 - dp / 100);
    if (derived > 0) loanAmount = derived;
  }

  // Validate ranges (conservative to prevent garbage)
  if (!loanAmount || !annualRatePct || !termYears) {
    return NextResponse.json(
      {
        error: "Missing or invalid inputs. Provide loanAmount, annualRatePct, termYears — or use q= with $, %, and years.",
        inputEcho: { q, loanAmount, annualRatePct, termYears, purchasePrice, downPercent },
      },
      { status: 400 }
    );
  }
  loanAmount = clamp(loanAmount, 1_000, 50_000_000);
  annualRatePct = clamp(annualRatePct, 0, 25);
  termYears = clamp(termYears, 5, 40);

  // Core PI
  const pi = monthlyPI(loanAmount, annualRatePct, termYears);

  // Sensitivity ±0.25%
  const minus025 = monthlyPI(loanAmount, Math.max(annualRatePct - 0.25, 0), termYears);
  const plus025 = monthlyPI(loanAmount, annualRatePct + 0.25, termYears);

  // PITI components (monthly)
  // Taxes: if taxesPct & purchasePrice → (purchasePrice * taxesPct%)/12, else 0
  const monthlyTax =
    taxesPct && purchasePrice ? (purchasePrice * (taxesPct / 100)) / 12 : 0;

  // Insurance: prefer monthly if given; else annual → monthly; else 0
  const monthlyIns =
    insuranceMonthly != null ? insuranceMonthly : insPerYear != null ? insPerYear / 12 : 0;

  const monthlyHOA = hoaPerMonth ?? 0;

  // MI: simple annual % of loan / 12 if provided (you can refine later)
  const monthlyMI = miPct ? (loanAmount * (miPct / 100)) / 12 : 0;

  const monthlyTotalPITI = Number((pi + monthlyTax + monthlyIns + monthlyHOA + monthlyMI).toFixed(2));

  const payload = {
    meta: { path: "calc", tag: "calc-v1-nlp", usedFRED: false as const, at: new Date().toISOString() },
    tldr: "Principal & Interest with ±0.25% rate sensitivity.",
    answer: {
      loanAmount,
      monthlyPI: Number(pi.toFixed(2)),
      sensitivities: [
        { rate: (annualRatePct - 0.25) / 100, pi: Number(minus025.toFixed(2)) },
        { rate: (annualRatePct + 0.25) / 100, pi: Number(plus025.toFixed(2)) },
      ],
      monthlyTax: Number(monthlyTax.toFixed(2)),
      monthlyIns: Number(monthlyIns.toFixed(2)),
      monthlyHOA: Number(monthlyHOA.toFixed(2)),
      monthlyMI: Number(monthlyMI.toFixed(2)),
      monthlyTotalPITI,
    },
    inputEcho: {
      q,
      loanAmount,
      annualRatePct,
      termYears,
      purchasePrice,
      downPercent,
      taxesPct,
      insuranceMonthly,
      insPerYear,
      hoaPerMonth,
      miPct,
    },
  };

  return NextResponse.json(payload, { status: 200 });
}
/* === COPY END: app/api/calc/payment/route.ts === */
