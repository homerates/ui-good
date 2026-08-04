'use client';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  formatValue: (value: number) => string;
}

/** Plain, accessible range input — deliberately not over-styled here since the VALUE display
 *  (where the animation lives) is composed by the caller via Framer Motion, not baked into this
 *  component, so ScenarioSliderPanel can control exactly how a changing number animates. */
export function Slider({ label, value, min, max, step, onChange, formatValue }: SliderProps) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: '#1e293b' }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#00e87a', fontVariantNumeric: 'tabular-nums' }}>
          {formatValue(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#00e87a', cursor: 'pointer' }}
      />
    </label>
  );
}
