import { motion } from 'framer-motion';
import type { ClosingCostLineItem } from '../../types';
import { flagForLineItem } from '../../types';
import { Tooltip } from '../shared';
import { formatCurrency } from '../../lib/formatters';
import { colors } from '../../design-system';

// This one-time flag highlight (1200ms fade, 300ms delay) is deliberately longer than the
// reusable UI-transition tokens in design-system/tokens.ts (max 500ms) — it's a special-purpose
// "notice this" effect, not a general transition, so it isn't promoted into the shared token set.
const FLAG_HIGHLIGHT_DURATION_S = 1.2;
const FLAG_HIGHLIGHT_DELAY_S = 0.3;

interface ClosingCostLineItemCardProps {
  item: ClosingCostLineItem;
}

const FLAG_COPY: Record<string, { label: string; color: string }> = {
  'within-range': { label: 'Within typical range', color: colors.semantic.good },
  'above-range': { label: 'Above typical range for this category', color: colors.semantic.warning },
  'below-range': { label: 'Below typical range for this category', color: colors.semantic.warning },
};

/**
 * COMPLIANCE: this card evaluates the CONSUMER'S OWN line item against a category range —
 * it never compares lenders or implies one lender's costs are better/worse than another's.
 * The copy is deliberately scoped to "this line item, this category" and never mentions a
 * lender name (ClosingCostLineItem has no lender field at all — see types/closingCost.ts).
 */
export function ClosingCostLineItemCard({ item }: ClosingCostLineItemCardProps) {
  const flag = flagForLineItem(item);
  const flagInfo = FLAG_COPY[flag];
  const isFlagged = flag !== 'within-range';

  return (
    <motion.div
      // One-time highlight on mount for a flagged item — not a persistent pulsing effect,
      // which would read as nagging rather than informative.
      initial={isFlagged ? { backgroundColor: 'rgba(217, 119, 6, 0.12)' } : false}
      animate={{ backgroundColor: 'rgba(217, 119, 6, 0)' }}
      transition={{ duration: FLAG_HIGHLIGHT_DURATION_S, delay: FLAG_HIGHLIGHT_DELAY_S }}
      className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 px-4 py-3"
    >
      <div className="min-w-0 flex-1">
        <Tooltip label={item.plainLanguageExplanation}>
          <button type="button" className="text-left text-sm font-medium text-neutral-900 underline decoration-dotted decoration-neutral-400 underline-offset-4">
            {item.category}
          </button>
        </Tooltip>
        <p className="mt-0.5 text-xs" style={{ color: flagInfo.color }}>
          {flagInfo.label}
          {item.rangeSource === 'mock' && (
            <span className="text-neutral-400"> · illustrative range, not a real benchmark</span>
          )}
        </p>
      </div>
      <div className="flex-shrink-0 text-right">
        <p className="text-base font-semibold text-neutral-900 tabular-nums">{formatCurrency(item.amount)}</p>
        <p className="text-xs text-neutral-400 tabular-nums">
          typical: {formatCurrency(item.typicalRangeLow)}–{formatCurrency(item.typicalRangeHigh)}
        </p>
      </div>
    </motion.div>
  );
}
