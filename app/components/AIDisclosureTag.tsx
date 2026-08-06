'use client';
// app/components/AIDisclosureTag.tsx
// Fannie Mae Lender Letter LL-2026-04 (effective 2026-08-06): disclose whenever
// a consumer is interacting with AI rather than a human. Place this next to any
// free-form AI-generated narrative — never next to deterministic calculated
// output (LLPA, PITI, DSCR, Decision Scores, buildNegotiationBrief()). See
// lib/disclosures.ts for the full scoping rule and the 2026-08-06 AI-narration
// audit for which surfaces need it.
//
// No single shared rendering component wraps AI narrative surfaces app-wide
// (confirmed by audit) -- this tag gets threaded into each surface
// individually, not applied globally.

import { useState } from 'react';
import { AI_GENERATED_LABEL, AI_GENERATED_TOOLTIP } from '../../lib/disclosures';

interface AIDisclosureTagProps {
  /** 'inline' — small tag next to a short piece of text (e.g. a chat message). 'block' — sits atop a longer AI-written section (e.g. property-intel's narrative panel). */
  variant?: 'inline' | 'block';
  className?: string;
  style?: React.CSSProperties;
}

export function AIDisclosureTag({ variant = 'inline', className, style }: AIDisclosureTagProps) {
  const [open, setOpen] = useState(false);

  const wrapStyle: React.CSSProperties =
    variant === 'block'
      ? { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.06)', ...style }
      : { display: 'inline-flex', flexDirection: 'column', gap: 4, ...style };

  return (
    <div className={className} style={wrapStyle}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', fontWeight: 600, color: '#8fa3b8', letterSpacing: '0.01em' }}>
        <span aria-hidden="true">✨</span>
        {AI_GENERATED_LABEL}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          title="About AI-generated content"
          aria-expanded={open}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1,
            fontSize: '0.7rem', color: open ? '#00e87a' : '#4b6080', transition: 'color .15s',
          }}
        >
          ⓘ
        </button>
      </span>
      {open && (
        <div style={{
          padding: '8px 12px', background: 'rgba(0,232,122,0.05)',
          border: '1px solid rgba(0,232,122,0.16)', borderRadius: 8,
          fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.6, maxWidth: 340,
        }}>
          {AI_GENERATED_TOOLTIP}
        </div>
      )}
    </div>
  );
}
