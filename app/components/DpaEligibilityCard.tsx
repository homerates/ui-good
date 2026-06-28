'use client';

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
  amiForHouseholdSize: number;
  ami80pct: number;
  ami50pct: number;
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
    <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'visible', margin: '10px 0 6px' }}>
      <div style={{ height: '100%', width: `${Math.min(capped / 140 * 100, 100)}%`, background: color, borderRadius: 4, transition: 'width 0.7s ease' }} />
      <div style={{ position: 'absolute', top: -3, left: `${80 / 140 * 100}%`, width: 1, height: 12, background: 'rgba(255,255,255,0.2)' }} />
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

  if (!result && !error) return (
    <div style={cardStyle}>
      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(0,232,122,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
        DPA Eligibility · Checking…
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[80, 60, 50].map(w => (
          <div key={w} style={{ height: 12, width: `${w}%`, background: 'rgba(255,255,255,0.05)', borderRadius: 6 }} />
        ))}
      </div>
    </div>
  );

  if (error || !result) return (
    <div style={{ ...cardStyle, borderColor: 'rgba(248,113,113,0.15)' }}>
      <div style={{ fontSize: '0.8rem', color: 'rgba(248,113,113,0.7)' }}>
        AMI lookup unavailable for ZIP {zip}.
      </div>
    </div>
  );

  const pct    = result.incomeAsPctOfAmi;
  const { homeReady, homePossible, dpa } = result.programs;
  const hhLabel = `${result.householdSize}-person`;
  const propertySearchUrl = `/chat?sq=${encodeURIComponent(`Find homes for sale in ZIP ${zip}`)}`;

  const eligRows = [
    {
      label:    'HomeReady (FNMA)',
      eligible: homeReady,
      detail:   homeReady ? `≤80% GSE AMI · ${fmt(result.ami80pct)} limit` : `${fmt(income - result.ami80pct)} over limit`,
    },
    {
      label:    'Home Possible (Freddie Mac)',
      eligible: homePossible,
      detail:   homePossible ? `≤80% GSE AMI · same threshold` : `${fmt(income - result.ami80pct)} over limit`,
    },
    {
      label:    'DPA / Down Payment Assistance',
      eligible: dpa,
      detail:   dpa
        ? result.dpaMatchCount > 0
          ? `${result.dpaMatchCount} lender${result.dpaMatchCount !== 1 ? 's' : ''} with active programs on HomeRates`
          : `HUD ${hhLabel} threshold met · ${fmt(result.ami120pct)} limit`
        : `${fmt(income - result.ami120pct)} over HUD threshold`,
    },
  ];

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
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
          <div style={{ fontSize: '0.62rem', color: 'rgba(185,208,192,0.35)' }}>of {hhLabel} AMI</div>
        </div>
      </div>

      {/* Progress bar */}
      <PctBar pct={pct} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: '0.62rem', color: 'rgba(185,208,192,0.3)' }}>
          {fmt(income)} · {hhLabel} household
        </div>
        <div style={{ fontSize: '0.62rem', color: 'rgba(185,208,192,0.3)' }}>
          80% limit: {fmt(result.ami80pct)}
        </div>
      </div>

      {/* Income Threshold Table */}
      <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '7px 14px 6px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'rgba(185,208,192,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            AMI Thresholds · {result.county}
          </span>
        </div>
        {[
          { label: `50% AMI (Section 8 / VLIL)`,    value: result.ami50pct,  tag: null },
          { label: `80% AMI (HomeReady / HP limit)`, value: result.ami80pct,  tag: income <= result.ami80pct  ? 'under' as const : 'over' as const },
          { label: `120% AMI (DPA ceiling)`,         value: result.ami120pct, tag: income <= result.ami120pct ? 'under' as const : 'over' as const },
          { label: `Your income`,                    value: income,           tag: null },
        ].map((row, i, arr) => (
          <div key={row.label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '7px 14px',
            borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            background: row.label === 'Your income' ? 'rgba(0,232,122,0.03)' : 'transparent',
          }}>
            <span style={{ fontSize: '0.75rem', color: row.label === 'Your income' ? '#e0f7ec' : 'rgba(185,208,192,0.4)' }}>
              {row.label}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {row.tag && (
                <span style={{
                  fontSize: '0.6rem', fontWeight: 700,
                  color: row.tag === 'under' ? '#4ade80' : '#f87171',
                  background: row.tag === 'under' ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
                  border: `1px solid ${row.tag === 'under' ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`,
                  borderRadius: 4, padding: '1px 6px', textTransform: 'uppercase',
                }}>
                  {row.tag}
                </span>
              )}
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: row.label === 'Your income' ? '#00e87a' : '#f0f4ff', minWidth: 78, textAlign: 'right' }}>
                {fmt(row.value)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Program Eligibility Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {eligRows.map(row => (
          <div key={row.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{
              width: 18, height: 18, borderRadius: '50%',
              background: row.eligible ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.1)',
              border: `1px solid ${row.eligible ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.2)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, fontSize: 10, marginTop: 1,
            }}>
              {row.eligible ? '✓' : '✗'}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: row.eligible ? '#e0f7ec' : 'rgba(185,208,192,0.4)' }}>
                {row.label}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'rgba(185,208,192,0.35)', marginTop: 1 }}>{row.detail}</div>
            </div>
          </div>
        ))}
      </div>

      {/* DPA match callout */}
      {dpa && result.dpaMatchCount > 0 && (
        <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(0,232,122,0.06)', border: '1px solid rgba(0,232,122,0.15)', borderRadius: 10 }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#4ade80', marginBottom: 2 }}>
            {result.dpaMatchCount} DPA program{result.dpaMatchCount !== 1 ? 's' : ''} available in {result.county}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'rgba(185,208,192,0.45)' }}>
            Lender identity shown only after you choose to connect.
          </div>
        </div>
      )}

      {/* CTAs — primary: property search; secondary: DPA connect */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link
          href={propertySearchUrl}
          style={{ fontSize: '0.75rem', fontWeight: 700, color: '#00e87a', background: 'rgba(0,232,122,0.1)', border: '1px solid rgba(0,232,122,0.25)', borderRadius: 8, padding: '8px 16px', textDecoration: 'none' }}
        >
          Find homes in {zip} →
        </Link>
        {dpa && result.dpaMatchCount > 0 && (
          <Link
            href="/connect/my-scenario"
            style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(185,208,192,0.5)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 16px', textDecoration: 'none' }}
          >
            Connect to DPA lender
          </Link>
        )}
      </div>

      <div style={{ marginTop: 12, fontSize: '0.6rem', color: 'rgba(185,208,192,0.18)', lineHeight: 1.5 }}>
        Preliminary only · Not financial advice · {result.dataSource} FY{result.fiscalYear} data · Verify with a licensed lender
      </div>
    </div>
  );
}
