import type { ClosingCostLineItem } from '../_types';

// Every typicalRangeLow/High here is a rough, illustrative placeholder — NOT a real industry
// benchmark. rangeSource: 'mock' makes that explicit end-to-end (see ClosingCostLineItem doc).
// // DATA SOURCE TODO: replace with a named, licensed closing-cost benchmark source and update
// rangeSource to that source's name.
export const mockClosingCosts: ClosingCostLineItem[] = [
  {
    id: 'origination',
    category: 'Loan Origination Fee',
    amount: 3_200,
    typicalRangeLow: 1_500,
    typicalRangeHigh: 3_000,
    plainLanguageExplanation:
      'What the lender charges to process, underwrite, and fund your loan — often quoted as a percentage of the loan amount.',
    rangeSource: 'mock',
  },
  {
    id: 'appraisal',
    category: 'Appraisal Fee',
    amount: 550,
    typicalRangeLow: 450,
    typicalRangeHigh: 700,
    plainLanguageExplanation:
      'Pays a licensed appraiser to independently confirm the home’s value — required by nearly every lender before closing.',
    rangeSource: 'mock',
  },
  {
    id: 'title-insurance',
    category: 'Title Insurance',
    amount: 1_850,
    typicalRangeLow: 1_000,
    typicalRangeHigh: 2_000,
    plainLanguageExplanation:
      "Protects you and the lender against a past ownership or lien dispute you didn't cause. Usually a one-time premium paid at closing.",
    rangeSource: 'mock',
  },
  {
    id: 'recording-fees',
    category: 'Recording Fees',
    amount: 175,
    typicalRangeLow: 100,
    typicalRangeHigh: 250,
    plainLanguageExplanation:
      'What your county charges to officially record the new deed and mortgage in public records.',
    rangeSource: 'mock',
  },
  {
    id: 'credit-report',
    category: 'Credit Report Fee',
    amount: 95,
    typicalRangeLow: 25,
    typicalRangeHigh: 75,
    plainLanguageExplanation:
      "Covers pulling your credit report(s) from the major bureaus during underwriting. This one's a bit above typical — worth asking your loan officer why.",
    rangeSource: 'mock',
  },
  {
    id: 'prepaid-interest',
    category: 'Prepaid Interest',
    amount: 620,
    typicalRangeLow: 300,
    typicalRangeHigh: 900,
    plainLanguageExplanation:
      'Interest that accrues between your closing date and the end of that month, paid up front so your first full payment starts the next month.',
    rangeSource: 'mock',
  },
];
