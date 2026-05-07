// lib/discoverQuestions.ts
// Discover question definitions per loan type.
// Each question has an AI benchmark (derived from real scenario numbers)
// and a gap evaluator that runs against whatever the lender quoted.

export type LoanTypeKey = 'fha' | 'conventional' | 'va' | 'jumbo';

export type GapStatus = 'match' | 'check' | 'alert' | 'pending';

export type GapResult = {
  status: GapStatus;
  note: string;
};

export type ScenarioSnapshot = {
  price: number;
  loanAmount: number;
  downPct: number;
  rate: number;          // FRED benchmark rate
  term: number;
  ltv: number;           // decimal e.g. 0.965
  monthlyPayment: number;
  monthlyMIP?: number;   // FHA
  monthlyPMI?: number;   // Conventional
  fundingFee?: number;   // VA — dollar amount
};

export type DiscoverQuestion = {
  id: string;
  icon: string;
  title: string;
  aiValue: (s: ScenarioSnapshot) => string;
  aiSub:   (s: ScenarioSnapshot) => string;
  prompt:  (s: ScenarioSnapshot) => string;   // question to show/send lender
  inputType: 'pct' | 'dollar' | 'number' | 'text';
  inputPlaceholder: string | ((s: ScenarioSnapshot) => string);
  evaluateGap: (raw: string, s: ScenarioSnapshot) => GapResult;
};

// ─────────────────────────────────────────────────────────
// Shared questions (all loan types)
// ─────────────────────────────────────────────────────────

function q_rate(benchmarkNote = 'FRED 30yr · zero points'): DiscoverQuestion {
  return {
    id: 'interest-rate',
    icon: '📊',
    title: 'Interest Rate',
    aiValue: s => `${s.rate.toFixed(3)}%`,
    aiSub:   () => benchmarkNote,
    prompt:  s => `What rate are you quoting me on a ${fmt$(s.loanAmount)} loan, and does it include any discount points?`,
    inputType: 'pct',
    inputPlaceholder: 'e.g. 6.375',
    evaluateGap(raw, s) {
      const v = parseFloat(raw);
      if (!raw || isNaN(v)) return { status: 'pending', note: '' };
      const diff = v - s.rate;
      if (diff <= 0.25)  return { status: 'match', note: `${v.toFixed(3)}% — within 0.25% of FRED benchmark` };
      if (diff <= 0.50)  return { status: 'check', note: `${diff.toFixed(3)}% above benchmark — ask if points are included` };
      return { status: 'alert', note: `${diff.toFixed(3)}% above benchmark — request a rate sheet` };
    },
  };
}

function q_origination(): DiscoverQuestion {
  return {
    id: 'origination-fee',
    icon: '🏦',
    title: 'Origination Fee',
    aiValue: s => `$0 – ${fmt$(s.loanAmount * 0.01)}`,
    aiSub:   s => `0–1% of ${fmt$(s.loanAmount)} · Section A`,
    prompt:  s => `What is your total origination charge in Section A of the Loan Estimate on a ${fmt$(s.loanAmount)} loan?`,
    inputType: 'dollar',
    inputPlaceholder: 'e.g. 2750',
    evaluateGap(raw, s) {
      const v = parseDollar(raw);
      if (v === null) return { status: 'pending', note: '' };
      const pct = v / s.loanAmount;
      if (pct <= 0.01)  return { status: 'match',  note: `${(pct*100).toFixed(2)}% — within standard range` };
      if (pct <= 0.015) return { status: 'check',  note: `${(pct*100).toFixed(2)}% — ask for line-item breakdown` };
      return { status: 'alert', note: `${(pct*100).toFixed(2)}% — above typical 0–1% · request Section A itemization` };
    },
  };
}

