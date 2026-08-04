'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { YearlyComposition } from '../../_lib/amortization';
import { colors, motion as motionTokens } from '../../_design-system';
import { formatCurrency } from '../../_lib/formatters';

interface PaymentCompositionChartProps {
  data: YearlyComposition[];
  hasHOA: boolean;
  hasPMI: boolean;
}

const SERIES: { key: keyof YearlyComposition; label: string; color: string }[] = [
  { key: 'interest', label: 'Interest', color: colors.chart.interest },
  { key: 'principal', label: 'Principal', color: colors.chart.principal },
  { key: 'taxes', label: 'Property Tax', color: colors.chart.taxes },
  { key: 'insurance', label: 'Insurance', color: colors.chart.insurance },
  { key: 'pmi', label: 'PMI', color: colors.chart.pmi },
  { key: 'hoa', label: 'HOA', color: colors.chart.hoa },
];

/**
 * Stacked, animated composition of the payment over the FULL life of the loan — the direct
 * replacement for a static month-1 PITI pie chart. One stack per year (360 monthly bars would
 * be too dense to read as discrete stacks); animates on every scenario change via Recharts'
 * own transition, not Framer Motion — see README "Animation ownership".
 */
export function PaymentCompositionChart({ data, hasHOA, hasPMI }: PaymentCompositionChartProps) {
  const visibleSeries = SERIES.filter(s => {
    if (s.key === 'hoa') return hasHOA;
    if (s.key === 'pmi') return hasPMI;
    return true;
  });

  return (
    <div style={{ height: 320, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.neutral[200]} vertical={false} />
          <XAxis
            dataKey="year"
            tickFormatter={(y: number) => `Yr ${y}`}
            stroke={colors.neutral[400]}
            fontSize={12}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => formatCurrency(v, { compact: true })}
            stroke={colors.neutral[400]}
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <RechartsTooltip
            formatter={(value, name) => [formatCurrency(Number(value)), String(name)]}
            labelFormatter={(y) => `Year ${y}`}
            contentStyle={{ borderRadius: 8, border: `1px solid ${colors.neutral[200]}` }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {visibleSeries.map(s => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stackId="composition"
              stroke={s.color}
              fill={s.color}
              fillOpacity={0.85}
              isAnimationActive
              animationDuration={motionTokens.durationMs.slow}
              animationEasing="ease-out"
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
