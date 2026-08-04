import {
  ComposedChart,
  Bar,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import type { ClosingCostLineItem } from '../../types';
import { flagForLineItem } from '../../types';
import { colors, motion as motionTokens } from '../../design-system';
import { formatCurrency } from '../../lib/formatters';

interface ClosingCostBreakdownChartProps {
  items: ClosingCostLineItem[];
}

const FLAG_DOT_COLOR: Record<string, string> = {
  'within-range': colors.semantic.good,
  'above-range': colors.semantic.warning,
  'below-range': colors.semantic.warning,
};

/**
 * Each category shows its typical range as a floating background bar, with the consumer's
 * actual amount plotted as a marker on top — reading "is my number inside or outside the band"
 * at a glance, without a table of numbers. Never a lender comparison: every row is one line
 * item's OWN amount against its OWN category range.
 */
export function ClosingCostBreakdownChart({ items }: ClosingCostBreakdownChartProps) {
  const data = items.map(item => ({
    category: item.category,
    range: [item.typicalRangeLow, item.typicalRangeHigh] as [number, number],
    amount: item.amount,
    flag: flagForLineItem(item),
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.neutral[200]} horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(v: number) => formatCurrency(v, { compact: true })}
            stroke={colors.neutral[400]}
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="category"
            width={150}
            stroke={colors.neutral[400]}
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <RechartsTooltip
            formatter={(value, name) => {
              if (name === 'range' && Array.isArray(value)) {
                return [`${formatCurrency(Number(value[0]))}–${formatCurrency(Number(value[1]))}`, 'Typical range'];
              }
              return [formatCurrency(Number(value)), 'Your amount'];
            }}
            contentStyle={{ borderRadius: 8, border: `1px solid ${colors.neutral[200]}` }}
          />
          <Bar
            dataKey="range"
            fill={colors.neutral[200]}
            barSize={14}
            radius={4}
            isAnimationActive
            animationDuration={motionTokens.durationMs.slow}
          />
          <Scatter
            dataKey="amount"
            fill={colors.brand[600]}
            shape={(props: any) => {
              const { cx, cy, payload } = props;
              const color = FLAG_DOT_COLOR[payload.flag] ?? colors.brand[600];
              return <circle cx={cx} cy={cy} r={6} fill={color} stroke="white" strokeWidth={2} />;
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-neutral-400">
        Gray band = typical range for this category (illustrative). Dot = your amount — green if
        within range, amber if outside it.
      </p>
    </div>
  );
}