function q_cashToClose(): DiscoverQuestion {
  return {
    id: 'cash-to-close',
    icon: '💰',
    title: 'Cash to Close',
    aiValue: s => fmt$(s.loanAmount * s.ltv === s.loanAmount ? s.price * (1 - (1 - s.ltv)) + s.price * 0.03 : s.price * (s.downPct / 100) + s.price * 0.03),
    aiSub:   s => `down + ~3% closing costs on ${fmt$(s.price)}`,
    prompt:  s => `What is my total cash to close on a ${fmt$(s.price)} purchase — including down payment, all fees, prepaids, and escrow setup?`,
    inputType: 'dollar',
    inputPlaceholder: 'e.g. 36500',
    evaluateGap(raw, s) {
      const v = parseDollar(raw);
      if (v === null) return { status: 'pending', note: '' };
      const benchmark = s.price * (s.downPct / 100) + s.price * 0.03;
      const diff = (v - benchmark) / benchmark;
      if (diff <= 0.10)  return { status: 'match', note: `${fmt$(v)} — within 10% of estimate` };
      if (diff <= 0.25)  return { status: 'check', note: `${fmt$(v - benchmark)} above estimate — ask for itemized breakdown` };
      return { status: 'alert', note: `${fmt$(v - benchmark)} above estimate — request full Loan Estimate before proceeding` };
    },
  };
}

function q_points(): DiscoverQuestion {
  return {
    id: 'points',
    icon: '🎯',
    title: 'Discount Points',
    aiValue: () => '0 points',
    aiSub:   () => 'FRED rate is always zero-point',
    prompt:  s => `Does your rate quote of ${s.rate.toFixed(3)}% include any discount points? What is the zero-point rate today?`,
    inputType: 'number',
    inputPlaceholder: 'e.g. 0, 0.5, 1',
    evaluateGap(raw) {
      const v = parseFloat(raw);
      if (!raw || isNaN(v)) return { status: 'pending', note: '' };
      if (v === 0)    return { status: 'match', note: 'Zero points — rate is comparable to benchmark' };
      if (v <= 0.5)   return { status: 'check', note: `${v} point(s) — ask for the equivalent no-cost rate` };
      return { status: 'alert', note: `${v} point(s) upfront — calculate break-even before committing` };
    },
  };
}

function q_rateLock(): DiscoverQuestion {
  return {
    id: 'rate-lock',
    icon: '⏱',
    title: 'Rate Lock',
    aiValue: () => '30-day',
    aiSub:   () => 'standard · 45-day adds ~0.125%',
    prompt:  s => `What does a 30-day vs 45-day rate lock cost on my ${fmt$(s.loanAmount)} loan? Do you offer a float-down option?`,
    inputType: 'text',
    inputPlaceholder: 'e.g. 30 days free',
    evaluateGap(raw) {
      if (!raw.trim()) return { status: 'pending', note: '' };
      return { status: 'match', note: raw };
    },
  };
}

// ─────────────────────────────────────────────────────────
// Loan-type specific questions
// ─────────────────────────────────────────────────────────

const FHA_QUESTIONS: DiscoverQuestion[] = [
  q_rate('FRED 30yr · zero points'),
  q_origination(),
  {
    id: 'monthly-mip',
    icon: '🔒',
    title: 'Monthly MIP',
    aiValue: s => s.monthlyMIP ? `${fmt$(s.monthlyMIP)}/mo` : `${fmt$(s.loanAmount * 0.0055 / 12)}/mo`,
    aiSub:   () => 'FHA 0.55%/yr · life of loan at <10% down',
    prompt:  s => `What is my monthly FHA MIP on a ${fmt$(s.loanAmount)} loan at 3.5% down? Does it ever cancel?`,
    inputType: 'dollar',
    inputPlaceholder: 'e.g. 248',
    evaluateGap(raw, s) {
      const v = parseDollar(raw);
      if (v === null) return { status: 'pending', note: '' };
      const bench = s.monthlyMIP ?? (s.loanAmount * 0.0055 / 12);
      const diff = Math.abs(v - bench) / bench;
      if (diff <= 0.05) return { status: 'match', note: `${fmt$(v)}/mo — matches HUD 0.55% guideline` };
      if (diff <= 0.15) return { status: 'check', note: `${fmt$(v)}/mo vs benchmark ${fmt$(bench)}/mo — verify MIP rate tier` };
      return { status: 'alert', note: `${fmt$(v)}/mo — significant difference from HUD guidelines · ask for MIP calculation sheet` };
    },
  },
  q_cashToClose(),
  q_rateLock(),
  q_points(),
];

