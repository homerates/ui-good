import { motion } from 'framer-motion';
import type { LoanScenario, LoanScenarioBounds } from '../../types';
import { Slider } from '../shared';
import { formatCurrency, formatPercent } from '../../lib/formatters';
import { downPaymentPct, totalMonthlyPayment } from '../../lib/mortgageMath';
import { motion as motionTokens } from '../../design-system';

interface ScenarioSliderPanelProps {
  scenario: LoanScenario;
  bounds: LoanScenarioBounds;
  onChange: (next: LoanScenario) => void;
}

const TERM_LABELS: Record<number, string> = { 180: '15 yr', 240: '20 yr', 360: '30 yr' };

/**
 * Controls that mutate the consumer's OWN scenario — never a lender's terms, never a rate
 * "offer". The rate slider models "what if my rate were X", not a real quote.
 */
export function ScenarioSliderPanel({ scenario, bounds, onChange }: ScenarioSliderPanelProps) {
  const currentDownPct = downPaymentPct(scenario);
  const payment = totalMonthlyPayment(scenario);

  function updateDownPaymentPct(pct: number) {
    const downPayment = Math.round(scenario.homePrice * (pct / 100));
    onChange({ ...scenario, downPayment, principal: scenario.homePrice - downPayment });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Animated headline number — the derived consequence of whichever slider just moved.
          `key={payment}` forces Framer Motion to re-trigger the tick animation on every change,
          rather than animating a continuous value change (a discrete "pop" reads better for a
          dollar figure than a smooth numeric tween). */}
      <div>
        <p className="text-sm text-neutral-600">Estimated monthly payment</p>
        <motion.p
          key={Math.round(payment)}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: motionTokens.durationMs.fast / 1000 }}
          className="text-3xl font-bold text-neutral-900 tabular-nums"
        >
          {formatCurrency(payment)}
          <span className="text-base font-normal text-neutral-600">/mo</span>
        </motion.p>
      </div>

      <Slider
        label="Interest rate"
        value={scenario.annualRatePct}
        min={bounds.annualRatePct.min}
        max={bounds.annualRatePct.max}
        step={bounds.annualRatePct.step}
        onChange={v => onChange({ ...scenario, annualRatePct: v })}
        formatValue={v => formatPercent(v, 3)}
      />

      <div>
        <span className="text-sm font-medium text-neutral-800 block mb-1.5">Loan term</span>
        <div className="flex gap-2">
          {bounds.termMonths.options.map(term => (
            <button
              key={term}
              type="button"
              onClick={() => onChange({ ...scenario, termMonths: term })}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                scenario.termMonths === term
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {TERM_LABELS[term] ?? `${term / 12} yr`}
            </button>
          ))}
        </div>
      </div>

      <Slider
        label="Down payment"
        value={currentDownPct}
        min={bounds.downPaymentPct.min}
        max={bounds.downPaymentPct.max}
        step={bounds.downPaymentPct.step}
        onChange={updateDownPaymentPct}
        formatValue={v => `${formatPercent(v, 0)} (${formatCurrency(scenario.homePrice * (v / 100), { compact: true })})`}
      />

      <Slider
        label="Extra monthly principal"
        value={scenario.extraMonthlyPrincipal ?? 0}
        min={bounds.extraMonthlyPrincipal.min}
        max={bounds.extraMonthlyPrincipal.max}
        step={bounds.extraMonthlyPrincipal.step}
        onChange={v => onChange({ ...scenario, extraMonthlyPrincipal: v })}
        formatValue={v => (v === 0 ? 'None' : formatCurrency(v))}
      />
    </div>
  );
}
