'use client';

import { useEffect, useState } from 'react';
import { useUser, SignInButton, SignedIn, SignedOut } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppNav from '../components/AppNav';

interface HomeownerRecord {
  property_address: string | null;
  digest_enabled: boolean;
  updated_at: string;
  name: string | null;
  email: string | null;
}

interface AnalysisData {
  address: string;
  estimatedValue: number | null;
  estimatedValueLow: number | null;
  estimatedValueHigh: number | null;
  estimatedBalance: number | null;
  estimatedEquity: number | null;
  purchaseRate: number | null;
  lastSaleDate: string | null;
  lastSalePrice: number | null;
  liveRate: number;
  rentEstimate: number | null;
  valueHistory: { date: string; value: number }[];
  ltv: number | null;
  equityPct: number | null;
  appreciationPct: number | null;
  helocMax: number | null;
  helocRate: number;
  helocRateLabel: string;
  cashOutMax: number | null;
  helocDraws: { label: string; amount: number; interestOnly: number; amortizing: number }[];
  refiMonthlySaving: number;
  refiBreakEven: number | null;
  refiClosingCost: number;
  paidOffPct: number;
  interestPaid: number | null;
  yearsElapsed: number | null;
  payoffYear: number | null;
  nextValueTarget: number | null;
  nextValueTargetYear: number | null;
  piti: number | null;
  rentMonthly: number | null;
  rentVsOwn: number | null;
  prime: number;
}

type ChipId = 'equity' | 'heloc' | 'refi' | 'economy' | 'milestones';

const CHIPS: { id: ChipId; label: string; icon: string }[] = [
  { id: 'equity',     label: 'Equity & Value',  icon: '🏠' },
  { id: 'heloc',      label: 'HELOC Power',      icon: '💳' },
  { id: 'refi',       label: 'Refi Math',        icon: '🔁' },
  { id: 'economy',    label: 'Economy',          icon: '📈' },
  { id: 'milestones', label: 'Milestones',       icon: '🏁' },
];

