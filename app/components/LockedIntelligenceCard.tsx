'use client';
// app/components/LockedIntelligenceCard.tsx
// Inline property search card — embedded check-property UX inside the chat stack.
// Shows address input + 3 preview tiles so the user can kick off a property lookup
// without leaving the chat. onSubmitAddress fires send() in the parent.

import { useState } from 'react';
import AdminCardBadge from './AdminCardBadge';
import AddressAutocomplete from './AddressAutocomplete';

interface Props {
  onSubmitAddress: (address: string) => void;
}

export default function LockedIntelligenceCard({ onSubmitAddress }: Props) {
  const [address, setAddress] = useState('');

  function handleSubmit() {
    const val = address.trim();
    if (!val) return;
    onSubmitAddress(val);
  }

  return (
    <div style={{
      background:   '#0d1117',
      border:       '1px solid rgba(255,255,255,0.08)',
      borderRadius: 16,
      position:     'relative',
      overflow:     'hidden',
      marginTop:    10,
      fontFamily:   "'DM Sans', system-ui, sans-serif",
    }}>
      <AdminCardBadge code="LIC-011" />

      {/* ── Header ── */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#00e87a', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>
          Check any property · Free
        </div>
        <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#f0f4ff', lineHeight: 1.25, marginBottom: 6 }}>
          Home + Mortgage Intelligence.<br />In seconds.
        </div>
        <div style={{ fontSize: '0.78rem', color: 'rgba(185,208,192,0.55)', lineHeight: 1.55, marginBottom: 16 }}>
          Enter any address, or paste a link from Zillow or Redfin — get your monthly payment, market position, and decision score instantly.
        </div>

        {/* ── Address input ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10, padding: '0 14px',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="rgba(0,232,122,0.6)" />
              <circle cx="12" cy="9" r="2.5" fill="#0d1117" />
            </svg>
            <AddressAutocomplete
              value={address}
              onChange={setAddress}
              onSelect={val => { setAddress(val); setTimeout(() => { if (val.trim()) onSubmitAddress(val.trim()); }, 80); }}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="Address, or paste a Zillow / Redfin link"
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                color: '#f0f4ff', fontSize: '0.82rem', padding: '11px 0',
                fontFamily: "'DM Sans', system-ui, sans-serif",
              }}
            />
          </div>
          <button
            onClick={handleSubmit}
            style={{
              background: '#00e87a', color: '#080c12', fontWeight: 800, fontSize: '0.85rem',
              border: 'none', borderRadius: 10, padding: '0 18px', cursor: 'pointer',
              fontFamily: "'DM Sans', system-ui, sans-serif", whiteSpace: 'nowrap',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            Check →
          </button>
        </div>

        {/* Trust signals */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
          {['No account required', '3 free lookups', 'No sales calls', 'Real FRED rates'].map(t => (
            <span key={t} style={{ fontSize: '0.67rem', color: 'rgba(185,208,192,0.45)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#00e87a', fontWeight: 700 }}>✓</span> {t}
            </span>
          ))}
        </div>
      </div>

      {/* ── Divider ── */}
      <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'rgba(185,208,192,0.25)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 20px 10px' }}>
        What you&apos;ll see in seconds
      </div>

      {/* ── Preview tiles ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '0 12px 16px' }}>

        {/* Tile 1 — Payment Analysis */}
        <div style={{ background: 'rgba(61,139,255,0.06)', border: '1px solid rgba(61,139,255,0.15)', borderRadius: 10, padding: '12px 10px' }}>
          <div style={{ fontSize: '0.55rem', fontWeight: 800, color: '#3d8bff', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
            Payment Analysis
          </div>
          <div style={{ fontSize: '0.65rem', color: 'rgba(185,208,192,0.5)', marginBottom: 6 }}>123 Sunset Blvd, LA</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#f0f4ff', marginBottom: 2 }}>$6,840<span style={{ fontSize: '0.65rem', fontWeight: 500, color: 'rgba(185,208,192,0.5)' }}>/mo</span></div>
          <div style={{ fontSize: '0.6rem', color: 'rgba(185,208,192,0.4)', marginBottom: 8 }}>PITI · 20% down · 6.875%</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            {[['$1,249,000','List price'],['$249,800','Down payment'],['$0','PMI']].map(([v,l]) => (
              <div key={l} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '4px 6px' }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#f0f4ff' }}>{v}</div>
                <div style={{ fontSize: '0.52rem', color: 'rgba(185,208,192,0.35)' }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: '62%', background: '#3d8bff' }} />
            <div style={{ width: '25%', background: '#f59e0b' }} />
            <div style={{ width: '13%', background: '#00e87a' }} />
          </div>
        </div>

        {/* Tile 2 — Decision Score */}
        <div style={{ background: 'rgba(0,232,122,0.05)', border: '1px solid rgba(0,232,122,0.15)', borderRadius: 10, padding: '12px 10px' }}>
          <div style={{ fontSize: '0.55rem', fontWeight: 800, color: '#00e87a', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Track 5 · Decision Score
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
              <svg width="36" height="36" viewBox="0 0 40 40" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="4" />
                <circle cx="20" cy="20" r="16" fill="none" stroke="#00e87a" strokeWidth="4" strokeLinecap="round" strokeDasharray="100" strokeDashoffset="26" />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 900, color: '#00e87a' }}>74</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#f0f4ff' }}>Strong position</div>
              <div style={{ fontSize: '0.6rem', color: 'rgba(185,208,192,0.45)' }}>Ready to apply</div>
            </div>
          </div>
          {[['Financial',82,'#00e87a'],['Property',65,'#f59e0b'],['Market',78,'#00e87a'],['Location',71,'#00e87a']].map(([label,score,color]) => (
            <div key={label as string} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
              <span style={{ fontSize: '0.58rem', color: 'rgba(185,208,192,0.45)', width: 44, flexShrink: 0 }}>{label}</span>
              <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${score}%`, height: '100%', background: color as string, borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: '0.58rem', color: '#f0f4ff', width: 18, textAlign: 'right', flexShrink: 0 }}>{score}</span>
            </div>
          ))}
        </div>

        {/* Tile 3 — Income to Qualify */}
        <div style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 10, padding: '12px 10px' }}>
          <div style={{ fontSize: '0.55rem', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
            Income to Qualify
          </div>
          <div style={{ fontSize: '0.62rem', color: 'rgba(185,208,192,0.45)', marginBottom: 4 }}>Minimum annual income</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#f0f4ff', marginBottom: 8 }}>$198,400<span style={{ fontSize: '0.6rem', fontWeight: 500, color: 'rgba(185,208,192,0.45)' }}>/yr</span></div>
          <div style={{ fontSize: '0.58rem', color: 'rgba(185,208,192,0.38)', marginBottom: 8 }}>At 43% DTI · 30yr conventional</div>
          {[['43%','Standard max','$198,400/yr'],['36%','Conservative','$237,100/yr'],['28%','Front-end','$304,700/yr']].map(([pct,label,val]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 5, padding: '3px 6px' }}>
              <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#f59e0b', width: 26, flexShrink: 0 }}>{pct}</span>
              <span style={{ fontSize: '0.58rem', color: 'rgba(185,208,192,0.45)', flex: 1 }}>{label}</span>
              <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#f0f4ff' }}>{val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