const CONVENTIONAL_QUESTIONS: DiscoverQuestion[] = [
  q_rate('FRED 30yr · zero points'),
  q_origination(),
  {
    id: 'monthly-pmi',
    icon: '🛡',
    title: 'Monthly PMI',
    aiValue: s => s.monthlyPMI ? `${fmt$(s.monthlyPMI)}/mo` : s.ltv <= 0.80 ? 'None (≥20% down)' : `~${fmt$(s.loanAmount * 0.005 / 12)}/mo`,
    aiSub:   s => s.ltv <= 0.80 ? 'No PMI at 20%+ down' : 'Cancels at 80% LTV · ~0.5%/yr est.',
    prompt:  s => s.ltv <= 0.80
      ? `I have 20%+ down — can you confirm there is no PMI on this conventional loan?`
      : `What is my monthly PMI on a ${fmt$(s.loanAmount)} loan at ${s.downPct}% down? At what LTV does it cancel?`,
    inputType: 'dollar',
    inputPlaceholder: (s: ScenarioSnapshot) => s.ltv <= 0.80 ? '0' : 'e.g. 185',
    evaluateGap(raw, s) {
      const v = parseDollar(raw);
      if (v === null) return { status: 'pending', note: '' };
      if (s.ltv <= 0.80 && v === 0) return { status: 'match', note: 'No PMI confirmed — correct at ≥20% down' };
      if (s.ltv <= 0.80 && v > 0)   return { status: 'alert', note: `PMI quoted at ${fmt$(v)}/mo but LTV is ≤80% — ask why` };
      const bench = s.monthlyPMI ?? (s.loanAmount * 0.005 / 12);
      const diff = Math.abs(v - bench) / bench;
      if (diff <= 0.20) return { status: 'match', note: `${fmt$(v)}/mo — within expected PMI range` };
      if (diff <= 0.50) return { status: 'check', note: `${fmt$(v)}/mo vs estimate ${fmt$(bench)}/mo — PMI varies by credit score` };
      return { status: 'alert', note: `${fmt$(v)}/mo — well above estimate · ask for PMI provider and rate sheet` };
    },
  },
  q_cashToClose(),
  q_rateLock(),
  q_points(),
];

const VA_QUESTIONS: DiscoverQuestion[] = [
  q_rate('VA rate typically 0.25% below conventional'),
  {
    id: 'origination-va',
    icon: '🏦',
    title: 'Origination Fee',
    aiValue: s => `≤${fmt$(s.loanAmount * 0.01)}`,
    aiSub:   () => 'VA caps at 1% of loan · no junk fees',
    prompt:  s => `What is your origination fee on my VA loan of ${fmt$(s.loanAmount)}? VA caps the origination charge at 1%.`,
    inputType: 'dollar',
    inputPlaceholder: 'e.g. 2200',
    evaluateGap(raw, s) {
      const v = parseDollar(raw);
      if (v === null) return { status: 'pending', note: '' };
      const cap = s.loanAmount * 0.01;
      if (v <= cap)         return { status: 'match', note: `${fmt$(v)} — within VA 1% origination cap` };
      if (v <= cap * 1.05)  return { status: 'check', note: `${fmt$(v)} — slightly above 1% VA cap · confirm with lender` };
      return { status: 'alert', note: `${fmt$(v)} exceeds VA 1% origination cap — this may violate VA guidelines` };
    },
  },
  {
    id: 'funding-fee',
    icon: '🎖',
    title: 'VA Funding Fee',
    aiValue: s => s.fundingFee ? fmt$(s.fundingFee) : `~${fmt$(s.loanAmount * 0.0215)}`,
    aiSub:   () => '2.15% first use · waived if disabled vet',
    prompt:  s => `What is my VA funding fee on a ${fmt$(s.loanAmount)} loan, and is it financed or paid upfront? Is it waived for any reason?`,
    inputType: 'dollar',
    inputPlaceholder: 'e.g. 4750',
    evaluateGap(raw, s) {
      const v = parseDollar(raw);
      if (v === null) return { status: 'pending', note: '' };
      const bench = s.fundingFee ?? (s.loanAmount * 0.0215);
      const diff = Math.abs(v - bench) / bench;
      if (v === 0)          return { status: 'check', note: 'Funding fee waived — confirm service-connected disability exemption' };
      if (diff <= 0.10)     return { status: 'match', note: `${fmt$(v)} — consistent with 2.15% first-use rate` };
      return { status: 'check', note: `${fmt$(v)} vs ${fmt$(bench)} estimate — may be subsequent use (3.3%) or different down payment tier` };
    },
  },
  q_cashToClose(),
  q_rateLock(),
  q_points(),
];

