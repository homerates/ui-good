'use client';
// DpaEligibilityCard — fires in chat when zip + income are known.
// Self-fetching: takes zip + income props, calls /api/ami-qualifier on mount.

import { useEffect, useState } from 'react';
import Link from 'next/link';

export type DpaEligibilityCardData = {
  zip: string;
  income: number;
  householdSize?: number;
};

interface AmiResult {
  county: string;
  state: string;
  zip?: string;
  ami4Person: number;
  ami80pct: number;
  ami120pct: number;
  annualIncome: number;
  householdSize: number;
  incomeAsPctOfAmi: number;
  programs: { homeReady: boolean; homePossible: boolean; dpa: boolean };
  fiscalYear: number;
  dataSource: 'FHFA' | 'HUD';
  dpaMatchCount: number;
}

const fmt = (n: number) => `$${n.toLocaleString()}`;

function PctBar({ pct }: { pct: number }) {
  const capped = Math.min(pct, 140);
  const color = pct <= 80 ? '#4ade80' : pct <= 120 ? '#fbbf24' : '#f87171';
  return (
    <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'visible' }}>
      <div style={{ height: '100%', width: `${Math.min(capped / 140 * 100, 100)}%`, background: color, borderRadius: 4, transition: 'width 0.7s ease' }} />
      {/* 80% tick */}
      <div style={{ position: 'absolute', top: -3, left: `${80 / 140 * 100}%`, width: 1, height: 12, background: 'rgba(255,255,255,0.2)' }} />
      {/* 120% tick */}
      <div style={{ position: 'absolute', top: -3, left: `${120 / 140 * 100}%`, width: 1, height: 12, background: 'rgba(255,255,255,0.12)' }} />
    </div>
  );
}

export default function DpaEligibilityCard({ zip, income, householdSize = 4 }: DpaEligibilityCardData) {
  const [result, setResult] = useState<AmiResult | null>(null);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/ami-qualifier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: zip, annualIncome: income, householdSize }),
    })
      .then(r => r.json())
      .then(d => { if (d.ok) setResult(d.result); else setError(d.error); })
      .catch(() => setError('Unable to load AMI data'));
  }, [zip, income, householdSize]);

  const cardStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, #0d1f14 0%, #0a1520 100%)',
    border: '1px solid rgba(0,232,122,0.15)',
    borderRadius: 16,
    padding: '20px 22px',
    marginTop: 12,
    fontFamily: "'DM Sans', system-ui, sans-serif",
  };

  // ── Loading state ────────────────────────────────────────────────────────────
  if (!result && !error) return (
    <div style={cardStyle}>
      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(0,232,122,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
        DPA Eligibility · Checking…
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[80, 60, 50].map(w => (
          <div key={w} style={{ height: 12, width: `${w}%`, background: 'rgba(255,255,255,0.05)', borderRadius: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />
        ))}
      </div>
    </div>
  );

  // ── Error state ──────────────────────────────────────────────────────────────
  if (error || !result) return (
    <div style={{ ...cardStyle, borderColor: 'rgba(248,113,113,0.15)' }}>
      <div style={{ fontSize: '0.8rem', color: 'rgba(248,113,113,0.7)' }}>
        AMI lookup unavailable — try the full qualifier at <Link href="/ami-qualifier" style={{ color: '#f87171' }}>/ami-qualifier</Link>
      </div>
    </div>
  );

  const pct    = result.incomeAsPctOfAmi;
  const { homeReady, homePossible, dpa } = result.programs;
  const qualifierUrl = `/ami-qualifier?prefill_zip=${zip}&prefill_income=${income}&prefill_hh=${householdSize}`;

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'rgba(0,232,122,0.55)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
            DPA Eligibility · {result.county}, {result.state}
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f0f4ff' }}>
            {fmt(result.ami4Person)}
            <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'rgba(185,208,192,0.45)', marginLeft: 6 }}>
              {result.dataSource} {result.fiscalYear} AMI · 4-person
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: pct <= 80 ? '#4ade80' : pct <= 120 ? '#fbbf24' : '#f87171' }}>
            {pct}%
          </div>
          <div style={{ fontSize: '0.62rem', color: 'rgba(185,208,192,0.35)' }}>of AMI</div>
        </div>
      </div>

      {/* Progress bar */}
      <PctBar pct={pct} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, marginBottom: 16 }}>
        <div style={{ fontSize: '0.62rem', color: 'rgba(185,208,192,0.3)' }}>
          {fmt(income)} · {householdSize}-person household
        </div>
        <div style={{ fontSize: '0.62rem', color: 'rgba(185,208,192,0.3)' }}>
          80% limit: {fmt(result.ami80pct)}
        </div>
      </div>

      {/* Eligibility rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          {
            label:    'HomeReady (FNMA)',
            eligible: homeReady,
            detail:   homeReady ? `≤80% GSE AMI · limit ${fmt(result.ami80pct)}` : `${pct - 80}% over limit`,
          },
          {
            label:    'Home Possible (Freddie Mac)',
            eligible: homePossible,
            detail:   homePossible ? `≤80% GSE AMI · same threshold` : `${pct - 80}% over limit`,
          },
          {
            label:    'DPA / Down Payment Assistance',
            eligible: dpa,
            detail:   dpa
              ? result.dpaMatchCount > 0
                ? `${result.dpaMatchCount} lender${result.dpaMatchCount !== 1 ? 's' : ''} with active programs on HomeRates`
                : `HUD threshold met · ${fmt(result.ami120pct)} limit`
              : `Over HUD DPA threshold`,
          },
        ].map(row => (
          <div key={row.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: row.eligible ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.1)', border: `1px solid ${row.eligible ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 10, marginTop: 1 }}>
              {row.eligible ? '✓' : '✗'}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: row.eligible ? '#e0f7ec' : 'rgba(185,208,192,0.4)' }}>{row.label}</div>
              <div style={{ fontSize: '0.7rem', color: 'rgba(185,208,192,0.35)', marginTop: 1 }}>{row.detail}</div>
            </div>
          </div>
        ))}
      </div>

      {/* DPA match callout */}
      {dpa && result.dpaMatchCount > 0 && (
        <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(0,232,122,0.06)', border: '1px solid rgba(0,232,122,0.15)', borderRadius: 10 }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#4ade80', marginBottom: 2 }}>
            {result.dpaMatchCount} DPA program{result.dpaMatchCount !== 1 ? 's' : ''} available in {result.county}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'rgba(185,208,192,0.45)' }}>
            Lender identity shown only after you choose to connect.
          </div>
        </div>
      )}

      {/* CTAs */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <Link href={qualifierUrl} style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(185,208,192,0.5)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '7px 14px', textDecoration: 'none' }}>
          Full breakdown ↗
        </Link>
        {dpa && result.dpaMatchCount > 0 && (
          <Link href="/connect/my-scenario" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#00e87a', background: 'rgba(0,232,122,0.1)', border: '1px solid rgba(0,232,122,0.25)', borderRadius: 8, padding: '7px 14px', textDecoration: 'none' }}>
            Connect to DPA lender →
          </Link>
        )}
      </div>
    </div>
  );
}
