'use client';

import { useEffect, useState, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DriftSignals {
  has_price:        boolean;
  has_down:         boolean;
  has_mortgage_ctx: boolean;
  has_location:     boolean;
  location?:        string;
  price_value?:     number;
}

interface DriftEntry {
  id:             string;
  created_at:     string;
  seed_prompt:    string;
  landed_on:      string;
  expected_card:  string | null;
  suggested_card: string | null;
  signals:        DriftSignals | null;
  diagnosis:      string | null;
  fix_applied:    string | null;
  fix_worked:     boolean | null;
  status:         'open' | 'diagnosed' | 'fixed' | 'wont_fix';
  source:         'auto' | 'manual';
  user_id:        string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  open:       '#f0a202',
  diagnosed:  '#58a6ff',
  fixed:      '#00e87a',
  wont_fix:   '#8b949e',
};

const STATUS_LABELS: Record<string, string> = {
  open:      'Open',
  diagnosed: 'Diagnosed',
  fixed:     'Fixed',
  wont_fix:  "Won't Fix",
};

const CARD_OPTIONS = [
  'conventional', 'jumbo', 'conventional_or_jumbo', 'fha', 'va', 'dscr',
  'refi', 'affordability', 'buydown', 'seller_credit', 'other',
];

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function fmtPrice(v?: number) {
  if (!v) return null;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

function SignalChips({ signals }: { signals: DriftSignals | null }) {
  if (!signals) return null;
  const chips: { label: string; color: string }[] = [];
  if (signals.price_value) chips.push({ label: fmtPrice(signals.price_value)!, color: '#00e87a' });
  if (signals.has_down)    chips.push({ label: 'DOWN%', color: '#58a6ff' });
  if (signals.has_location && signals.location) chips.push({ label: signals.location.toUpperCase().slice(0, 10), color: '#f0a202' });
  else if (signals.has_location) chips.push({ label: 'LOCATION', color: '#f0a202' });
  if (signals.has_mortgage_ctx && !signals.has_price) chips.push({ label: 'MTG CTX', color: '#8b949e' });
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {chips.map(c => (
        <span key={c.label} style={{
          background: c.color + '22', color: c.color,
          border: `1px solid ${c.color}44`,
          borderRadius: 4, fontSize: 10, fontWeight: 700,
          padding: '1px 6px', letterSpacing: '0.05em',
        }}>{c.label}</span>
      ))}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DriftLogPage() {
  const [entries, setEntries]         = useState<DriftEntry[]>([]);
  const [filter, setFilter]           = useState<string>('all');
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState<DriftEntry | null>(null);
  const [editState, setEditState]     = useState<Partial<DriftEntry>>({});
  const [saving, setSaving]           = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [newForm, setNewForm]         = useState({ seed_prompt: '', landed_on: 'grok', expected_card: '', diagnosis: '' });
  const [submitting, setSubmitting]   = useState(false);
  const [saveMsg, setSaveMsg]         = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const url = filter === 'all'
      ? '/api/admin/drift-log'
      : `/api/admin/drift-log?status=${filter}`;
    const r = await fetch(url);
    if (r.ok) {
      const d = await r.json();
      setEntries(d.entries ?? []);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const counts = entries.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  function selectRow(e: DriftEntry) {
    if (selected?.id === e.id) {
      setSelected(null);
      setEditState({});
    } else {
      setSelected(e);
      setEditState({
        expected_card: e.expected_card ?? '',
        diagnosis:     e.diagnosis ?? '',
        fix_applied:   e.fix_applied ?? '',
        fix_worked:    e.fix_worked ?? null,
        status:        e.status,
      });
      setSaveMsg('');
    }
  }

  async function saveEdit() {
    if (!selected) return;
    setSaving(true);
    setSaveMsg('');
    const r = await fetch('/api/admin/drift-log', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selected.id, ...editState }),
    });
    if (r.ok) {
      setSaveMsg('Saved');
      await load();
      // Update selected to reflect saved state
      setSelected(prev => prev ? { ...prev, ...(editState as any) } : null);
    } else {
      const d = await r.json();
      setSaveMsg('Error: ' + (d.error ?? 'unknown'));
    }
    setSaving(false);
  }

  async function submitNew() {
    if (!newForm.seed_prompt.trim()) return;
    setSubmitting(true);
    const r = await fetch('/api/admin/drift-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newForm),
    });
    if (r.ok) {
      setNewForm({ seed_prompt: '', landed_on: 'grok', expected_card: '', diagnosis: '' });
      setShowNew(false);
      await load();
    }
    setSubmitting(false);
  }

  const filtered = filter === 'all' ? entries : entries.filter(e => e.status === filter);

  // ─── Styles ────────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#0d1117', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 6, color: '#e6edf3', fontSize: 13, padding: '8px 10px',
    fontFamily: 'inherit', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 700, color: '#8b949e',
    letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4,
  };
  const btnStyle = (color = '#00e87a'): React.CSSProperties => ({
    background: color, color: color === '#00e87a' ? '#07100f' : '#fff',
    border: 'none', borderRadius: 8, padding: '7px 16px',
    fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  });

  return (
    <div style={{
      minHeight: '100vh', background: '#0d1117', color: '#e6edf3',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      padding: '32px 24px',
    }}>
      {/* Header */}
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 700, color: '#00e87a', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Admin</p>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Routing Drift Log</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8b949e' }}>
              Prompts that fell through to Grok when they should have hit a calculator card.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => load()} style={{ ...btnStyle('#161b22'), border: '1px solid rgba(255,255,255,0.12)', color: '#e6edf3' }}>
              ↻ Refresh
            </button>
            <button onClick={() => setShowNew(!showNew)} style={btnStyle()}>
              + Log Drift
            </button>
          </div>
        </div>

        {/* Manual Entry Form */}
        {showNew && (
          <div style={{
            background: '#161b22', border: '1px solid rgba(0,232,122,0.2)',
            borderRadius: 12, padding: 20, marginBottom: 20,
          }}>
            <p style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700 }}>Manual Drift Entry</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 200px', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Seed Prompt *</label>
                <input style={inputStyle} placeholder="e.g. 850k home in Los Angeles 10% down"
                  value={newForm.seed_prompt} onChange={e => setNewForm(p => ({ ...p, seed_prompt: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Landed On</label>
                <input style={inputStyle} placeholder="grok" value={newForm.landed_on}
                  onChange={e => setNewForm(p => ({ ...p, landed_on: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Expected Card</label>
                <select style={inputStyle} value={newForm.expected_card}
                  onChange={e => setNewForm(p => ({ ...p, expected_card: e.target.value }))}>
                  <option value="">— select —</option>
                  {CARD_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Diagnosis (optional)</label>
              <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                placeholder="Root cause if already known..."
                value={newForm.diagnosis} onChange={e => setNewForm(p => ({ ...p, diagnosis: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={submitNew} disabled={submitting || !newForm.seed_prompt.trim()} style={btnStyle()}>
                {submitting ? 'Saving…' : 'Save Entry'}
              </button>
              <button onClick={() => setShowNew(false)} style={{ ...btnStyle('#161b22'), border: '1px solid rgba(255,255,255,0.12)', color: '#8b949e' }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Status Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {(['all', 'open', 'diagnosed', 'fixed', 'wont_fix'] as const).map(s => {
            const count = s === 'all' ? entries.length : (counts[s] ?? 0);
            const active = filter === s;
            const color  = s === 'all' ? '#e6edf3' : (STATUS_COLORS[s] ?? '#e6edf3');
            return (
              <button key={s} onClick={() => setFilter(s)} style={{
                background: active ? color + '22' : 'transparent',
                border: `1px solid ${active ? color : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
                color: active ? color : '#8b949e', fontSize: 13, fontWeight: 600,
                fontFamily: 'inherit',
              }}>
                {s === 'all' ? 'All' : STATUS_LABELS[s]} <span style={{ opacity: 0.6 }}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Table */}
        {loading ? (
          <p style={{ color: '#8b949e', textAlign: 'center', padding: 40 }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#8b949e' }}>
            <p style={{ fontSize: 32, margin: '0 0 8px' }}>✓</p>
            <p style={{ margin: 0 }}>No drift entries{filter !== 'all' ? ` with status "${filter}"` : ''}.</p>
          </div>
        ) : (
          <div style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }}>
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr 120px 140px 100px 90px',
              padding: '10px 16px',
              background: '#161b22',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              fontSize: 11, fontWeight: 700, color: '#8b949e', letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}>
              <span>Time</span>
              <span>Prompt</span>
              <span>Landed On</span>
              <span>Signals</span>
              <span>Suggested</span>
              <span>Status</span>
            </div>

            {/* Rows */}
            {filtered.map(entry => {
              const isOpen = selected?.id === entry.id;
              const sc = STATUS_COLORS[entry.status] ?? '#8b949e';
              return (
                <div key={entry.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  {/* Main row */}
                  <div
                    onClick={() => selectRow(entry)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '120px 1fr 120px 140px 100px 90px',
                      padding: '12px 16px', cursor: 'pointer', alignItems: 'center',
                      background: isOpen ? '#161b22' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = '#161b22'; }}
                    onMouseLeave={e => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <span style={{ fontSize: 11, color: '#8b949e' }}>{fmt(entry.created_at)}</span>
                    <span style={{ fontSize: 13, color: '#e6edf3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>
                      {entry.source === 'manual' && <span style={{ fontSize: 10, color: '#f0a202', marginRight: 6 }}>MANUAL</span>}
                      {entry.seed_prompt}
                    </span>
                    <span style={{
                      fontSize: 12, color: entry.landed_on === 'grok' ? '#f85149' : '#f0a202',
                      fontWeight: 600,
                    }}>{entry.landed_on}</span>
                    <span><SignalChips signals={entry.signals} /></span>
                    <span style={{ fontSize: 12, color: entry.suggested_card ? '#00e87a' : '#484f58' }}>
                      {entry.suggested_card ?? '—'}
                    </span>
                    <span>
                      <span style={{
                        background: sc + '22', color: sc,
                        border: `1px solid ${sc}44`,
                        borderRadius: 6, fontSize: 11, fontWeight: 700,
                        padding: '2px 8px',
                      }}>{STATUS_LABELS[entry.status]}</span>
                    </span>
                  </div>

                  {/* Expanded edit panel */}
                  {isOpen && (
                    <div style={{
                      background: '#0d1117', borderTop: '1px solid rgba(255,255,255,0.07)',
                      padding: '20px 24px',
                    }}>
                      {/* Full prompt */}
                      <div style={{ marginBottom: 16 }}>
                        <label style={labelStyle}>Full Prompt</label>
                        <div style={{
                          background: '#161b22', border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 6, padding: '10px 12px', fontSize: 13, color: '#e6edf3',
                          fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        }}>{entry.seed_prompt}</div>
                      </div>

                      {/* Signals detail */}
                      {entry.signals && (
                        <div style={{ marginBottom: 16 }}>
                          <label style={labelStyle}>Detected Signals</label>
                          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            {Object.entries(entry.signals).map(([k, v]) => (
                              <span key={k} style={{ fontSize: 12, color: '#8b949e' }}>
                                <span style={{ color: '#484f58' }}>{k}:</span>{' '}
                                <span style={{ color: v ? '#00e87a' : '#8b949e' }}>
                                  {typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v ?? '—')}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Edit grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 120px', gap: 12, marginBottom: 14 }}>
                        <div>
                          <label style={labelStyle}>Expected Card</label>
                          <select style={inputStyle} value={(editState.expected_card as string) ?? ''}
                            onChange={e => setEditState(p => ({ ...p, expected_card: e.target.value || null }))}>
                            <option value="">— select —</option>
                            {CARD_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Status</label>
                          <select style={inputStyle} value={(editState.status as string) ?? 'open'}
                            onChange={e => setEditState(p => ({ ...p, status: e.target.value as DriftEntry['status'] }))}>
                            <option value="open">Open</option>
                            <option value="diagnosed">Diagnosed</option>
                            <option value="fixed">Fixed</option>
                            <option value="wont_fix">Won&apos;t Fix</option>
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Fix Worked?</label>
                          <select style={inputStyle}
                            value={editState.fix_worked === null || editState.fix_worked === undefined ? '' : String(editState.fix_worked)}
                            onChange={e => setEditState(p => ({
                              ...p,
                              fix_worked: e.target.value === '' ? null : e.target.value === 'true',
                            }))}>
                            <option value="">— untested —</option>
                            <option value="true">Yes ✓</option>
                            <option value="false">No ✗</option>
                          </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                          <button onClick={saveEdit} disabled={saving} style={{ ...btnStyle(), width: '100%' }}>
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>

                      <div style={{ marginBottom: 12 }}>
                        <label style={labelStyle}>Diagnosis — root cause</label>
                        <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
                          placeholder="e.g. hasPrice regex requires $ prefix — '850k' not matched because no dollar sign"
                          value={(editState.diagnosis as string) ?? ''}
                          onChange={e => setEditState(p => ({ ...p, diagnosis: e.target.value }))} />
                      </div>

                      <div style={{ marginBottom: 12 }}>
                        <label style={labelStyle}>Fix Applied</label>
                        <textarea style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }}
                          placeholder="e.g. Updated hasPrice regex in calcDispatcher.ts to match '850k' without $ prefix"
                          value={(editState.fix_applied as string) ?? ''}
                          onChange={e => setEditState(p => ({ ...p, fix_applied: e.target.value }))} />
                      </div>

                      {saveMsg && (
                        <p style={{ margin: '8px 0 0', fontSize: 12, color: saveMsg === 'Saved' ? '#00e87a' : '#f85149' }}>
                          {saveMsg}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