// ── Format helpers ─────────────────────────────────────────────────────────────
function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}k`;
  return `$${n.toLocaleString()}`;
}
function pct(n: number | null): string { return n !== null ? `${n}%` : '—'; }
function rate(n: number | null | undefined): string { return n ? `${n.toFixed(2)}%` : '—'; }

// ── Sub-cards ──────────────────────────────────────────────────────────────────

function CardEquity({ d }: { d: AnalysisData }) {
  const eqPct = d.equityPct ?? 0;
  const balPct = 100 - eqPct;
  return (
    <div>
      <div className="mh-stat-row">
        <div className="mh-stat">
          <div className="mh-stat-label">Est. Value</div>
          <div className="mh-stat-value">{d.estimatedValue ? fmt(d.estimatedValue) : '—'}</div>
          {d.appreciationPct !== null && (
            <div className="mh-stat-sub" style={{ color: d.appreciationPct >= 0 ? '#22c55e' : '#f97066' }}>
              {d.appreciationPct >= 0 ? '+' : ''}{d.appreciationPct}% since purchase
            </div>
          )}
        </div>
        <div className="mh-stat">
          <div className="mh-stat-label">Est. Equity</div>
          <div className="mh-stat-value">{d.estimatedEquity ? fmt(d.estimatedEquity) : '—'}</div>
          <div className="mh-stat-sub">{pct(d.equityPct)} of value</div>
        </div>
        <div className="mh-stat">
          <div className="mh-stat-label">LTV Ratio</div>
          <div className="mh-stat-value">{pct(d.ltv)}</div>
          <div className="mh-stat-sub">{d.estimatedBalance ? fmt(d.estimatedBalance) + ' balance' : ''}</div>
        </div>
      </div>

      {/* Equity bar */}
      {d.estimatedEquity && d.estimatedBalance && (
        <div style={{ margin: '20px 0 8px' }}>
          <div className="mh-bar-label-row">
            <span style={{ color: '#22c55e' }}>{fmt(d.estimatedEquity)} equity ({pct(d.equityPct)})</span>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>{fmt(d.estimatedBalance)} remaining</span>
          </div>
          <div className="mh-bar-track">
            <div className="mh-bar-fill" style={{ width: `${eqPct}%`, background: '#22c55e' }} />
            <div className="mh-bar-fill" style={{ width: `${balPct}%`, background: 'rgba(255,255,255,0.1)' }} />
          </div>
        </div>
      )}

      {/* Range */}
      {d.estimatedValueLow && d.estimatedValueHigh && (
        <div className="mh-range-note">
          Value range: {fmt(d.estimatedValueLow)} – {fmt(d.estimatedValueHigh)}
          {d.lastSaleDate && d.lastSalePrice && (
            <span style={{ marginLeft: 12, color: 'rgba(255,255,255,0.35)' }}>
              Purchased {fmt(d.lastSalePrice)} · {d.lastSaleDate}
            </span>
          )}
        </div>
      )}

      {/* Sparkline */}
      {d.valueHistory.length >= 2 && (
        <div style={{ marginTop: 20 }}>
          <div className="mh-section-sub-label">12-month value trend</div>
          <Sparkline history={d.valueHistory} />
        </div>
      )}
    </div>
  );
}

function CardHELOC({ d }: { d: AnalysisData }) {
  if (!d.helocMax || d.helocMax < 10_000) {
    return <p className="mh-empty-note">Not enough equity for a HELOC right now. Typically requires at least 15% equity above your balance.</p>;
  }
  return (
    <div>
      <div className="mh-stat-row" style={{ marginBottom: 20 }}>
        <div className="mh-stat">
          <div className="mh-stat-label">Max HELOC Available</div>
          <div className="mh-stat-value" style={{ color: '#22c55e' }}>{fmt(d.helocMax)}</div>
          <div className="mh-stat-sub">At 85% CLTV</div>
        </div>
        <div className="mh-stat">
          <div className="mh-stat-label">HELOC Rate</div>
          <div className="mh-stat-value">{rate(d.helocRate)}</div>
          <div className="mh-stat-sub">{d.helocRateLabel} variable</div>
        </div>
        {d.cashOutMax && d.cashOutMax > 10_000 && (
          <div className="mh-stat">
            <div className="mh-stat-label">Cash-out Refi Alt.</div>
            <div className="mh-stat-value">{fmt(d.cashOutMax)}</div>
            <div className="mh-stat-sub">At 80% LTV fixed</div>
          </div>
        )}
      </div>

      <div className="mh-section-sub-label" style={{ marginBottom: 8 }}>Draw scenarios</div>
      <table className="mh-table">
        <thead>
          <tr>
            <th>Scenario</th>
            <th>Amount</th>
            <th>Interest only</th>
            <th>Amortizing (20yr)</th>
          </tr>
        </thead>
        <tbody>
          {d.helocDraws.map(row => (
            <tr key={row.label}>
              <td style={{ color: 'rgba(255,255,255,0.6)' }}>{row.label}</td>
              <td>{fmt(row.amount)}</td>
              <td style={{ color: 'rgba(255,255,255,0.55)' }}>{fmt(row.interestOnly)}/mo</td>
              <td style={{ color: 'rgba(255,255,255,0.55)' }}>{fmt(row.amortizing)}/mo</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mh-footnote">
        Rate is estimated Prime + 0.50% variable. Actual rates vary by lender, credit, and LTV.{' '}
        <Link href={`/chat?sq=${encodeURIComponent('What HELOC options do I have on my home?')}`} className="mh-inline-link">
          Talk to an LO →
        </Link>
      </div>
    </div>
  );
}

function CardRefi({ d }: { d: AnalysisData }) {
  const hasOpportunity = d.refiMonthlySaving > 50 && d.purchaseRate && d.purchaseRate > d.liveRate;
  return (
    <div>
      <div className="mh-stat-row" style={{ marginBottom: 20 }}>
        <div className="mh-stat">
          <div className="mh-stat-label">Your Rate</div>
          <div className="mh-stat-value">{rate(d.purchaseRate)}</div>
          <div className="mh-stat-sub">At purchase</div>
        </div>
        <div className="mh-stat">
          <div className="mh-stat-label">Market Today</div>
          <div className="mh-stat-value" style={{ color: d.liveRate < (d.purchaseRate ?? 99) ? '#22c55e' : '#f97066' }}>
            {rate(d.liveRate)}
          </div>
          <div className="mh-stat-sub">30yr fixed avg</div>
        </div>
        <div className="mh-stat">
          <div className="mh-stat-label">Rate Gap</div>
          <div className="mh-stat-value">
            {d.purchaseRate ? Math.abs(d.purchaseRate - d.liveRate).toFixed(2) + '%' : '—'}
          </div>
          <div className="mh-stat-sub">{(d.purchaseRate ?? 0) > d.liveRate ? 'Market is lower' : 'Market is higher'}</div>
        </div>
      </div>

      {hasOpportunity ? (
        <div className="mh-highlight-box" style={{ borderColor: 'rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.05)' }}>
          <div className="mh-highlight-title" style={{ color: '#22c55e' }}>Refi opportunity</div>
          <div className="mh-stat-row" style={{ marginTop: 12, marginBottom: 0 }}>
            <div className="mh-stat" style={{ background: 'none', border: 'none', padding: 0 }}>
              <div className="mh-stat-label">Monthly savings</div>
              <div className="mh-stat-value" style={{ color: '#22c55e' }}>{fmt(d.refiMonthlySaving)}/mo</div>
            </div>
            <div className="mh-stat" style={{ background: 'none', border: 'none', padding: 0 }}>
              <div className="mh-stat-label">Annual savings</div>
              <div className="mh-stat-value">{fmt(d.refiMonthlySaving * 12)}/yr</div>
            </div>
            {d.refiBreakEven && (
              <div className="mh-stat" style={{ background: 'none', border: 'none', padding: 0 }}>
                <div className="mh-stat-label">Break-even</div>
                <div className="mh-stat-value">{d.refiBreakEven} months</div>
                <div className="mh-stat-sub">~{fmt(d.refiClosingCost)} closing costs</div>
              </div>
            )}
          </div>
          <Link
            href={`/chat?sq=${encodeURIComponent(`Refi from ${d.purchaseRate?.toFixed(2)}% to ${d.liveRate.toFixed(2)}% on ${d.estimatedBalance ? fmt(d.estimatedBalance) : 'my'} balance`)}`}
            className="mh-cta-link"
            style={{ display: 'inline-block', marginTop: 14 }}
          >
            Run detailed refi analysis →
          </Link>
        </div>
      ) : (
        <div className="mh-empty-note">
          {(d.purchaseRate ?? 0) <= d.liveRate
            ? 'Your current rate is already at or below today\'s market — refinancing likely doesn\'t make sense right now.'
            : 'The rate gap is too small to justify refinancing costs at this time.'}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <div className="mh-section-sub-label" style={{ marginBottom: 8 }}>Loan payoff progress</div>
        <div className="mh-bar-label-row">
          <span>{d.paidOffPct}% paid off</span>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>{d.estimatedBalance ? fmt(d.estimatedBalance) + ' remaining' : ''}</span>
        </div>
        <div className="mh-bar-track" style={{ marginTop: 6 }}>
          <div className="mh-bar-fill" style={{ width: `${d.paidOffPct}%`, background: '#22c55e' }} />
          <div className="mh-bar-fill" style={{ width: `${100 - d.paidOffPct}%`, background: 'rgba(255,255,255,0.08)' }} />
        </div>
        {d.interestPaid && (
          <div className="mh-range-note" style={{ marginTop: 8 }}>
            Est. interest paid to date: <strong>{fmt(d.interestPaid)}</strong>
            {d.yearsElapsed ? ` over ${d.yearsElapsed} years` : ''}
          </div>
        )}
      </div>
    </div>
  );
}

function CardEconomy({ d }: { d: AnalysisData }) {
  return (
    <div>
      <div className="mh-stat-row" style={{ marginBottom: 20 }}>
        <div className="mh-stat">
          <div className="mh-stat-label">30yr Fixed</div>
          <div className="mh-stat-value">{rate(d.liveRate)}</div>
          <div className="mh-stat-sub">Freddie Mac avg</div>
        </div>
        <div className="mh-stat">
          <div className="mh-stat-label">Fed Funds</div>
          <div className="mh-stat-value">4.25–4.50%</div>
          <div className="mh-stat-sub">Held steady</div>
        </div>
        <div className="mh-stat">
          <div className="mh-stat-label">Prime Rate</div>
          <div className="mh-stat-value">{rate(d.prime)}</div>
          <div className="mh-stat-sub">Drives HELOC rates</div>
        </div>
      </div>

      {d.piti && d.rentMonthly && (
        <div style={{ marginTop: 4 }}>
          <div className="mh-section-sub-label" style={{ marginBottom: 10 }}>Rent vs. own — your area</div>
          <div className="mh-compare-row">
            <div className="mh-compare-item">
              <div className="mh-stat-label">Est. rent equivalent</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>{fmt(d.rentMonthly)}/mo</div>
            </div>
            <div className="mh-compare-divider" />
            <div className="mh-compare-item">
              <div className="mh-stat-label">Your est. P&I + tax/ins</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>{fmt(d.piti)}/mo</div>
            </div>
            {d.rentVsOwn !== null && (
              <>
                <div className="mh-compare-divider" />
                <div className="mh-compare-item">
                  <div className="mh-stat-label">
                    {d.rentVsOwn > 0 ? 'Owning saves' : 'Owning costs extra'}
                  </div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: d.rentVsOwn > 0 ? '#22c55e' : '#f97066' }}>
                    {fmt(Math.abs(d.rentVsOwn))}/mo
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="mh-footnote">Rent estimate from Rentcast market data. Ownership cost includes est. taxes &amp; insurance at 1.5% annual.</div>
        </div>
      )}
    </div>
  );
}

function CardMilestones({ d }: { d: AnalysisData }) {
  const items = [];

  if (d.estimatedEquity && d.estimatedEquity > 100_000) {
    const rounded = Math.floor(d.estimatedEquity / 100_000) * 100_000;
    items.push({
      done: true, color: '#22c55e',
      label: `Reached ${fmt(rounded)} equity`,
      detail: `Currently at ${fmt(d.estimatedEquity)} — ${pct(d.equityPct)} of home value`,
    });
  }

  if (d.payoffYear) {
    const yrs = d.payoffYear - new Date().getFullYear();
    items.push({
      done: false, color: '#eab308',
      label: 'Pay off mortgage',
      detail: `${d.payoffYear} · ${yrs} years remaining at current rate`,
    });
  }

  if (d.nextValueTarget && d.nextValueTargetYear) {
    items.push({
      done: false, color: 'rgba(255,255,255,0.3)',
      label: `Reach ${fmt(d.nextValueTarget)} value`,
      detail: `~${d.nextValueTargetYear} at 4.2% annual appreciation`,
    });
  }

  if (items.length === 0) {
    return <p className="mh-empty-note">Not enough data to compute milestones. Make sure your address is saved and the digest has run at least once.</p>;
  }

  return (
    <div>
      {items.map((m, i) => (
        <div key={i} className="mh-milestone-row">
          <div className="mh-milestone-dot" style={{ background: m.color, opacity: m.done ? 1 : 0.4 }} />
          <div className="mh-milestone-body">
            <div className="mh-milestone-label" style={{ color: m.done ? '#22c55e' : '#fff' }}>
              {m.label}
              {m.done && <span className="mh-milestone-done-badge">Done</span>}
            </div>
            <div className="mh-milestone-detail">{m.detail}</div>
          </div>
        </div>
      ))}
      <div className="mh-footnote" style={{ marginTop: 16 }}>Milestones based on Rentcast AVM, FRED rates, and 4.2% national avg. appreciation.</div>
    </div>
  );
}

// ── Sparkline component ────────────────────────────────────────────────────────

function Sparkline({ history }: { history: { date: string; value: number }[] }) {
  if (history.length < 2) return null;
  const vals = history.map(h => h.value);
  const min  = Math.min(...vals);
  const max  = Math.max(...vals);
  const range = max - min || 1;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 48, marginTop: 4 }}>
      {vals.map((v, i) => {
        const h = Math.max(4, Math.round(((v - min) / range) * 40));
        const isLast = i === vals.length - 1;
        return (
          <div
            key={i}
            style={{
              flex: 1, height: h, borderRadius: '2px 2px 0 0',
              background: isLast ? '#22c55e' : 'rgba(34,197,94,0.3)',
              transition: 'height 0.3s',
            }}
          />
        );
      })}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function MyHomePage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  const [record, setRecord]         = useState<HomeownerRecord | null>(null);
  const [loading, setLoading]       = useState(true);
  const [address, setAddress]       = useState('');
  const [saving, setSaving]         = useState(false);
  const [editing, setEditing]       = useState(false);
  const [digestOn, setDigestOn]     = useState(true);
  const [saved, setSaved]           = useState(false);

  const [activeChip, setActiveChip] = useState<ChipId>('equity');
  const [analysis, setAnalysis]     = useState<AnalysisData | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisErr, setAnalysisErr]         = useState('');

  useEffect(() => {
    if (!isLoaded || !user) return;
    fetch('/api/homeowner/save')
      .then(r => r.json())
      .then(({ homeowner }) => {
        setRecord(homeowner);
        if (homeowner) {
          setAddress(homeowner.property_address ?? '');
          setDigestOn(homeowner.digest_enabled ?? true);
        }
      })
      .finally(() => setLoading(false));
  }, [isLoaded, user]);

  // Auto-load analysis when address is known
  useEffect(() => {
    if (!record?.property_address || analysis || analysisLoading) return;
    loadAnalysis();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record]);

  async function loadAnalysis() {
    setAnalysisLoading(true);
    setAnalysisErr('');
    try {
      const res = await fetch('/api/homeowner/analysis');
      const data = await res.json();
      if (!res.ok) { setAnalysisErr(data.error ?? 'Could not load analysis'); return; }
      setAnalysis(data);
    } catch {
      setAnalysisErr('Network error — try again');
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function saveAddress() {
    if (!address.trim()) return;
    setSaving(true);
    const res = await fetch('/api/homeowner/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: address.trim(), digest_enabled: digestOn }),
    });
    const { homeowner } = await res.json();
    setRecord(homeowner);
    setAnalysis(null); // clear old analysis so it reloads
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    setSaving(false);
  }

  async function toggleDigest(val: boolean) {
    setDigestOn(val);
    await fetch('/api/homeowner/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ digest_enabled: val }),
    });
  }

  const hasAddress = record?.property_address;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="mh-root">
        <nav className="mh-nav">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <Link href="/" className="mh-logo"><img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" /></Link>
          <AppNav drawerOnly />
        </nav>

        <div className="mh-shell">
          <SignedOut>
            <div className="mh-signin-box">
              <h2>Your Home, Analyzed for Free</h2>
              <p>Sign in to monitor equity, HELOC capacity, refi timing, and more — no agent or lender required.</p>
              <SignInButton mode="modal">
                <button className="mh-signin-cta">Sign In — See My Home Value</button>
              </SignInButton>
            </div>
          </SignedOut>

          <SignedIn>
            {loading ? (
              <div className="mh-loading">Loading your home profile…</div>
            ) : (
              <>
                <div className="mh-header">
                  <h1>My Home</h1>
                  <p>{user?.firstName ? `Welcome back, ${user.firstName}.` : 'Welcome back.'}{' '}
                    {hasAddress ? 'Your property intelligence is below.' : 'Add your address to get started.'}
                  </p>
                </div>

                {/* ADDRESS CARD */}
                <div className="mh-card">
                  <div className="mh-card-label">Property Address</div>
                  {hasAddress && !editing ? (
                    <>
                      <div className="mh-address-display">
                        <span className="mh-address-text">{record.property_address}</span>
                        <button className="mh-edit-btn" onClick={() => setEditing(true)}>Edit</button>
                      </div>
                    </>
                  ) : (
                    <div className={hasAddress ? '' : 'mh-no-address'}>
                      {!hasAddress && (
                        <>
                          <h2>Add Your Property</h2>
                          <p>Enter your home address to unlock equity tracking, HELOC capacity, rate alerts, and a weekly homeowner digest.</p>
                        </>
                      )}
                      <div className="mh-form">
                        <input
                          className="mh-input"
                          placeholder="e.g. 1234 Oak Street, Los Angeles, CA 90001"
                          value={address}
                          onChange={e => setAddress(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveAddress()}
                        />
                        <div className="mh-form-row">
                          <button className="mh-save-btn" onClick={saveAddress} disabled={saving || !address.trim()}>
                            {saving ? 'Saving…' : 'Save Address'}
                          </button>
                          {editing && (
                            <button className="mh-cancel-btn" onClick={() => { setEditing(false); setAddress(record?.property_address ?? ''); }}>
                              Cancel
                            </button>
                          )}
                        </div>
                        {saved && <div className="mh-saved-msg">Address saved!</div>}
                      </div>
                    </div>
                  )}
                </div>

                {/* INTELLIGENCE SECTION */}
                {hasAddress && (
                  <div className="mh-card" style={{ padding: 0, overflow: 'hidden' }}>
                    {/* Chip nav */}
                    <div className="mh-chip-bar">
                      {CHIPS.map(c => (
                        <button
                          key={c.id}
                          className={`mh-chip${activeChip === c.id ? ' mh-chip-active' : ''}`}
                          onClick={() => setActiveChip(c.id)}
                        >
                          <span className="mh-chip-icon">{c.icon}</span>
                          {c.label}
                        </button>
                      ))}
                    </div>

                    {/* Card content */}
                    <div className="mh-chip-body">
                      {analysisLoading && (
                        <div className="mh-analysis-loading">
                          <div className="mh-spinner" />
                          <span>Fetching property data…</span>
                        </div>
                      )}

                      {!analysisLoading && analysisErr && (
                        <div className="mh-analysis-err">
                          {analysisErr}
                          <button className="mh-retry-btn" onClick={loadAnalysis}>Retry</button>
                        </div>
                      )}

                      {!analysisLoading && !analysisErr && analysis && (
                        <>
                          {activeChip === 'equity'     && <CardEquity     d={analysis} />}
                          {activeChip === 'heloc'      && <CardHELOC      d={analysis} />}
                          {activeChip === 'refi'       && <CardRefi       d={analysis} />}
                          {activeChip === 'economy'    && <CardEconomy    d={analysis} />}
                          {activeChip === 'milestones' && <CardMilestones d={analysis} />}
                        </>
                      )}
                    </div>

                    {/* Refresh + chat CTA footer */}
                    {analysis && !analysisLoading && (
                      <div className="mh-chip-footer">
                        <button className="mh-refresh-btn" onClick={loadAnalysis}>↻ Refresh</button>
                        <Link
                          href={`/chat?sq=${encodeURIComponent(`Property analysis for ${record?.property_address}`)}`}
                          className="mh-cta-link"
                        >
                          Ask a mortgage question →
                        </Link>
                      </div>
                    )}
                  </div>
                )}

                {/* DIGEST TOGGLE */}
                <div className="mh-card">
                  <div className="mh-card-label">Weekly Digest</div>
                  <div className="mh-digest-row">
                    <div className="mh-digest-info">
                      <h3>Home Intelligence Email</h3>
                      <p>Receive a weekly snapshot: equity, HELOC capacity, rate movement, and refi timing — sent to {user?.emailAddresses?.[0]?.emailAddress ?? 'your email'}.</p>
                    </div>
                    <label className="mh-toggle">
                      <input type="checkbox" checked={digestOn} onChange={e => toggleDigest(e.target.checked)} />
                      <span className="mh-toggle-track" />
                    </label>
                  </div>
                </div>
              </>
            )}
          </SignedIn>
        </div>
      </div>
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const CSS = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html:has(.mh-root){height:auto!important;overflow:visible!important}
  body:has(.mh-root){display:block!important;height:auto!important;overflow:visible!important;background:#0a0a0f!important}
  .mh-root{min-height:100vh;background:#0a0a0f;color:#f0f0f0;font-family:'Inter',system-ui,sans-serif}

  .mh-nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 2rem;height:56px;background:rgba(10,10,15,0.95);border-bottom:1px solid rgba(255,255,255,0.07)}
  .mh-logo img{height:26px;display:block}
  .mh-shell{max-width:760px;margin:0 auto;padding:3rem 1.5rem 5rem}

  .mh-signin-box{text-align:center;padding:5rem 2rem;border:1px solid rgba(255,255,255,0.08);border-radius:20px;background:rgba(255,255,255,0.02)}
  .mh-signin-box h2{font-size:1.6rem;font-weight:700;margin-bottom:.75rem}
  .mh-signin-box p{color:rgba(255,255,255,0.55);margin-bottom:2rem;font-size:.95rem}
  .mh-signin-cta{display:inline-block;padding:.75rem 2rem;background:#22c55e;color:#000;font-weight:700;border-radius:10px;font-size:1rem;cursor:pointer;border:none}
  .mh-loading{text-align:center;padding:6rem 0;color:rgba(255,255,255,0.4);font-size:.95rem}

  .mh-header{margin-bottom:2rem}
  .mh-header h1{font-size:2rem;font-weight:800;letter-spacing:-.03em;margin-bottom:.4rem}
  .mh-header p{color:rgba(255,255,255,0.5);font-size:.95rem}

  .mh-card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:16px;padding:1.75rem 2rem;margin-bottom:1.25rem}
  .mh-card-label{font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:.75rem}

  .mh-address-display{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}
  .mh-address-text{font-size:1.1rem;font-weight:600;color:#fff}
  .mh-edit-btn{font-size:.8rem;color:rgba(255,255,255,0.45);background:rgba(255,255,255,0.06);border:none;border-radius:6px;padding:.3rem .75rem;cursor:pointer}
  .mh-edit-btn:hover{color:#fff;background:rgba(255,255,255,0.1)}

  .mh-form{display:flex;flex-direction:column;gap:.75rem}
  .mh-input{width:100%;padding:.75rem 1rem;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:10px;color:#fff;font-size:.95rem;outline:none}
  .mh-input:focus{border-color:#22c55e}
  .mh-input::placeholder{color:rgba(255,255,255,0.3)}
  .mh-form-row{display:flex;gap:.75rem}
  .mh-save-btn{flex:1;padding:.75rem;background:#22c55e;color:#000;font-weight:700;border:none;border-radius:10px;cursor:pointer;font-size:.95rem}
  .mh-save-btn:disabled{opacity:.5;cursor:not-allowed}
  .mh-cancel-btn{padding:.75rem 1.25rem;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.6);border:none;border-radius:10px;cursor:pointer}
  .mh-saved-msg{font-size:.8rem;color:#22c55e;text-align:center}
  .mh-no-address h2{font-size:1.2rem;font-weight:700;margin-bottom:.4rem}
  .mh-no-address p{color:rgba(255,255,255,0.5);font-size:.9rem;margin-bottom:1.25rem;line-height:1.6}

  /* CHIP NAV */
  .mh-chip-bar{display:flex;gap:6px;overflow-x:auto;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.07);scrollbar-width:none}
  .mh-chip-bar::-webkit-scrollbar{display:none}
  .mh-chip{display:flex;align-items:center;gap:6px;padding:7px 14px;border-radius:999px;font-size:.8rem;font-weight:600;cursor:pointer;white-space:nowrap;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.55);transition:all .15s}
  .mh-chip:hover{background:rgba(255,255,255,0.08);color:#fff;border-color:rgba(255,255,255,0.2)}
  .mh-chip-active{background:rgba(34,197,94,0.12);color:#22c55e;border-color:rgba(34,197,94,0.35)}
  .mh-chip-icon{font-size:.85rem}

  /* CHIP BODY */
  .mh-chip-body{padding:24px}
  .mh-chip-footer{display:flex;align-items:center;justify-content:space-between;padding:12px 24px;border-top:1px solid rgba(255,255,255,0.07)}
  .mh-refresh-btn{font-size:.8rem;color:rgba(255,255,255,0.4);background:none;border:none;cursor:pointer;padding:4px 8px;border-radius:6px}
  .mh-refresh-btn:hover{color:rgba(255,255,255,0.7);background:rgba(255,255,255,0.06)}

  /* LOADING / ERROR */
  .mh-analysis-loading{display:flex;align-items:center;gap:12px;color:rgba(255,255,255,0.45);font-size:.9rem;padding:2rem 0}
  .mh-spinner{width:18px;height:18px;border:2px solid rgba(255,255,255,0.1);border-top-color:#22c55e;border-radius:50%;animation:mh-spin .7s linear infinite;flex-shrink:0}
  @keyframes mh-spin{to{transform:rotate(360deg)}}
  .mh-analysis-err{color:rgba(255,95,95,.8);font-size:.875rem;display:flex;align-items:center;gap:12px;padding:.75rem 0}
  .mh-retry-btn{font-size:.8rem;padding:.3rem .75rem;background:rgba(255,95,95,.12);color:rgba(255,95,95,.8);border:1px solid rgba(255,95,95,.2);border-radius:6px;cursor:pointer}

  /* STATS GRID */
  .mh-stat-row{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
  .mh-stat{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:12px 14px}
  .mh-stat-label{font-size:.68rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:5px}
  .mh-stat-value{font-size:1.25rem;font-weight:800;color:#fff;line-height:1.1}
  .mh-stat-sub{font-size:.7rem;color:rgba(255,255,255,0.4);margin-top:3px}

  /* BARS */
  .mh-bar-label-row{display:flex;justify-content:space-between;font-size:.75rem;color:rgba(255,255,255,0.55);margin-bottom:5px}
  .mh-bar-track{display:flex;height:7px;border-radius:999px;overflow:hidden}
  .mh-bar-fill{height:100%;transition:width .4s ease}

  /* TABLE */
  .mh-table{width:100%;border-collapse:collapse;font-size:.85rem}
  .mh-table th{text-align:left;font-size:.68rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,0.35);padding:.5rem 0;border-bottom:1px solid rgba(255,255,255,0.07)}
  .mh-table td{padding:.65rem 0;border-bottom:1px solid rgba(255,255,255,0.05);color:#fff;font-weight:600}
  .mh-table th:not(:first-child), .mh-table td:not(:first-child){text-align:right}

  /* MISC */
  .mh-range-note{font-size:.75rem;color:rgba(255,255,255,0.4);margin-top:4px}
  .mh-section-sub-label{font-size:.72rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,0.35)}
  .mh-empty-note{font-size:.875rem;color:rgba(255,255,255,0.4);line-height:1.6;padding:.5rem 0}
  .mh-footnote{font-size:.72rem;color:rgba(255,255,255,0.3);margin-top:10px;line-height:1.5}
  .mh-inline-link{color:#22c55e;text-decoration:none}
  .mh-cta-link{color:#22c55e;font-size:.875rem;font-weight:600;text-decoration:none}
  .mh-cta-link:hover{opacity:.8}

  .mh-highlight-box{padding:16px;border-radius:10px;border:1px solid rgba(255,255,255,0.08)}
  .mh-highlight-title{font-size:.75rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;margin-bottom:4px}

  /* COMPARE ROW */
  .mh-compare-row{display:flex;align-items:center;gap:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:14px 16px}
  .mh-compare-item{flex:1}
  .mh-compare-divider{width:1px;height:40px;background:rgba(255,255,255,0.08);flex-shrink:0}

  /* MILESTONES */
  .mh-milestone-row{display:flex;align-items:flex-start;gap:14px;padding:14px 0;border-bottom:1px solid rgba(255,255,255,0.06)}
  .mh-milestone-row:last-of-type{border-bottom:none}
  .mh-milestone-dot{width:10px;height:10px;border-radius:50%;margin-top:4px;flex-shrink:0}
  .mh-milestone-body{flex:1}
  .mh-milestone-label{font-size:.9rem;font-weight:700;display:flex;align-items:center;gap:8px}
  .mh-milestone-done-badge{font-size:.7rem;font-weight:600;color:#22c55e;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.25);border-radius:4px;padding:1px 7px}
  .mh-milestone-detail{font-size:.8rem;color:rgba(255,255,255,0.45);margin-top:3px}

  /* DIGEST */
  .mh-digest-row{display:flex;align-items:center;justify-content:space-between;gap:1rem}
  .mh-digest-info h3{font-size:1rem;font-weight:600;margin-bottom:.2rem}
  .mh-digest-info p{font-size:.82rem;color:rgba(255,255,255,0.45);line-height:1.4}
  .mh-toggle{position:relative;width:48px;height:26px;flex-shrink:0}
  .mh-toggle input{opacity:0;width:0;height:0;position:absolute}
  .mh-toggle-track{position:absolute;inset:0;background:rgba(255,255,255,0.12);border-radius:13px;cursor:pointer;transition:background .25s}
  .mh-toggle input:checked+.mh-toggle-track{background:#22c55e}
  .mh-toggle-track::after{content:'';position:absolute;left:3px;top:3px;width:20px;height:20px;background:#fff;border-radius:50%;transition:transform .25s}
  .mh-toggle input:checked+.mh-toggle-track::after{transform:translateX(22px)}

  @media(max-width:600px){
    .mh-shell{padding:2rem 1rem 4rem}
    .mh-header h1{font-size:1.5rem}
    .mh-stat-row{grid-template-columns:1fr 1fr}
    .mh-stat-row .mh-stat:last-child{grid-column:span 2}
    .mh-compare-row{flex-direction:column;gap:10px}
    .mh-compare-divider{display:none}
    .mh-table{font-size:.78rem}
  }
`;
