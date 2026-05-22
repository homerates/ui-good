// lib/discoverQuestions.ts
// Discover — 4 universal evaluation buckets.
// Each bucket adapts its prompt text per loan type via factory.

export type LoanTypeKey = 'fha' | 'conventional' | 'va' | 'jumbo';
export type GapStatus   = 'match' | 'check' | 'alert' | 'pending';
export type GapResult   = { status: GapStatus; note: string };

export type ScenarioSnapshot = {
  price:         number;
  loanAmount:    number;
  downPct:       number;
  rate:          number;   // FRED benchmark rate
  term:          number;
  ltv:           number;   // decimal e.g. 0.965
  monthlyPayment: number;
  monthlyMIP?:   number;   // FHA
  monthlyPMI?:   number;   // Conventional
  fundingFee?:   number;   // VA — dollar amount
};

export type DiscoverQuestion = {
  id:              string;
  icon:            string;
  title:           string;
  subtopics:       string;   // shown as grey sub-label under title
  aiValue:         (s: ScenarioSnapshot) => string;
  aiSub:           (s: ScenarioSnapshot) => string;
  prompt:          (s: ScenarioSnapshot) => string;
  inputType:       'pct' | 'dollar' | 'number' | 'text';
  inputPlaceholder: string | ((s: ScenarioSnapshot) => string);
  evaluateGap:     (raw: string, s: ScenarioSnapshot) => GapResult;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt$(n: number): string {
  return '$' + Math.round(n).toLocaleString();
}
function parseDollar(raw: string): number | null {
  const v = parseFloat(raw.replace(/[$,\s]/g, ''));
  return isNaN(v) ? null : v;
}

// Appended to every chip question sent to the LO.
// Explicitly breaks the "push to application" reflex by clarifying this is
// pre-application education — legally identical to answering a seminar question
// or publishing rates on a website. No TRID trigger, no Loan Estimate required.
const COMPLIANCE_NOTE =
  `\n\n📋 HomeRates Discover — pre-application education inquiry. No application has been submitted, no credit has been pulled, and no Loan Estimate obligation is created by responding. You are being asked to share the same general program information you would publish on your website or present at an open house. Your response is not an origination agreement or rate lock.`;

// ─── 1. Rate, APR & Program ───────────────────────────────────────────────────
function makeRateQuestion(lt: LoanTypeKey): DiscoverQuestion {
  const loanSpecific: Record<LoanTypeKey, string> = {
    fha:          'What is the upfront MIP rate and will it be financed into the loan amount?',
    conventional: 'Are any discount points required to achieve this rate?',
    va:           'What is the VA funding fee and can it be financed into the loan?',
    jumbo:        'Is this a fixed rate or ARM, and what overlay requirements apply on credit and reserves?',
  };
  return {
    id:    'rate',
    icon:  '📊',
    title: 'Rate, APR & Program',
    subtopics: 'Exact rate · APR · fixed vs ARM · rate lock options & extension cost',
    aiValue: s => `${s.rate.toFixed(3)}%`,
    aiSub:   () => 'FRED 30yr avg interest rate · live benchmark',
    prompt:  s => `What is your interest rate on a ${fmt$(s.loanAmount)} ${lt.toUpperCase()} loan at ${s.downPct}% down? Is this fixed or ARM? What rate lock periods do you offer and what does a lock extension cost? ${loanSpecific[lt]}`,
    inputType: 'pct',
    inputPlaceholder: 'e.g. 6.875',
    evaluateGap(raw, s) {
      if (!raw) return { status: 'pending', note: '' };
      const v = parseFloat(raw);
      if (isNaN(v)) return { status: 'check', note: 'No specific rate quoted yet — reply in chat asking for an exact interest rate' };
      const diff = v - s.rate;
      // Jumbo rates carry a natural 0.35–0.65% premium above FRED conforming.
      // Apply a 0.50 offset so a 0.60% spread doesn't incorrectly fire as Alert.
      const premiumOffset = lt === 'jumbo' ? 0.50 : 0;
      const adjDiff = diff - premiumOffset;
      const typeCtx = lt === 'jumbo' ? ' (Jumbo portfolio premium applied)' : '';
      if (adjDiff <= 0.25) return { status: 'match', note: `${v.toFixed(3)}% — competitive${lt === 'jumbo' ? ' for Jumbo' : ' vs today\'s FRED average'}` };
      if (adjDiff <= 0.50) return { status: 'check', note: `${diff.toFixed(3)}% above FRED${typeCtx} — confirm no hidden points` };
      return             { status: 'alert', note: `${diff.toFixed(3)}% above FRED${typeCtx} — ask for rate sheet and zero-point option` };
    },
  };
}

// ─── 2. Costs & Cash to Close ─────────────────────────────────────────────────
function makeCostsQuestion(lt: LoanTypeKey): DiscoverQuestion {
  const loanSpecific: Record<LoanTypeKey, string> = {
    fha:          'Include the 1.75% UFMIP and first monthly MIP in the total.',
    conventional: 'Include origination fee, title, prepaids, and any PMI setup.',
    va:           'Include the VA funding fee and any lender fees outside the 1% VA cap.',
    jumbo:        'Include origination fee (benchmark 0–1%), title, prepaids, and any reserve requirements.',
  };
  return {
    id:    'costs',
    icon:  '💰',
    title: 'Costs & Cash to Close',
    subtopics: 'Origination fee · discount points · title · prepaids · total cash needed',
    aiValue: s => fmt$(s.price * (s.downPct / 100) + s.price * 0.03),
    aiSub:   s => `${s.downPct}% down + ~3% closing costs on ${fmt$(s.price)}`,
    prompt:  s => `What is your origination fee on this ${fmt$(s.loanAmount)} loan — flat fee or percentage? Are there discount points? What is my estimated total cash to close including all lender fees, title, prepaids, and escrow? ${loanSpecific[lt]}`,
    inputType: 'dollar',
    inputPlaceholder: s => `e.g. ${fmt$(s.price * (s.downPct / 100) + s.price * 0.03).replace('$', '')}`,
    evaluateGap(raw, s) {
      if (!raw) return { status: 'pending', note: '' };
      const v = parseDollar(raw);
      if (v === null) return { status: 'check', note: 'No cost figure quoted yet — ask the LO for a Loan Estimate with itemized fees' };
      const bench = s.price * (s.downPct / 100) + s.price * 0.03;
      const diff  = (v - bench) / bench;
      if (diff <= 0.08) return { status: 'match',  note: `${fmt$(v)} — within 8% of AI estimate` };
      if (diff <= 0.20) return { status: 'check',  note: `${fmt$(v - bench)} above estimate — ask for itemized Loan Estimate` };
      return { status: 'alert', note: `${fmt$(v - bench)} above estimate — request full Loan Estimate before proceeding` };
    },
  };
}

// ─── 3. Process & Timeline ────────────────────────────────────────────────────
function makeProcessQuestion(lt: LoanTypeKey): DiscoverQuestion {
  const loanSpecific: Record<LoanTypeKey, string> = {
    fha:          'FHA requires an FHA appraisal — does that add time to your process?',
    conventional: 'When is the latest you can remove the loan contingency given this timeline?',
    va:           'VA requires a VA appraisal (MPR inspection) — how does that affect your timeline?',
    jumbo:        'Jumbo loans often need a second appraisal — is that part of your process?',
  };
  return {
    id:    'process',
    icon:  '🗓',
    title: 'Process & Timeline',
    subtopics: 'Days to close · appraisal timing · UW approval · contingency removal · rate lock window',
    aiValue: () => '30–45 days',
    aiSub:   () => 'Appraisal day 3–5 · UW approval day 14 · contingency day 17–21',
    prompt:  s => `Walk me through your process on a ${fmt$(s.loanAmount)} purchase: How many days to close? When do you order the appraisal? What is your underwriting approval timeline, and what day do you recommend I remove my loan contingency? ${loanSpecific[lt]}`,
    inputType: 'text',
    inputPlaceholder: 'e.g. 30 days, appraisal day 5',
    evaluateGap(raw) {
      if (!raw.trim()) return { status: 'pending', note: '' };
      const days = parseInt(raw);
      if (!isNaN(days)) {
        if (days <= 30) return { status: 'match',  note: `${days} days — fast close, strong for competitive offers` };
        if (days <= 45) return { status: 'check',  note: `${days} days — confirm loan contingency removal day with your agent` };
        return { status: 'alert', note: `${days} days — above standard; may weaken your offer in a competitive market` };
      }
      return { status: 'match', note: raw };
    },
  };
}

// ─── 4. After Close & Future Rate ────────────────────────────────────────────
function makeAfterCloseQuestion(_lt: LoanTypeKey): DiscoverQuestion {
  return {
    id:    'after-close',
    icon:  '🔄',
    title: 'After Close & Future Rate',
    subtopics: 'No-cost refi options · rate monitoring · strike point alerts · lifetime guarantee · servicing quality',
    aiValue: () => 'Ask lender',
    aiSub:   () => 'Top lenders: rate monitoring + no-cost refi commitment',
    prompt:  () => `What is your commitment to me after this loan closes? Do you offer a no-cost refinance if rates drop? Do you actively monitor my rate and notify me when I hit a strike point? Do you offer a lifetime rate guarantee or certificate? And regardless of who services the loan, what is your personal commitment to staying involved?`,
    inputType: 'text',
    inputPlaceholder: 'e.g. Rate alerts + no-cost refi offered',
    evaluateGap(raw) {
      if (!raw.trim()) return { status: 'pending', note: '' };
      const lower = raw.toLowerCase();
      const hasMonitor = lower.includes('monitor') || lower.includes('alert') || lower.includes('track') || lower.includes('notify');
      const hasRefi    = lower.includes('refi') || lower.includes('refinan') || lower.includes('no-cost') || lower.includes('no cost');
      if (hasMonitor && hasRefi) return { status: 'match',  note: 'Rate monitoring + no-cost refi both confirmed — ask for it in writing' };
      if (hasMonitor || hasRefi) return { status: 'check',  note: 'Partial commitment — ask specifically for both rate monitoring and a no-cost refi program' };
      return { status: 'alert', note: 'No post-close commitment mentioned — this is a red flag. A lender who won\'t track your rate has no incentive to keep your business' };
    },
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getQuestions(loanType: LoanTypeKey): DiscoverQuestion[] {
  const lt = loanType ?? 'conventional';
  return [
    makeRateQuestion(lt),
    makeCostsQuestion(lt),
    makeProcessQuestion(lt),
    makeAfterCloseQuestion(lt),
  ];
}

export const DISCLOSURE_TEXT = `HomeRates Discover is a pre-application education tool. No application has been submitted, no credit has been pulled, and no Loan Estimate obligation is created through this process. Scenario numbers, AI benchmarks, lender responses, and gap analysis are stored anonymously and used to improve HomeRates AI accuracy. No personally identifiable information is collected or retained as part of this analysis. This tool does not constitute a commitment to lend or a rate lock.`;
