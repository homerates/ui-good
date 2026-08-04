import { useMemo, useState } from 'react';
import type { LoanScenario, LoanScenarioBounds } from '../../types';
import { Card } from '../shared';
import { ScenarioSliderPanel } from './ScenarioSliderPanel';
import { PaymentCompositionChart } from './PaymentCompositionChart';
import { AmortizationCrossoverChart } from './AmortizationCrossoverChart';
import { computeAmortizationSchedule, aggregateToYearly, findCrossoverMonth } from '../../lib/amortization';

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
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
      <Card title="Adjust your scenario" subtitle="Explore how rate, term, and down payment change your payment.">
        <ScenarioSliderPanel scenario={scenario} bounds={bounds} onChange={setScenario} />
      </Card>

      <div className="flex flex-col gap-5">
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
