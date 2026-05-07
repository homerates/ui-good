// lib/discoverCard.ts
// HomeRates Discover Card — educational mortgage prompt coach.
// Helps users know what to ask before sharing contact info with a lender.

export type DiscoverItem = {
  id: string;
  title: string;
  question: string;
  whyItMatters: string;
  likelyAnswer: string;
  gapToWatch: string;
  followUpPrompt: string;
};

export type DiscoverCard = {
  title: 'HomeRates Discover Card';
  subtitle: 'Questions to ask before you share your contact information';
  scenarioSummary?: {
    purchasePrice?: number;
    loanAmount?: number;
    downPayment?: number;
    downPaymentPercent?: number;
    loanType?: string;
    estimatedClosingCosts?: number;
    estimatedClosingCostPercent?: number;
    estimatedCashToClose?: number;
    sellerCredit?: number;
    points?: number;
    lenderCredit?: number;
    buyerAgentCompensationKnown?: boolean;
  };
  items: DiscoverItem[];
  contactReadinessScore?: 'Ready to compare' | 'Needs clarification' | 'Get another estimate first';
  finalCta: string;
};

export interface DiscoverCardInput {
  purchase_price?: number;
  loan_amount?: number;
  down_payment?: number;
  down_payment_percent?: number;
  loan_type?: string;
  interest_rate?: number;
  points?: number;
  lender_credit?: number;
  estimated_closing_costs?: number;
  estimated_cash_to_close?: number;
  seller_credit?: number;
  property_state?: string;
  occupancy?: string;
  agent_compensation?: number | boolean;
}

export function isDiscoverCardTrigger(text: string): boolean {
  return /compare\s+lenders?|closing\s+costs?|what\s+questions?\s+to\s+ask|before\s+applying|before\s+sharing|loan\s+estimate|cash\s+to\s+close|discount\s+points?|lender\s+credits?|seller\s+credits?|agent\s+commission|buyer\s+agent\s+comp|rate\s+comparison|mortgage\s+quote|quotes?\s+comparison|shop\s+(?:my\s+)?(?:loan|mortgage|rate|lender)|how\s+do\s+i\s+compare|what\s+(?:should|do)\s+i\s+ask/i.test(text);
}

function fmt$(n: number): string {
  return '$' + Math.round(n).toLocaleString();
}

function scoreReadiness(input: DiscoverCardInput): DiscoverCard['contactReadinessScore'] {
  const fields = [
    input.purchase_price,
    input.loan_type,
    input.estimated_closing_costs ?? input.estimated_cash_to_close,
    input.interest_rate,
  ].filter(Boolean).length;

  if (fields >= 3) return 'Ready to compare';
  if (fields >= 1) return 'Needs clarification';
  return 'Get another estimate first';
}

