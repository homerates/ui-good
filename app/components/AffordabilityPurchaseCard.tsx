'use client';
// app/components/AffordabilityPurchaseCard.tsx
// v4 — independent sliders, editable inputs, remount-safe state via module-level cache

import React, { useState } from 'react';
import { useAuth } from '@clerk/nextjs';

// ── Remount-safe state cache ───────────────────────────────────────────────────
// Keyed by message id (from chat/page.tsx). Because the card unmounts during
// typingId animation and loading, local useState alone can't survive remounts.
// This module-level Map persists state across unmount/remount within a session.
interface APCCachedState {
  price: number;
  downPct: number;
  downAmtFixed: number;
  downMode: 'pct' | 'dollar';
  rate: number;
  termYrs: number;
  annualIncome: number;
  monthlyDebt: number;
  vaFF: number;
  drawerOpen: boolean;
}
const _apcCache = new Map<string, APCCachedState>();
import AdminCardBadge from './AdminCardBadge';
import FredRateBadge from './FredRateBadge';
import LockedIntelligenceCard from './LockedIntelligenceCard';
import { calcPI } from '../../lib/math';
import {
  CONF_STANDARD,
  CONF_HIGH_BALANCE,
  FHA_UFMIP_RATE,
  FHA_ANNUAL_MIP_HIGH,
  FHA_ANNUAL_MIP_LOW,
  PMI_RATE_STD,
  DTI_STANDARD_MAX,
  DTI_VA_MAX,
} from '../../lib/constants';

export interface AffordabilityPurchaseParams {
  loanType: 'conventional' | 'fha' | 'va' | 'jumbo';
  price: number;
  downPct: number;
  rate: number;
  term: number;
  taxRate: number;
  insRate: number;
  annualIncome?: number;
  monthlyDebt?: number;
  vaFundingFeePct?: number;
  fredStamp?: string;
  /** Stable id from the parent chat message — used to key the remount-safe state cache */
  messageId?: string;
  /** When true, hides the LockedIntelligenceCard address CTA (e.g. property is already loaded) */
  hideAddressSearch?: boolean;
  onRunScenario?: (seed: string, overrides: Record<string, unknown>) => void;
  onLiveChange?: (vals: { price: number; downPct: number; rate: number; term: number; loanType: string }) => void;
}

