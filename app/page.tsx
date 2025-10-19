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
  fred?: {
    tenYearYield: number | null;
    mort30Avg: number | null;
    spread: number | null;
    asOf?: string | null;
  };
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
  const nexts = lines
    .filter((l) => l.toLowerCase().startsWith('next:'))
    .map((l) => l.slice(5).trim());

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="meta">
        <span>
          path: <b>{meta.path}</b>
        </span>
        <span>
          · usedFRED: <b>{String(meta.usedFRED)}</b>
        </span>
        {meta.lockBias && (
          <span>
            · bias: <b>{meta.lockBias}</b>
          </span>
        )}
        {meta.confidence && (
          <span>
            · confidence: <b>{meta.confidence}</b>
          </span>
        )}
      </div>

      {meta.tldr?.length ? (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>TL;DR</div>
          <ul style={{ marginTop: 0 }}>
            {meta.tldr.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {takeaway && <div>{takeaway}</div>}

      {bullets.length > 0 && (
        <ul style={{ marginTop: 0 }}>
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}

      {nexts.length > 0 && (
        <div style={{ display: 'grid', gap: 4 }}>
          {nexts.map((n, i) => (
            <div key={i}>
              <b>Next:</b> {n}
            </div>
          ))}
        </div>
      )}

      {meta.path === 'market' && meta.usedFRED && meta.borrowerSummary && (
        <div className="panel">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            Borrower Summary
          </div>
          <ul style={{ marginTop: 0 }}>
            {meta.borrowerSummary
              .split('\n')
              .map((l, i) => (
                <li key={i}>{l.replace(/^[-•]\s*/, '')}</li>
              ))}
          </ul>
        </div>
      )}

      {meta.paymentDelta && (
        <div style={{ fontSize: 13 }}>
          Every 0.25% ≈{' '}
          <b>
            ${meta.paymentDelta.perQuarterPt}/mo
          </b>{' '}
          on ${meta.paymentDelta.loanAmount.toLocaleString()}.
        </div>
      )}
    </div>
  );
}

function Bubble({ role, children }: { role: Role; children: React.ReactNode }) {
  const isUser = role === 'user';
  return (
    <div className="bubble">
      <div className={`avatar ${isUser ? 'user' : 'bot'}`}>
        {isUser ? 'U' : 'HR'}
      </div>
      <div className={`balloon ${isUser ? 'user' : 'bot'}`}>{children}</div>
    </div>
  );
}

export default function Page() {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: uid(),
      role: 'assistant',
      content:
        'Ask about a concept (DTI, PMI, FHA) or market (rates vs 10-year). Add intent + loan for buyer math.',
    },
  ]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'borrower' | 'public'>('borrower');
  const [intent, setIntent] = useState<'' | 'purchase' | 'refi' | 'investor'>(
    ''
  );
  const [loanAmount, setLoanAmount] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<{ id: string; title: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  function newChat() {
    setMessages([
      {
        id: uid(),
        role: 'assistant',
        content: 'New chat. What do you want to figure out?',
      },
    ]);
  }

  async function send() {
    const q = input.trim();
    if (!q || loading) return;

    const title = q.length > 42 ? q.slice(0, 42) + '…' : q;
    setHistory((h) => [{ id: uid(), title }, ...h].slice(0, 12));
    setMessages((m) => [...m, { id: uid(), role: 'user', content: q }]);
    setInput('');
    setLoading(true);

    try {
      const body: {
        question: string;
        mode: 'borrower' | 'public';
        intent?: 'purchase' | 'refi' | 'investor';
        loanAmount?: number;
      } = { question: q, mode };

      if (intent) body.intent = intent;
      if (loanAmount && Number(loanAmount) > 0)
        body.loanAmount = Number(loanAmount);

      const r = await fetch('/api/answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const meta = await safeJson(r);

      // --- Friendly display line for market summaries ---
      function displayLine(j: ApiResponse): string {
        if ((j as any).message) return (j as any).message;
        if ((j as any).summary) return (j as any).summary;
        if (j.answer) return j.answer;
        if (j.fred && j.fred.tenYearYield && j.fred.mort30Avg && j.fred.spread) {
          const f = j.fred;
          const y = f.tenYearYield?.toFixed(2);
          const m = f.mort30Avg?.toFixed(2);
          const s = f.spread?.toFixed(2);
          return `As of ${f.asOf ?? 'recent data'}: 10Y ${y}%, 30Y ${m}%, spread ${s}%.`;
        }
        return `path: ${j.path} · usedFRED: ${String(
          j.usedFRED
        )} · confidence: ${j.confidence ?? '-'}`;
      }

      const line = displayLine(meta);

      setMessages((m) => [
        ...m,
        { id: uid(), role: 'assistant', content: line, meta },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessages((m) => [
        ...m,
        { id: uid(), role: 'assistant', content: `Error: ${msg}` },
      ]);
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
    <>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="side-top">
          <div className="brand">HomeRates</div>
          <button className="btn primary" onClick={newChat}>
            ＋ New chat
          </button>
        </div>
        <div className="chat-list">
          {history.length === 0 && (
            <div className="chat-item" style={{ opacity: 0.7 }}>
              No history yet
            </div>
          )}
          {history.map((h) => (
            <div key={h.id} className="chat-item" title={h.title}>
              {h.title}
            </div>
          ))}
        </div>
        <div className="side-bottom">
          <button className="btn">⚙️ Settings</button>
          <button className="btn">🔗 Share</button>
        </div>
      </aside>

      {/* Main */}
      <section className="main">
        <div className="header">
          <div className="header-inner">
            <div style={{ fontWeight: 700 }}>Chat</div>
            <div className="controls">
              <select
                value={mode}
                onChange={(e) =>
                  setMode(e.target.value as 'borrower' | 'public')
                }
              >
                <option value="borrower">Borrower</option>
                <option value="public">Public</option>
              </select>
              <select
                value={intent}
                onChange={(e) =>
                  setIntent(
                    e.target.value as '' | 'purchase' | 'refi' | 'investor'
                  )
                }
              >
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
                onChange={(e) =>
                  setLoanAmount(e.target.value ? Number(e.target.value) : '')
                }
              />
            </div>
          </div>
        </div>

        <div ref={scrollRef} className="scroll">
          <div className="center">
            <div className="messages">
              {messages.map((m) => (
                <div key={m.id}>
                  <Bubble role={m.role}>
                    {m.role === 'assistant' ? (
                      <AnswerBlock meta={m.meta} />
                    ) : (
                      m.content
                    )}
                  </Bubble>
                </div>
              ))}
              {loading && <div className="meta">…thinking</div>}
            </div>
          </div>
        </div>

        <div className="composer">
          <div className="composer-inner">
            <input
              className="input"
              placeholder="Ask about DTI, PMI, or where rates sit vs the 10-year…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
            />
            <button
              className="btn"
              onClick={send}
              disabled={loading || !input.trim()}
            >
              Send
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
