// One row in the Closing Disclosure Annotator. This type is intentionally silent on "who
// charged this" — it never carries a lender name or lender identifier. It describes a cost
// category and how the consumer's own number compares to a typical range for that category.
// COMPLIANCE: the "typical range" comparison flags a LINE ITEM as unusual, never a lender as
// bad — see ClosingCostLineItemCard.tsx for how this is worded in the UI.
export interface ClosingCostLineItem {
  id: string;
  /** e.g. "Loan Origination Fee", "Appraisal", "Title Insurance", "Recording Fees" */
  category: string;
  amount: number;
  typicalRangeLow: number;
  typicalRangeHigh: number;
  plainLanguageExplanation: string;
  /**
   * 'mock' today — every range in mock-data/closingCosts.mock.ts is a rough placeholder, NOT a
   * real industry benchmark. When a real benchmark source is wired in (e.g. a named annual
   * survey), this becomes that source's name so the UI can honestly cite it instead of
   * silently upgrading a fabricated number to look authoritative.
   * // DATA SOURCE TODO: real closing-cost benchmark data (e.g. a licensed industry survey)
   */
  rangeSource: 'mock' | string;
}

export type ClosingCostFlag = 'within-range' | 'above-range' | 'below-range';

export function flagForLineItem(item: ClosingCostLineItem): ClosingCostFlag {
  if (item.amount > item.typicalRangeHigh) return 'above-range';
  if (item.amount < item.typicalRangeLow) return 'below-range';
  return 'within-range';
}