// ── Formatting helpers ────────────────────────────────────────────────────────
function fmt$(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function fmtK(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 100_000)   return `$${Math.round(n / 1_000)}k`;
  return fmt$(n);
}
function parseCurrency(s: string): number {
  return parseFloat(s.replace(/[$,\s]/g, '')) || 0;
}
function parsePct(s: string): number {
  return parseFloat(s.replace(/[%\s]/g, '')) || 0;
}
function fillPct(value: number, min: number, max: number) {
  if (max <= min) return 0;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

export default function AffordabilityPurchaseCard(props: AffordabilityPurchaseParams) {
  const isFHA   = props.loanType === 'fha';
  const isVA    = props.loanType === 'va';
  const isJumbo = props.loanType === 'jumbo';

  const minDown    = isJumbo ? 20 : isFHA ? 3.5 : isVA ? 0 : 3;
  const priceMax   = isJumbo ? 10_000_000 : 3_000_000;
  const priceStep  = isJumbo ? 25_000 : 5_000;
  const incomeMax  = isJumbo ? 2_000_000 : 600_000;
  const incomeStep = isJumbo ? 10_000 : 5_000;
  // Fixed down-payment slider range — completely independent of price
  const downMaxDollar = priceMax / 2;

  const dtiThreshold = isVA ? DTI_VA_MAX : DTI_STANDARD_MAX;
  const dtiScale     = isVA ? 50 : 55;

  const ltAccent = isFHA ? '#f59e0b' : isVA ? '#14b8a6' : isJumbo ? '#8b5cf6' : '#00e87a';
  const ltLabel  = isFHA ? 'FHA' : isVA ? 'VA' : isJumbo ? 'Jumbo' : 'Conv/HB';

  // ── Remount-safe cache plumbing ────────────────────────────────────────────
  // On remount (typingId animation or loading), useState re-initializes from props.
  // The cache prevents that: state written here persists across unmounts within
  // the same session. Cache is keyed by props.messageId (provided by chat/page.tsx).
  const cacheKey = props.messageId ?? null;
  const cached   = cacheKey ? (_apcCache.get(cacheKey) ?? null) : null;

  function saveToCache(patch: Partial<APCCachedState>) {
    if (!cacheKey) return;
    const cur = _apcCache.get(cacheKey) ?? {
      price: props.price,
      downPct: Math.max(minDown, props.downPct),
      downAmtFixed: Math.max(props.price * minDown / 100, props.price * Math.max(minDown, props.downPct) / 100),
      downMode: 'pct' as const,
      rate: props.rate,
      termYrs: props.term,
      annualIncome: props.annualIncome ?? 0,
      monthlyDebt: props.monthlyDebt ?? 0,
      vaFF: isVA ? (props.vaFundingFeePct ?? 2.5) : 0,
      drawerOpen: false,
    };
    _apcCache.set(cacheKey, { ...cur, ...patch });
  }

  // ── Primary state ─────────────────────────────────────────────────────────
  // Initial values fall back to cache first, then props.
  const [price,        setPrice]        = useState(cached?.price ?? props.price);
  // Two independent anchors — price slider NEVER touches these.
  // % mode: downPct is fixed; downAmt is derived from price (expected math).
  // $ mode: downAmtFixed is fixed; % is derived from current price (info only).
  const [downPct,      setDownPct]      = useState(cached?.downPct ?? Math.max(minDown, props.downPct));
  const [downAmtFixed, setDownAmtFixed] = useState(
    cached?.downAmtFixed ?? Math.max(props.price * minDown / 100, props.price * Math.max(minDown, props.downPct) / 100)
  );
  const [downMode,     setDownMode]     = useState<'pct' | 'dollar'>(cached?.downMode ?? 'pct');
  const [rate,         setRate]         = useState(cached?.rate ?? props.rate);
  const [termYrs,      setTermYrs]      = useState(cached?.termYrs ?? props.term);
  const [annualIncome, setAnnualIncome] = useState(cached?.annualIncome ?? props.annualIncome ?? 0);
  const [monthlyDebt,  setMonthlyDebt]  = useState(cached?.monthlyDebt ?? props.monthlyDebt ?? 0);
  // VA Funding Fee — adjustable, defaults to 2.5% (first-use 0% down standard rate)
  const [vaFF,         setVaFF]         = useState(cached?.vaFF ?? (isVA ? (props.vaFundingFeePct ?? 2.5) : 0));
  const [drawerOpen,   setDrawerOpen]   = useState(cached?.drawerOpen ?? false);

  const { userId } = useAuth();

  // ── Income interaction state (for transient helper line) ──────────────────
  const [incomeSliderActive, setIncomeSliderActive] = useState(false);
  const [incomeInputFocused, setIncomeInputFocused] = useState(false);
  const incomeInteracting = incomeSliderActive || incomeInputFocused;

  // ── Editable input draft state (null = not editing = show formatted value) ─
  const [priceDraft,  setPriceDraft]  = useState<string | null>(null);
  const [downDraft,   setDownDraft]   = useState<string | null>(null);
  const [rateDraft,   setRateDraft]   = useState<string | null>(null);
  const [debtDraft,   setDebtDraft]   = useState<string | null>(null);
  const [incomeDraft, setIncomeDraft] = useState<string | null>(null);
  const [vaFFDraft,   setVaFFDraft]   = useState<string | null>(null);

  // ── Derived math ──────────────────────────────────────────────────────────
  // In $ mode, clamp downAmtFixed so it never exceeds price (edge case only —
  // the sliders are independent, so this only triggers if user typed a huge #).
  const downAmt = downMode === 'pct'
    ? price * downPct / 100
    : Math.min(downAmtFixed, price > 0 ? price * 0.99 : downAmtFixed);

  const effectiveDownPct = downMode === 'pct'
    ? downPct
    : price > 0 ? (downAmt / price) * 100 : 0;

  const baseLoan   = price - downAmt;
  const ltv        = price > 0 ? (baseLoan / price) * 100 : 0;

  const ufmip      = isFHA ? baseLoan * FHA_UFMIP_RATE : 0;
  const vaFundFee  = isVA  ? baseLoan * (vaFF / 100) : 0;
  const loanAmt    = baseLoan + ufmip + vaFundFee;

  const pi         = calcPI(loanAmt, rate, termYrs);
  const tax        = (price * props.taxRate) / 12;
  const ins        = (price * props.insRate) / 12;
  const pmi        = (!isFHA && !isVA && !isJumbo && ltv > 80) ? (baseLoan * PMI_RATE_STD) / 12 : 0;
  const monthlyMIP = isFHA ? (baseLoan * (ltv > 90 ? FHA_ANNUAL_MIP_HIGH : FHA_ANNUAL_MIP_LOW)) / 12 : 0;

  const piti    = pi + tax + ins + pmi + monthlyMIP;
  const totalMo = piti + monthlyDebt;

  const incomeToQualify = Math.ceil((totalMo / dtiThreshold) * 12 / 100) * 100;
  const backEndDTI      = annualIncome > 0 ? (totalMo / (annualIncome / 12)) * 100 : null;

  const dtiColor = backEndDTI == null
    ? 'rgba(255,255,255,0.18)'
    : backEndDTI <= dtiThreshold * 100 * 0.85 ? '#00e87a'
    : backEndDTI <= dtiThreshold * 100        ? '#f59e0b'
    : '#ef4444';

  const jumboZone = isJumbo
    ? baseLoan <= CONF_STANDARD     ? 'Conforming'
    : baseLoan <= CONF_HIGH_BALANCE ? 'High-Balance'
    : 'Jumbo'
    : null;
  const jumboZoneColor = jumboZone === 'Conforming' ? '#00e87a'
    : jumboZone === 'High-Balance' ? '#f59e0b'
    : '#8b5cf6';

  // ── Commit handlers (called on blur / Enter) ──────────────────────────────
  function commitPrice(s: string) {
    const parsed = parseCurrency(s);
    const v = parsed > 0 ? Math.max(100_000, Math.min(priceMax, parsed)) : price;
    setPrice(v);
    saveToCache({ price: v });
  }
  function commitDown(s: string) {
    if (downMode === 'pct') {
      const v = parsePct(s);
      if (v > 0) setDownSafe(v);
    } else {
      const v = Math.max(0, Math.min(downMaxDollar, parseCurrency(s)));
      setDownAmtFixed(v);
      saveToCache({ downAmtFixed: v });
    }
  }
  function commitRate(s: string) {
    const v = Math.max(3, Math.min(12, Math.round(parsePct(s) / 0.125) * 0.125 || rate));
    setRate(v);
    saveToCache({ rate: v });
  }
  function commitDebt(s: string) {
    const v = Math.max(0, Math.min(3000, Math.round(parseCurrency(s) / 50) * 50 || 0));
    setMonthlyDebt(v);
    saveToCache({ monthlyDebt: v });
  }
  function commitIncome(s: string) {
    const v = Math.max(0, Math.min(incomeMax, Math.round(parseCurrency(s) / incomeStep) * incomeStep || 0));
    setAnnualIncome(v);
    saveToCache({ annualIncome: v });
  }
  function commitVaFF(s: string) {
    const v = Math.max(0, Math.min(3.6, Math.round(parsePct(s) / 0.05) * 0.05 || vaFF));
    setVaFF(v);
    saveToCache({ vaFF: v });
  }

  // ── Other handlers ────────────────────────────────────────────────────────
  function setDownSafe(pct: number) {
    const v = Math.max(minDown, Math.min(50, Math.round(pct * 10) / 10));
    setDownPct(v);
    saveToCache({ downPct: v });
  }
  function switchToDollar() {
    const amt = price * downPct / 100;
    setDownAmtFixed(amt);
    setDownDraft(null);
    setDownMode('dollar');
    saveToCache({ downAmtFixed: amt, downMode: 'dollar' });
  }
  function switchToPct() {
    setDownDraft(null);
    setDownMode('pct');
    saveToCache({ downMode: 'pct' });
  }

  function handleAddressSubmit(addr: string) {
    props.onRunScenario?.(addr, {
      purchasePrice:  Math.round(price),
      downPaymentPct: effectiveDownPct,
      annualRatePct:  rate,
      termYears:      termYrs,
      loanType:       props.loanType,
      ...(isFHA ? { isFHA: true } : {}),
      ...(isVA  ? { isVA:  true } : {}),
    });
    if (userId) {
      void fetch('/api/crm/auto-capture', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'affordability_run',
          data:  {
            loan_type:      props.loanType,
            purchase_price: Math.round(price),
            down_pct:       effectiveDownPct,
            monthly_piti:   Math.round(piti),
          },
        }),
      }).catch(() => {});
    }
  }

  // ── Slider fill percents ──────────────────────────────────────────────────
  const priceFill   = fillPct(price, 100_000, priceMax);
  const downPctFill = fillPct(downPct, minDown, 50);
  const downAmtFill = fillPct(downAmtFixed, 0, downMaxDollar);  // fixed range — independent of price
  const rateFill    = fillPct(rate, 3, 12);
  const debtFill    = fillPct(monthlyDebt, 0, 3000);
  const incomeFill  = fillPct(annualIncome, 0, incomeMax);
  const vaFFFill    = fillPct(vaFF, 0, 3.6);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="apc" style={{ position: 'relative' }}>
      <AdminCardBadge code="AFFD-012" />

      {/* Topbar */}
      <div className="apc-topbar">
        <div className="apc-topbar-l">
          <div className="apc-dot" style={{ background: ltAccent }} />
          <span className="apc-tl">Affordability</span>
          <span className="apc-lt-badge" style={{ color: ltAccent, background: `${ltAccent}18`, border: `1px solid ${ltAccent}38` }}>
            {ltLabel}
          </span>
        </div>
        <span className="apc-tr">Live · CalcEngine</span>
      </div>

      {/* Hero */}
      <div className="apc-hero">
        <div className="apc-hero-label">Purchase Price</div>
        <div className="apc-hero-amount" style={{ color: ltAccent }}>{fmt$(price)}</div>
        <div className="apc-hero-sub">
          {fmt$(Math.round(piti))}/mo PITI{isFHA ? '+MIP' : isVA ? ' (no PMI)' : pmi > 0 ? '+PMI' : ''}
          {isVA && vaFF > 0 ? ` · FF ${vaFF.toFixed(2)}%` : ''}
          {monthlyDebt > 0 ? ` · ${fmt$(Math.round(monthlyDebt))}/mo debts` : ''}
          {' · '}{rate.toFixed(3)}% · {termYrs}yr
        </div>
        <div className="apc-hero-breakdown">
          {'P+I '}{fmt$(Math.round(pi))}
          {' · Tax '}{fmt$(Math.round(tax))}
          {' · Ins '}{fmt$(Math.round(ins))}
          {isFHA && ` · MIP ${fmt$(Math.round(monthlyMIP))}`}
          {!isFHA && !isVA && pmi > 0 && ` · PMI ${fmt$(Math.round(pmi))}`}
        </div>
      </div>

      {/* 3-tile row */}
      <div className="apc-tiles">
        <div className="apc-tile">
          <div className="apc-tile-label">Loan Amount</div>
          <div className="apc-tile-val">{fmtK(Math.round(loanAmt))}</div>
          {isFHA && <div className="apc-tile-sub">incl. UFMIP</div>}
          {isVA  && <div className="apc-tile-sub">incl. fee</div>}
        </div>
        <div className="apc-tile apc-tile--mid">
          <div className="apc-tile-label">LTV</div>
          <div className="apc-tile-val">{ltv.toFixed(1)}%</div>
          {!isFHA && !isVA && !isJumbo && ltv > 80
            ? <div className="apc-tile-sub" style={{ color: '#f59e0b' }}>PMI applies</div>
            : !isFHA && ltv <= 80
              ? <div className="apc-tile-sub" style={{ color: '#00e87a' }}>No PMI</div>
              : null}
        </div>
        <div className="apc-tile">
          <div className="apc-tile-label">Income to Qualify</div>
          <div className="apc-tile-val" style={{ color: annualIncome === 0 ? ltAccent : dtiColor }}>{fmtK(incomeToQualify)}</div>
          <div className="apc-tile-sub">{isVA ? '41% DTI' : '43% DTI'}</div>
        </div>
      </div>

      {/* DTI bar */}
      <div className="apc-dti-wrap">
        <div className="apc-dti-row">
          <span className="apc-dti-lbl">
            {backEndDTI != null ? `Your DTI: ${backEndDTI.toFixed(1)}%` : 'Back-End DTI'}
          </span>
          <span className="apc-dti-status" style={{ color: dtiColor }}>
            {backEndDTI != null
              ? backEndDTI <= dtiThreshold * 100
                ? '✓ Qualifies at this price'
                : `✗ Need ${fmtK(incomeToQualify)}/yr`
              : 'Enter income below to see your DTI'}
          </span>
        </div>
        <div className="apc-dti-track">
          <div className="apc-dti-fill" style={{
            width: backEndDTI != null ? `${Math.min(100, (backEndDTI / dtiScale) * 100)}%` : '0%',
            background: dtiColor,
          }} />
          <div className="apc-dti-mark" style={{ left: `${(dtiThreshold * 100 / dtiScale) * 100}%` }} />
        </div>
        <div className="apc-dti-legend">
          <span>0%</span>
          <span style={{ color: ltAccent }}>{isVA ? '41%' : '43%'} limit</span>
          <span>{isVA ? '50%+' : '55%+'}</span>
        </div>
      </div>

      {/* FHA note */}
      {isFHA && (
        <div className="apc-prog-note" style={{ borderColor: 'rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.05)' }}>
          <span className="apc-prog-note-icon" style={{ color: '#f59e0b' }}>ⓘ</span>
          <span>
            UFMIP of {fmt$(Math.round(ufmip))} (1.75%) is financed into the loan, raising the total to {fmtK(Math.round(loanAmt))}.
            Monthly MIP: {fmt$(Math.round(monthlyMIP))}/mo{ltv <= 90 ? ' (LTV ≤ 90% — lower rate applies)' : ''}.
          </span>
        </div>
      )}

      {/* VA note */}
      {isVA && (
        <div className="apc-prog-note" style={{ borderColor: 'rgba(20,184,166,0.2)', background: 'rgba(20,184,166,0.05)' }}>
          <span className="apc-prog-note-icon" style={{ color: '#14b8a6' }}>ⓘ</span>
          <span>
            No PMI required. VA funding fee of {fmt$(Math.round(vaFundFee))} ({vaFF.toFixed(2)}%) is financed into the loan — adjust below if exempt or using a different use tier.
            DTI guideline is 41% — enter your income below to see your qualification status.
          </span>
        </div>
      )}

      {/* Jumbo zone */}
      {isJumbo && jumboZone && (
        <div className="apc-jumbo-zone" style={{ borderColor: `${jumboZoneColor}28`, background: `${jumboZoneColor}06` }}>
          <span className="apc-jumbo-badge" style={{ color: jumboZoneColor, background: `${jumboZoneColor}18`, border: `1px solid ${jumboZoneColor}35` }}>
            {jumboZone}
          </span>
          <span className="apc-jumbo-note">
            {jumboZone === 'Conforming'
              ? `Loan ${fmtK(Math.round(baseLoan))} is below the ${fmtK(CONF_STANDARD)} conforming limit — a conventional loan may offer better pricing.`
              : jumboZone === 'High-Balance'
                ? `Loan ${fmtK(Math.round(baseLoan))} qualifies as high-balance conforming (up to ${fmtK(CONF_HIGH_BALANCE)}).`
                : `Loan ${fmtK(Math.round(baseLoan))} exceeds the high-balance limit — full Jumbo underwriting applies.`}
          </span>
        </div>
      )}

      {/* Drawer trigger */}
      <button
        type="button"
        className={`apc-trigger${drawerOpen ? ' open' : ''}`}
        style={{
          color:            ltAccent,
          borderTopColor:   `${ltAccent}30`,
          background:       drawerOpen ? `${ltAccent}0d` : `${ltAccent}06`,
        }}
        onClick={() => { setDrawerOpen(o => { saveToCache({ drawerOpen: !o }); return !o; }); }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          {/* Tapering-lines "sliders" icon — visually signals adjustable parameters */}
          <svg className="apc-trigger-icon" width="15" height="11" viewBox="0 0 15 11" fill="none" aria-hidden="true">
            <rect x="0"   y="0"   width="15" height="1.8" rx="0.9" fill="currentColor" opacity="0.5"/>
            <rect x="2"   y="4.6" width="11" height="1.8" rx="0.9" fill="currentColor" opacity="0.8"/>
            <rect x="4.5" y="9.2" width="6"  height="1.8" rx="0.9" fill="currentColor" opacity="0.5"/>
          </svg>
          <span className="apc-trigger-lbl">Adjust your numbers</span>
        </div>
        {/* Chevron rotates 180° on open via CSS */}
        <svg className="apc-trigger-chevron" width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <path d="M2.5 4.5l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Adjuster drawer */}
      <div className={`apc-drawer${drawerOpen ? ' open' : ''}`}>
        <div className="apc-drawer-inner">

          {/* ── Home Price ── */}
          <div className="apc-field">
            <div className="apc-field-top">
              <span className="apc-field-lbl">Home Price</span>
              <input
                className="apc-numval"
                value={priceDraft !== null ? priceDraft : fmt$(price)}
                onChange={e => setPriceDraft(e.target.value)}
                onFocus={e => { setPriceDraft(String(price)); e.currentTarget.select(); }}
                onBlur={() => { commitPrice(priceDraft ?? ''); setPriceDraft(null); }}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              />
            </div>
            <input type="range" className="apc-slider"
              style={{ '--tc': ltAccent, '--val': `${priceFill}%` } as React.CSSProperties}
              min={100_000} max={priceMax} step={priceStep}
              value={price}
              onChange={e => { const v = Number(e.target.value); setPrice(v); saveToCache({ price: v }); }} />
            <div className="apc-range-lbls"><span>$100k</span><span>{isJumbo ? '$10M' : '$3M'}</span></div>
          </div>

          {/* ── Down Payment — fully independent of price slider ── */}
          <div className="apc-field">
            <div className="apc-field-top">
              <span className="apc-field-lbl">Down Payment</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div className="apc-mode-toggle">
                  <button type="button"
                    className={`apc-mode-btn${downMode === 'pct' ? ' active' : ''}`}
                    style={downMode === 'pct' ? { color: ltAccent, borderColor: `${ltAccent}50`, background: `${ltAccent}15` } : {}}
                    onClick={switchToPct}
                  >%</button>
                  <button type="button"
                    className={`apc-mode-btn${downMode === 'dollar' ? ' active' : ''}`}
                    style={downMode === 'dollar' ? { color: ltAccent, borderColor: `${ltAccent}50`, background: `${ltAccent}15` } : {}}
                    onClick={switchToDollar}
                  >$</button>
                </div>
                <input
                  className="apc-numval"
                  style={{ width: 100 }}
                  value={
                    downDraft !== null ? downDraft
                    : downMode === 'pct' ? `${downPct.toFixed(1)}%`
                    : fmt$(Math.round(downAmtFixed))
                  }
                  onChange={e => setDownDraft(e.target.value)}
                  onFocus={e => {
                    setDownDraft(downMode === 'pct' ? String(downPct) : String(Math.round(downAmtFixed)));
                    e.currentTarget.select();
                  }}
                  onBlur={() => { commitDown(downDraft ?? ''); setDownDraft(null); }}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                />
              </div>
            </div>

            {downMode === 'pct' ? (
              <>
                <input type="range" className="apc-slider"
                  style={{ '--tc': ltAccent, '--val': `${downPctFill}%` } as React.CSSProperties}
                  min={minDown} max={50} step={0.5}
                  value={downPct}
                  onChange={e => setDownSafe(Number(e.target.value))} /* setDownSafe writes cache */ />
                <div className="apc-range-lbls"><span>{minDown}%</span><span>50%</span></div>
                <div className="apc-field-secondary">= {fmt$(Math.round(downAmt))} at current price</div>
              </>
            ) : (
              <>
                {/* Fixed range [0 → priceMax/2] — no dependency on price whatsoever */}
                <input type="range" className="apc-slider"
                  style={{ '--tc': ltAccent, '--val': `${downAmtFill}%` } as React.CSSProperties}
                  min={0} max={downMaxDollar} step={1000}
                  value={Math.round(downAmtFixed)}
                  onChange={e => { const v = Number(e.target.value); setDownAmtFixed(v); saveToCache({ downAmtFixed: v }); }} />
                <div className="apc-range-lbls"><span>$0</span><span>{fmtK(downMaxDollar)}</span></div>
                <div className="apc-field-secondary">= {effectiveDownPct.toFixed(1)}% of current price</div>
              </>
            )}
          </div>

          {/* ── Interest Rate ── */}
          <div className="apc-field">
            <div className="apc-field-top">
              <span className="apc-field-lbl">Interest Rate</span>
              <input
                className="apc-numval"
                value={rateDraft !== null ? rateDraft : `${rate.toFixed(3)}%`}
                onChange={e => setRateDraft(e.target.value)}
                onFocus={e => { setRateDraft(String(rate)); e.currentTarget.select(); }}
                onBlur={() => { commitRate(rateDraft ?? ''); setRateDraft(null); }}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              />
            </div>
            <input type="range" className="apc-slider"
              style={{ '--tc': ltAccent, '--val': `${rateFill}%` } as React.CSSProperties}
              min={3} max={12} step={0.125}
              value={rate}
              onChange={e => { const v = Number(e.target.value); setRate(v); saveToCache({ rate: v }); }} />
            <div className="apc-range-lbls"><span>3%</span><span>12%</span></div>
          </div>

          {/* ── VA Funding Fee (VA only) ── */}
          {isVA && (
            <div className="apc-field">
              <div className="apc-field-top">
                <span className="apc-field-lbl">VA Funding Fee</span>
                <input
                  className="apc-numval"
                  value={vaFFDraft !== null ? vaFFDraft : `${vaFF.toFixed(2)}%`}
                  onChange={e => setVaFFDraft(e.target.value)}
                  onFocus={e => { setVaFFDraft(String(vaFF)); e.currentTarget.select(); }}
                  onBlur={() => { commitVaFF(vaFFDraft ?? ''); setVaFFDraft(null); }}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                />
              </div>
              <input type="range" className="apc-slider"
                style={{ '--tc': '#14b8a6', '--val': `${vaFFFill}%` } as React.CSSProperties}
                min={0} max={3.6} step={0.05}
                value={vaFF}
                onChange={e => { const v = Number(e.target.value); setVaFF(v); saveToCache({ vaFF: v }); }} />
              <div className="apc-range-lbls"><span>0% (exempt)</span><span>3.6%</span></div>
              <div className="apc-field-hint">
                Typical: 2.15% first use · 1.5% with 5%+ down · 3.3% subsequent use · 0% if service-connected disabled
              </div>
            </div>
          )}

          {/* ── Monthly Debts ── */}
          <div className="apc-field">
            <div className="apc-field-top">
              <span className="apc-field-lbl">Monthly Debts</span>
              <input
                className="apc-numval"
                style={{ color: monthlyDebt > 0 && debtDraft === null ? '#f59e0b' : undefined }}
                value={debtDraft !== null ? debtDraft : monthlyDebt === 0 ? '$0' : fmt$(monthlyDebt)}
                onChange={e => setDebtDraft(e.target.value)}
                onFocus={e => { setDebtDraft(String(monthlyDebt)); e.currentTarget.select(); }}
                onBlur={() => { commitDebt(debtDraft ?? ''); setDebtDraft(null); }}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              />
            </div>
            <input type="range" className="apc-slider apc-slider--debt"
              style={{ '--val': `${debtFill}%` } as React.CSSProperties}
              min={0} max={3000} step={50}
              value={monthlyDebt}
              onChange={e => { const v = Number(e.target.value); setMonthlyDebt(v); saveToCache({ monthlyDebt: v }); }} />
            <div className="apc-range-lbls"><span>$0</span><span>$3,000/mo</span></div>
            <div className="apc-field-hint">Cars, credit cards, student loans</div>
          </div>

          {/* ── Annual Income ── */}
          <div className="apc-field">
            <div className="apc-field-top">
              <span className="apc-field-lbl">Annual Income</span>
              <input
                className="apc-numval"
                value={incomeDraft !== null ? incomeDraft : annualIncome === 0 ? '$0' : fmt$(annualIncome)}
                onChange={e => setIncomeDraft(e.target.value)}
                onFocus={e => { setIncomeInputFocused(true); setIncomeDraft(String(annualIncome)); e.currentTarget.select(); }}
                onBlur={() => { setIncomeInputFocused(false); commitIncome(incomeDraft ?? ''); setIncomeDraft(null); }}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              />
            </div>
            <input type="range" className="apc-slider"
              style={{ '--tc': ltAccent, '--val': `${incomeFill}%` } as React.CSSProperties}
              min={0} max={incomeMax} step={incomeStep}
              value={annualIncome}
              onMouseDown={() => setIncomeSliderActive(true)}
              onTouchStart={() => setIncomeSliderActive(true)}
              onMouseUp={() => setIncomeSliderActive(false)}
              onTouchEnd={() => setIncomeSliderActive(false)}
              onBlur={() => setIncomeSliderActive(false)}
              onChange={e => { const v = Number(e.target.value); setAnnualIncome(v); saveToCache({ annualIncome: v }); }} />
            <div className="apc-range-lbls"><span>$0</span><span>{isJumbo ? '$2M' : '$600k'}</span></div>
            {annualIncome === 0 && !incomeInteracting && <div className="apc-field-hint">Optional — updates DTI bar above</div>}
            {incomeInteracting && incomeToQualify > 0 && (
              <div className="apc-income-gap" style={{
                color: annualIncome >= incomeToQualify ? '#00e87a' : '#f59e0b',
              }}>
                {annualIncome >= incomeToQualify
                  ? `✓ ${fmt$(annualIncome - incomeToQualify)}/yr above qualifying income`
                  : `${fmt$(incomeToQualify - annualIncome)}/yr short of qualifying income (${fmt$(incomeToQualify)}/yr needed)`}
              </div>
            )}
          </div>

          {/* ── Loan Term ── */}
          <div className="apc-field">
            <div className="apc-field-top">
              <span className="apc-field-lbl">Loan Term</span>
            </div>
            <div className="apc-terms">
              {([15, 20, 30] as const).map(yr => (
                <button type="button" key={yr}
                  className={`apc-term${termYrs === yr ? ' active' : ''}`}
                  style={termYrs === yr ? { borderColor: `${ltAccent}55`, color: ltAccent, background: `${ltAccent}12` } : {}}
                  onClick={() => { setTermYrs(yr); saveToCache({ termYrs: yr }); }}
                >{yr}yr</button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* CTA — address input → property lookup (hidden when property is already loaded) */}
      {!props.hideAddressSearch && (
        <div className="apc-lic-wrap">
          <LockedIntelligenceCard onSubmitAddress={handleAddressSubmit} />
        </div>
      )}

      {/* FRED rate badge */}
      <div className="apc-fred-wrap">
        <FredRateBadge rate={rate} fredStamp={props.fredStamp} />
      </div>

      {/* Disclosure */}
      <div className="apc-disc">
        Educational estimates only — not a Loan Estimate, pre-approval, or commitment to lend.
        Estimates include principal &amp; interest, property taxes ({(props.taxRate * 100).toFixed(1)}%/yr estimated),
        homeowner&apos;s insurance ({(props.insRate * 100).toFixed(1)}%/yr estimated)
        {isFHA ? ', and FHA MIP' : isVA ? '. VA loans carry no PMI' : pmi > 0 ? ', and PMI (auto-cancels at 80% LTV)' : ''}.
        {isFHA && ' FHA UFMIP 1.75% financed into loan; annual MIP based on LTV.'}
        {isVA  && ` VA funding fee ${vaFF.toFixed(2)}% financed into loan — may be waived for veterans with service-connected disability.`}
        {!props.fredStamp && ` Rate ${rate.toFixed(3)}% is a market estimate.`}
        {' '}Actual rate, payment, and loan costs depend on creditworthiness, property type, occupancy, and lender.
        Consult a licensed loan officer for a Loan Estimate.
      </div>

      <style>{`
        .apc {
          background: #0d1117;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          overflow: clip;
          margin-top: 14px;
          font-family: system-ui,-apple-system,sans-serif;
          color: #f0f4ff;
        }
        .apc-topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          background: rgba(255,255,255,0.02);
        }
        .apc-topbar-l { display: flex; align-items: center; gap: 6px; }
        .apc-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .apc-tl { font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #94a3b8; }
        .apc-tr { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: rgba(234,248,247,0.7); }
        .apc-lt-badge { font-size: 9px; font-weight: 800; padding: 2px 7px; border-radius: 20px; letter-spacing: .06em; text-transform: uppercase; }

        .apc-hero { padding: 18px 18px 10px; }
        .apc-hero-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: #94a3b8; margin-bottom: 4px; }
        .apc-hero-amount { font-size: 38px; font-weight: 800; letter-spacing: -0.03em; line-height: 1; font-variant-numeric: tabular-nums; }
        .apc-hero-sub { font-size: 12px; color: #8fa3b8; margin-top: 6px; line-height: 1.4; }
        .apc-hero-breakdown { font-size: 10.5px; color: rgba(255,255,255,0.35); margin-top: 4px; letter-spacing: 0.01em; }

        .apc-tiles { display: grid; grid-template-columns: 1fr 1fr 1fr; margin: 10px 16px 12px; background: #0e1420; border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; overflow: hidden; }
        .apc-tile { padding: 12px 14px; }
        .apc-tile--mid { border-left: 1px solid rgba(255,255,255,0.06); border-right: 1px solid rgba(255,255,255,0.06); }
        .apc-tile-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: #8fa3b8; margin-bottom: 4px; }
        .apc-tile-val { font-size: 15px; font-weight: 800; color: #f0f4ff; font-variant-numeric: tabular-nums; }
        .apc-tile-sub { font-size: 10px; color: #8fa3b8; margin-top: 2px; }

        .apc-dti-wrap { margin: 0 16px 12px; }
        .apc-dti-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; gap: 8px; }
        .apc-dti-lbl { font-size: 11px; font-weight: 600; color: #8fa3b8; }
        .apc-dti-status { font-size: 11px; font-weight: 600; flex-shrink: 0; }
        .apc-dti-track { height: 6px; background: rgba(255,255,255,0.07); border-radius: 3px; position: relative; overflow: visible; }
        .apc-dti-fill { height: 100%; border-radius: 3px; transition: width 0.22s, background 0.22s; position: absolute; top: 0; left: 0; }
        .apc-dti-mark { position: absolute; top: -3px; bottom: -3px; width: 2px; background: rgba(255,255,255,0.3); border-radius: 1px; transform: translateX(-50%); }
        .apc-dti-legend { display: flex; justify-content: space-between; font-size: 9px; color: #4b6080; margin-top: 5px; }

        .apc-prog-note { margin: 0 16px 10px; border: 1px solid; border-radius: 10px; padding: 9px 13px; display: flex; align-items: flex-start; gap: 7px; font-size: 11.5px; color: #94a3b8; line-height: 1.5; }
        .apc-prog-note-icon { font-size: 13px; flex-shrink: 0; margin-top: 1px; }

        .apc-jumbo-zone { margin: 0 16px 10px; border: 1px solid; border-radius: 10px; padding: 10px 13px; display: flex; align-items: flex-start; gap: 10px; }
        .apc-jumbo-badge { font-size: 9px; font-weight: 800; padding: 3px 8px; border-radius: 20px; flex-shrink: 0; letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; margin-top: 1px; }
        .apc-jumbo-note { font-size: 11.5px; color: rgba(255,255,255,0.5); line-height: 1.45; }

        .apc-trigger { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; background: transparent; border: none; border-top: 1px solid rgba(255,255,255,0.07); cursor: pointer; font-family: inherit; transition: background 0.15s; }
        .apc-trigger:hover { background: rgba(255,255,255,0.03); }
        .apc-trigger-lbl { font-size: 13px; font-weight: 700; }
        .apc-trigger-icon { flex-shrink: 0; }
        .apc-trigger-chevron { flex-shrink: 0; transition: transform 0.28s cubic-bezier(0.4,0,0.2,1); }
        .apc-trigger.open .apc-trigger-chevron { transform: rotate(180deg); }

        .apc-drawer { max-height: 0; overflow: hidden; transition: max-height 0.38s cubic-bezier(0.4,0,0.2,1); }
        .apc-drawer.open { max-height: 1000px; }
        .apc-drawer-inner { padding: 16px 18px 12px; background: #0a0f18; border-top: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; gap: 18px; }

        .apc-field { display: flex; flex-direction: column; gap: 8px; }
        .apc-field-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .apc-field-lbl { font-size: 12px; font-weight: 600; color: #8fa3b8; flex-shrink: 0; }
        .apc-field-hint { font-size: 10.5px; color: #4b6080; }
        .apc-field-secondary { font-size: 10.5px; color: #4b6080; text-align: right; margin-top: -2px; }

        /* Editable number input */
        .apc-numval {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 6px;
          padding: 4px 10px;
          font-size: 12px;
          font-weight: 700;
          color: #f0f4ff;
          text-align: right;
          width: 120px;
          font-family: system-ui,-apple-system,sans-serif;
          font-variant-numeric: tabular-nums;
          outline: none;
          transition: border-color 0.12s, background 0.12s;
          cursor: text;
          flex-shrink: 0;
        }
        .apc-numval:focus {
          border-color: rgba(255,255,255,0.35);
          background: rgba(255,255,255,0.09);
        }

        .apc-mode-toggle { display: flex; border-radius: 6px; overflow: hidden; flex-shrink: 0; }
        .apc-mode-btn { padding: 3px 8px; font-size: 10px; font-weight: 700; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); color: #8fa3b8; cursor: pointer; font-family: inherit; transition: all 0.12s; }
        .apc-mode-btn:first-child { border-right: none; border-radius: 6px 0 0 6px; }
        .apc-mode-btn:last-child  { border-left:  none; border-radius: 0 6px 6px 0; }

        /* Range slider */
        .apc-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 4px; border-radius: 2px; background: linear-gradient(to right, var(--tc,#00e87a) 0%, var(--tc,#00e87a) var(--val,0%), rgba(255,255,255,0.12) var(--val,0%)); outline: none; cursor: pointer; }
        .apc-slider--debt { background: linear-gradient(to right, #f59e0b 0%, #f59e0b var(--val,0%), rgba(255,255,255,0.12) var(--val,0%)); }
        .apc-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #f0f4ff; cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,0.5); }
        .apc-slider::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; border: none; background: #f0f4ff; cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,0.5); }
        .apc-range-lbls { display: flex; justify-content: space-between; font-size: 9.5px; color: #4b6080; margin-top: -2px; }
        .apc-income-gap { font-size: 10.5px; font-weight: 600; margin-top: 5px; line-height: 1.4; }

        .apc-terms { display: flex; gap: 8px; }
        .apc-term { flex: 1; padding: 9px 0; border-radius: 8px; border: 1.5px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); font-size: 12px; font-weight: 600; color: #94a3b8; cursor: pointer; font-family: inherit; text-align: center; transition: all 0.15s; }
        .apc-term:hover:not(.active) { border-color: rgba(255,255,255,0.18); color: #f0f4ff; }

        .apc-lic-wrap { margin-top: 2px; }
        .apc-lic-wrap > * { margin-top: 0 !important; border-radius: 0 0 14px 14px !important; }

        .apc-fred-wrap { padding: 0 16px 10px; }
        .apc-disc { margin: 0 16px 16px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 10px; padding: 10px 13px; font-size: 10.5px; color: rgba(148,163,184,0.65); line-height: 1.6; }

        @media (max-width: 480px) {
          .apc-hero-amount { font-size: 30px; }
          .apc-tile { padding: 10px 10px; }
          .apc-tile-val { font-size: 13px; }
          .apc-numval { width: 90px; }
        }
      `}</style>
    </div>
  );
}
