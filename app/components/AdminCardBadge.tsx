'use client';
// AdminCardBadge — shows product code + card spec on each card in admin debug mode.
// Toggle with the "Card Labels" button in /admin. Stored in sessionStorage so it
// persists while testing but clears on tab close.

import { useEffect, useState } from 'react';

export const CARD_REGISTRY: Record<string, { code: string; name: string; family: string; trigger: string; outputs: string }> = {
  'PPC-001': {
    code:    'PPC-001',
    name:    'Property Preview Card',
    family:  'Display',
    trigger: 'property_lookup intent — Redfin/Zillow URL or address paste',
    outputs: 'Photo, price, beds/baths/sqft, listing status, source link',
  },
  'ISC-002': {
    code:    'ISC-002',
    name:    'Interactive Scenario Card',
    family:  'Scenario / Buyer',
    trigger: 'property_lookup or conventional/FHA/VA/jumbo calc intent',
    outputs: 'PITI, stacked bar, loan type tabs, buydown, Get Matched, Check Property',
  },
  'IQC-003': {
    code:    'IQC-003',
    name:    'Income Qualify Card',
    family:  'Scenario / Buyer',
    trigger: 'property_lookup (fires alongside ISC). hideDrawer=true in property lookup path',
    outputs: 'Min. income by DTI threshold, live DTI bar, FHA MIP / VA / Jumbo advisory',
  },
  'DSC-004': {
    code:    'DSC-004',
    name:    'Decision Score Card',
    family:  'Track 5 / Scoring',
    trigger: 'Auto-fires after property_lookup when address + 2+ L1/L2 inputs present',
    outputs: 'L1–L4 composite score, verdict, Get Matched → Track 5, Full Analysis → property-intel',
  },
  'DSCR-005': {
    code:    'DSCR-005',
    name:    'DSCR Slider Card',
    family:  'Scenario / Investor',
    trigger: 'dscr intent — "investment property", "rental income", "DSCR loan"',
    outputs: 'NOI, DSCR ratio, cap rate, cash-on-cash, break-even rent',
  },
  'BD-006': {
    code:    'BD-006',
    name:    'Buydown Slider Card',
    family:  'Scenario / Buyer',
    trigger: 'buydown intent — "2/1 buydown", "rate buydown", "builder credit"',
    outputs: 'Year-by-year payment table, buydown cost, seller credit coverage',
  },
  'REFI-007': {
    code:    'REFI-007',
    name:    'Refi Intelligence Card',
    family:  'Scenario / Homeowner',
    trigger: 'refi intent — "refinance", "lower my rate", "break-even"',
    outputs: 'Monthly savings, break-even months, rate spread, lifetime savings',
  },
  'GK-008': {
    code:    'GK-008',
    name:    'Grok Card',
    family:  'AI / Market',
    trigger: 'market analysis, neighbourhood, school, comparables questions',
    outputs: 'Free-form AI markdown answer with Tavily + Grok web intelligence',
  },
  'AFFD-009': {
    code:    'AFFD-009',
    name:    'Affordability Slider',
    family:  'Scenario / Buyer',
    trigger: 'affordability intent — "how much can I afford", income + savings present',
    outputs: 'Max home price, recommended price, monthly budget breakdown',
  },
  'CMA-010': {
    code:    'CMA-010',
    name:    'CMA / Check Property Card',
    family:  'Scenario / Buyer',
    trigger: 'check-property page or CMA intent',
    outputs: 'AVM, comp table, market stats, L2/L3 score inputs',
  },
  'LIC-011': {
    code:    'LIC-011',
    name:    'Locked Intelligence Card',
    family:  'Track 5 / Scoring',
    trigger: 'Scenario seed (ISC) present but no property address — replaces DSC in stack',
    outputs: '4 locked level tiles, teaser copy, Check a Property CTA',
  },
  // ── Stack codes ───────────────────────────────────────────────────────────────
  // 4CS1234 = property-first: PropertyPreviewCard(1) → ISC(2) → IQC(3) → DSC(4)
  // 4CS2341 = scenario-first: ISC(2) → IQC(3) → LIC(4) — no property card
  // 2CS     = comparison stacks (2 scenario columns side-by-side)
  '4CS1234-CONV':  { code: '4CS1234-CONV',  name: 'Stack: Property → Conv',        family: 'Stack / Property-First',   trigger: 'property_lookup · conventional loan',          outputs: 'PropertyPreviewCard + ISC + IQC + DSC' },
  '4CS1234-JUMBO': { code: '4CS1234-JUMBO', name: 'Stack: Property → Jumbo',       family: 'Stack / Property-First',   trigger: 'property_lookup · jumbo loan >$832,750',       outputs: 'PropertyPreviewCard + ISC + IQC + DSC' },
  '4CS1234-FHA':   { code: '4CS1234-FHA',   name: 'Stack: Property → FHA',         family: 'Stack / Property-First',   trigger: 'property_lookup · FHA loan',                   outputs: 'PropertyPreviewCard + ISC + IQC + DSC' },
  '4CS1234-VA':    { code: '4CS1234-VA',    name: 'Stack: Property → VA',          family: 'Stack / Property-First',   trigger: 'property_lookup · VA loan',                    outputs: 'PropertyPreviewCard + ISC + IQC + DSC' },
  '4CS2341-CONV':  { code: '4CS2341-CONV',  name: 'Stack: Scenario → Conv',        family: 'Stack / Scenario-First',   trigger: 'convHBSlider · conventional scenario seed',    outputs: 'ISC + IQC + LIC (no property)' },
  '4CS2341-JUMBO': { code: '4CS2341-JUMBO', name: 'Stack: Scenario → Jumbo',       family: 'Stack / Scenario-First',   trigger: 'jumboSlider · jumbo scenario seed',            outputs: 'ISC + IQC + LIC (no property)' },
  '4CS2341-FHA':   { code: '4CS2341-FHA',   name: 'Stack: Scenario → FHA',         family: 'Stack / Scenario-First',   trigger: 'fhaSlider · FHA scenario seed',                outputs: 'ISC + IQC + LIC (no property)' },
  '4CS2341-VA':    { code: '4CS2341-VA',    name: 'Stack: Scenario → VA',          family: 'Stack / Scenario-First',   trigger: 'vaSlider · VA scenario seed',                  outputs: 'ISC + IQC + LIC (no property)' },
  '2CS-CONV-JUMBO':{ code: '2CS-CONV-JUMBO',name: 'Stack: Conv vs Jumbo',          family: 'Stack / Comparison',       trigger: 'loan amount near $832,750 threshold',          outputs: 'Side-by-side Conv + Jumbo scenario columns' },
  '2CS-CONV-FHA':  { code: '2CS-CONV-FHA',  name: 'Stack: Conv vs FHA',            family: 'Stack / Comparison',       trigger: 'low down payment / FHA eligibility intent',    outputs: 'Side-by-side Conv + FHA scenario columns' },
  'AFFD-012': {
    code:    'AFFD-012',
    name:    'Affordability Purchase Card',
    family:  'Scenario / Buyer',
    trigger: 'affordability intent — purchase price hero, one loan-type variant per card',
    outputs: 'Purchase price hero, loan amount / LTV / income-to-qualify tiles, DTI bar, adjuster drawer, Check a Property CTA',
  },
};

