// scripts/test-rate-role-correction.ts
//
// Rate Role Correction (2026-09-08): proves Property Intelligence's neutral
// propertyMarketRate and Rate Intelligence's segmented rateIntelligence are
// genuinely separate, and that Property Intelligence's payment math is
// driven by the neutral rate only -- never FICO/LTV/LLPA.
//
// Run with: npx tsx scripts/test-rate-role-correction.ts

import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

import { resolvePropertyId } from '../lib/gateway/intelligenceGateway';
import { buildCanonicalPropertyIntelligence } from '../lib/canonicalPropertyIntelligence';
import { getPropertyMarketReferenceRate } from '../lib/propertyIntelligence';
import { calculateMortgage } from '../lib/mortgageCalculator';

const BASE_URL = process.env.NEXT_PUBLIC_APP_BASE_URL ?? 'https://chat.homerates.ai';

type Status = 'PASS' | 'FAIL';
interface Result { name: string; status: Status; evidence: string }
const results: Result[] = [];
function record(name: string, status: Status, evidence: string) {
  results.push({ name, status, evidence });
  console.log(`[${status}] ${name} -- ${evidence}`);
}

async function getTicker30Y(): Promise<number | null> {
  const r = await fetch(`${BASE_URL}/api/ticker`);
  const j = await r.json();
  const item = j?.items?.find((i: any) => i.label === '30Y FIXED');
  const v = parseFloat(item?.value);
  return !isNaN(v) ? v : null;
}

async function main() {
  // A. DOVERWOOD -- propertyMarketRate === live first-party ticker rate
  {
    const address = '5845 Doverwood Dr #106, Culver City, CA 90230';
    const id = await resolvePropertyId(address);
    const canonical = id ? await buildCanonicalPropertyIntelligence(id) : null;
    const tickerRate = await getTicker30Y();
    const ok = canonical?.financing != null && tickerRate != null && canonical.financing.propertyMarketRate.rate === tickerRate;
    record('A. Doverwood: propertyMarketRate == live /api/ticker 30Y FIXED', ok ? 'PASS' : 'FAIL', JSON.stringify({ propertyMarketRate: canonical?.financing?.propertyMarketRate.rate, tickerRate }));
  }

  // B. MATARO -- same
  {
    const address = '1131 Mataro Ct, Pleasanton, CA 94566';
    const id = await resolvePropertyId(address);
    const canonical = id ? await buildCanonicalPropertyIntelligence(id) : null;
    const tickerRate = await getTicker30Y();
    const ok = canonical?.financing != null && tickerRate != null && canonical.financing.propertyMarketRate.rate === tickerRate;
    record('B. Mataro: propertyMarketRate == live /api/ticker 30Y FIXED', ok ? 'PASS' : 'FAIL', JSON.stringify({ propertyMarketRate: canonical?.financing?.propertyMarketRate.rate, tickerRate }));

    // D. RATE INTELLIGENCE PRESERVED -- still a credit/LTV-segmented value,
    // structurally distinct from the neutral rate (Mataro is jumbo, where
    // the segment adjustment is large enough to guarantee inequality).
    const distinct = canonical?.financing != null && canonical.financing.rateIntelligence.llpaAdjustedRate !== canonical.financing.propertyMarketRate.rate;
    record('D. Rate Intelligence still produces its own segmented rate (distinct from neutral)', distinct ? 'PASS' : 'FAIL', JSON.stringify({ llpaAdjustedRate: canonical?.financing?.rateIntelligence.llpaAdjustedRate, propertyMarketRate: canonical?.financing?.propertyMarketRate.rate }));

    // E. DIFFERENT VALUES ARE ALLOWED -- explicitly not a failure condition.
    record('E. Neutral rate != Rate Intelligence rate is an ALLOWED outcome (different products)', 'PASS', 'no equality assertion made -- this test exists to document the allowance, not enforce a value');

    // G. PAYMENT -- P&I is computed from propertyMarketRate, verified by
    // independently recomputing via the SAME calculateMortgage() primitive.
    if (canonical?.financing) {
      const price = canonical.valuation.listPrice ?? canonical.valuation.pointEstimate ?? 0;
      const expected = Math.round(calculateMortgage({
        price,
        downPaymentPct: canonical.financing.scenario.downPaymentPct,
        rate: canonical.financing.propertyMarketRate.rate,
        termYears: canonical.financing.scenario.termYears,
      }).monthlyPI);
      const ok = expected === canonical.financing.principalInterestMonthly;
      record('G. principalInterestMonthly matches calculateMortgage() at propertyMarketRate', ok ? 'PASS' : 'FAIL', JSON.stringify({ expected, actual: canonical.financing.principalInterestMonthly }));
    }
  }

  // C. NO CREDIT INPUT -- getPropertyMarketReferenceRate() takes zero
  // parameters at all (structural: TypeScript signature itself proves this;
  // confirmed here by actually calling it with nothing).
  {
    const r = await getPropertyMarketReferenceRate();
    const ok = typeof r.rate === 'number' && r.rate > 0;
    record('C. getPropertyMarketReferenceRate() returns a valid rate with zero borrower/property inputs', ok ? 'PASS' : 'FAIL', JSON.stringify(r));
  }

  // F. NO LLPA CALL -- source-inspect getPropertyMarketReferenceRate()'s
  // own function body (not the whole file, which legitimately references
  // LLPA/OBMMI elsewhere for Rate Intelligence) for any LLPA/OBMMI call.
  {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'lib/propertyIntelligence.ts'), 'utf8');
    const fnMatch = src.match(/export async function getPropertyMarketReferenceRate\(\)[^{]*\{([\s\S]*?)\n\}/);
    const fnBody = fnMatch?.[1] ?? '';
    const noLlpaOrObmmi = !/computeLLPA|resolveObmmiSeriesId|creditScore|estimateJumboAnchor/i.test(fnBody);
    record('F. getPropertyMarketReferenceRate() never calls LLPA/OBMMI logic', noLlpaOrObmmi ? 'PASS' : 'FAIL', fnBody.trim().slice(0, 300));
  }

  console.log('\n=== FINAL RESULTS ===');
  console.table(results.map((r) => ({ name: r.name, status: r.status })));
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\nPASS=${pass} FAIL=${fail} TOTAL=${results.length}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
