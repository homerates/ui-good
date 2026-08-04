import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion as motionDom } from 'framer-motion';
import { motion as motionTokens } from '../../design-system';

interface TooltipProps {
  label: ReactNode;
  children: ReactNode; // the trigger element
}

/** Hover/focus-triggered plain-language explanation — used for closing-cost line items and the
 *  amortization crossover annotation. Keyboard-accessible via focus, not just mouse hover. */
export function Tooltip({ label, children }: TooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      <AnimatePresence>
        {open && (
          <motionDom.div
            role="tooltip"
            variants={motionTokens.variants.popIn}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ duration: motionTokens.durationMs.fast / 1000 }}
            className="absolute bottom-full left-1/2 z-20 mb-2 w-64 -translate-x-1/2 rounded-lg bg-neutral-900 px-3 py-2 text-sm text-neutral-0 shadow-lg"
          >
            {label}
            <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-neutral-900" />
          </motionDom.div>
        )}
      </AnimatePresence>
    </span>
  );
}