const STORAGE_KEY = 'hr_admin_card_labels';

export function useAdminCardLabels() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    try { setActive(sessionStorage.getItem(STORAGE_KEY) === '1'); } catch {}
  }, []);
  return active;
}

export function toggleAdminCardLabels(): boolean {
  try {
    const next = sessionStorage.getItem(STORAGE_KEY) !== '1';
    if (next) sessionStorage.setItem(STORAGE_KEY, '1');
    else sessionStorage.removeItem(STORAGE_KEY);
    return next;
  } catch { return false; }
}

interface AdminCardBadgeProps {
  code: keyof typeof CARD_REGISTRY;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export default function AdminCardBadge({ code, position = 'top-right' }: AdminCardBadgeProps) {
  const active = useAdminCardLabels();
  const [tip, setTip] = useState(false);
  if (!active) return null;

  const card = CARD_REGISTRY[code];
  if (!card) return null;

  const pos: Record<string, React.CSSProperties> = {
    'top-right':    { top: 6,  right: 6  },
    'top-left':     { top: 6,  left: 6   },
    'bottom-right': { bottom: 6, right: 6 },
    'bottom-left':  { bottom: 6, left: 6  },
  };

  return (
    <div style={{ position: 'absolute', zIndex: 999, ...pos[position] }}>
      {/* Badge */}
      <button
        onClick={() => setTip(t => !t)}
        style={{
          background: '#ff6b35', color: '#fff', border: 'none',
          borderRadius: 4, padding: '2px 7px', fontSize: '0.6rem',
          fontWeight: 800, letterSpacing: '0.08em', cursor: 'pointer',
          fontFamily: 'DM Mono, monospace', lineHeight: 1.5,
          boxShadow: '0 1px 6px rgba(0,0,0,0.4)',
        }}
      >
        {card.code}
      </button>

      {/* Tooltip */}
      {tip && (
        <div style={{
          position: 'absolute', [position.includes('right') ? 'right' : 'left']: 0,
          [position.includes('top') ? 'top' : 'bottom']: 26,
          width: 280, background: '#0d1117',
          border: '1px solid #ff6b35', borderRadius: 8, padding: '10px 12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.6)', zIndex: 1000,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontFamily: 'DM Mono,monospace', fontSize: '0.65rem', fontWeight: 800, color: '#ff6b35' }}>{card.code}</span>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#e2e8f0' }}>{card.name}</span>
          </div>
          <div style={{ fontSize: '0.6rem', color: '#4b6080', marginBottom: 4, fontFamily: 'DM Mono,monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Family</div>
          <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginBottom: 8 }}>{card.family}</div>
          <div style={{ fontSize: '0.6rem', color: '#4b6080', marginBottom: 4, fontFamily: 'DM Mono,monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Trigger</div>
          <div style={{ fontSize: '0.65rem', color: '#94a3b8', lineHeight: 1.5, marginBottom: 8 }}>{card.trigger}</div>
          <div style={{ fontSize: '0.6rem', color: '#4b6080', marginBottom: 4, fontFamily: 'DM Mono,monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Outputs</div>
          <div style={{ fontSize: '0.65rem', color: '#94a3b8', lineHeight: 1.5 }}>{card.outputs}</div>
          <button onClick={() => setTip(false)} style={{ marginTop: 8, background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#4b6080', fontSize: '0.58rem', padding: '2px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>close</button>
        </div>
      )}
    </div>
  );
}
