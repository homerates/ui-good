import { useState, useEffect, useRef } from 'react';

function easeOutCubic(t: number) { return 1 - (1 - t) ** 3; }

/**
 * Counts up from 0 to `target` on first mount, then smoothly transitions
 * between values on subsequent changes (e.g. slider adjustments).
 */
export function useAnimatedNumber(
  target: number,
  initialDuration = 900,
  updateDuration  = 400,
): number {
  const [val, setVal]  = useState(0);
  const fromRef        = useRef(0);
  const rafRef         = useRef<number | null>(null);
  const isFirstRef     = useRef(true);

  useEffect(() => {
    const duration = isFirstRef.current ? initialDuration : updateDuration;
    isFirstRef.current = false;

    const from = fromRef.current;
    const t0   = performance.now();

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    function tick(now: number) {
      const p = Math.min((now - t0) / duration, 1);
      const v = Math.round(from + (target - from) * easeOutCubic(p));
      fromRef.current = v;
      setVal(v);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
        setVal(target);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  // initialDuration/updateDuration are always constants — omit from deps intentionally
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return val;
}
