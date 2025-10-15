'use client';

import { useEffect, useRef, useState } from 'react';

type Role = 'user' | 'assistant';

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
  status?: number;
};

type ChatMsg =
  | { id: string; role: 'user'; content: string }
  | { id: string; role: 'assistant'; content: string; meta?: ApiResponse };

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

async function safeJson(r: Response): Promise<ApiResponse> {
  const txt = await r.text();
  try {
    return JSON.parse(txt) as ApiResponse;
  } catch {
    return { path: 'error', usedFRED: false, answer: txt, status: r.status };
  }
}

function AnswerBlock({ meta }: { meta?: ApiResponse }) {
  if (!meta) return null;

  const lines = (meta.answer ?? '').split('\n').map((s) => s.trim());
  const takeaway = lines[0] || '';
  const bullets = lines.filter((l) => l.startsWith('• ')).map((l) => l.slice(2));
  const nexts = lines.filter((l) => l.toLowerCase().startsWith('next:')).map((l) => l.slice(5).trim());

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {/* meta strip */}
      <div style={{ fontSize: 12, color: '#667', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span>path: <b>{meta.path}</b></span>
        <span>· usedFRED: <b>{String(meta.usedFRED)}</b></span>
        {meta.lockBias && <span>· bias: <b>{meta.lockBias}</b></span>}
        {meta.confidence && <span>· confidence: <b>{meta.confidence}</b></span>}
      </div>

      {/* TL;DR */}
      {meta.tldr && meta.tldr.length > 0 && (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>TL;DR</div>
          <ul style={{ marginTop: 0 }}>
            {meta.tldr.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}

      {/* Main answer */}
      {takeaway && <div>{takeaway}</div>}
      {bullets.length > 0 && <ul style={{ marginTop: 0 }}>{bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
      {nexts.length > 0 && (
        <div style={{ display: 'grid', gap: 4 }}>
          {nexts.map((n, i) => <div key={i}><b>Next:</b> {n}</div>)}
        </div>
      )}

      {/* Borrower summary */}
      {meta.path === 'market' && meta.usedFRED && meta.borrowerSummary && (
        <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10, padding: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Borrower Summary</div>
          <ul style={{ marginTop: 0 }}>
            {meta.borrowerSummary.split('\n').map((l, i) => <li key={i}>{l.replace(/^[-•]\s*/, '')}</li>)}
          </ul>
        </div>
      )}

      {/* Payment delta */}
      {meta.paymentDelta && (
        <div style={{ fontSize: 13, color: '#334155' }}>
          Every 0.25% ≈ <b>${meta.paymentDelta.perQuarterPt}/mo</b> on ${meta.paymentDelta.loanAmount.toLocaleString()}.
        </div>
      )}
    </div>
  );
}

function Bubble({ role, children }: { role: Role; children: React.ReactNode }) {
  const isUser = role === 'user';
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div
        aria-hidden
        style={{
          width: 28, height: 28, borderRadius: 999,
          background: isUser ? '#0ea5e9' : '#111827',
          color: 'white', display: 'grid', placeItems: 'center',
          fontSize: 14, fontWeight: 700, flex: '0 0 auto'
        }}>
        {isUser ? 'U' : 'HR'}
      </div>
      <div
        style={{
          background: isUser ? '#e0f2fe' : '#f4f4f5',
          border: '1px solid #e5e7eb',
          borderRadius: 16,
          padding: '10px 12px',
          maxWidth: 760,
          whiteSpace: 'pre-wrap'
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: uid(), role: 'assistant', content: 'Ask about a concept (DTI, PMI, FHA) or market (rates vs 10-year). You can also add intent and loan amount.' }
  ]);
  const [input, setInput] = useState<string>('');
  const [mode, setMode] = useState<'borrower' | 'public'>('borrower');
  const [intent, setIntent] = useState<'' | 'purchase' | 'refi' | 'investor'>('');
  const [loanAmount, setLoanAmount] = useState<number | ''>('');
  const [loading, setLoading] = useState<boolean>(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const q = input.trim();
    if (!q || loading) return;

    const userMsg: ChatMsg = { id: uid(), role: 'user', content: q };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const body: { question: string; mode: 'borrower' | 'public'; intent?: 'purchase' | 'refi' | 'investor'; loanAmount?: number } = {
        question: q,
        mode
      };
      if (intent) body.intent = intent;
      if (loanAmount && Number(loanAmount) > 0) body.loanAmount = Number(loanAmount);

      const r = await fetch('/api/answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const meta = await safeJson(r);
      const botMsg: ChatMsg = {
        id: uid(),
        role: 'assistant',
        content: meta.answer ?? '(no answer)',
        meta
      };
      setMessages((m) => [...m, botMsg]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessages((m) => [...m, { id: uid(), role: 'assistant', content: `Error: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <main style={{ height: '100dvh', display: 'grid', gridTemplateRows: 'auto 1fr auto', maxWidth: 980, margin: '0 auto' }}>
      {/* Header */}
      <header style={{ padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ fontWeight: 800 }}>HomeRates</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <select value={mode} onChange={(e) => setMode(e.target.value as 'borrower' | 'public')} style={{ padding: 8, borderRadius: 10 }}>
            <option value="borrower">Borrower</option>
            <option value="public">Public</option>
          </select>
          <select value={intent} onChange={(e) => setIntent(e.target.value as '' | 'purchase' | 'refi' | 'investor')} style={{ padding: 8, borderRadius: 10 }}>
            <option value="">Intent: auto</option>
            <option value="purchase">Purchase</option>
            <option value="refi">Refi</option>
            <option value="investor">Investor</option>
          </select>
          <input
            type="number"
            min={50000}
            step={1000}
            placeholder="Loan (optional)"
            value={loanAmount}
            onChange={(e) => setLoanAmount(e.target.value ? Number(e.target.value) : '')}
            style={{ width: 150, padding: 8, borderRadius: 10, border: '1px solid #ddd' }}
          />
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollerRef} style={{ overflowY: 'auto', padding: '12px 16px', background: '#fff' }}>
        <div style={{ display: 'grid', gap: 12 }}>
          {messages.map((m) => (
            <div key={m.id}>
              <Bubble role={m.role}>
                {m.role === 'assistant' ? <AnswerBlock meta={m.meta} /> : m.content}
              </Bubble>
            </div>
          ))}
          {loading && (
            <div style={{ color: '#64748b', fontSize: 13, paddingLeft: 38 }}>…thinking</div>
          )}
        </div>
      </div>

      {/* Composer */}
      <footer style={{ padding: 12, borderTop: '1px solid #eee', background: '#fafafa' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ask about DTI, PMI, or where rates sit vs the 10-year…"
            style={{ padding: 12, borderRadius: 12, border: '1px solid #ddd' }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            style={{ padding: '12px 16px', borderRadius: 12 }}>
            Send
          </button>
        </div>
      </footer>
    </main>
  );
}
