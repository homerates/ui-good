'use client';

import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion as motionDom } from 'framer-motion';
import { motion as motionTokens } from '../../_design-system';

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
      style={{ position: 'relative', display: 'inline-flex' }}
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
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              zIndex: 20,
              marginBottom: 8,
              width: 256,
              transform: 'translateX(-50%)',
              borderRadius: 8,
              backgroundColor: '#0f172a',
              padding: '8px 12px',
              fontSize: 14,
              color: '#ffffff',
              boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.2)',
            }}
          >
            {label}
            <span
              style={{
                position: 'absolute',
                left: '50%',
                top: '100%',
                transform: 'translateX(-50%)',
                border: '4px solid transparent',
                borderTopColor: '#0f172a',
              }}
            />
          </motionDom.div>
        )}
      </AnimatePresence>
    </span>
  );
}
