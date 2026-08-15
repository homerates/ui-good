'use client';

import { useEffect, useState, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AerialEntry {
  address_raw:   string;
  state:         string;
  video_id:      string | null;
  http_status:   number | null;
  error_detail:  string | null;
  created_at:    string;
  checked_at:    string;
}

interface Stats {
  total:                   number;
  active:                  number;
  processing:              number;
  errored:                 number;
  activeRate:              number | null;
  oldestProcessingMinutes: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATE_COLORS: Record<string, string> = {
  ACTIVE:      '#00e87a',
  PROCESSING:  '#f0a202',
  ERROR:       '#ff5f5f',
  UNAVAILABLE: '#8b949e',
};

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function ageMinutes(iso: string) {
  return Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
}

function fmtAge(mins: number) {
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}

function StateChip({ state }: { state: string }) {
  const color = STATE_COLORS[state] ?? '#8b949e';
  return (
    <span style={{
      background: color + '22', color, border: `1px solid ${color}44`,
      borderRadius: 4, fontSize: 10, fontWeight: 700,
      padding: '2px 7px', letterSpacing: '0.05em',
    }}>{state}</span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AerialViewStatusPage() {
  const [entries, setEntries] = useState<AerialEntry[]>([]);
  const [stats, setStats]     = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<string>('all');

  const [checkAddr, setCheckAddr]   = useState('');
  const [checking, setChecking]     = useState(false);
  const [checkResult, setCheckResult] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/admin/aerial-view-status');
    if (r.ok) {
      const d = await r.json();
      setEntries(d.entries ?? []);
      setStats(d.stats ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runCheck() {
    if (!checkAddr.trim()) return;
    setChecking(true);
    setCheckResult('');
    try {
      const r = await fetch(`/api/property/aerial-view?address=${encodeURIComponent(checkAddr.trim())}`);
      const d = await r.json();
      setCheckResult(d.status === 'ready' ? '✅ ready — video available' : d.status === 'processing' ? '⏳ processing — not ready yet' : '❌ unavailable');
      await load();
    } catch {
      setCheckResult('❌ request failed');
    }
    setChecking(false);
  }

  const filtered = filter === 'all' ? entries : entries.filter(e => e.state === filter);

  const btnStyle = (color = '#00e87a'): React.CSSProperties => ({
    background: color, color: color === '#00e87a' ? '#07100f' : '#fff',
    border: 'none', borderRadius: 8, padding: '7px 16px',
    fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  });
  const cardStyle: React.CSSProperties = {
    background: '#161b22', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12, padding: 16,
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#0d1117', color: '#e6edf3',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      padding: '32px 24px',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 700, color: '#00e87a', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Admin</p>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Aerial View Status</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8b949e' }}>
              Google Aerial View integration — hit rate and stability data, for evaluating whether this is worth continuing to invest in.
            </p>
          </div>
          <button onClick={() => load()} style={{ ...btnStyle('#161b22'), border: '1px solid rgba(255,255,255,0.12)', color: '#e6edf3' }}>
            ↻ Refresh
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
            <div style={cardStyle}>
              <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Checked</div>
              <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{stats.total}</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active (working)</div>
              <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4, color: '#00e87a' }}>
                {stats.active} {stats.activeRate != null && <span style={{ fontSize: 14, color: '#8b949e' }}>({stats.activeRate}%)</span>}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Still Processing</div>
              <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4, color: '#f0a202' }}>{stats.processing}</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Errored</div>
              <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4, color: '#ff5f5f' }}>{stats.errored}</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Oldest Still Pending</div>
              <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>
                {stats.oldestProcessingMinutes != null ? fmtAge(stats.oldestProcessingMinutes) : '—'}
              </div>
            </div>
          </div>
        )}

        {/* Check an address */}
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700 }}>Check a specific address</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={checkAddr}
              onChange={e => setCheckAddr(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') runCheck(); }}
              placeholder="123 Main St, City, ST 00000"
              style={{
                flex: '1 1 300px', background: '#0d1117', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 6, color: '#e6edf3', fontSize: 13, padding: '8px 10px',
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
            <button onClick={runCheck} disabled={checking} style={btnStyle()}>
              {checking ? 'Checking…' : 'Check'}
            </button>
          </div>
          {checkResult && <p style={{ margin: '10px 0 0', fontSize: 13 }}>{checkResult}</p>}
        </div>

        {/* Filter */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {['all', 'ACTIVE', 'PROCESSING', 'ERROR'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                ...btnStyle(filter === f ? '#00e87a' : '#161b22'),
                color: filter === f ? '#07100f' : '#8b949e',
                border: filter === f ? 'none' : '1px solid rgba(255,255,255,0.12)',
                fontSize: 12, padding: '5px 12px',
              }}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>

        {/* Table */}
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {['Address', 'State', 'Age', 'First Checked', 'Last Checked', 'Video ID', 'Error'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 12px', color: '#8b949e', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#8b949e' }}>Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#8b949e' }}>No entries</td></tr>
                ) : filtered.map((e, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '10px 12px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.address_raw}</td>
                    <td style={{ padding: '10px 12px' }}><StateChip state={e.state} /></td>
                    <td style={{ padding: '10px 12px', color: '#8b949e' }}>{fmtAge(ageMinutes(e.created_at))}</td>
                    <td style={{ padding: '10px 12px', color: '#8b949e' }}>{fmt(e.created_at)}</td>
                    <td style={{ padding: '10px 12px', color: '#8b949e' }}>{fmt(e.checked_at)}</td>
                    <td style={{ padding: '10px 12px', color: '#8b949e', fontFamily: 'monospace', fontSize: 11 }}>{e.video_id ? e.video_id.slice(0, 10) + '…' : '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#ff5f5f', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.error_detail ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
