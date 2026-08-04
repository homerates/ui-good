'use client';

import { motion } from 'framer-motion';
import type { LoanScenario, LoanScenarioBounds } from '../../_types';
import { Slider } from '../shared';
import { formatCurrency, formatPercent } from '../../_lib/formatters';
import { downPaymentPct, totalMonthlyPayment } from '../../_lib/mortgageMath';
import { motion as motionTokens } from '../../_design-system';

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Animated headline number — the derived consequence of whichever slider just moved.
          `key={payment}` forces Framer Motion to re-trigger the tick animation on every change,
          rather than animating a continuous value change (a discrete "pop" reads better for a
          dollar figure than a smooth numeric tween). */}
      <div>
        <p style={{ fontSize: 14, color: '#475569', margin: 0 }}>Estimated monthly payment</p>
        <motion.p
          key={Math.round(payment)}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: motionTokens.durationMs.fast / 1000 }}
          style={{ fontSize: 30, fontWeight: 700, color: '#0f172a', margin: 0, fontVariantNumeric: 'tabular-nums' }}
        >
          {formatCurrency(payment)}
          <span style={{ fontSize: 16, fontWeight: 400, color: '#475569' }}>/mo</span>
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
        <span style={{ fontSize: 14, fontWeight: 500, color: '#1e293b', display: 'block', marginBottom: 6 }}>
          Loan term
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {bounds.termMonths.options.map(term => {
            const active = scenario.termMonths === term;
            return (
              <button
                key={term}
                type="button"
                onClick={() => onChange({ ...scenario, termMonths: term })}
                className={active ? undefined : 'vizDemoTermBtn'}
                style={{
                  flex: 1,
                  borderRadius: 8,
                  border: `1px solid ${active ? '#00e87a' : '#e2e8f0'}`,
                  backgroundColor: active ? '#e8fdf3' : 'transparent',
                  color: active ? '#00b862' : '#475569',
                  padding: '8px 12px',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'background-color 150ms, border-color 150ms, color 150ms',
                }}
              >
                {TERM_LABELS[term] ?? `${term / 12} yr`}
              </button>
            );
          })}
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
