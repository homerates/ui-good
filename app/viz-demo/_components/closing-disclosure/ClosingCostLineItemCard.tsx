'use client';

import { motion } from 'framer-motion';
import type { ClosingCostLineItem } from '../../_types';
import { flagForLineItem } from '../../_types';
import { Tooltip } from '../shared';
import { formatCurrency } from '../../_lib/formatters';
import { colors } from '../../_design-system';

// This one-time flag highlight (1200ms fade, 300ms delay) is deliberately longer than the
// reusable UI-transition tokens in _design-system/tokens.ts (max 500ms) — it's a special-purpose
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
 * lender name (ClosingCostLineItem has no lender field at all — see _types/closingCost.ts).
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
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        borderRadius: 8,
        border: '1px solid #e2e8f0',
        padding: '12px 16px',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <Tooltip label={item.plainLanguageExplanation}>
          <button
            type="button"
            style={{
              textAlign: 'left',
              fontSize: 14,
              fontWeight: 500,
              color: '#0f172a',
              textDecoration: 'underline dotted',
              textDecorationColor: '#94a3b8',
              textUnderlineOffset: '4px',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            {item.category}
          </button>
        </Tooltip>
        <p style={{ marginTop: 2, fontSize: 12, color: flagInfo.color }}>
          {flagInfo.label}
          {item.rangeSource === 'mock' && (
            <span style={{ color: '#94a3b8' }}> · illustrative range, not a real benchmark</span>
          )}
        </p>
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', fontVariantNumeric: 'tabular-nums', margin: 0 }}>
          {formatCurrency(item.amount)}
        </p>
        <p style={{ fontSize: 12, color: '#94a3b8', fontVariantNumeric: 'tabular-nums', margin: 0 }}>
          typical: {formatCurrency(item.typicalRangeLow)}–{formatCurrency(item.typicalRangeHigh)}
        </p>
      </div>
    </motion.div>
  );
}
