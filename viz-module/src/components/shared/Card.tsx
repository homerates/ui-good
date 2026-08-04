import { motion as motionDom } from 'framer-motion';
import type { ReactNode } from 'react';
import { motion as motionTokens } from '../../design-system';

interface CardProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

/** Every panel in this module is a Card — this is the one place mount animation is defined,
 *  so all panels move consistently instead of each component picking its own transition. */
export function Card({ title, subtitle, children, className = '' }: CardProps) {
  return (
    <motionDom.div
      variants={motionTokens.variants.fadeInUp}
      initial="hidden"
      animate="visible"
      transition={{ duration: motionTokens.durationMs.base / 1000, ease: motionTokens.easing.decelerate }}
      className={`rounded-2xl border border-neutral-200 bg-neutral-0 p-5 shadow-sm ${className}`}
    >
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>}
          {subtitle && <p className="text-sm text-neutral-600 mt-0.5">{subtitle}</p>}
        </div>
      )}
      {children}
    </motionDom.div>
  );
}
