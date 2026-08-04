'use client';

import { useMemo, useState } from 'react';
import type { LoanScenario, LoanScenarioBounds } from '../../_types';
import { Card } from '../shared';
import { ScenarioSliderPanel } from './ScenarioSliderPanel';
import { PaymentCompositionChart } from './PaymentCompositionChart';
import { AmortizationCrossoverChart } from './AmortizationCrossoverChart';
import { computeAmortizationSchedule, aggregateToYearly, findCrossoverMonth } from '../../_lib/amortization';

interface PaymentCompositionExplorerProps {
  initialScenario: LoanScenario;
  bounds: LoanScenarioBounds;
}

/**
 * Top-level Payment Composition Explorer — owns the LoanScenario state, recomputes the
 * amortization schedule whenever it changes, and passes derived data down to the two charts.
 * The schedule/crossover recompute is cheap (pure arithmetic over ≤360 iterations) so it runs
 * synchronously on every slider tick with no debouncing needed.
 */
export function PaymentCompositionExplorer({ initialScenario, bounds }: PaymentCompositionExplorerProps) {
  const [scenario, setScenario] = useState<LoanScenario>(initialScenario);

  const schedule = useMemo(() => computeAmortizationSchedule(scenario), [scenario]);
  const yearlyData = useMemo(() => aggregateToYearly(schedule, scenario), [schedule, scenario]);
  const crossoverMonth = useMemo(() => findCrossoverMonth(schedule), [schedule]);

  return (
    <div className="vizDemoGrid">
      <Card title="Adjust your scenario" subtitle="Explore how rate, term, and down payment change your payment.">
        <ScenarioSliderPanel scenario={scenario} bounds={bounds} onChange={setScenario} />
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Card
          title="Payment composition over the life of your loan"
          subtitle="Principal, interest, taxes, and insurance — by year, not just month 1."
        >
          <PaymentCompositionChart
            data={yearlyData}
            hasHOA={(scenario.monthlyHOA ?? 0) > 0}
            hasPMI={(scenario.monthlyPMI ?? 0) > 0}
          />
        </Card>

        <Card
          title="When does more of your payment start building equity?"
          subtitle="Principal vs. interest, month by month."
        >
          <AmortizationCrossoverChart schedule={schedule} crossoverMonth={crossoverMonth} />
        </Card>
      </div>
    </div>
  );
}
