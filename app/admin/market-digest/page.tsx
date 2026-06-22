'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Stats {
  subscriber_count: number;
  last_send: { sent_at: string; subject: string; recipient_count: number } | null;
  current_rate_30y: number | null;
}

export default function MarketDigestAdmin() {
  const [stats, setStats]       = useState<Stats | null>(null);
  const [loading, setLoading]   = useState(true);
  const [sending, setSending]   = useState(false);
  const [dryRun, setDryRun]     = useState(false);
  const [result, setResult]     = useState<any>(null);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/market-rates-digest')
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function send() {
    setSending(true);
    setResult(null);
    setError(null);
    try {
      const r = await fetch('/api/market-rates-digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? 'Send failed'); }
      else setResult(d);
    } catch (e: any) {
      setError(e.message);
    }
    setSending(false);
    // Refresh stats
    fetch('/api/market-rates-digest').then(r => r.json()).then(d => setStats(d)).catch(() => {});
  }

  const bg = { background: '#080c12', minHeight: '100vh', color: '#f0f4ff', fontFamily: "'DM Sans', sans-serif", padding: '32px 24px' };
  const card = { background: '#0e1420', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '1.75rem', marginBottom: 24 };
  const label = { fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#8fa3b8', marginBottom: 4 };
  const val = { fontSize: '1.6rem', fontWeight: 800, color: '#f0f4ff', margin: 0 };

  return (
    <div style={bg}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
          <Link href="/admin" style={{ color: '#3d8bff', textDecoration: 'none', fontSize: '0.875rem' }}>← Admin</Link>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>Daily Rate Brief</h1>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#8fa3b8', marginTop: 4 }}>
              Sends a live mortgage rate snapshot + Grok commentary to all newsletter subscribers. Cron: Mon–Fri 8am ET.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div style={{ ...card, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
          <div>
            <div style={label}>Subscribers</div>
            <p style={val}>{loading ? '—' : (stats?.subscriber_count ?? 0).toLocaleString()}</p>
          </div>
          <div>
            <div style={label}>Current 30-Yr</div>
            <p style={{ ...val, color: '#00e87a' }}>{stats?.current_rate_30y != null ? stats.current_rate_30y.toFixed(2) + '%' : '—'}</p>
          </div>
          <div>
            <div style={label}>Last Sent</div>
            <p style={{ ...val, fontSize: '0.9rem', lineHeight: 1.4, marginTop: 2 }}>
              {stats?.last_send
                ? new Date(stats.last_send.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                : 'Never'}
            </p>
            {stats?.last_send && (
              <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#8fa3b8' }}>
                {stats.last_send.recipient_count} sent
              </p>
            )}
          </div>
        </div>

        {/* Last send subject */}
        {stats?.last_send && (
          <div style={{ ...card, paddingTop: '1rem', paddingBottom: '1rem' }}>
            <div style={label}>Last Subject Line</div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#c8d8ea', fontFamily: 'monospace' }}>{stats.last_send.subject}</p>
          </div>
        )}

        {/* Send controls */}
        <div style={card}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#3d8bff', marginBottom: 12 }}>
            Manual Send
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, cursor: 'pointer', fontSize: '0.85rem', color: '#8fa3b8' }}>
            <input
              type="checkbox"
              checked={dryRun}
              onChange={e => setDryRun(e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            Dry run — preview subject + rates without sending any emails
          </label>

          <button
            onClick={send}
            disabled={sending}
            style={{
              padding: '12px 28px', borderRadius: 10,
              background: dryRun ? 'rgba(61,139,255,0.12)' : 'rgba(0,232,122,0.12)',
              border: `1px solid ${dryRun ? 'rgba(61,139,255,0.35)' : 'rgba(0,232,122,0.35)'}`,
              color: dryRun ? '#3d8bff' : '#00e87a',
              fontWeight: 700, fontSize: '0.9rem',
              cursor: sending ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              opacity: sending ? 0.6 : 1,
            }}
          >
            {sending ? 'Generating + sending…' : dryRun ? 'Preview rate brief' : 'Send rate brief now →'}
          </button>
        </div>

        {/* Result */}
        {error && (
          <div style={{ ...card, borderColor: 'rgba(255,95,95,0.3)', background: 'rgba(255,95,95,0.06)' }}>
            <p style={{ margin: 0, color: '#ff5f5f', fontSize: '0.85rem' }}>✗ {error}</p>
          </div>
        )}

        {result && (
          <div style={{ ...card, borderColor: 'rgba(0,232,122,0.2)' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#00e87a', marginBottom: 12 }}>
              {result.dryRun ? 'Preview' : 'Send Complete'}
            </div>
            <p style={{ margin: '0 0 8px', fontSize: '0.85rem', color: '#c8d8ea', fontFamily: 'monospace' }}>{result.subject}</p>
            {result.dryRun ? (
              <div style={{ fontSize: '0.8rem', color: '#8fa3b8', display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                <span>30-yr: {result.rates?.rate30y?.toFixed(2)}% | 15-yr: {result.rates?.rate15y?.toFixed(2)}% | 10-yr: {result.rates?.rate10y?.toFixed(2)}% | Fed: {result.rates?.fedFunds?.toFixed(2)}%</span>
                {result.commentary && <span style={{ color: '#c8d8ea', marginTop: 6, fontStyle: 'italic' }}>"{result.commentary}"</span>}
                <span style={{ marginTop: 6 }}>Would send to {stats?.subscriber_count ?? '—'} subscribers</span>
              </div>
            ) : (
              <div style={{ fontSize: '0.8rem', color: '#8fa3b8', display: 'flex', gap: 16 }}>
                <span style={{ color: '#00e87a' }}>✓ {result.sent} sent</span>
                {result.skipped > 0 && <span>↩ {result.skipped} skipped</span>}
                {result.errors > 0 && <span style={{ color: '#ff5f5f' }}>✗ {result.errors} errors</span>}
              </div>
            )}
          </div>
        )}

        {/* Schedule info */}
        <div style={{ ...card, background: 'rgba(61,139,255,0.04)', borderColor: 'rgba(61,139,255,0.15)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#3d8bff', marginBottom: 8 }}>
            Cron Schedule
          </div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#8fa3b8', lineHeight: 1.6 }}>
            Auto-sends <strong style={{ color: '#c8d8ea' }}>Monday – Friday at 8am ET</strong> (13:00 UTC).<br />
            Use "Send now" above to trigger outside the schedule. Dry run first to preview the subject line and commentary before sending live.
          </p>
          <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: '#8fa3b8' }}>
            Links recipients to:{' '}
            <a href="https://chat.homerates.ai/market-intelligence" target="_blank" style={{ color: '#3d8bff', textDecoration: 'none' }}>
              chat.homerates.ai/market-intelligence →
            </a>
          </p>
        </div>

      </div>
    </div>
  );
}
