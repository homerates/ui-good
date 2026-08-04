import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { AmortizationPeriod } from '../../lib/amortization';
import { colors, motion as motionTokens } from '../../design-system';
import { formatCurrency, formatMonthYear } from '../../lib/formatters';

interface AmortizationCrossoverChartProps {
  schedule: AmortizationPeriod[];
  crossoverMonth: number | null;
}

/**
 * Principal vs. interest per month across the FULL schedule (month-level, not yearly —
 * the crossover annotation needs to point at an exact month, which a yearly aggregate can't).
 */
export function AmortizationCrossoverChart({ schedule, crossoverMonth }: AmortizationCrossoverChartProps) {
  const data = schedule.map(p => ({
    period: p.period,
    principal: p.principalPaid + p.extraPrincipalPaid,
    interest: p.interestPaid,
  }));

  return (
    <div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.neutral[200]} vertical={false} />
            <XAxis
              dataKey="period"
              tickFormatter={(m: number) => `Yr ${Math.ceil(m / 12)}`}
              stroke={colors.neutral[400]}
              fontSize={12}
              tickLine={false}
              interval={Math.floor(data.length / 10)}
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
              labelFormatter={(m) => formatMonthYear(Number(m))}
              contentStyle={{ borderRadius: 8, border: `1px solid ${colors.neutral[200]}` }}
            />
            <Line
              type="monotone"
              dataKey="interest"
              name="Interest"
              stroke={colors.chart.interest}
              strokeWidth={2}
              dot={false}
              isAnimationActive
              animationDuration={motionTokens.durationMs.slow}
            />
            <Line
              type="monotone"
              dataKey="principal"
              name="Principal"
              stroke={colors.chart.principal}
              strokeWidth={2}
              dot={false}
              isAnimationActive
              animationDuration={motionTokens.durationMs.slow}
            />
            {crossoverMonth && (
              <ReferenceLine
                x={crossoverMonth}
                stroke={colors.semantic.info}
                strokeDasharray="4 4"
                label={{
                  value: `Crossover: ${formatMonthYear(crossoverMonth)}`,
                  position: 'top',
                  fill: colors.semantic.info,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {crossoverMonth && (
        <p className="mt-3 text-sm text-neutral-600 leading-relaxed">
          <span className="font-semibold text-neutral-900">{formatMonthYear(crossoverMonth)}</span> is
          the month your payment starts going mostly toward equity instead of interest — before
          this point, more of every payment pays the bank; after it, more of every payment builds
          what you own.
        </p>
      )}
    </div>
  );
}
