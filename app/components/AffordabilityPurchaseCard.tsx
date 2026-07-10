'use client';
// app/components/AffordabilityPurchaseCard.tsx
// v2 affordability card — purchase price as hero, one loan-type variant per render.
// Handles Conv/HB, FHA, VA, Jumbo via loanType prop.
// Structure: topbar → price hero → 3-tile row → DTI bar (always visible)
//            → program note (FHA/VA) → jumbo zone badge → drawer trigger
//            → collapsed adjuster drawer (5 sliders + 15/20/30yr term) → CTA → disclosure

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminCardBadge from './AdminCardBadge';
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

// ── Types ─────────────────────────────────────────────────────────────────────

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
  fredStamp?: string;
  onRunScenario?: (seed: string, overrides: Record<string, unknown>) => void;
  onLiveChange?: (vals: { price: number; downPct: number; rate: number; term: number; loanType: string }) => void;
}

// ── Format helpers ────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function fmtK(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 100_000)   return `$${Math.round(n / 1_000)}k`;
  return fmt$(n);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AffordabilityPurchaseCard(props: AffordabilityPurchaseParams) {
  const isFHA   = props.loanType === 'fha';
  const isVA    = props.loanType === 'va';
  const isJumbo = props.loanType === 'jumbo';

  const minDown   = isJumbo ? 20 : isFHA ? 3.5 : isVA ? 0 : 3;
  const priceMax  = isJumbo ? 10_000_000 : 3_000_000;
  const priceStep = isJumbo ? 25_000 : 5_000;
  const incomeMax = isJumbo ? 2_000_000 : 600_000;
  const incomeStep = isJumbo ? 10_000 : 5_000;
  const dtiThreshold = isVA ? DTI_VA_MAX : DTI_STANDARD_MAX;
  const dtiScale     = isVA ? 50 : 55;   // bar saturates slightly past limit

  const ltAccent = isFHA ? '#f59e0b' : isVA ? '#14b8a6' : isJumbo ? '#8b5cf6' : '#00e87a';
  const ltLabel  = isFHA ? 'FHA' : isVA ? 'VA' : isJumbo ? 'Jumbo' : 'Conv/HB';

  // ── State ─────────────────────────────────────────────────────────────────

  const [price,        setPrice]        = useState(props.price);
  const [downPct,      setDownPct]      = useState(Math.max(minDown, props.downPct));
  const [downMode,     setDownMode]     = useState<'pct' | 'dollar'>('pct');
  const [rate,         setRate]         = useState(props.rate);
  const [termYrs,      setTermYrs]      = useState(props.term);
  const [annualIncome, setAnnualIncome] = useState(props.annualIncome ?? 0);
  const [monthlyDebt,  setMonthlyDebt]  = useState(props.monthlyDebt ?? 0);
  const [drawerOpen,   setDrawerOpen]   = useState(false);

  const router = useRouter();

  // ── Derived math (live on every slider move) ──────────────────────────────

  const downAmt    = price * downPct / 100;
  const baseLoan   = price - downAmt;
  const ltv        = price > 0 ? (baseLoan / price) * 100 : 0;

  const ufmip      = isFHA ? baseLoan * FHA_UFMIP_RATE : 0;
  const vaFundFee  = isVA  ? baseLoan * 0.0215 : 0;
  const loanAmt    = baseLoan + ufmip + vaFundFee;

  const pi         = calcPI(loanAmt, rate, termYrs);
  const tax        = (price * props.taxRate) / 12;
  const ins        = (price * props.insRate) / 12;
  const pmi        = (!isFHA && !isVA && !isJumbo && ltv > 80) ? (baseLoan * PMI_RATE_STD) / 12 : 0;
  const monthlyMIP = isFHA ? (baseLoan * (ltv > 90 ? FHA_ANNUAL_MIP_HIGH : FHA_ANNUAL_MIP_LOW)) / 12 : 0;

  const piti       = pi + tax + ins + pmi + monthlyMIP;
  const totalMo    = piti + monthlyDebt;

  const incomeToQualify = Math.ceil((totalMo / dtiThreshold) * 12 / 100) * 100;
  const backEndDTI      = annualIncome > 0 ? (totalMo / (annualIncome / 12)) * 100 : null;

  const dtiColor = backEndDTI == null
    ? 'rgba(255,255,255,0.18)'
    : backEndDTI <= dtiThreshold * 100 * 0.85 ? '#00e87a'
    : backEndDTI <= dtiThreshold * 100        ? '#f59e0b'
    : '#ef4444';

  // Jumbo zone (updates live as loan amount crosses thresholds)
  const jumboZone = isJumbo
    ? baseLoan <= CONF_STANDARD   ? 'Conforming'
    : baseLoan <= CONF_HIGH_BALANCE ? 'High-Balance'
    : 'Jumbo'
    : null;
  const jumboZoneColor = jumboZone === 'Conforming' ? '#00e87a'
    : jumboZone === 'High-Balance' ? '#f59e0b'
    : '#8b5cf6';

  // Notify parent of live slider changes
  useEffect(() => {
    props.onLiveChange?.({ price, downPct, rate, term: termYrs, loanType: props.loanType });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [price, downPct, rate, termYrs]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function setDownSafe(pct: number) {
    setDownPct(Math.max(minDown, Math.min(50, Math.round(pct * 10) / 10)));
  }

  function handleDownDollar(dollars: number) {
    if (price > 0) setDownSafe((dollars / price) * 100);
  }

  function handleCheckProperty() {
    const p = new URLSearchParams({
      price:       String(Math.round(price)),
      dp:          String(downPct),
      rate:        rate.toFixed(3),
      term:        String(termYrs),
      lt:          props.loanType,
      taxRate:     props.taxRate.toFixed(5),
      insRate:     props.insRate.toFixed(5),
      monthlyDebt: String(Math.round(monthlyDebt)),
    });
    router.push(`/check-property?${p.toString()}`);
  }

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

      {/* Hero — purchase price */}
      <div className="apc-hero">
        <div className="apc-hero-label">Purchase Price</div>
        <div className="apc-hero-amount" style={{ color: ltAccent }}>
          {fmt$(price)}
        </div>
        <div className="apc-hero-sub">
          {fmt$(Math.round(piti))}/mo PITI{isFHA ? '+MIP' : isVA ? ' (no PMI)' : pmi > 0 ? '+PMI' : ''}
          {monthlyDebt > 0 ? ` · ${fmt$(Math.round(monthlyDebt))}/mo debts` : ''}
          {' · '}{rate.toFixed(3)}% · {termYrs}yr
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
          <div className="apc-tile-val" style={{ color: ltAccent }}>{fmtK(incomeToQualify)}</div>
          <div className="apc-tile-sub">{isVA ? '41% DTI' : '43% DTI'}</div>
        </div>
      </div>

      {/* DTI bar — always visible, outside drawer */}
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

      {/* FHA program note — always visible, before drawer */}
      {isFHA && (
        <div className="apc-prog-note" style={{ borderColor: 'rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.05)' }}>
          <span className="apc-prog-note-icon" style={{ color: '#f59e0b' }}>ⓘ</span>
          <span>
            UFMIP of {fmt$(Math.round(ufmip))} (1.75%) is financed into the loan, raising the total loan to {fmtK(Math.round(loanAmt))}.
            Monthly MIP: {fmt$(Math.round(monthlyMIP))}/mo{ltv <= 90 ? ' (LTV ≤ 90% — lower rate applies)' : ''}.
          </span>
        </div>
      )}

      {/* VA program note — always visible, before drawer */}
      {isVA && (
        <div className="apc-prog-note" style={{ borderColor: 'rgba(20,184,166,0.2)', background: 'rgba(20,184,166,0.05)' }}>
          <span className="apc-prog-note-icon" style={{ color: '#14b8a6' }}>ⓘ</span>
          <span>
            No PMI required. VA funding fee of {fmt$(Math.round(vaFundFee))} (2.15% first use) is financed into the loan.
            DTI guideline is 41% — enter your income in the drawer to see your qualification status.
          </span>
        </div>
      )}

      {/* Jumbo zone badge — dynamic, updates as loan amount crosses thresholds */}
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

      {/* Drawer trigger — collapsed by default */}
      <button
        type="button"
        className={`apc-trigger${drawerOpen ? ' open' : ''}`}
        style={drawerOpen
          ? { borderColor: `${ltAccent}40`, background: `${ltAccent}06`, color: ltAccent }
          : {}}
        onClick={() => setDrawerOpen(o => !o)}
      >
        <span className="apc-trigger-lbl">Adjust your numbers</span>
        <span className="apc-trigger-arrow">{drawerOpen ? '▴' : '▾'}</span>
      </button>

      {/* Collapsible adjuster drawer */}
      <div className={`apc-drawer${drawerOpen ? ' open' : ''}`}>
        <div className="apc-drawer-inner">

          {/* Home price */}
          <div className="apc-field">
            <div className="apc-field-top">
              <span className="apc-field-lbl">Home Price</span>
              <span className="apc-field-val">{fmt$(price)}</span>
            </div>
            <input type="range" className="apc-slider"
              style={{ '--tc': ltAccent } as React.CSSProperties}
              min={100_000} max={priceMax} step={priceStep}
              value={price} onChange={e => setPrice(Number(e.target.value))} />
            <div className="apc-range-lbls">
              <span>$100k</span><span>{isJumbo ? '$10M' : '$3M'}</span>
            </div>
          </div>

          {/* Down payment + [$]/[%] toggle */}
          <div className="apc-field">
            <div className="apc-field-top">
              <span className="apc-field-lbl">Down Payment</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                <div className="apc-mode-toggle">
                  <button type="button"
                    className={`apc-mode-btn${downMode === 'pct' ? ' active' : ''}`}
                    style={downMode === 'pct' ? { color: ltAccent, borderColor: `${ltAccent}50`, background: `${ltAccent}15` } : {}}
                    onClick={() => setDownMode('pct')}
                  >%</button>
                  <button type="button"
                    className={`apc-mode-btn${downMode === 'dollar' ? ' active' : ''}`}
                    style={downMode === 'dollar' ? { color: ltAccent, borderColor: `${ltAccent}50`, background: `${ltAccent}15` } : {}}
                    onClick={() => setDownMode('dollar')}
                  >$</button>
                </div>
                <span className="apc-field-val">
                  {downMode === 'pct'
                    ? `${downPct.toFixed(1)}% · ${fmt$(Math.round(downAmt))}`
                    : `${fmt$(Math.round(downAmt))} · ${downPct.toFixed(1)}%`}
                </span>
              </div>
            </div>
            {downMode === 'pct' ? (
              <>
                <input type="range" className="apc-slider"
                  style={{ '--tc': ltAccent } as React.CSSProperties}
                  min={minDown} max={50} step={0.5}
                  value={downPct} onChange={e => setDownSafe(Number(e.target.value))} />
                <div className="apc-range-lbls"><span>{minDown}%</span><span>50%</span></div>
              </>
            ) : (
              <>
                <input type="range" className="apc-slider"
                  style={{ '--tc': ltAccent } as React.CSSProperties}
                  min={Math.round(price * minDown / 100)}
                  max={Math.round(price * 0.5)}
                  step={1000}
                  value={Math.round(downAmt)}
                  onChange={e => handleDownDollar(Number(e.target.value))} />
                <div className="apc-range-lbls">
                  <span>{fmt$(Math.round(price * minDown / 100))}</span>
                  <span>{fmtK(price * 0.5)}</span>
                </div>
              </>
            )}
          </div>

          {/* Interest rate */}
          <div className="apc-field">
            <div className="apc-field-top">
              <span className="apc-field-lbl">Interest Rate</span>
              <span className="apc-field-val">{rate.toFixed(3)}%</span>
            </div>
            <input type="range" className="apc-slider"
              style={{ '--tc': ltAccent } as React.CSSProperties}
              min={3} max={12} step={0.125}
              value={rate} onChange={e => setRate(Number(e.target.value))} />
            <div className="apc-range-lbls"><span>3%</span><span>12%</span></div>
          </div>

          {/* Monthly debts */}
          <div className="apc-field">
            <div className="apc-field-top">
              <span className="apc-field-lbl">Monthly Debts</span>
              <span className="apc-field-val" style={{ color: monthlyDebt > 0 ? '#f59e0b' : undefined }}>
                {monthlyDebt === 0 ? 'None' : fmt$(monthlyDebt) + '/mo'}
              </span>
            </div>
            <input type="range" className="apc-slider apc-slider--debt"
              min={0} max={3000} step={50}
              value={monthlyDebt} onChange={e => setMonthlyDebt(Number(e.target.value))} />
            <div className="apc-range-lbls"><span>$0</span><span>$3k/mo</span></div>
            <div className="apc-field-hint">Cars, credit cards, student loans</div>
          </div>

          {/* Annual income */}
          <div className="apc-field">
            <div className="apc-field-top">
              <span className="apc-field-lbl">Annual Income</span>
              <span className="apc-field-val">{annualIncome === 0 ? '—' : fmtK(annualIncome) + '/yr'}</span>
            </div>
            <input type="range" className="apc-slider"
              style={{ '--tc': ltAccent } as React.CSSProperties}
              min={0} max={incomeMax} step={incomeStep}
              value={annualIncome} onChange={e => setAnnualIncome(Number(e.target.value))} />
            <div className="apc-range-lbls"><span>$0</span><span>{isJumbo ? '$2M' : '$600k'}</span></div>
            {annualIncome === 0 && <div className="apc-field-hint">Optional — updates DTI bar above</div>}
          </div>

          {/* Loan term — 15 / 20 / 30yr for all card types */}
          <div className="apc-field">
            <div className="apc-field-top">
              <span className="apc-field-lbl">Loan Term</span>
            </div>
            <div className="apc-terms">
              {([15, 20, 30] as const).map(yr => (
                <button type="button" key={yr}
                  className={`apc-term${termYrs === yr ? ' active' : ''}`}
                  style={termYrs === yr
                    ? { borderColor: `${ltAccent}55`, color: ltAccent, background: `${ltAccent}12` }
                    : {}}
                  onClick={() => setTermYrs(yr)}
                >{yr}yr</button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* CTA */}
      <div className="apc-cta-row">
        <button type="button" className="apc-cta" onClick={handleCheckProperty}
          style={{ borderColor: `${ltAccent}40`, color: ltAccent, background: `${ltAccent}09` }}>
          Check a property <span style={{ fontSize: '0.95em' }}>↗</span>
        </button>
      </div>

      {/* Disclosure */}
      <div className="apc-disc">
        Educational estimates only — not a Loan Estimate, pre-approval, or commitment to lend.
        Estimates include principal &amp; interest, property taxes ({(props.taxRate * 100).toFixed(1)}%/yr),
        homeowner&apos;s insurance ({(props.insRate * 100).toFixed(1)}%/yr)
        {isFHA ? ', and FHA MIP' : isVA ? '. No PMI on VA loans' : pmi > 0 ? ', and PMI (auto-cancels at 80% LTV)' : ''}.
        {isFHA && ' UFMIP at 1.75% financed into loan.'}
        {isVA  && ' VA funding fee at 2.15% (first use) financed into loan.'}
        {props.fredStamp && ` Rate ${rate.toFixed(3)}% — ${props.fredStamp}.`}
        {' '}Actual terms depend on creditworthiness, property type, and lender.
      </div>

      {/* Styles */}
      <style>{`
        .apc {
          background: #0d1117;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          overflow: clip;
          margin-top: 14px;
          font-family: system-ui, -apple-system, sans-serif;
          color: #f0f4ff;
        }

        /* topbar */
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
        .apc-lt-badge {
          font-size: 9px; font-weight: 800; padding: 2px 7px;
          border-radius: 20px; letter-spacing: .06em; text-transform: uppercase;
        }

        /* hero */
        .apc-hero { padding: 18px 18px 10px; }
        .apc-hero-label {
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: .1em; color: #94a3b8; margin-bottom: 4px;
        }
        .apc-hero-amount {
          font-size: 38px; font-weight: 800; letter-spacing: -0.03em; line-height: 1;
          font-variant-numeric: tabular-nums;
        }
        .apc-hero-sub {
          font-size: 12px; color: #8fa3b8; margin-top: 6px; line-height: 1.4;
        }

        /* 3-tile row */
        .apc-tiles {
          display: grid; grid-template-columns: 1fr 1fr 1fr;
          margin: 10px 16px 12px;
          background: #0e1420;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px;
          overflow: hidden;
        }
        .apc-tile { padding: 12px 14px; }
        .apc-tile--mid {
          border-left: 1px solid rgba(255,255,255,0.06);
          border-right: 1px solid rgba(255,255,255,0.06);
        }
        .apc-tile-label {
          font-size: 9px; font-weight: 700; text-transform: uppercase;
          letter-spacing: .07em; color: #8fa3b8; margin-bottom: 4px;
        }
        .apc-tile-val {
          font-size: 15px; font-weight: 800; color: #f0f4ff;
          font-variant-numeric: tabular-nums;
        }
        .apc-tile-sub {
          font-size: 10px; color: #8fa3b8; margin-top: 2px;
        }

        /* DTI bar */
        .apc-dti-wrap { margin: 0 16px 12px; }
        .apc-dti-row {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 6px; gap: 8px;
        }
        .apc-dti-lbl { font-size: 11px; font-weight: 600; color: #8fa3b8; }
        .apc-dti-status { font-size: 11px; font-weight: 600; flex-shrink: 0; }
        .apc-dti-track {
          height: 6px; background: rgba(255,255,255,0.07);
          border-radius: 3px; position: relative; overflow: visible;
        }
        .apc-dti-fill {
          height: 100%; border-radius: 3px;
          transition: width 0.22s, background 0.22s;
          position: absolute; top: 0; left: 0;
        }
        .apc-dti-mark {
          position: absolute; top: -3px; bottom: -3px;
          width: 2px; background: rgba(255,255,255,0.3); border-radius: 1px;
          transform: translateX(-50%);
        }
        .apc-dti-legend {
          display: flex; justify-content: space-between;
          font-size: 9px; color: #4b6080; margin-top: 5px;
        }

        /* program notes (FHA / VA) */
        .apc-prog-note {
          margin: 0 16px 10px;
          border: 1px solid;
          border-radius: 10px; padding: 9px 13px;
          display: flex; align-items: flex-start; gap: 7px;
          font-size: 11.5px; color: #94a3b8; line-height: 1.5;
        }
        .apc-prog-note-icon { font-size: 13px; flex-shrink: 0; margin-top: 1px; }

        /* jumbo zone */
        .apc-jumbo-zone {
          margin: 0 16px 10px;
          border: 1px solid;
          border-radius: 10px; padding: 10px 13px;
          display: flex; align-items: flex-start; gap: 10px;
        }
        .apc-jumbo-badge {
          font-size: 9px; font-weight: 800; padding: 3px 8px;
          border-radius: 20px; flex-shrink: 0; letter-spacing: .06em;
          text-transform: uppercase; white-space: nowrap; margin-top: 1px;
        }
        .apc-jumbo-note { font-size: 11.5px; color: rgba(255,255,255,0.5); line-height: 1.45; }

        /* drawer trigger */
        .apc-trigger {
          width: 100%; display: flex; align-items: center; justify-content: space-between;
          padding: 12px 18px; background: transparent; border: none;
          border-top: 1px solid rgba(255,255,255,0.07);
          cursor: pointer; font-family: inherit;
          color: #8fa3b8; transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .apc-trigger:hover { background: rgba(255,255,255,0.02); color: #f0f4ff; }
        .apc-trigger.open { }
        .apc-trigger-lbl { font-size: 13px; font-weight: 600; }
        .apc-trigger-arrow { font-size: 14px; flex-shrink: 0; transition: transform 0.18s; }

        /* collapsible drawer */
        .apc-drawer { max-height: 0; overflow: hidden; transition: max-height 0.38s cubic-bezier(0.4,0,0.2,1); }
        .apc-drawer.open { max-height: 900px; }
        .apc-drawer-inner {
          padding: 16px 18px 8px;
          background: #0a0f18;
          border-top: 1px solid rgba(255,255,255,0.06);
          display: flex; flex-direction: column; gap: 16px;
        }

        /* slider fields */
        .apc-field { display: flex; flex-direction: column; gap: 6px; }
        .apc-field-top {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
        }
        .apc-field-lbl { font-size: 12px; font-weight: 600; color: #8fa3b8; }
        .apc-field-val { font-size: 12px; font-weight: 700; color: #f0f4ff; }
        .apc-field-hint { font-size: 10.5px; color: #4b6080; }

        /* [$]/[%] toggle */
        .apc-mode-toggle { display: flex; border-radius: 6px; overflow: hidden; }
        .apc-mode-btn {
          padding: 3px 7px; font-size: 10px; font-weight: 700;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
          color: #8fa3b8; cursor: pointer; font-family: inherit;
          transition: all 0.12s;
        }
        .apc-mode-btn:first-child { border-right: none; border-radius: 6px 0 0 6px; }
        .apc-mode-btn:last-child  { border-left: none; border-radius: 0 6px 6px 0; }
        .apc-mode-btn.active { }

        /* range input */
        .apc-slider {
          -webkit-appearance: none; appearance: none;
          width: 100%; height: 4px; border-radius: 2px;
          background: linear-gradient(to right, var(--tc, #00e87a) 0%, var(--tc, #00e87a) calc(var(--val, 50) * 1%), rgba(255,255,255,0.12) calc(var(--val, 50) * 1%));
          outline: none; cursor: pointer;
        }
        .apc-slider--debt {
          background: linear-gradient(to right, #f59e0b 0%, #f59e0b calc(var(--val, 0) * 1%), rgba(255,255,255,0.12) calc(var(--val, 0) * 1%));
        }
        .apc-slider::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 16px; height: 16px; border-radius: 50%;
          background: #f0f4ff; cursor: pointer;
          box-shadow: 0 1px 4px rgba(0,0,0,0.5);
        }
        .apc-slider::-moz-range-thumb {
          width: 16px; height: 16px; border-radius: 50%; border: none;
          background: #f0f4ff; cursor: pointer;
          box-shadow: 0 1px 4px rgba(0,0,0,0.5);
        }
        .apc-range-lbls {
          display: flex; justify-content: space-between;
          font-size: 9.5px; color: #4b6080;
        }

        /* loan term */
        .apc-terms { display: flex; gap: 8px; }
        .apc-term {
          flex: 1; padding: 9px 0; border-radius: 8px;
          border: 1.5px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.03);
          font-size: 12px; font-weight: 600; color: #94a3b8;
          cursor: pointer; font-family: inherit; text-align: center;
          transition: all 0.15s;
        }
        .apc-term:hover:not(.active) { border-color: rgba(255,255,255,0.18); color: #f0f4ff; }
        .apc-term.active { }

        /* CTA */
        .apc-cta-row { padding: 10px 16px 12px; }
        .apc-cta {
          width: 100%; padding: 13px 18px;
          border: 1.5px solid; border-radius: 10px;
          font-size: 14px; font-weight: 700;
          cursor: pointer; font-family: inherit;
          transition: opacity 0.15s;
        }
        .apc-cta:hover { opacity: 0.8; }

        /* disclosure */
        .apc-disc {
          margin: 0 16px 16px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.04);
          border-radius: 10px; padding: 10px 13px;
          font-size: 10.5px; color: rgba(148,163,184,0.65); line-height: 1.6;
        }

        @media (max-width: 480px) {
          .apc-hero-amount { font-size: 30px; }
          .apc-tiles { grid-template-columns: 1fr 1fr 1fr; }
          .apc-tile { padding: 10px 10px; }
          .apc-tile-val { font-size: 13px; }
        }
      `}</style>
    </div>
  );
}
