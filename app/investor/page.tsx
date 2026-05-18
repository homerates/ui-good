'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppNav from '../components/AppNav';
import AddressAutocomplete from '../components/AddressAutocomplete';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PortfolioItem {
  id:          string;
  address:     string;
  avm:         number | null;
  beds:        number | null;
  baths:       number | null;
  sqft:        number | null;
  year_built:  number | null;
  dscr:        number | null;
  cap_rate:    number | null;
  gross_yield: number | null;
  cash_flow:   number | null;
  down_pct:    number | null;
  rate:        number | null;
  rent:        number | null;
  status:      'qualifying' | 'watch' | 'nogo' | 'pending';
  notes:       string | null;
  added_at:    string;
}

interface WatchlistItem {
  id:            string;
  address:       string;
  list_price:    number | null;
  beds:          number | null;
  property_type: string | null;
  notes:         string | null;
  added_at:      string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt$ = (n: number | null | undefined) =>
  n != null ? '$' + Math.round(n).toLocaleString() : '—';

const fmtPct = (n: number | null | undefined, digits = 1) =>
  n != null ? n.toFixed(digits) + '%' : '—';

function dscrColor(d: number | null): string {
  if (d == null)  return '#4a5a7a';
  if (d >= 1.25)  return '#00e87a';
  if (d >= 1.0)   return '#5edb94';
  if (d >= 0.75)  return '#ff8c42';
  return '#ff5f5f';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7)  return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const STATUS_CFG = {
  qualifying: { label: 'Qualifying', bg: 'rgba(0,232,122,0.1)',  color: '#00e87a', border: 'rgba(0,232,122,0.2)'  },
  watch:      { label: 'Watch',      bg: 'rgba(245,200,66,0.1)', color: '#f5c842', border: 'rgba(245,200,66,0.2)' },
  nogo:       { label: 'No-Go',      bg: 'rgba(255,95,95,0.1)',  color: '#ff5f5f', border: 'rgba(255,95,95,0.2)'  },
  pending:    { label: 'Pending',    bg: 'rgba(167,139,250,0.1)',color: '#a78bfa', border: 'rgba(167,139,250,0.2)'},
};

// ── Main component ────────────────────────────────────────────────────────────

export default function InvestorPortalPage() {
  const router = useRouter();

  const [tab,          setTab]          = useState<'portfolio' | 'watchlist'>('portfolio');
  const [portfolio,    setPortfolio]    = useState<PortfolioItem[]>([]);
  const [watchlist,    setWatchlist]    = useState<WatchlistItem[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [filterText,   setFilterText]   = useState('');
  const [sortBy,       setSortBy]       = useState<'date' | 'dscr' | 'avm' | 'cashflow'>('date');
  const [watchInput,   setWatchInput]   = useState('');
  const [addingWatch,  setAddingWatch]  = useState(false);
  const [removingId,   setRemovingId]   = useState<string | null>(null);
  const [savedMsg,     setSavedMsg]     = useState('');

  // ── Load data ───────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch('/api/investor/portfolio').then(r => r.json()),
      fetch('/api/investor/watchlist').then(r => r.json()),
    ]).then(([p, w]) => {
      if (p.ok)  setPortfolio(p.items ?? []);
      if (w.ok)  setWatchlist(w.items ?? []);
      if (!p.ok) setError(p.error ?? 'Could not load portfolio');
    }).catch(() => setError('Could not load data'))
      .finally(() => setLoading(false));
  }, []);

  // ── Portfolio summary ───────────────────────────────────────────────────────
  const totalAvm      = portfolio.reduce((s, i) => s + (i.avm ?? 0), 0);
  const avgDscr       = portfolio.length
    ? portfolio.filter(i => i.dscr != null).reduce((s, i) => s + (i.dscr ?? 0), 0) / Math.max(1, portfolio.filter(i => i.dscr != null).length)
    : null;
  const totalCashFlow = portfolio.reduce((s, i) => s + (i.cash_flow ?? 0), 0);
  const qualifyCount  = portfolio.filter(i => i.status === 'qualifying').length;
  const watchCount    = portfolio.filter(i => i.status === 'watch').length;

  // ── Filtered + sorted portfolio ─────────────────────────────────────────────
  const filteredPortfolio = portfolio
    .filter(i => !filterText || i.address.toLowerCase().includes(filterText.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'dscr')     return (b.dscr ?? 0) - (a.dscr ?? 0);
      if (sortBy === 'avm')      return (b.avm ?? 0) - (a.avm ?? 0);
      if (sortBy === 'cashflow') return (b.cash_flow ?? 0) - (a.cash_flow ?? 0);
      return new Date(b.added_at).getTime() - new Date(a.added_at).getTime();
    });

  const filteredWatchlist = watchlist.filter(i =>
    !filterText || i.address.toLowerCase().includes(filterText.toLowerCase())
  );

  // ── Actions ─────────────────────────────────────────────────────────────────
  const removePortfolio = async (id: string) => {
    setRemovingId(id);
    await fetch('/api/investor/portfolio', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setPortfolio(p => p.filter(i => i.id !== id));
    setRemovingId(null);
  };

  const removeWatchlist = async (id: string) => {
    setRemovingId(id);
    await fetch('/api/investor/watchlist', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setWatchlist(w => w.filter(i => i.id !== id));
    setRemovingId(null);
  };

  const addToWatchlist = async (addr: string) => {
    if (!addr.trim()) return;
    setAddingWatch(true);
    try {
      const res  = await fetch('/api/investor/watchlist', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ address: addr }),
      });
      const json = await res.json();
      if (json.ok) {
        setWatchlist(w => [json.item, ...w]);
        setWatchInput('');
        setSavedMsg('Added to watchlist');
        setTimeout(() => setSavedMsg(''), 2500);
      }
    } finally {
      setAddingWatch(false);
    }
  };

  const runReport = (addr: string) => {
    router.push(`/investor-intel?address=${encodeURIComponent(addr)}`);
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="page-standalone ip-root">
        <AppNav />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.07)', borderTopColor: '#00e87a', animation: 'ipSpin 0.9s linear infinite' }} />
          <style>{`@keyframes ipSpin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .ip-root { background:#07090f; color:#f0f4ff; font-family:var(--font-dm-sans,system-ui); }
        .ip-table { width:100%; border-collapse:collapse; background:#0d1420; border:1px solid rgba(255,255,255,0.07); border-radius:12px; overflow:hidden; }
        .ip-table thead th { font-size:10px; font-weight:800; color:#2a3a5a; text-transform:uppercase; letter-spacing:0.07em; padding:11px 14px; text-align:left; border-bottom:1px solid rgba(255,255,255,0.06); background:#0a0f1c; white-space:nowrap; }
        .ip-table thead th:not(:first-child) { text-align:right; }
        .ip-table tbody tr { border-bottom:1px solid rgba(255,255,255,0.04); cursor:pointer; transition:background 0.12s; }
        .ip-table tbody tr:last-child { border-bottom:none; }
        .ip-table tbody tr:hover { background:rgba(255,255,255,0.025); }
        .ip-table td { font-size:12px; padding:13px 14px; text-align:right; vertical-align:middle; }
        .ip-table td:first-child { text-align:left; }
        @media(max-width:700px){
          .ip-table thead th:nth-child(n+4){ display:none; }
          .ip-table td:nth-child(n+4)      { display:none; }
          .ip-sum-grid { grid-template-columns:1fr 1fr !important; }
        }
      `}</style>

      <div className="page-standalone ip-root">
        <AppNav />
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 16px 80px' }}>

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.12em', color: '#00e87a', textTransform: 'uppercase', marginBottom: 5 }}>Investor Portal</div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f0f4ff', lineHeight: 1.1, margin: 0 }}>My Investment Dashboard</h1>
              <p style={{ fontSize: '0.75rem', color: '#3a4a6a', marginTop: 4 }}>Track deals · analyze properties · monitor your portfolio</p>
            </div>
            <Link href="/investor-intel" style={{ textDecoration: 'none' }}>
              <button style={{ background: '#00e87a', color: '#07100f', fontSize: 12, fontWeight: 800, border: 'none', borderRadius: 9, padding: '10px 18px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Run Deal Report
              </button>
            </Link>
          </div>

          {error && (
            <div style={{ padding: '12px 16px', background: 'rgba(255,95,95,0.08)', border: '1px solid rgba(255,95,95,0.2)', borderRadius: 10, color: '#ff5f5f', fontSize: '0.8rem', marginBottom: 20 }}>
              ⚠ {error}
            </div>
          )}

          {/* ── Summary cards ──────────────────────────────────────────── */}
          <div className="ip-sum-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 24 }}>
            {[
              { label: 'Properties', val: portfolio.length, fmt: (v: number) => String(v), color: '#c9d4e8', note: `${qualifyCount} qualifying · ${watchCount} watch` },
              { label: 'Combined AVM', val: totalAvm || null, fmt: fmt$, color: '#c9d4e8', note: 'Est. portfolio value' },
              { label: 'Avg DSCR', val: avgDscr, fmt: (v: number) => v.toFixed(2) + 'x', color: avgDscr != null ? dscrColor(avgDscr) : '#4a5a7a', note: 'Portfolio average' },
              { label: 'Monthly Cash Flow', val: portfolio.length ? totalCashFlow : null, fmt: (v: number) => (v >= 0 ? '+' : '') + fmt$(v), color: totalCashFlow >= 0 ? '#00e87a' : '#ff5f5f', note: 'Net across all deals' },
            ].map(({ label, val, fmt: fmtFn, color, note }) => (
              <div key={label} style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#3a4a6a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color, lineHeight: 1 }}>
                  {val != null ? fmtFn(val as number) : '—'}
                </div>
                <div style={{ fontSize: '0.6rem', color: '#3a4a6a', marginTop: 4 }}>{note}</div>
              </div>
            ))}
          </div>

          {/* ── Tabs ───────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 20 }}>
            {([['portfolio', 'Portfolio', portfolio.length], ['watchlist', 'Watchlist', watchlist.length]] as const).map(([t, label, count]) => (
              <button key={t} onClick={() => setTab(t)}
                style={{ fontSize: 13, fontWeight: 700, color: tab === t ? '#00e87a' : '#4a5a7a', padding: '10px 20px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === t ? '#00e87a' : 'transparent'}`, marginBottom: -1, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s' }}>
                {label}
                <span style={{ fontSize: 9, fontWeight: 800, background: tab === t ? 'rgba(0,232,122,0.12)' : 'rgba(255,255,255,0.05)', color: tab === t ? '#00e87a' : '#4a5a7a', borderRadius: 99, padding: '1px 6px' }}>{count}</span>
              </button>
            ))}
          </div>

          {/* ── PORTFOLIO TAB ───────────────────────────────────────────── */}
          {tab === 'portfolio' && (
            <>
              {/* Filter + sort */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  value={filterText}
                  onChange={e => setFilterText(e.target.value)}
                  placeholder="Filter by address or city…"
                  style={{ flex: 1, minWidth: 180, background: '#0d1420', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: '#f0f4ff', outline: 'none', fontFamily: 'inherit' }}
                />
                <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
                  style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#6a7a9a', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                  <option value="date">Sort: Date added</option>
                  <option value="dscr">Sort: DSCR ↓</option>
                  <option value="avm">Sort: AVM ↓</option>
                  <option value="cashflow">Sort: Cash flow ↓</option>
                </select>
              </div>

              {/* Empty state */}
              {filteredPortfolio.length === 0 && (
                <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '2.2rem', marginBottom: 14 }}>📊</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#c9d4e8', marginBottom: 8 }}>No deals saved yet</div>
                  <div style={{ fontSize: '0.8rem', color: '#3a4a6a', lineHeight: 1.6, maxWidth: 300, margin: '0 auto 20px' }}>
                    Run a deal report on any investment property and save it to track here.
                  </div>
                  <Link href="/investor-intel" style={{ textDecoration: 'none' }}>
                    <button style={{ background: '#00e87a', color: '#07100f', fontSize: 12, fontWeight: 800, border: 'none', borderRadius: 9, padding: '10px 20px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Run Your First Report →
                    </button>
                  </Link>
                </div>
              )}

              {/* Table */}
              {filteredPortfolio.length > 0 && (
                <table className="ip-table">
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th>AVM</th>
                      <th>DSCR</th>
                      <th>Cap Rate</th>
                      <th>Cash Flow</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPortfolio.map(item => {
                      const sc = STATUS_CFG[item.status] ?? STATUS_CFG.pending;
                      return (
                        <tr key={item.id} onClick={() => runReport(item.address)}>
                          <td>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#f0f4ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{item.address.split(',').slice(0, 2).join(',')}</div>
                            <div style={{ fontSize: 10, color: '#3a4a6a', marginTop: 2 }}>
                              {[item.beds && `${item.beds}bd`, item.baths && `${item.baths}ba`, item.sqft && `${Number(item.sqft).toLocaleString()} sqft`].filter(Boolean).join(' · ')}
                              {' · '}{timeAgo(item.added_at)}
                            </div>
                          </td>
                          <td style={{ fontWeight: 700, color: '#c9d4e8' }}>{fmt$(item.avm)}</td>
                          <td>
                            <span style={{ fontWeight: 800, color: dscrColor(item.dscr) }}>
                              {item.dscr != null ? item.dscr.toFixed(2) + 'x' : '—'}
                            </span>
                          </td>
                          <td style={{ fontWeight: 700, color: '#c9d4e8' }}>{fmtPct(item.cap_rate)}</td>
                          <td style={{ fontWeight: 700, color: item.cash_flow != null ? (item.cash_flow >= 0 ? '#00e87a' : '#ff5f5f') : '#4a5a7a' }}>
                            {item.cash_flow != null ? (item.cash_flow >= 0 ? '+' : '') + fmt$(item.cash_flow) + '/mo' : '—'}
                          </td>
                          <td>
                            <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 99, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, whiteSpace: 'nowrap' }}>
                              {sc.label}
                            </span>
                          </td>
                          <td onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button onClick={() => runReport(item.address)}
                                style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', background: 'transparent', color: '#00e87a', border: '1px solid rgba(0,232,122,0.25)', fontFamily: 'inherit' }}>
                                Report
                              </button>
                              <button onClick={() => removePortfolio(item.id)} disabled={removingId === item.id}
                                style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '5px 8px', cursor: 'pointer', background: 'transparent', color: '#3a4a6a', border: '1px solid rgba(255,255,255,0.07)', fontFamily: 'inherit', opacity: removingId === item.id ? 0.5 : 1 }}>
                                ✕
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* ── WATCHLIST TAB ───────────────────────────────────────────── */}
          {tab === 'watchlist' && (
            <>
              {/* Add to watchlist */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <AddressAutocomplete
                  value={watchInput}
                  onChange={setWatchInput}
                  onSelect={addr => addToWatchlist(addr)}
                  placeholder="Paste or type an address to watch…"
                  style={{ flex: 1, background: '#0d1420', border: '1.5px solid rgba(0,232,122,0.2)', borderRadius: 9, padding: '10px 16px', fontSize: 13, color: '#f0f4ff', outline: 'none', fontFamily: 'inherit' }}
                  onKeyDown={e => { if (e.key === 'Enter') addToWatchlist(watchInput); }}
                />
                <button onClick={() => addToWatchlist(watchInput)} disabled={addingWatch || !watchInput.trim()}
                  style={{ background: 'rgba(0,232,122,0.1)', color: '#00e87a', fontSize: 12, fontWeight: 800, border: '1px solid rgba(0,232,122,0.2)', borderRadius: 9, padding: '10px 18px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: addingWatch ? 0.6 : 1 }}>
                  {addingWatch ? '…' : '+ Add'}
                </button>
              </div>

              {savedMsg && (
                <div style={{ fontSize: 12, color: '#00e87a', marginBottom: 12 }}>✓ {savedMsg}</div>
              )}

              {/* Empty state */}
              {filteredWatchlist.length === 0 && (
                <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '2.2rem', marginBottom: 14 }}>👁</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#c9d4e8', marginBottom: 8 }}>Watchlist is empty</div>
                  <div style={{ fontSize: '0.8rem', color: '#3a4a6a', lineHeight: 1.6, maxWidth: 300, margin: '0 auto' }}>
                    Add addresses you want to track before running a full deal report.
                  </div>
                </div>
              )}

              {/* Watchlist cards */}
              {filteredWatchlist.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {filteredWatchlist.map(item => (
                    <div key={item.id} style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 11, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', transition: 'border-color 0.12s', cursor: 'pointer' }}
                      onClick={() => runReport(item.address)}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(0,232,122,0.2)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#f0f4ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.address}</div>
                        <div style={{ fontSize: 10, color: '#3a4a6a', marginTop: 2 }}>Added {timeAgo(item.added_at)} · No report yet</div>
                      </div>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexShrink: 0 }}>
                        {item.list_price && <span style={{ fontSize: 11, color: '#6a7a9a' }}>Listed <strong style={{ color: '#c9d4e8' }}>{fmt$(item.list_price)}</strong></span>}
                        {item.beds && <span style={{ fontSize: 11, color: '#6a7a9a' }}><strong style={{ color: '#c9d4e8' }}>{item.beds}bd</strong></span>}
                        {item.property_type && <span style={{ fontSize: 11, color: '#6a7a9a' }}>{item.property_type}</span>}
                      </div>
                      {item.notes && (
                        <div style={{ fontSize: 11, color: '#3a4a6a', fontStyle: 'italic', flexBasis: '100%', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.04)' }}>"{item.notes}"</div>
                      )}
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => runReport(item.address)}
                          style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', background: 'transparent', color: '#00e87a', border: '1px solid rgba(0,232,122,0.25)', fontFamily: 'inherit' }}>
                          Run Report
                        </button>
                        <button onClick={() => removeWatchlist(item.id)} disabled={removingId === item.id}
                          style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '5px 8px', cursor: 'pointer', background: 'transparent', color: '#3a4a6a', border: '1px solid rgba(255,255,255,0.07)', fontFamily: 'inherit', opacity: removingId === item.id ? 0.5 : 1 }}>
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </>
  );
}
