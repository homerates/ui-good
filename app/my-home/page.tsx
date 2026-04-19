'use client';

import { useEffect, useState, Suspense } from 'react';
import { useUser, SignInButton, SignedIn, SignedOut } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AppNav from '../components/AppNav';
import AddressAutocomplete from '../components/AddressAutocomplete';

interface HomeownerProperty {
  id: string;
  property_address: string;
  is_primary: boolean;
  digest_enabled: boolean;
  updated_at: string;
  name: string | null;
  email: string | null;
  actual_balance: number | null;
  actual_rate: number | null;
  actual_purchase_price: number | null;
  actual_purchase_date: string | null;
}

interface SavedOverrides {
  actual_balance:        number | null;
  actual_rate:           number | null;
  actual_purchase_price: number | null;
  actual_purchase_date:  string | null;
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
  savedOverrides: SavedOverrides;
  balanceIsEstimated: boolean;
  rateIsEstimated: boolean;
  borrowerName?: string;
  isLoView?: boolean;
}

type ChipId = 'equity' | 'heloc' | 'refi' | 'economy' | 'milestones';

const CHIPS: { id: ChipId; label: string; icon: string }[] = [
  { id: 'equity',     label: 'Equity & Value',  icon: '🏠' },
  { id: 'heloc',      label: 'HELOC Power',      icon: '💳' },
  { id: 'refi',       label: 'Refi Math',        icon: '🔁' },
  { id: 'economy',    label: 'Economy',          icon: '📈' },
  { id: 'milestones', label: 'Milestones',       icon: '🏁' },
];

// ── Estimated badge ────────────────────────────────────────────────────────────
function EstBadge() {
  return (
    <span style={{
      fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em',
      textTransform: 'uppercase', padding: '1px 5px', borderRadius: 4,
      background: 'rgba(234,179,8,0.12)', color: '#eab308',
      border: '1px solid rgba(234,179,8,0.25)', marginLeft: 5,
      verticalAlign: 'middle',
    }}>est</span>
  );
}

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
        <Link href="/messages" className="mh-inline-link">
          Message my LO →
        </Link>
      </div>
    </div>
  );
}

