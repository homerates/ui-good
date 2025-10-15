'use client';
import { useState } from 'react';

type ApiResponse = {
  path: 'concept' | 'market' | 'dynamic' | 'error';
  usedFRED: boolean;
  tldr?: string[];
  lockBias?: 'Mild Lock' | 'Neutral' | 'Float Watch';
  answer?: string;
  borrowerSummary?: string | null;
  fred?: { tenYearYield: number | null; mort30Avg: number | null; spread: number | null; asOf?: string | null };
  paymentDelta?: { perQuarterPt: number; loanAmount: number };
  watchNext?: string[];
  confidence?: 'low' | 'med' | 'high';
  ok?: boolean;
  expects?: string;
  __raw?: string;
  status?: number;
};

async function safeJson(r: Response): Promise<ApiResponse> {
  const txt = await r.text();
  try {
    return JSON.parse(txt) as ApiResponse;
  } catch {
    return { path: 'error', usedFRED: false, answer: txt, status: r.status };
  }
}

function renderBulletsFromText(text?: string) {
  if (!text) return null;
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  const items = lines.map((l) => l.replace(/^[-•]\s*/, '')).filter(Boolean);
  return <ul style={{ marginTop: 0 }}>{items.map((it, i) => <li key={i}>{it}</li>)}</ul>;
}

function renderAnswer(text?: string) {
  if (!text) return <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>(no answer)</pre>;
  const lines = text.split('\n').map((s) => s.trim());
  const takeaway = lines[0] || '';
  const bullets = lines.filter((l) => l.startsWith('• ')).map((l) => l.slice(2));
  const nexts = lines.filter((l) => l.toLowerCase().startsWith('next:')).map((l) => l.slice(5).trim());

  return (
    <div>
      <div style={{ marginBottom: 8 }}>{takeaway}</div>
      {bullets.length > 0 && <ul>{bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
      {nexts.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {nexts.map((n, i) => (
            <div key={i}>
              <b>Next:</b> {n}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [q, setQ] = useState<string>('');
  const [mode, setMode] = useState<'borrower' | 'public'>('borrower');
  const [intent, setIntent] = useState<'' | 'purchase' | 'refi' | 'investor'>('');
  const [loanAmount, setLoanAmount] = useState<number | ''>('');
  const [res, setRes] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  async function ask() {
    setLoading(true);
    setErr(null);
    setRes(null);
    try {
      const body: { question: string; mode: 'borrower' | 'public'; intent?: 'purchase' | 'refi' | 'investor'; loanAmount?: number } = {
        question: q,
        mode,
      };
      if (intent) body.intent = intent;
      if (loanAmount && Number(loanAmount) > 0) body.loanAmount = Number(loanAmount);

      const r = await fetch('/api/answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await safeJson(r);
      setRes(data);
      if (!r.ok) setErr(`HTTP ${r.status}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  const showBorrowerSummary = !!res && res.path === 'market' && res.usedFRED && !!res.borrowerSummary;

  return (
    <main style={{ maxWidth: 920, margin: '40px auto', padding: 24, fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif' }}>
      <h1 style={{ marginBottom: 12 }}>HomeRates — Local Tester</h1>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 140px 140px 180px auto' }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type your question…"
          style={{ padding: 10, border: '1px solid #ccc', borderRadius: 8 }}
        />
        <select value={mode} onChange={(e) => setMode(e.target.value as 'borrower' | 'public')} style={{ padding: 10, borderRadius: 8 }}>
          <option value="borrower">Borrower</option>
          <option value="public">Public</option>
        </select>
        <select value={intent} onChange={(e) => setIntent(e.target.value as '' | 'purchase' | 'refi' | 'investor')} style={{ padding: 10, borderRadius: 8 }}>
          <option value="">intent: auto</option>
          <option value="purchase">purchase</option>
          <option value="refi">refi</option>
          <option value="investor">investor</option>
        </select>
        <input
          type="number"
          min={50000}
          step={1000}
          placeholder="loan amount (optional)"
          value={loanAmount}
          onChange={(e) => setLoanAmount(e.target.value ? Number(e.target.value) : '')}
          style={{ padding: 10, border: '1px solid #ccc', borderRadius: 8 }}
        />
        <button onClick={ask} disabled={loading || !q.trim()} style={{ padding: '10px 16px', borderRadius: 8 }}>
          {loading ? 'Thinking…' : 'Ask'}
        </button>
      </div>

      {err && <div style={{ marginTop: 10, color: '#a00' }}>Error: {err}</div>}

      {res && (
        <section style={{ marginTop: 16, border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
            Path: <b>{String(res.path)}</b> · usedFRED: <b>{String(res.usedFRED)}</b> {res.lockBias ? <>· bias: <b>{res.lockBias}</b></> : null}{' '}
            {res.confidence ? <>· confidence: <b>{res.confidence}</b></> : null}
          </div>

          {Array.isArray(res.tldr) && res.tldr.length > 0 && (
            <>
              <h3 style={{ margin: '8px 0' }}>TL;DR</h3>
              <ul style={{ marginTop: 0 }}>
                {res.tldr.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </>
          )}

          <h3 style={{ margin: '8px 0' }}>Answer</h3>
          {renderAnswer(res.answer)}

          {showBorrowerSummary && (
            <>
              <h3 style={{ margin: '16px 0 8px' }}>Borrower Summary</h3>
              {renderBulletsFromText(res.borrowerSummary!)}
            </>
          )}

          {res.paymentDelta && (
            <div style={{ marginTop: 12, fontSize: 14, color: '#333' }}>
              Every 0.25% ≈ <b>${res.paymentDelta.perQuarterPt}/mo</b> on ${res.paymentDelta.loanAmount.toLocaleString()}.
            </div>
          )}

          {res.fred && (
            <>
              <h3 style={{ margin: '16px 0 8px' }}>FRED Snapshot</h3>
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(res.fred, null, 2)}</pre>
            </>
          )}

          {Array.isArray(res.watchNext) && res.watchNext.length > 0 && (
            <>
              <h3 style={{ margin: '16px 0 8px' }}>Watch Next</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {res.watchNext.map((w, i) => (
                  <span key={i} style={{ padding: '4px 8px', border: '1px solid #ddd', borderRadius: 999 }}>
                    {w}
                  </span>
                ))}
              </div>
            </>
          )}

          {'__raw' in (res || {}) && (
            <>
              <h3 style={{ margin: '16px 0 8px' }}>Raw</h3>
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{String((res as Record<string, unknown>).__raw)}</pre>
            </>
          )}
        </section>
      )}
    </main>
  );
}