const JUMBO_QUESTIONS: DiscoverQuestion[] = [
  {
    id: 'interest-rate-jumbo',
    icon: '📊',
    title: 'Interest Rate',
    aiValue: s => `${(s.rate + 0.25).toFixed(3)}% est.`,
    aiSub:   () => 'Jumbo typically +0.25% above conforming',
    prompt:  s => `What rate are you quoting on a ${fmt$(s.loanAmount)} jumbo loan, and does it include points?`,
    inputType: 'pct',
    inputPlaceholder: 'e.g. 6.625',
    evaluateGap(raw, s) {
      const v = parseFloat(raw);
      if (!raw || isNaN(v)) return { status: 'pending', note: '' };
      const bench = s.rate + 0.25;
      const diff = v - bench;
      if (diff <= 0.25)  return { status: 'match', note: `${v.toFixed(3)}% — within normal jumbo spread` };
      if (diff <= 0.50)  return { status: 'check', note: `${diff.toFixed(3)}% above est. — ask if lender holds in portfolio` };
      return { status: 'alert', note: `${diff.toFixed(3)}% above benchmark — get a second jumbo quote` };
    },
  },
  q_origination(),
  {
    id: 'portfolio-vs-sold',
    icon: '📁',
    title: 'Portfolio or Sold?',
    aiValue: () => 'Ask lender',
    aiSub:   () => 'Portfolio lenders offer more flexibility',
    prompt:  s => `Do you hold ${fmt$(s.loanAmount)} jumbo loans in your portfolio, or do you sell them to investors? How does that affect my rate and servicing?`,
    inputType: 'text',
    inputPlaceholder: 'Portfolio / Sold to investor',
    evaluateGap(raw) {
      if (!raw.trim()) return { status: 'pending', note: '' };
      return { status: 'match', note: raw };
    },
  },
  q_cashToClose(),
  q_rateLock(),
  {
    id: 'reserves',
    icon: '🏦',
    title: 'Reserves Required',
    aiValue: () => '6–12 months PITIA',
    aiSub:   () => 'Jumbo standard post-close reserve req.',
    prompt:  s => `How many months of reserves are required after closing on my ${fmt$(s.loanAmount)} jumbo loan?`,
    inputType: 'text',
    inputPlaceholder: 'e.g. 6 months',
    evaluateGap(raw) {
      if (!raw.trim()) return { status: 'pending', note: '' };
      const months = parseInt(raw);
      if (isNaN(months)) return { status: 'match', note: raw };
      if (months <= 12) return { status: 'match', note: `${months} months — within standard range` };
      return { status: 'check', note: `${months} months — above standard 6–12 · confirm with lender` };
    },
  },
];

export const QUESTIONS_BY_LOAN_TYPE: Record<LoanTypeKey, DiscoverQuestion[]> = {
  fha:          FHA_QUESTIONS,
  conventional: CONVENTIONAL_QUESTIONS,
  va:           VA_QUESTIONS,
  jumbo:        JUMBO_QUESTIONS,
};

export function getQuestions(loanType: LoanTypeKey): DiscoverQuestion[] {
  return QUESTIONS_BY_LOAN_TYPE[loanType] ?? CONVENTIONAL_QUESTIONS;
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────
function fmt$(n: number): string {
  return '$' + Math.round(n).toLocaleString();
}

function parseDollar(raw: string): number | null {
  const v = parseFloat(raw.replace(/[$,\s]/g, ''));
  return isNaN(v) ? null : v;
}

export const DISCLOSURE_TEXT = `HomeRates Discover sessions are stored anonymously. Scenario numbers, AI benchmarks, lender responses, and gap analysis are used to improve HomeRates AI accuracy over time. No personally identifiable information — names, contact details, or loan application data — is collected or retained as part of this analysis. Lenders whose responses appear in Discover sessions agree their answers may contribute anonymously to HomeRates AI training and market intelligence. This data is never sold.`;
