'use client';

import { motion as motionDom } from 'framer-motion';
import type { CSSProperties, ReactNode } from 'react';
import { motion as motionTokens } from '../../_design-system';

interface CardProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  style?: CSSProperties;
}

/** Every panel in this module is a Card — this is the one place mount animation is defined,
 *  so all panels move consistently instead of each component picking its own transition. */
export function Card({ title, subtitle, children, style }: CardProps) {
  return (
    <motionDom.div
      variants={motionTokens.variants.fadeInUp}
      initial="hidden"
      animate="visible"
      transition={{ duration: motionTokens.durationMs.base / 1000, ease: motionTokens.easing.decelerate }}
      style={{
        borderRadius: 16,
        border: '1px solid #e2e8f0',
        backgroundColor: '#ffffff',
        padding: 20,
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
        ...style,
      }}
    >
      {(title || subtitle) && (
        <div style={{ marginBottom: 16 }}>
          {title && <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', margin: 0 }}>{title}</h3>}
          {subtitle && <p style={{ fontSize: 14, color: '#475569', marginTop: 2 }}>{subtitle}</p>}
        </div>
      )}
      {children}
    </motionDom.div>
  );
}
