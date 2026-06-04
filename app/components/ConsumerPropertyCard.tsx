'use client';
// app/components/ConsumerPropertyCard.tsx
// Consumer-first property result card — replaces ISC+IQC+GrokCard for signed-out users.
// Shows: property status, list price, PITI, 4 shimmering score tiles, chips + Get Matched.

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { calcPI } from '../../lib/math';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ConsumerPropertyCardProps {
  // Property
  address: string;
  price: number;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  photoUrl?: string | null;
  listingStatus?: 'FOR_SALE' | 'OFF_MARKET' | 'PENDING' | 'SOLD' | 'UNKNOWN' | null;
  daysOnMarket?: number | null;
  pricePerSqft?: number | null;
  hoaMonthly?: number | null;
  // Scenario
  downPct: number;
  rate: number;
  term: number;
  taxRate: number;
  insRate: number;
  loanType: string;
  // DSC — null while computing
  dscState?: 'computing' | 'complete';
  l1Score?: number | null;
  l2Score?: number | null;
  l3Score?: number | null;
  l4Score?: number | null;
  // Actions
  onChip: (seed: string) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function fmtRate(r: number) { return parseFloat(r.toFixed(3)) + '%'; }

function scoreColor(s: number | null | undefined) {
  if (s == null) return '#8fa3b8';
  if (s >= 75) return '#00e87a';
  if (s >= 55) return '#f59e0b';
  return '#ff5f5f';
}

function scorePct(s: number | null | undefined) {
  if (s == null) return 0;
  return Math.min(100, Math.max(0, s));
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ConsumerPropertyCard(props: ConsumerPropertyCardProps) {
  const router = useRouter();
  const {
    address, price, beds, baths, sqft, photoUrl,
    listingStatus, daysOnMarket,
    downPct, rate, term, taxRate, insRate, loanType,
    dscState, l1Score, l2Score, l3Score, l4Score,
    onChip,
  } = props;

  // ── PITI ──────────────────────────────────────────────────────────────────
  const payment = useMemo(() => {
    const downAmt  = price * downPct / 100;
    const baseLoan = price - downAmt;
    const ltv      = baseLoan / price * 100;
    const pi       = calcPI(baseLoan, rate, term);
    const tax      = price * taxRate / 12;
    const ins      = price * insRate / 12;
    const pmi      = (loanType !== 'fha' && loanType !== 'va' && ltv > 80)
                     ? baseLoan * 0.008 / 12 : 0;
    return { pi, tax, ins, pmi, total: pi + tax + ins + pmi, downAmt, baseLoan, ltv };
  }, [price, downPct, rate, term, taxRate, insRate, loanType]);

  const piPct  = payment.total > 0 ? (payment.pi  / payment.total) * 100 : 0;
  const taxPct = payment.total > 0 ? (payment.tax / payment.total) * 100 : 0;
  const insPct = payment.total > 0 ? (payment.ins / payment.total) * 100 : 0;
  const pmiPct = payment.pmi > 0 && payment.total > 0 ? (payment.pmi / payment.total) * 100 : 0;

  // ── Status badge ──────────────────────────────────────────────────────────
  const statusLabel =
    listingStatus === 'FOR_SALE'   ? '✓ Active Listing' :
    listingStatus === 'PENDING'    ? '⏳ Under Contract' :
    listingStatus === 'SOLD'       ? 'Sold' :
    listingStatus === 'OFF_MARKET' ? 'Off Market' : null;

  const statusColor =
    listingStatus === 'FOR_SALE'   ? '#00e87a' :
    listingStatus === 'PENDING'    ? '#3d8bff' :
    listingStatus === 'SOLD'       ? '#8fa3b8' :
    listingStatus === 'OFF_MARKET' ? '#f59e0b' : '#8fa3b8';

  // ── Score tiles config ────────────────────────────────────────────────────
  const complete = dscState === 'complete';
  const tiles = [
    { key: 'l2', label: 'Value Score',      score: l2Score, shimmer: l2Score == null },
    { key: 'l3', label: 'Market Heat',      score: l3Score, shimmer: !complete || l3Score == null },
    { key: 'l4', label: 'Neighborhood',     score: l4Score, shimmer: !complete || l4Score == null },
    { key: 'l1', label: 'Buyer Readiness',  score: l1Score, shimmer: l1Score == null },
  ];

  // ── Get Matched URL ───────────────────────────────────────────────────────
  function goMatch() {
    const lt = loanType === 'va' ? 'va' : loanType === 'jumbo' ? 'jumbo' : loanType === 'fha' ? 'fha' : 'conventional';
    const p = new URLSearchParams({
      from: 'consumer', lt,
      price: String(Math.round(price)),
      dp: String(downPct),
      rate: rate.toFixed(2),
      monthly: String(Math.round(payment.total)),
      term: String(term),
    });
    router.push(`/connect/post?${p.toString()}`);
  }

  return (
    <div className="cpc">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="cpc-header">
        <div className="cpc-header-left">
          {statusLabel && (
            <div className="cpc-status" style={{ color: statusColor, background: `${statusColor}15`, border: `1px solid ${statusColor}30` }}>
              {statusLabel}
            </div>
          )}
          <div className="cpc-address">{address}</div>
          {(beds || baths || sqft || daysOnMarket) && (
            <div className="cpc-facts">
              {beds   != null && <span>{beds} bd</span>}
              {baths  != null && <span>{baths} ba</span>}
              {sqft   != null && <span>{sqft.toLocaleString()} sqft</span>}
              {daysOnMarket != null && daysOnMarket > 0 && <span>{daysOnMarket} days on market</span>}
            </div>
          )}
        </div>
        {photoUrl && (
          <div className="cpc-photo-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt={address} className="cpc-photo" />
          </div>
        )}
      </div>

      {/* ── Price + Payment ─────────────────────────────────────────── */}
      <div className="cpc-financials">
        <div className="cpc-price-block">
          <div className="cpc-price-lbl">List Price</div>
          <div className="cpc-price">{fmt$(price)}</div>
        </div>
        <div className="cpc-divider" />
        <div className="cpc-payment-block">
          <div className="cpc-payment-lbl">PITI · Monthly Payment</div>
          <div className="cpc-payment">{fmt$(payment.total)}<span className="cpc-mo">/mo</span></div>
          <div className="cpc-payment-sub">
            {downPct}% down · {fmtRate(rate)} · {loanType === 'jumbo' ? 'Jumbo' : loanType === 'fha' ? 'FHA' : loanType === 'va' ? 'VA' : 'Conventional'}
            {payment.pmi === 0 && payment.ltv <= 80 ? ' · No PMI' : ''}
          </div>
          {/* Color bar */}
          <div className="cpc-bar">
            <div style={{ width: `${piPct}%`,  background: '#3d8bff', height: '100%', minWidth: 2 }} />
            <div style={{ width: `${taxPct}%`, background: '#f59e0b', height: '100%', minWidth: 2 }} />
            <div style={{ width: `${insPct}%`, background: '#00e87a', height: '100%', minWidth: 2 }} />
            {payment.pmi > 0 && <div style={{ width: `${pmiPct}%`, background: '#ff5f5f', height: '100%', minWidth: 2 }} />}
          </div>
          <div className="cpc-legend">
            {[
              { c: '#3d8bff', n: 'P&I',      v: payment.pi },
              { c: '#f59e0b', n: 'Tax',       v: payment.tax },
              { c: '#00e87a', n: 'Insurance', v: payment.ins },
              ...(payment.pmi > 0 ? [{ c: '#ff5f5f', n: 'PMI', v: payment.pmi }] : []),
            ].map(item => (
              <div key={item.n} className="cpc-legend-item">
                <span className="cpc-legend-dot" style={{ background: item.c }} />
                <span className="cpc-legend-name">{item.n}</span>
                <span className="cpc-legend-val">{fmt$(item.v)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Decision Intelligence ────────────────────────────────────── */}
      <div className="cpc-intel">
        <div className="cpc-intel-header">
          <div className="cpc-intel-dot" />
          <span className="cpc-intel-lbl">Decision Intelligence</span>
          {dscState === 'computing' && <span className="cpc-intel-computing">· Analysing…</span>}
        </div>
        <div className="cpc-tiles">
          {tiles.map(t => (
            <div key={t.key} className="cpc-tile">
              {t.shimmer ? (
                <>
                  <div className="cpc-tile-shimmer-num" />
                  <div className="cpc-tile-name">{t.label}</div>
                  <div className="cpc-tile-bar-wrap">
                    <div className="cpc-tile-bar-shimmer" />
                  </div>
                </>
              ) : (
                <>
                  <div className="cpc-tile-num" style={{ color: scoreColor(t.score) }}>{t.score}</div>
                  <div className="cpc-tile-name">{t.label}</div>
                  <div className="cpc-tile-bar-wrap">
                    <div className="cpc-tile-bar-fill" style={{ width: `${scorePct(t.score)}%`, background: scoreColor(t.score) }} />
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Chips + CTA ─────────────────────────────────────────────── */}
      <div className="cpc-chips">
        <button className="cpc-chip cpc-chip--pri" onClick={() => onChip(`Can I afford ${fmt$(price)} on my income?`)}>
          Can I afford this?
        </button>
        <button className="cpc-chip" onClick={() => onChip(`What annual income do I need to qualify for ${fmt$(price)} at ${downPct}% down?`)}>
          What income do I need?
        </button>
        <button className="cpc-chip" onClick={() => onChip(`Compare FHA vs Conventional for ${fmt$(price)} with ${downPct}% down`)}>
          FHA vs Conventional
        </button>
      </div>
      <div className="cpc-cta-row">
        <button className="cpc-cta" onClick={goMatch}>
          Get matched with a loan officer →
        </button>
      </div>

      {/* ── Styles ────────────────────────────────────────────────────── */}
      <style>{`
        .cpc {
          background: #0d1117;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          overflow: hidden;
          margin-top: 12px;
          font-family: system-ui, -apple-system, sans-serif;
          color: #c4cfe0;
        }

        /* Header */
        .cpc-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          padding: 16px 18px 14px; border-bottom: 1px solid rgba(255,255,255,0.06); gap: 12px;
        }
        .cpc-header-left { flex: 1; display: flex; flex-direction: column; gap: 5px; min-width: 0; }
        .cpc-status {
          display: inline-block; padding: 3px 9px; border-radius: 99px;
          font-size: 0.6rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
          align-self: flex-start;
        }
        .cpc-address { font-size: 0.9rem; font-weight: 700; color: #f0f4ff; line-height: 1.3; }
        .cpc-facts { display: flex; flex-wrap: wrap; gap: 4px 10px; }
        .cpc-facts span { font-size: 0.68rem; color: #8fa3b8; }
        .cpc-facts span + span::before { content: '·'; margin-right: 10px; color: rgba(255,255,255,0.15); }
        .cpc-photo-wrap { flex-shrink: 0; }
        .cpc-photo { width: 90px; height: 68px; object-fit: cover; border-radius: 9px; border: 1px solid rgba(255,255,255,0.08); }
        @media (max-width: 420px) { .cpc-photo { width: 72px; height: 54px; } }

        /* Financials */
        .cpc-financials { padding: 16px 18px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; gap: 14px; }
        .cpc-price-lbl { font-size: 0.58rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #4b6080; margin-bottom: 3px; }
        .cpc-price { font-size: clamp(2rem, 6vw, 2.8rem); font-weight: 900; color: #f0f4ff; letter-spacing: -0.05em; line-height: 1; font-variant-numeric: tabular-nums; }
        .cpc-divider { height: 1px; background: rgba(255,255,255,0.06); }
        .cpc-payment-lbl { font-size: 0.58rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #4b6080; margin-bottom: 3px; }
        .cpc-payment { font-size: clamp(1.6rem, 4vw, 2rem); font-weight: 800; color: #f0f4ff; letter-spacing: -0.04em; line-height: 1; font-variant-numeric: tabular-nums; }
        .cpc-mo { font-size: 0.85rem; color: #8fa3b8; font-weight: 500; margin-left: 2px; }
        .cpc-payment-sub { font-size: 0.65rem; color: #8fa3b8; margin-top: 4px; margin-bottom: 8px; }
        .cpc-bar { display: flex; height: 6px; border-radius: 99px; overflow: hidden; background: rgba(255,255,255,0.07); margin-bottom: 8px; gap: 1px; }
        .cpc-legend { display: flex; flex-wrap: wrap; gap: 4px 10px; }
        .cpc-legend-item { display: flex; align-items: center; gap: 4px; }
        .cpc-legend-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
        .cpc-legend-name { font-size: 9px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.04em; }
        .cpc-legend-val { font-size: 10px; font-weight: 700; color: #c4cfe0; font-variant-numeric: tabular-nums; }

        /* Intelligence */
        .cpc-intel { padding: 14px 18px 12px; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .cpc-intel-header { display: flex; align-items: center; gap: 7px; margin-bottom: 10px; }
        .cpc-intel-dot { width: 6px; height: 6px; border-radius: 50%; background: #3d8bff; flex-shrink: 0; }
        .cpc-intel-lbl { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #3d8bff; }
        .cpc-intel-computing { font-size: 0.6rem; color: #8fa3b8; font-style: italic; }

        .cpc-tiles { display: grid; grid-template-columns: repeat(4,1fr); gap: 1px; background: rgba(255,255,255,0.05); }
        @media (max-width: 460px) { .cpc-tiles { grid-template-columns: repeat(2,1fr); } }
        .cpc-tile { background: #0d1117; padding: 10px 10px 8px; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .cpc-tile-num { font-size: 1.1rem; font-weight: 800; letter-spacing: -0.03em; line-height: 1; }
        .cpc-tile-name { font-size: 0.58rem; color: #8fa3b8; line-height: 1.3; }
        .cpc-tile-bar-wrap { height: 3px; border-radius: 99px; background: rgba(255,255,255,0.08); margin-top: 4px; overflow: hidden; }
        .cpc-tile-bar-fill { height: 100%; border-radius: 99px; transition: width 0.8s cubic-bezier(0.34,1.56,0.64,1); }

        /* Shimmer states */
        @keyframes cpc-shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
        .cpc-tile-shimmer-num {
          width: 36px; height: 20px; border-radius: 5px;
          background: linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 100%);
          background-size: 200% 100%;
          animation: cpc-shimmer 1.6s infinite;
        }
        .cpc-tile-bar-shimmer {
          width: 100%; height: 100%; border-radius: 99px;
          background: linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.05) 100%);
          background-size: 200% 100%;
          animation: cpc-shimmer 1.6s infinite;
        }

        /* Chips */
        .cpc-chips { padding: 12px 18px 0; display: flex; flex-wrap: wrap; gap: 6px; }
        .cpc-chip {
          padding: 6px 13px; border-radius: 99px; font-size: 0.72rem; font-weight: 500;
          cursor: pointer; font-family: inherit; border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04); color: #8fa3b8; transition: all 0.15s;
        }
        .cpc-chip:hover { color: #f0f4ff; border-color: rgba(255,255,255,0.22); }
        .cpc-chip--pri { background: rgba(0,232,122,0.08); border-color: rgba(0,232,122,0.2); color: #00e87a; font-weight: 600; }
        .cpc-chip--pri:hover { background: rgba(0,232,122,0.14); }

        /* CTA */
        .cpc-cta-row { padding: 10px 18px 14px; }
        .cpc-cta {
          width: 100%; padding: 11px; background: #3d8bff; border: none;
          border-radius: 10px; color: #fff; font-size: 0.82rem; font-weight: 800;
          cursor: pointer; font-family: inherit; letter-spacing: -0.01em; transition: opacity 0.15s;
        }
        .cpc-cta:hover { opacity: 0.88; }
      `}</style>
    </div>
  );
}
