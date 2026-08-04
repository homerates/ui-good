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
    <label className="block">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-medium text-neutral-800">{label}</span>
        <span className="text-sm font-semibold text-brand-600 tabular-nums">{formatValue(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-brand-600 cursor-pointer"
      />
    </label>
  );
}
