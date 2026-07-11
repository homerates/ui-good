'use client';
// app/components/FredRateBadge.tsx
// Branded FRED rate disclosure badge — canonical brand element for all rate-bearing cards.
// Renders a blue pill: "📡 Seeded from FRED live rate: X.XXX% — {fredStamp}"

import React from 'react';

interface FredRateBadgeProps {
  rate: number;
  fredStamp?: string;
  /** Number of decimal places for the rate. Defaults to 3 for precision. */
  decimals?: number;
  /** Additional className for layout overrides */
  className?: string;
}

export default function FredRateBadge({ rate, fredStamp, decimals = 3, className }: FredRateBadgeProps) {
  if (!fredStamp) return null;
  return (
    <>
      <div className={`frb${className ? ` ${className}` : ''}`}>
        <span className="frb-icon">📡</span>
        <span className="frb-text">
          Seeded from FRED live rate:{' '}
          <strong className="frb-rate">{rate.toFixed(decimals)}%</strong>
          {' '}—{' '}{fredStamp}
        </span>
      </div>
      <style>{`
        .frb {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: rgba(61,139,255,0.08);
          border: 1px solid rgba(61,139,255,0.22);
          border-radius: 7px;
          padding: 4px 10px;
          font-size: 11px;
          color: #6aabff;
          font-weight: 600;
          letter-spacing: 0.01em;
          line-height: 1.4;
        }
        .frb-icon { font-size: 12px; flex-shrink: 0; }
        .frb-rate { color: #93c5fd; font-weight: 800; }
        .frb-text { color: #7bb8ff; }
      `}</style>
    </>
  );
}