export function buildDiscoverCard(input: DiscoverCardInput = {}): DiscoverCard {
  const hasSummaryData = !!(
    input.purchase_price || input.loan_amount || input.loan_type ||
    input.estimated_closing_costs || input.estimated_cash_to_close
  );

  const closingCostPct =
    input.estimated_closing_costs && input.purchase_price
      ? parseFloat(((input.estimated_closing_costs / input.purchase_price) * 100).toFixed(2))
      : undefined;

  const scenarioSummary: DiscoverCard['scenarioSummary'] = hasSummaryData ? {
    ...(input.purchase_price    && { purchasePrice: input.purchase_price }),
    ...(input.loan_amount       && { loanAmount: input.loan_amount }),
    ...(input.down_payment      && { downPayment: input.down_payment }),
    ...(input.down_payment_percent && { downPaymentPercent: input.down_payment_percent }),
    ...(input.loan_type         && { loanType: input.loan_type }),
    ...(input.estimated_closing_costs && { estimatedClosingCosts: input.estimated_closing_costs }),
    ...(closingCostPct !== undefined  && { estimatedClosingCostPercent: closingCostPct }),
    ...(input.estimated_cash_to_close && { estimatedCashToClose: input.estimated_cash_to_close }),
    ...(input.seller_credit     && { sellerCredit: input.seller_credit }),
    ...(input.points != null    && { points: input.points }),
    ...(input.lender_credit     && { lenderCredit: input.lender_credit }),
    ...(input.agent_compensation != null && { buyerAgentCompensationKnown: true }),
  } : undefined;

  const priceStr  = input.purchase_price ? fmt$(input.purchase_price) : 'your home';
  const loanStr   = input.loan_amount    ? fmt$(input.loan_amount)    : 'your loan';
  const ccStr     = input.estimated_closing_costs ? fmt$(input.estimated_closing_costs) : '2–4% of purchase price';
  const loanType  = input.loan_type?.toUpperCase() ?? 'Conventional';
  const ccPctStr  = closingCostPct ? `${closingCostPct.toFixed(1)}%` : '2–4%';

  const items: DiscoverItem[] = [
    {
      id: 'cost-transparency',
      title: 'Cost Transparency',
      question: 'What is my total cash to close, and what does it include?',
      whyItMatters: `Cash to close is your down payment plus closing costs, prepaids, and escrow reserves. On ${priceStr}, that's typically ${ccPctStr} of the purchase price on top of your down payment — a number that varies by lender and state.`,
      likelyAnswer: `A responsible lender can give you a good-faith worksheet before you apply. Formal disclosure comes as a Loan Estimate within 3 business days of application.`,
      gapToWatch: `If a lender can't estimate total cash to close until after you apply, ask why. Vague answers here often mean surprises at the closing table.`,
      followUpPrompt: 'Can you show me a fee worksheet or informal breakdown before I apply?',
    },
    {
      id: 'lender-charges',
      title: 'Lender-Controlled Charges',
      question: 'Which fees are yours to set, and which are third-party?',
      whyItMatters: `Origination, processing, and underwriting fees are 100% set by the lender — these are negotiable. Title, escrow, appraisal, and government fees are third-party and roughly consistent across lenders. Only Section A of the Loan Estimate is fully in a lender's control.`,
      likelyAnswer: `Origination fees typically run 0–1% of ${loanStr}. Processing and underwriting: $500–$1,500. Any line item labeled "admin fee," "doc prep fee," or "application fee" is lender-set profit.`,
      gapToWatch: `Fees that appear in Section A but lack a clear description are worth questioning. The lender must honor LE figures within 10% at closing — hold them to it.`,
      followUpPrompt: 'Can you walk me through Section A of your Loan Estimate line by line?',
    },
    {
      id: 'points-credits',
      title: 'Points and Lender Credits',
      question: input.points != null
        ? `This quote includes ${input.points} point(s). What does the no-cost option look like?`
        : 'Does this rate quote include discount points, and what is the no-cost alternative?',
      whyItMatters: `Points (discount points) let you buy down your interest rate by paying upfront. One point = 1% of loan amount. Lender credits work in reverse — you accept a slightly higher rate in exchange for the lender covering closing costs. Neither is automatically bad, but you need to see both options to evaluate them.`,
      likelyAnswer: `Typical buydown: 0.25% rate reduction per point paid. Break-even is usually 4–7 years. If you plan to stay long-term, paying points often wins. Short-term? Credits may be smarter.`,
      gapToWatch: input.points != null && input.points > 0
        ? `This quote already includes points. Request the zero-point alternative so you can compare total cost of ownership, not just the monthly payment.`
        : `If a lender quotes a rate without mentioning points, assume the rate may include them. Always ask for the zero-point equivalent.`,
      followUpPrompt: 'What does this loan look like with zero points? And what\'s the rate if I use lender credits to cover fees?',
    },
    {
      id: 'title-escrow',
      title: 'Third-Party and Title/Escrow Fees',
      question: 'Can I shop for my own title company, and do you have an affiliated provider?',
      whyItMatters: `Title insurance and settlement fees are among the largest closing costs — often 0.5–1.0% of the purchase price. Federal law (RESPA) gives you the right to shop for your own title company in most cases. Lenders with affiliated settlement services may recommend those providers — which can be convenient but isn't always the best price.`,
      likelyAnswer: `Yes, in most states you can choose your own title company. Your agent or attorney often has relationships with competitive providers. Getting one competing title quote is worth 30 minutes.`,
      gapToWatch: `Ask directly: "Do you have a financial interest in the title or settlement company you're recommending?" RESPA requires disclosure of affiliated business arrangements.`,
      followUpPrompt: 'Do you have an affiliated title company, and am I required to use them?',
    },
    {
      id: 'prepaids-escrow',
      title: 'Prepaids and Escrow Reserves',
      question: 'What property tax rate and insurance estimate are you using to calculate my escrow?',
      whyItMatters: `Prepaids and escrow setup — first year's homeowners insurance, prepaid mortgage interest, and 2–3 months of tax and insurance reserves — typically add $3,000–$8,000 to closing costs. Some lenders use optimistic assumptions to make the total cash to close look lower than it will be.`,
      likelyAnswer: `Escrow reserves: typically 2–3 months of property taxes and homeowners insurance. Your first year insurance premium is paid at closing. Prepaid interest covers the days from close to your first payment date.`,
      gapToWatch: `If the escrow estimate seems low, ask what property tax rate they used. In California and Texas, a 1% vs 2% assumption is a $3,000–$10,000 difference on a ${priceStr} home.`,
      followUpPrompt: 'What property tax rate and annual insurance estimate are you using in your escrow calculation?',
    },
    {
      id: 'seller-credits',
      title: 'Seller Credits and Strategy',
      question: input.seller_credit
        ? `A seller credit of ${fmt$(input.seller_credit)} is included. Does that affect my loan structure or approval odds?`
        : 'Can a seller credit cover my closing costs, and how does it affect the loan?',
      whyItMatters: `Seller credits (also called seller concessions) let the seller pay some or all of your closing costs, reducing your upfront cash requirement. ${loanType} loans allow up to ${loanType === 'FHA' ? '6%' : loanType === 'VA' ? '4%' : '3%'} of purchase price in seller concessions. They can be the difference between buying now and waiting longer to save more cash.`,
      likelyAnswer: `Seller credits are negotiated in the purchase contract. They reduce cash to close without changing the loan amount. Common in slower markets or when the seller wants a cleaner deal.`,
      gapToWatch: `Some lenders treat high seller credits as a red flag for appraisal pressure. Confirm upfront that your planned seller credit falls within program limits and doesn't require a price adjustment.`,
      followUpPrompt: 'If I negotiate a seller credit of 2–3%, does that change my interest rate, approval timeline, or required documentation?',
    },
    {
      id: 'agent-comp',
      title: 'Agent Compensation',
      question: 'How is my buyer agent\'s fee structured, and is it included in my cash to close?',
      whyItMatters: `Post-NAR settlement (August 2024), buyer agent compensation is no longer automatically paid by the seller through the MLS. You may negotiate it directly, have it covered by a seller concession, or structure it into the transaction. How it's handled can affect your loan-to-value ratio and closing costs — some structures require lender approval.`,
      likelyAnswer: `Typical buyer agent fees: 2–2.5% of purchase price. Often covered by seller concession if negotiated upfront. If rolled into closing costs, it counts toward seller concession limits.`,
      gapToWatch: `Ask your lender: if the seller is covering buyer agent fees as part of the contract, is that classified separately from other concessions? Structuring it incorrectly can complicate underwriting.`,
      followUpPrompt: 'If my buyer agent fee is covered by a seller concession, does that count against my seller credit limit for this loan type?',
    },
    {
      id: 'contact-readiness',
      title: 'Contact Readiness',
      question: 'Have I compared at least two Loan Estimates before choosing a lender?',
      whyItMatters: `CFPB research shows that borrowers who compare at least three lenders save an average of $1,500 over the life of the loan — and often significantly more. A Loan Estimate is a standardized 3-page document you are legally entitled to receive within 3 business days of any application, at no cost, with no commitment.`,
      likelyAnswer: `Most buyers contact one lender and stop. Getting a second LE takes 15 minutes and gives you real negotiating leverage. The first lender often matches the better quote when shown a competitor's Loan Estimate.`,
      gapToWatch: `If a lender discourages you from shopping, that's a signal — not a reason to stay loyal. Your credit score only takes one inquiry hit if all mortgage applications are submitted within 14 days.`,
      followUpPrompt: 'What is the current FRED 30-year average rate, and how does your quote compare to it?',
    },
  ];

  return {
    title: 'HomeRates Discover Card',
    subtitle: 'Questions to ask before you share your contact information',
    ...(scenarioSummary && { scenarioSummary }),
    items,
    contactReadinessScore: scoreReadiness(input),
    finalCta: "Use these prompts before you share your contact information. The goal is not to avoid lenders. The goal is to choose who has earned the right to advise you.",
  };
}