function CardRefi({ d, onEdit }: { d: AnalysisData; onEdit: () => void }) {
  const hasOpportunity = d.refiMonthlySaving > 50 && d.purchaseRate && d.purchaseRate > d.liveRate;
  return (
    <div>
      <div className="mh-stat-row" style={{ marginBottom: 20 }}>
        <div className="mh-stat">
          <div className="mh-stat-label">Your Rate {d.rateIsEstimated && <EstBadge />}</div>
          <div className="mh-stat-value">{rate(d.purchaseRate)}</div>
          <div className="mh-stat-sub">{d.rateIsEstimated ? 'Historical avg estimate' : 'Your actual rate'}</div>
        </div>
        <div className="mh-stat">
          <div className="mh-stat-label">Market Today</div>
          <div className="mh-stat-value" style={{ color: d.liveRate < (d.purchaseRate ?? 99) ? '#22c55e' : '#f97066' }}>
            {rate(d.liveRate)}
          </div>
          <div className="mh-stat-sub">30yr fixed avg</div>
        </div>
        <div className="mh-stat">
          <div className="mh-stat-label">Balance {d.balanceIsEstimated && <EstBadge />}</div>
          <div className="mh-stat-value">{d.estimatedBalance ? fmt(d.estimatedBalance) : '—'}</div>
          <div className="mh-stat-sub">{d.balanceIsEstimated ? 'Estimate' : 'Your actual balance'}</div>
        </div>
      </div>
      {(d.rateIsEstimated || d.balanceIsEstimated) && (
        <div className="mh-est-notice">
          Numbers marked <span style={{ color: '#eab308' }}>est</span> are estimated from public records.{' '}
          <button className="mh-inline-btn" onClick={onEdit}>Enter your actual numbers →</button>
        </div>
      )}

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
            href={(() => {
              const rawBal = d.estimatedBalance ?? (d.estimatedValue ? Math.round(d.estimatedValue * 0.65) : null);
              const effectiveRate = d.purchaseRate ?? d.liveRate;
              const balNote  = d.estimatedBalance ? '' : ' (approximate — based on estimated home value, adjust as needed)';
              const rateNote = d.purchaseRate     ? '' : ' (using today\'s market rate as reference — update if you know your actual rate)';
              const q = rawBal
                ? `I have a $${Math.round(rawBal).toLocaleString('en-US')} balance${balNote} at ${effectiveRate.toFixed(2)}%${rateNote}, market rate is ${d.liveRate.toFixed(2)}%. Should I refinance? Show monthly savings and break-even.`
                : `I have a mortgage at ${effectiveRate.toFixed(2)}%${rateNote}, market rate is ${d.liveRate.toFixed(2)}%. Should I refinance? What is the break-even point?`;
              return `/chat?sq=${encodeURIComponent(q)}`;
            })()}
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

function MyHomePageInner() {
  const { user, isLoaded } = useUser();
  const searchParams = useSearchParams()!;
  const borrowerId   = searchParams?.get('borrower_id') ?? null;

  // Multi-home state
  const [properties, setProperties]           = useState<HomeownerProperty[]>([]);
  const [activePropertyId, setActivePropertyId] = useState<string | null>(null);
  const [loading, setLoading]                 = useState(true);
  const [newAddress, setNewAddress]           = useState('');
  const [addingNew, setAddingNew]             = useState(false);
  const [saving, setSaving]                   = useState(false);
  const [saved, setSaved]                     = useState(false);

  const [activeChip, setActiveChip] = useState<ChipId>('equity');
  const [analysis, setAnalysis]     = useState<AnalysisData | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisErr, setAnalysisErr]         = useState('');

  // Loan detail editor (consumer only)
  const [editingLoan, setEditingLoan]               = useState(false);
  const [loanBalance, setLoanBalance]               = useState('');
  const [loanRate, setLoanRate]                     = useState('');
  const [loanPurchasePrice, setLoanPurchasePrice]   = useState('');
  const [loanPurchaseDate, setLoanPurchaseDate]     = useState('');
  const [loanSaving, setLoanSaving]                 = useState(false);
  const [loanSaved, setLoanSaved]                   = useState(false);

  // Derived
  const activeProperty = properties.find(p => p.id === activePropertyId)
    ?? properties.find(p => p.is_primary)
    ?? properties[0]
    ?? null;
  const hasAddress = borrowerId ? true : properties.length > 0;

  // Load property list on mount
  useEffect(() => {
    if (!isLoaded || !user) return;
    if (borrowerId) { setLoading(false); return; }
    fetch('/api/homeowner/save')
      .then(r => r.json())
      .then(({ properties: props }: { properties: HomeownerProperty[] }) => {
        const list = props ?? [];
        setProperties(list);
        const primary = list.find(p => p.is_primary) ?? list[0];
        if (primary) setActivePropertyId(primary.id);
      })
      .finally(() => setLoading(false));
  }, [isLoaded, user, borrowerId]);

  // Load analysis whenever active property changes
  useEffect(() => {
    if (borrowerId) {
      if (!analysisLoading) loadAnalysis();
      return;
    }
    if (!activeProperty?.id) return;
    loadAnalysis(activeProperty.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProperty?.id, borrowerId]);

  async function loadAnalysis(propertyId?: string) {
    const pid = propertyId ?? activeProperty?.id;
    if (!borrowerId && !pid) return;
    setAnalysisLoading(true);
    setAnalysisErr('');
    setAnalysis(null);
    try {
      const url = borrowerId
        ? `/api/homeowner/analysis?borrower_id=${encodeURIComponent(borrowerId)}`
        : `/api/homeowner/analysis?property_id=${encodeURIComponent(pid!)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) { setAnalysisErr(data.error ?? 'Could not load analysis'); return; }
      setAnalysis(data);
    } catch {
      setAnalysisErr('Network error — try again');
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function addProperty() {
    if (!newAddress.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/homeowner/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: newAddress.trim() }),
      });
      const { property } = await res.json();
      if (property) {
        setProperties(prev => {
          const updated = property.is_primary
            ? prev.map(p => ({ ...p, is_primary: false }))
            : prev;
          return [...updated, property];
        });
        setActivePropertyId(property.id);
        setNewAddress('');
        setAddingNew(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  async function setPrimary(propertyId: string) {
    setProperties(prev => prev.map(p => ({ ...p, is_primary: p.id === propertyId })));
    await fetch('/api/homeowner/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ property_id: propertyId, is_primary: true }),
    });
  }

  async function removeProperty(propertyId: string) {
    if (!window.confirm('Remove this property from My Properties?')) return;
    const res = await fetch(`/api/homeowner/save?property_id=${encodeURIComponent(propertyId)}`, { method: 'DELETE' });
    if (!res.ok) return;
    setProperties(prev => {
      const remaining = prev.filter(p => p.id !== propertyId);
      if (activePropertyId === propertyId) {
        const next = remaining.find(p => p.is_primary) ?? remaining[0];
        setActivePropertyId(next?.id ?? null);
        setAnalysis(null);
      }
      return remaining;
    });
  }

  async function toggleDigest(propertyId: string, val: boolean) {
    setProperties(prev => prev.map(p => p.id === propertyId ? { ...p, digest_enabled: val } : p));
    await fetch('/api/homeowner/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ property_id: propertyId, digest_enabled: val }),
    });
  }

  function openLoanEditor() {
    const ov = analysis?.savedOverrides;
    setLoanBalance(ov?.actual_balance        ? String(ov.actual_balance)        : '');
    setLoanRate(ov?.actual_rate              ? String(ov.actual_rate)            : '');
    setLoanPurchasePrice(ov?.actual_purchase_price ? String(ov.actual_purchase_price) : '');
    setLoanPurchaseDate(ov?.actual_purchase_date   ?? '');
    setEditingLoan(true);
  }

  async function saveLoanDetails() {
    if (!activeProperty?.id) return;
    setLoanSaving(true);
    await fetch('/api/homeowner/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        property_id:           activeProperty.id,
        actual_balance:        loanBalance       ? parseFloat(loanBalance.replace(/[,$]/g, ''))       : null,
        actual_rate:           loanRate          ? parseFloat(loanRate.replace('%', ''))               : null,
        actual_purchase_price: loanPurchasePrice ? parseFloat(loanPurchasePrice.replace(/[,$]/g, '')) : null,
        actual_purchase_date:  loanPurchaseDate  || null,
      }),
    });
    setLoanSaving(false);
    setLoanSaved(true);
    setEditingLoan(false);
    setAnalysis(null);
    setTimeout(() => setLoanSaved(false), 2500);
  }

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
                <button className="mh-signin-cta">Sign In — See My Properties</button>
              </SignInButton>
            </div>
          </SignedOut>

          <SignedIn>
            {loading ? (
              <div className="mh-loading">Loading your home profile…</div>
            ) : (
              <>
                {/* LO context banner */}
                {borrowerId && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 12, padding: '10px 16px', borderRadius: 10, marginBottom: 16,
                    background: 'rgba(99,179,237,0.07)', border: '1px solid rgba(99,179,237,0.2)',
                  }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(99,179,237,0.7)' }}>LO View</span>
                      <span style={{ fontSize: '0.88rem', color: '#e0f0e8', marginLeft: 10 }}>
                        {analysis?.borrowerName ? `${analysis.borrowerName}'s home intelligence` : 'Loading borrower data…'}
                      </span>
                    </div>
                    <Link href="/lo/borrowers" style={{ fontSize: '0.78rem', color: 'rgba(99,179,237,0.7)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                      ← Back to Borrowers
                    </Link>
                  </div>
                )}

                {/* HEADER + PROPERTY SELECTOR */}
                <div className="mh-header">
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <h1>{borrowerId ? (analysis?.borrowerName ? `${analysis.borrowerName}'s Home` : 'Borrower Home') : 'My Properties'}</h1>
                      <p style={{ marginTop: 4 }}>{borrowerId
                        ? `Viewing property intelligence for ${analysis?.address ?? '…'}`
                        : hasAddress
                          ? `${user?.firstName ? `Hi ${user.firstName}.` : ''} Your property intelligence is below.`
                          : 'Add your address to unlock equity tracking, HELOC capacity, and rate alerts.'
                      }</p>
                    </div>
                    {!borrowerId && (
                      <button
                        className="mh-add-prop-btn"
                        onClick={() => { setAddingNew(v => !v); setTimeout(() => document.querySelector<HTMLInputElement>('.mh-add-form input')?.focus(), 60); }}
                      >
                        {addingNew ? '✕ Cancel' : '+ Add property'}
                      </button>
                    )}
                  </div>

                  {/* Property pills — shown when ≥1 property */}
                  {!borrowerId && properties.length > 0 && (
                    <div className="mh-prop-selector">
                      {properties.map(p => {
                        const short = p.property_address.split(',')[0];
                        const isActive = p.id === activeProperty?.id;
                        return (
                          <div key={p.id} className={`mh-prop-pill${isActive ? ' mh-prop-pill-active' : ''}`}>
                            <button
                              className="mh-prop-pill-inner"
                              onClick={() => {
                                if (!isActive) {
                                  setActivePropertyId(p.id);
                                  setAnalysis(null);
                                }
                              }}
                            >
                              <span>🏠</span>
                              <span className="mh-prop-pill-addr">{short}</span>
                              {p.is_primary && <span className="mh-prop-pill-star" title="Primary home">★</span>}
                            </button>
                            {/* Context menu: set primary / remove */}
                            {isActive && properties.length > 1 && (
                              <div className="mh-prop-pill-actions">
                                {!p.is_primary && (
                                  <button
                                    className="mh-prop-action-btn"
                                    title="Set as primary"
                                    onClick={() => setPrimary(p.id)}
                                  >★</button>
                                )}
                                <button
                                  className="mh-prop-action-btn mh-prop-action-remove"
                                  title="Remove property"
                                  onClick={() => removeProperty(p.id)}
                                >×</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add new property form */}
                  {!borrowerId && addingNew && (
                    <div className="mh-add-form mh-card" style={{ marginTop: 12, marginBottom: 0 }}>
                      <div className="mh-card-label">Add a property</div>
                      <div className="mh-form">
                        <AddressAutocomplete
                          className="mh-input"
                          placeholder="e.g. 1234 Oak Street, Los Angeles, CA 90001"
                          value={newAddress}
                          onChange={setNewAddress}
                          onSelect={setNewAddress}
                          onKeyDown={e => e.key === 'Enter' && addProperty()}
                        />
                        <div className="mh-form-row">
                          <button className="mh-save-btn" onClick={addProperty} disabled={saving || !newAddress.trim()}>
                            {saving ? 'Saving…' : 'Add →'}
                          </button>
                          <button className="mh-cancel-btn" onClick={() => { setAddingNew(false); setNewAddress(''); }}>
                            Cancel
                          </button>
                        </div>
                        {saved && <div className="mh-saved-msg">Property added!</div>}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── HOME INTELLIGENCE HERO — shown when analysis is loaded ── */}
                {analysis && !analysisLoading && (
                  <div style={{
                    background: '#0f172a', borderRadius: 16, marginBottom: 16,
                    boxShadow: '0 4px 24px rgba(0,0,0,0.4)', overflow: 'hidden',
                  }}>
                    {/* Green accent line */}
                    <div style={{ height: 3, background: 'linear-gradient(90deg,#00e87a,#00b459)' }} />
                    <div style={{ padding: '20px 24px' }}>
                      {/* Address + date */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
                        <div>
                          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#00e87a', marginBottom: 3 }}>Home Intelligence</div>
                          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#f1f5f9', lineHeight: 1.3 }}>{analysis.address}</div>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#334155' }}>
                          {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </div>
                      </div>
                      {/* 4 key stats */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, marginBottom: 20 }}>
                        {[
                          { label: 'Est. Value', value: analysis.estimatedValue ? `$${Math.round(analysis.estimatedValue).toLocaleString()}` : '—', green: true },
                          { label: 'Total Equity', value: analysis.estimatedEquity != null && analysis.estimatedEquity < 0 ? 'Underwater' : analysis.estimatedEquity ? `$${Math.round(analysis.estimatedEquity).toLocaleString()}` : '—', green: false, warn: analysis.estimatedEquity != null && analysis.estimatedEquity < 0 },
                          { label: 'Appreciation', value: analysis.appreciationPct != null ? `+${analysis.appreciationPct}%` : '—', green: true },
                          { label: 'LTV Ratio', value: analysis.ltv != null ? `${analysis.ltv}%` : '—', green: false, warn: analysis.ltv != null && analysis.ltv > 100 },
                        ].map((s, i) => (
                          <div key={i} style={{ paddingRight: i < 3 ? 16 : 0, paddingLeft: i > 0 ? 16 : 0, borderRight: i < 3 ? '1px solid #1e293b' : 'none' }}>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#475569', marginBottom: 4 }}>{s.label}</div>
                            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: (s as {green?:boolean;warn?:boolean}).warn ? '#f59e0b' : s.green ? '#00e87a' : '#f1f5f9', lineHeight: 1.1 }}>{s.value}</div>
                          </div>
                        ))}
                      </div>
                      {/* Equity bar — only show when not underwater */}
                      {analysis.equityPct != null && analysis.estimatedEquity != null && analysis.estimatedEquity >= 0 && (
                        <div style={{ marginBottom: 20 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#475569', marginBottom: 5 }}>
                            <span style={{ color: '#00e87a' }}>
                              {`$${Math.round(analysis.estimatedEquity / 1000)}K equity (${analysis.equityPct}%)`}
                            </span>
                            <span>
                              {analysis.estimatedBalance ? `$${Math.round(analysis.estimatedBalance / 1000)}K balance` : 'Balance'}
                            </span>
                          </div>
                          <div style={{ height: 6, background: '#1e293b', borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min(analysis.equityPct, 100)}%`, background: 'linear-gradient(90deg,#00e87a,#00b459)', borderRadius: 999 }} />
                          </div>
                        </div>
                      )}
                      {/* Underwater warning */}
                      {analysis.estimatedEquity != null && analysis.estimatedEquity < 0 && (
                        <div style={{ marginBottom: 20, padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8 }}>
                          <div style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 700 }}>⚠️ Property is currently underwater</div>
                          <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: 3 }}>
                            Balance exceeds estimated value by {analysis.estimatedBalance && analysis.estimatedValue ? `$${Math.round(Math.abs(analysis.estimatedBalance - analysis.estimatedValue) / 1000)}K` : '—'}. Consider running refi math.
                          </div>
                        </div>
                      )}
                      {/* CTA buttons */}
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <a
                          href={(() => {
                            const a = analysis;
                            const parts: string[] = [`Run my numbers for ${a.address}.`];
                            // Balance and rate first — refi parser grabs the first large dollar figure as the balance
                            if (a.estimatedBalance) parts.push(`Loan balance: $${Math.round(a.estimatedBalance).toLocaleString()}${a.balanceIsEstimated ? ' (estimated)' : ' (on file)'}.`);
                            const rate = a.savedOverrides?.actual_rate ?? a.purchaseRate;
                            if (rate) parts.push(`Current mortgage rate: ${rate}%${a.rateIsEstimated ? ' (estimated from purchase year)' : ' (on file)'}.`);
                            if (a.estimatedValue) parts.push(`Home value: $${Math.round(a.estimatedValue).toLocaleString()}${a.estimatedValueLow && a.estimatedValueHigh ? ` (range $${Math.round(a.estimatedValueLow/1000)}K–$${Math.round(a.estimatedValueHigh/1000)}K)` : ''}.`);
                            if (a.estimatedEquity) parts.push(`Equity: $${Math.round(a.estimatedEquity).toLocaleString()} (${a.equityPct}%).`);
                            if (a.lastSalePrice) parts.push(`Purchase price: $${Math.round(a.lastSalePrice).toLocaleString()}.`);
                            if (a.piti) parts.push(`Current PITI: $${Math.round(a.piti).toLocaleString()}/mo.`);
                            parts.push('Use these exact figures — do not substitute estimates or benchmarks.');
                            return `/chat?sq=${encodeURIComponent(parts.join(' '))}`;
                          })()}
                          style={{ padding: '10px 20px', borderRadius: 999, background: '#00e87a', color: '#07100f', fontWeight: 800, fontSize: '0.82rem', textDecoration: 'none', display: 'inline-block' }}
                        >
                          Run My Numbers →
                        </a>
                        <a
                          href="#equity"
                          onClick={e => {
                            e.preventDefault();
                            const chip = document.querySelector('[data-chip="equity"]') as HTMLButtonElement | null;
                            chip?.click();
                            setTimeout(() => {
                              (document.querySelector('.mh-chip-bar') as HTMLElement | null)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }, 50);
                          }}
                          style={{ padding: '10px 20px', borderRadius: 999, border: '1px solid #1e293b', color: '#94a3b8', fontWeight: 600, fontSize: '0.82rem', textDecoration: 'none', display: 'inline-block' }}
                        >
                          Full Analysis ↓
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {/* INTELLIGENCE SECTION — always visible; locked preview when no address */}
                <div className="mh-card" style={{ padding: 0, overflow: 'hidden' }}>
                  {/* Chip nav */}
                  <div className="mh-chip-bar">
                    {CHIPS.map(c => (
                      <button
                        key={c.id}
                        data-chip={c.id}
                        className={`mh-chip${activeChip === c.id ? ' mh-chip-active' : ''}${!hasAddress ? ' mh-chip-dim' : ''}`}
                        onClick={() => { if (hasAddress) setActiveChip(c.id); }}
                        style={!hasAddress ? { cursor: 'default' } : undefined}
                      >
                        <span className="mh-chip-icon">{c.icon}</span>
                        {c.label}
                      </button>
                    ))}
                  </div>

                  {/* Card content */}
                  <div className="mh-chip-body">
                    {/* ── Locked preview — no address yet ── */}
                    {!hasAddress && (
                      <div className="mh-preview-wrap">
                        {/* Ghost stat row */}
                        <div className="mh-stat-row mh-preview-ghost">
                          {[
                            { label: 'Est. Value',  value: '$———' },
                            { label: 'Est. Equity', value: '$———' },
                            { label: 'LTV Ratio',   value: '——%'  },
                          ].map(s => (
                            <div key={s.label} className="mh-stat">
                              <div className="mh-stat-label">{s.label}</div>
                              <div className="mh-stat-value" style={{ color: 'rgba(255,255,255,0.12)', letterSpacing: 2 }}>{s.value}</div>
                            </div>
                          ))}
                        </div>
                        {/* Ghost bar */}
                        <div style={{ margin: '20px 0 8px' }}>
                          <div className="mh-bar-label-row" style={{ opacity: 0.2 }}>
                            <span>Equity</span><span>Balance</span>
                          </div>
                          <div className="mh-bar-track">
                            <div className="mh-bar-fill" style={{ width: '40%', background: 'rgba(34,197,94,0.15)' }} />
                            <div className="mh-bar-fill" style={{ width: '60%', background: 'rgba(255,255,255,0.05)' }} />
                          </div>
                        </div>
                        {/* Unlock CTA overlay */}
                        <div className="mh-preview-cta">
                          <div style={{ fontSize: '1.4rem', marginBottom: 8 }}>🔓</div>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 6 }}>
                            Enter your address to unlock
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginBottom: 16, lineHeight: 1.5 }}>
                            Equity tracking, HELOC capacity, refi timing, milestones — all personalized to your home.
                          </div>
                          <button
                            className="mh-save-btn"
                            style={{ width: 'auto', padding: '10px 28px' }}
                            onClick={() => {
                              setAddingNew(true);
                              setTimeout(() => {
                                const el = document.querySelector<HTMLInputElement>('.mh-add-form input');
                                el?.focus();
                                el?.closest('.mh-add-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }, 60);
                            }}
                          >
                            Add my property →
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── Active state ── */}
                    {hasAddress && (
                      <>
                        {analysisLoading && (
                          <div className="mh-analysis-loading">
                            <div className="mh-spinner" />
                            <span>Fetching property data…</span>
                          </div>
                        )}

                        {!analysisLoading && analysisErr && (
                          <div className="mh-analysis-err">
                            {analysisErr}
                            <button className="mh-retry-btn" onClick={() => loadAnalysis()}>Retry</button>
                          </div>
                        )}

                        {!analysisLoading && !analysisErr && analysis && (
                          <>
                            {activeChip === 'equity'     && <CardEquity     d={analysis} />}
                            {activeChip === 'heloc'      && <CardHELOC      d={analysis} />}
                            {activeChip === 'refi'       && <CardRefi       d={analysis} onEdit={openLoanEditor} />}
                            {activeChip === 'economy'    && <CardEconomy    d={analysis} />}
                            {activeChip === 'milestones' && <CardMilestones d={analysis} />}
                          </>
                        )}
                      </>
                    )}
                  </div>

                  {/* Refresh + chat CTA footer — only when analysis is loaded */}
                  {analysis && !analysisLoading && (
                    <div className="mh-chip-footer">
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="mh-refresh-btn" onClick={() => loadAnalysis()}>↻ Refresh</button>
                        {!borrowerId && <button className="mh-refresh-btn" onClick={openLoanEditor} style={{ color: 'rgba(34,197,94,0.6)' }}>✎ Edit loan details</button>}
                        {borrowerId && <Link href="/lo/borrowers" className="mh-refresh-btn" style={{ color: 'rgba(99,179,237,0.6)', textDecoration: 'none' }}>✎ Edit in Borrowers</Link>}
                      </div>
                      <Link
                        href={(() => {
                          const addr = analysis?.address ?? activeProperty?.property_address ?? '';
                          const bal  = analysis?.estimatedBalance;
                          const live = analysis?.liveRate ?? 6.99;
                          const rate = analysis?.purchaseRate ?? live;
                          if (activeChip === 'refi') {
                            const refibal = bal ?? (analysis?.estimatedValue ? Math.round(analysis.estimatedValue * 0.65) : null);
                            const balNote = bal ? '' : ' (approximate — based on estimated home value, adjust as needed)';
                            const rateNote = analysis?.purchaseRate ? '' : ' (using today\'s market rate as reference — update if you know your actual rate)';
                            if (refibal) return `/chat?sq=${encodeURIComponent(`I have a $${Math.round(refibal).toLocaleString('en-US')} balance${balNote} at ${rate.toFixed(2)}%${rateNote}, market rate is ${live.toFixed(2)}%. Should I refinance? Show monthly savings and break-even.`)}`;
                          }
                          if (activeChip === 'heloc' && analysis?.helocMax) {
                            return `/chat?sq=${encodeURIComponent(`HELOC analysis for ${addr}: I have ${analysis.helocMax ? '$' + Math.round(analysis.helocMax).toLocaleString() : 'equity'} available at ~${analysis.helocRate?.toFixed(2) ?? '7.75'}%. What are my best options for accessing home equity?`)}`;
                          }
                          if (activeChip === 'equity' && bal) {
                            return `/chat?sq=${encodeURIComponent(`Equity analysis for ${addr}: estimated value ${analysis?.estimatedValue ? '$' + Math.round(analysis.estimatedValue).toLocaleString() : 'unknown'}, balance $${Math.round(bal).toLocaleString()}, equity ${analysis?.estimatedEquity ? '$' + Math.round(analysis.estimatedEquity).toLocaleString() : 'unknown'}. What are my options?`)}`;
                          }
                          return `/chat?sq=${encodeURIComponent(`Property analysis for ${addr}`)}`;
                        })()}
                        className="mh-cta-link"
                      >
                        Ask a mortgage question →
                      </Link>
                    </div>
                  )}
                </div>

                {/* LOAN DETAIL EDITOR — consumer only */}
                {!borrowerId && editingLoan && (
                  <div className="mh-card" style={{ border: '1px solid rgba(34,197,94,0.2)' }}>
                    <div className="mh-card-label">Correct Your Loan Details</div>
                    <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.45)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
                      We estimate your balance and rate from public records. Enter your actual numbers for more accurate analysis.
                      Leave a field blank to keep using the estimate.
                    </p>
                    <div className="mh-loan-grid">
                      <div className="mh-loan-field">
                        <label className="mh-loan-label">Current loan balance</label>
                        <input
                          className="mh-input"
                          placeholder="e.g. 209000"
                          value={loanBalance}
                          onChange={e => setLoanBalance(e.target.value)}
                        />
                      </div>
                      <div className="mh-loan-field">
                        <label className="mh-loan-label">Your interest rate (%)</label>
                        <input
                          className="mh-input"
                          placeholder="e.g. 6.54"
                          value={loanRate}
                          onChange={e => setLoanRate(e.target.value)}
                        />
                      </div>
                      <div className="mh-loan-field">
                        <label className="mh-loan-label">Purchase price</label>
                        <input
                          className="mh-input"
                          placeholder="e.g. 670000"
                          value={loanPurchasePrice}
                          onChange={e => setLoanPurchasePrice(e.target.value)}
                        />
                      </div>
                      <div className="mh-loan-field">
                        <label className="mh-loan-label">Close date</label>
                        <input
                          className="mh-input"
                          type="date"
                          value={loanPurchaseDate}
                          onChange={e => setLoanPurchaseDate(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="mh-form-row" style={{ marginTop: '1rem' }}>
                      <button className="mh-save-btn" onClick={saveLoanDetails} disabled={loanSaving}>
                        {loanSaving ? 'Saving…' : 'Save my numbers'}
                      </button>
                      <button className="mh-cancel-btn" onClick={() => setEditingLoan(false)}>Cancel</button>
                    </div>
                    {loanSaved && <div className="mh-saved-msg" style={{ marginTop: 8 }}>Saved — refreshing analysis…</div>}
                  </div>
                )}

                {/* DIGEST TOGGLE — consumer only */}
                {!borrowerId && <div className="mh-card">
                  <div className="mh-card-label">Weekly Digest</div>
                  <div className="mh-digest-row">
                    <div className="mh-digest-info">
                      <h3>Home Intelligence Email</h3>
                      <p>Receive a weekly snapshot: equity, HELOC capacity, rate movement, and refi timing — sent to {user?.emailAddresses?.[0]?.emailAddress ?? 'your email'}.</p>
                    </div>
                    <label className="mh-toggle">
                      <input type="checkbox" checked={activeProperty?.digest_enabled ?? true} onChange={e => activeProperty && toggleDigest(activeProperty.id, e.target.checked)} />
                      <span className="mh-toggle-track" />
                    </label>
                  </div>
                </div>}
              </>
            )}
          </SignedIn>
        </div>
      </div>
    </>
  );
}

export default function MyHomePage() {
  return (
    <Suspense fallback={null}>
      <MyHomePageInner />
    </Suspense>
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
  .mh-chip-dim{opacity:0.3;pointer-events:none}
  .mh-chip-icon{font-size:.85rem}

  /* LOCKED PREVIEW */
  .mh-preview-wrap{position:relative;padding-bottom:24px}
  .mh-preview-ghost{opacity:0.18;pointer-events:none;user-select:none;filter:blur(2px)}
  .mh-preview-cta{text-align:center;padding:28px 24px 8px;color:#f0f0f0}

  /* PROPERTY SELECTOR */
  .mh-add-prop-btn{flex-shrink:0;padding:7px 14px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.25);border-radius:999px;color:#22c55e;font-size:.8rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:all .15s}
  .mh-add-prop-btn:hover{background:rgba(34,197,94,0.18)}
  .mh-prop-selector{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
  .mh-prop-pill{display:flex;align-items:center;border-radius:999px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);overflow:hidden;transition:border-color .15s}
  .mh-prop-pill-active{border-color:rgba(34,197,94,0.4);background:rgba(34,197,94,0.07)}
  .mh-prop-pill-inner{display:flex;align-items:center;gap:6px;padding:7px 14px;background:none;border:none;color:rgba(255,255,255,0.6);font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}
  .mh-prop-pill-active .mh-prop-pill-inner{color:#22c55e}
  .mh-prop-pill-addr{max-width:160px;overflow:hidden;text-overflow:ellipsis}
  .mh-prop-pill-star{font-size:.7rem;color:#eab308;margin-left:2px}
  .mh-prop-pill-actions{display:flex;gap:0;border-left:1px solid rgba(255,255,255,0.08)}
  .mh-prop-action-btn{padding:7px 10px;background:none;border:none;color:rgba(255,255,255,0.3);font-size:.85rem;cursor:pointer;transition:color .15s;font-family:inherit}
  .mh-prop-action-btn:hover{color:rgba(255,255,255,0.7)}
  .mh-prop-action-remove:hover{color:#f97066}
  .mh-add-form{margin-top:0}

  /* CHIP BODY */
  .mh-chip-body{padding:24px}
  .mh-chip-footer{display:flex;align-items:center;justify-content:space-between;padding:12px 24px;border-top:1px solid rgba(255,255,255,0.07)}
  .mh-refresh-btn{font-size:.8rem;color:rgba(255,255,255,0.4);background:none;border:none;cursor:pointer;padding:4px 8px;border-radius:6px}
  .mh-refresh-btn:hover{color:rgba(255,255,255,0.7);background:rgba(255,255,255,0.06)}

  /* LOAN EDITOR */
  .mh-loan-grid{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
  .mh-loan-field{display:flex;flex-direction:column;gap:.3rem}
  .mh-loan-label{font-size:.72rem;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:rgba(255,255,255,0.4)}
  .mh-est-notice{font-size:.78rem;color:rgba(255,255,255,0.4);background:rgba(234,179,8,0.06);border:1px solid rgba(234,179,8,0.15);border-radius:8px;padding:10px 12px;margin-bottom:14px;line-height:1.5}
  .mh-inline-btn{background:none;border:none;cursor:pointer;color:#eab308;font-size:.78rem;text-decoration:underline;padding:0}
  @media(max-width:600px){.mh-loan-grid{grid-template-columns:1fr}}

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
