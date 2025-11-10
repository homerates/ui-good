// ==== REPLACE ENTIRE FILE: app/api/calc/payment/route.ts ====
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';

function noStore(json: unknown, status = 200) {
  const res = NextResponse.json(json, { status });
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

// ---------- helpers ----------
function isFiniteNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function parseMoney(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const s = raw.trim().toLowerCase().replace(/,/g, '');
  const m = s.match(/^\$?\s*([\d]+(?:\.[\d]+)?)\s*([km])?\b/);
  if (!m) return undefined;
  let n = parseFloat(m[1]);
  const unit = m[2];
  if (unit === 'k') n *= 1_000;
  if (unit === 'm') n *= 1_000_000;
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n);
}

function parsePercent(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const m = raw.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : undefined;
}

function solvePI(loanAmount: number, annualRatePct: number, termYears: number): number | undefined {
  const r = (annualRatePct / 100) / 12;
  const n = termYears * 12;
  if (!(r > 0) || !(n > 0) || !(loanAmount > 0)) return undefined;
  const denom = 1 - Math.pow(1 + r, -n);
  if (denom <= 0) return undefined;
  const pmt = loanAmount * (r / denom);
  return Math.round(pmt * 100) / 100;
}

/** Lightweight parser for free-form q, mirrors your client patterns enough for MVP */
function parseFromQ(q: string) {
  const clean = q.replace(/,/g, '').toLowerCase();

  // dollars (with optional k/m) that are NOT followed by %
  const moneyTokens = Array.from(clean.matchAll(/\$?\s*\d+(?:\.\d+)?\s*[km]?\b/g))
    .map((m) => {
      const start = m.index ?? 0;
      const text = m[0];
      const end = start + text.length;
      const next = clean.slice(end, end + 3);
      return { text, index: start, value: parseMoney(text), followedByPercent: /^\s*%/.test(next) };
    });

  // rate %
  let annualRatePct: number | undefined;
  const near = clean.match(/(?:rate|at|@)\s*:?[\s]*([0-9]+(?:\.[0-9]+)?)\s*%/i);
  if (near) annualRatePct = parseFloat(near[1]);
  if (!isFiniteNum(annualRatePct)) {
    const any = clean.match(/([0-9]+(?:\.\d+)?)\s*%/);
    if (any) annualRatePct = parseFloat(any[1]);
  }

  // term years
  const yearsMatch = clean.match(/(\d+)\s*(years?|yrs?|yr|y)\b/);
  let termYears = yearsMatch ? parseInt(yearsMatch[1], 10) : undefined;

  // explicit "loan amount: $X"
  let loanAmount: number | undefined;
  const loanExplicit = clean.match(/\bloan(?:\s*amount)?(?:\s*[:=])?\s*(?:of\s*)?(\$?\s*\d+(?:\.\d+)?\s*[km]?)\b/);
  if (loanExplicit?.[1]) loanAmount = parseMoney(loanExplicit[1]);

  // fallback: first non-% money token interpreted as loan
  if (!isFiniteNum(loanAmount)) {
    const candidate = moneyTokens.find((t) => !t.followedByPercent)?.value;
    if (isFiniteNum(candidate)) loanAmount = candidate;
  }

  // down %
  const downMatch = clean.match(/(\d+(?:\.\d+)?)\s*%\s*down/);
  const downPercent = downMatch ? parseFloat(downMatch[1]) : undefined;

  // purchase price (if they used "price" words)
  let purchasePrice: number | undefined;
  if (!isFiniteNum(loanAmount)) {
    const priceHint = /\b(purchase|purchase\s*price|price|home|house|pp|value)\b/.test(clean);
    if (priceHint) {
      const t = moneyTokens.find((t) => !t.followedByPercent)?.value;
      if (isFiniteNum(t)) purchasePrice = t;
    }
  }

  // default term if context exists
  if (!termYears && (isFiniteNum(loanAmount) || isFiniteNum(purchasePrice)) && isFiniteNum(annualRatePct)) {
    termYears = 30;
  }

  return { loanAmount, purchasePrice, downPercent, annualRatePct, termYears };
}

// ---------- handler ----------
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sp = url.searchParams;

    // 1) Read structured params
    let loanAmount = parseMoney(sp.get('loanAmount'));
    const purchasePrice = parseMoney(sp.get('purchasePrice'));
    const downPercent = parsePercent(sp.get('downPercent'));
    let annualRatePct = parsePercent(sp.get('annualRatePct'));
    let termYears = parseInt(sp.get('termYears') || '', 10);
    if (!Number.isFinite(termYears)) termYears = undefined as any;

    // 2) If missing, try free-form q
    if (!loanAmount || !annualRatePct || !termYears) {
      const q = sp.get('q') || '';
      if (q.trim()) {
        const parsed = parseFromQ(q);
        loanAmount = loanAmount ?? parsed.loanAmount;
        annualRatePct = annualRatePct ?? parsed.annualRatePct;
        termYears = termYears ?? parsed.termYears;
        // if they gave price + down% instead of loan
        if (!loanAmount && parsed.purchasePrice && isFiniteNum(parsed.downPercent)) {
          loanAmount = Math.round(parsed.purchasePrice * (1 - parsed.downPercent / 100));
        }
      }
    }

    // 3) If still no loan amount, derive from price + down%
    if (!loanAmount && isFiniteNum(purchasePrice) && isFiniteNum(downPercent)) {
      loanAmount = Math.round(purchasePrice * (1 - (downPercent! / 100)));
    }

    // Defaults: if we have enough context, assume 30y term
    if (!termYears && isFiniteNum(annualRatePct) && isFiniteNum(loanAmount)) termYears = 30;

    // Validate
    if (!isFiniteNum(loanAmount) || !isFiniteNum(annualRatePct) || !isFiniteNum(termYears)) {
      return noStore(
        {
          path: 'error',
          usedFRED: false,
          message:
            'Need loanAmount + annualRatePct + termYears, or purchasePrice + downPercent + annualRatePct (+ termYears).',
          status: 400,
          generatedAt: new Date().toISOString(),
        },
        200 // keep 200 so UI shows the message without failing fetch()
      );
    }

    const monthlyPI = solvePI(loanAmount, annualRatePct, termYears) ?? 0;

    // Sensitivity: base ± 0.25%
    const deltas = [-0.25, 0.0, 0.25];
    const sensitivities = deltas
      .map((d) => {
        const r = annualRatePct + d;
        const pi = solvePI(loanAmount!, r, termYears!);
        return isFiniteNum(pi) ? { rate: r / 100, pi } : null;
      })
      .filter(Boolean) as { rate: number; pi: number }[];

    return noStore({
      path: 'calc',
      usedFRED: false,
      answer: {
        loanAmount,
        monthlyPI,
        sensitivities,
        // Optional fields left undefined until you pass taxes/ins/hoa/mi
        // monthlyTax, monthlyIns, monthlyHOA, monthlyMI, monthlyTotalPITI
      },
      generatedAt: new Date().toISOString(),
      status: 200,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return noStore(
      { path: 'error', usedFRED: false, message: `calc/payment failed: ${msg}`, status: 500, generatedAt: new Date().toISOString() },
      200
    );
  }
}
