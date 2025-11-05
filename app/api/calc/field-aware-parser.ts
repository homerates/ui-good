export type ParsedCalc = {
  loanAmount?: number;
  annualRatePct?: number;
  termYears?: number;
  taxesPct?: number;
  insuranceMonthly?: number;
  hoaMonthly?: number;
};

const moneyRe = /\$?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+(?:\.[0-9]+)?)/g;
const pctRe = /([0-9]+(?:\.[0-9]+)?)\s*%/g;
const yearsRe = /([0-9]+(?:\.[0-9]+)?)\s*(years?|yrs?|y)\b/gi;
const monthsRe = /([0-9]+)\s*(months?|mos?)\b/gi;

function toNumber(raw: string) {
  return Number(raw.replace(/[\$,]/g, ''));
}

function nearestNumberAfter(text: string, anchor: RegExp, valueRe: RegExp): number | undefined {
  const m = anchor.exec(text);
  if (!m) return undefined;
  valueRe.lastIndex = anchor.lastIndex;
  const v = valueRe.exec(text);
  if (!v) return undefined;
  return toNumber(v[1]);
}

export function parseCalcQuery(input: string): ParsedCalc {
  const loan = nearestNumberAfter(input, /\b(loan|amount|purchase|price|home|house)\b/gi, moneyRe);

  const ratePct = (() => {
    let m: RegExpExecArray | null;
    let winner: number | undefined;
    pctRe.lastIndex = 0;
    while ((m = pctRe.exec(input))) {
      const val = Number(m[1]);
      if (val >= 0.5 && val <= 25) { winner = val; break; }
    }
    if (winner !== undefined) return winner;
    const nearRate = nearestNumberAfter(input, /\brate\b/gi, moneyRe);
    return nearRate && nearRate > 0 && nearRate < 25 ? nearRate : undefined;
  })();

  const termYears = (() => {
    let m = yearsRe.exec(input);
    if (m) return Number(m[1]);
    let mm = monthsRe.exec(input);
    if (mm) return Number(mm[1]) / 12;
    const short = /(\d+)\s*(yr|y)\b/i.exec(input);
    if (short) return Number(short[1]);
    return undefined;
  })();

  const taxesPct = (() => {
    let m: RegExpExecArray | null;
    pctRe.lastIndex = 0;
    while ((m = pctRe.exec(input))) {
      const idx = m.index;
      const window = input.slice(Math.max(0, idx - 20), idx + 10).toLowerCase();
      if (window.includes('tax')) return Number(m[1]);
    }
    return undefined;
  })();

  const insuranceMonthly = (() => {
    const nearIns = nearestNumberAfter(input, /\binsurance\b/gi, moneyRe);
    return nearIns ?? undefined;
  })();

  const hoaMonthly = (() => {
    const nearHoa = nearestNumberAfter(input, /\bhoa\b/gi, moneyRe);
    return nearHoa ?? undefined;
  })();

  let loanAmount = loan;
  if (loanAmount === undefined) {
    const monies = [...input.matchAll(moneyRe)].map(m => toNumber(m[1]));
    const plausible = monies.filter(n => n >= 1000);
    if (plausible.length) loanAmount = Math.max(...plausible);
  }

  return { loanAmount, annualRatePct: ratePct, termYears, taxesPct, insuranceMonthly, hoaMonthly };
}
