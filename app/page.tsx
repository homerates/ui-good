'use client';
import Link from "next/link";
import { useEffect, useRef, useState } from 'react';

type Role = 'user' | 'assistant';

/* =========================
   Calc helpers (UI)
   ========================= */
function isPaymentQuery(q: string) {
  // payment / payments / monthly payment / p&i / principal & interest
  const s = q.toLowerCase();
  if (/\bpay(ment|mnt|ments|mnts)?\b/.test(s)) return true;
  if (/\bmonthly\s*payment(s)?\b/.test(s)) return true;
  if (/\bp\s*&\s*i\b/.test(s)) return true;
  if (/\bprincipal\s*&?\s*interest\b/.test(s)) return true;

  // pattern: has 'loan' + some % + some years
  const hasLoan = /\bloan\b/.test(s);
  const hasRate = /\b\d+(\.\d+)?\s*%/.test(s);
  const hasYears = /\b\d+\s*(years?|yrs?|yr|y|yeards?)\b/.test(s);
  if (hasLoan && hasRate && hasYears) return true;

  return false;
}

// parses: "$500k with 20% down at 6.5% for 30 years"
function parsePaymentQuery(q: string) {
  const clean = q.replace(/,/g, "");

  // $500k / 500k / $500000
  const priceMatch = clean.match(/\$?\s*([\d.]+)\s*k?/i);
  const kBump = /k\b/i.test(clean) ? 1000 : 1;
  const purchasePrice = priceMatch ? Number(priceMatch[1]) * kBump : undefined;

  // 1) Down % (capture explicitly)
  const downMatch = clean.match(/(\d+(\.\d+)?)\s*%\s*down/i);
  const downPct = downMatch ? Number(downMatch[1]) : undefined;

  // 2) Remove "X% down" before searching for the rate
  const withoutDown = downMatch ? clean.replace(downMatch[0], "") : clean;

  // 3) Rate % (prefer “rate … %” or “at … %”, else first remaining %)
  let ratePct: number | undefined;
  const nearRate = withoutDown.match(/(?:rate|at)\s*:?[\s]*([0-9]+(\.[0-9]+)?)\s*%/i);
  if (nearRate) {
    ratePct = Number(nearRate[1]);
  } else {
    const anyPct = withoutDown.match(/([0-9]+(\.[0-9]+)?)\s*%/i);
    ratePct = anyPct ? Number(anyPct[1]) : undefined;
  }

  // 4) Term years (tolerate “yrs/yr/y/yeards”)
  const yearsMatch = clean.toLowerCase().match(/(\d+)\s*(years?|yrs?|yr|y|yeards?)/i);
  const termYears = yearsMatch ? Number(yearsMatch[1]) : undefined;

  return { purchasePrice, downPercent: downPct, annualRatePct: ratePct, termYears };
}

function buildCalcUrl(
  base: string,
  p: { purchasePrice?: number; downPercent?: number; annualRatePct?: number; termYears?: number }
) {
  const sp = new URLSearchParams();
  if (p.purchasePrice != null) sp.set("purchasePrice", String(p.purchasePrice));
  if (p.downPercent   != null) sp.set("downPercent",   String(p.downPercent));
  if (p.annualRatePct != null) sp.set("annualRatePct", String(p.annualRatePct));
  if (p.termYears     != null) sp.set("termYears",     String(p.termYears));
  return `${base}?${sp.toString()}`;
}

/* =========================
   Types
   ========================= */
type CalcAnswer = {
  loanAmount: number;
  monthlyPI: number;
  sensitivities: Array<{ rate: number; pi: number }>;
};

type ApiResponse = {
  path: 'concept' | 'market' | 'dynamic' | 'error' | 'calc';
  usedFRED: boolean;

  message?: string;
  summary?: string;

  tldr?: string[] | string;          // calc returns a single string here
  answer?: string | CalcAnswer;      // calc returns an object
  borrowerSummary?: string | null;
  fred?: {
    tenYearYield: number | null;
    mort30Avg: number | null;
    spread: number | null;
    asOf?: string | null;
  };
  lockBias?: 'Mild Lock' | 'Neutral' | 'Float Watch';
  paymentDelta?: { perQuarterPt: number; loanAmount: number };
  watchNext?: string[];
  confidence?: 'low' | 'med' | 'high';
  status?: number;
  generatedAt?: string;
};

type AnswersResponse = {
  ok: boolean;
  route: "answers";
  intent: string;
  tag: string;
  usedFRED?: boolean;
  generatedAt?: string;
  market?: {
    type: "market";
    asOf?: string;
    tenYearYield?: number | null;
    mort30Avg?: number | null;
    spread?: number | null;
    tone?: string;
    text?: string;
  } | { type: "market"; error: string };
};

type ChatMsg =
  | { id: string; role: 'user'; content: string }
  | { id: string; role: 'assistant'; content: string; meta?: ApiResponse };

/* =========================
   Utils
   ========================= */
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

const fmtISOshort = (iso?: string) => {
  if (!iso) return 'n/a';
  return iso.replace('T', ' ').replace('Z', 'Z');
};

/* =========================
   Rendering
   ========================= */
function AnswerBlock({ meta }: { meta?: ApiResponse }) {
  if (!meta) return null;

  // Defensive header fields (works whether values are top-level or nested)
  const headerPath = (meta as any).path ?? (meta as any).meta?.path ?? '—';
  const headerUsedFRED = (meta as any).usedFRED ?? (meta as any).meta?.usedFRED ?? false;
  const headerAt = (meta as any).generatedAt ?? (meta as any).meta?.at ?? undefined;

  // ---- CALC RENDERING ----
  if (headerPath === 'calc' && meta.answer && typeof meta.answer === 'object') {
    const a = meta.answer as CalcAnswer;
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div className="meta">
          <span>path: <b>{String(headerPath)}</b></span>
          <span> | usedFRED: <b>{String(headerUsedFRED)}</b></span>
          {headerAt && <span> | at: <b>{fmtISOshort(headerAt)}</b></span>}
        </div>

        <div>
          <div><b>Loan amount:</b> ${Number(a.loanAmount).toLocaleString()}</div>
          <div><b>Monthly P&I:</b> ${Number(a.monthlyPI).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        </div>

        {Array.isArray(a.sensitivities) && a.sensitivities.length > 0 && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>±0.25% Sensitivity</div>
            <ul style={{ marginTop: 0 }}>
              {a.sensitivities.map((s, i) => (
                <li key={i}>
                  Rate: {(Number(s.rate) * 100).toFixed(2)}% → P&I ${Number(s.pi).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </li>
              ))}
            </ul>
          </div>
        )}

        {typeof meta.tldr === 'string' && <div style={{ fontStyle: 'italic' }}>{meta.tldr}</div>}
      </div>
    );
  }
  // ---- END CALC RENDERING ----

  // --- existing non-calc rendering (unchanged) ---
  const primary =
    meta.message ??
    meta.summary ??
    (meta.fred &&
     meta.fred.tenYearYield != null &&
     meta.fred.mort30Avg != null &&
     meta.fred.spread != null
      ? `As of ${meta.fred.asOf ?? 'recent data'}: 10Y ${
          typeof meta.fred.tenYearYield === 'number'
            ? meta.fred.tenYearYield.toFixed(2)
            : meta.fred.tenYearYield
        }%, 30Y ${
          typeof meta.fred.mort30Avg === 'number'
            ? meta.fred.mort30Avg.toFixed(2)
            : meta.fred.mort30Avg
        }%, spread ${
          typeof meta.fred.spread === 'number'
            ? meta.fred.spread.toFixed(2)
            : meta.fred.spread
        }%.`
      : typeof meta.answer === 'string' ? meta.answer : '');

  const lines = (typeof meta.answer === 'string' ? meta.answer : '').split('\n').map((s) => s.trim());
  const takeaway = primary || lines[0] || '';
  const bullets = lines.filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
  const nexts = lines
    .filter((l) => l.toLowerCase().startsWith('next:'))
    .map((l) => l.slice(5).trim());

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="meta">
        <span>path: <b>{String(headerPath)}</b></span>
        <span> | usedFRED: <b>{String(headerUsedFRED)}</b></span>
        {headerAt && <span> | at: <b>{fmtISOshort(headerAt)}</b></span>}
      </div>

      {takeaway && <div>{takeaway}</div>}

      {Array.isArray(meta.tldr) && meta.tldr.length > 0 && (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>TL;DR</div>
          <ul style={{ marginTop: 0 }}>
            {meta.tldr.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}

      {bullets.length > 0 && (
        <ul style={{ marginTop: 0 }}>
          {bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      )}

      {nexts.length > 0 && (
        <div style={{ display: 'grid', gap: 4 }}>
          {nexts.map((n, i) => (
            <div key={i}><b>Next:</b> {n}</div>
          ))}
        </div>
      )}

      {headerPath === 'market' && headerUsedFRED && meta.borrowerSummary && (
        <div className="panel">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Borrower Summary</div>
          <ul style={{ marginTop: 0 }}>
            {meta.borrowerSummary.split('\n').map((l, i) => (
              <li key={i}>{l.replace(/^\s*[-|*]\s*/, '')}</li>
            ))}
          </ul>
        </div>
      )}

      {meta.paymentDelta && (
        <div style={{ fontSize: 13 }}>
          Every 0.25% ~ <b>${meta.paymentDelta.perQuarterPt}/mo</b> on ${meta.paymentDelta.loanAmount.toLocaleString()}.
        </div>
      )}
    </div>
  );
}

function Bubble({ role, children }: { role: Role; children: React.ReactNode }) {
  const isUser = role === 'user';
  return (
    <div className="bubble">
      <div className={`avatar ${isUser ? 'user' : 'bot'}`}>{isUser ? 'U' : 'HR'}</div>
      <div className={`balloon ${isUser ? 'user' : 'bot'}`}>{children}</div>
    </div>
  );
}

/* =========================
   Page
   ========================= */
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
  const [intent, setIntent] = useState<'' | 'purchase' | 'refi' | 'investor'>('');
  const [loanAmount, setLoanAmount] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<{ id: string; title: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  function newChat() {
    setMessages([{ id: uid(), role: 'assistant', content: 'New chat. What do you want to figure out?' }]);
  }

  async function send() {
    const q = input.trim();
    if (!q || loading) return;

    const title = q.length > 42 ? q.slice(0, 42) + '...' : q;
    setHistory((h) => [{ id: uid(), title }, ...h].slice(0, 12));
    setMessages((m) => [...m, { id: uid(), role: 'user', content: q }]);
    setInput('');
    setLoading(true);

    try {
      // ---- calc short-circuit ----
      if (isPaymentQuery(q)) {
        const parsed = parsePaymentQuery(q); // { purchasePrice, downPercent, annualRatePct, termYears }
        const url = buildCalcUrl("/api/calc/payment", parsed);

        const r = await fetch(url, { method: "GET" });
        const raw = await r.json(); // { meta:{...}, tldr, answer }

        // FLATTEN so renderer always has top-level fields
        const meta: ApiResponse = {
          path: (raw?.meta?.path ?? raw?.path ?? 'calc') as ApiResponse['path'],
          usedFRED: (raw?.meta?.usedFRED ?? raw?.usedFRED ?? false) as boolean,
          tldr: (raw?.tldr ?? raw?.summary ?? raw?.message),
          answer: (raw?.answer ?? raw),
          generatedAt: (raw?.meta?.at ?? raw?.generatedAt)
        };

        // Friendly line
        let friendly = "Calculated principal & interest payment.";
        if (meta.path === "calc" && meta.answer && typeof meta.answer === "object") {
          const a = meta.answer as CalcAnswer;
          friendly = `Monthly P&I: $${Number(a.monthlyPI).toLocaleString(undefined, { maximumFractionDigits: 2 })} on $${Number(a.loanAmount).toLocaleString()}`;
        }

        setMessages((m) => [...m, { id: uid(), role: 'assistant', content: friendly, meta }]);
        return; // don’t fall through to /api/answers
      }
      // ---- end calc short-circuit ----

      // /api/answers flow
      const body: {
        question: string;
        mode: 'borrower' | 'public';
        intent?: 'purchase' | 'refi' | 'investor';
        loanAmount?: number;
      } = { question: q, mode };
      if (intent) body.intent = intent;
      if (loanAmount && Number(loanAmount) > 0) body.loanAmount = Number(loanAmount);

      const r = await fetch('/api/answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const meta = await safeJson(r);

      const friendly =
        meta.message ??
        meta.summary ??
        (meta.fred &&
         meta.fred.tenYearYield != null &&
         meta.fred.mort30Avg != null &&
         meta.fred.spread != null
           ? `As of ${meta.fred.asOf ?? 'recent data'}: 10Y ${
               typeof meta.fred.tenYearYield === 'number'
                 ? meta.fred.tenYearYield.toFixed(2)
                 : meta.fred.tenYearYield
             }%, 30Y ${
               typeof meta.fred.mort30Avg === 'number'
                 ? meta.fred.mort30Avg.toFixed(2)
                 : meta.fred.mort30Avg
             }%, spread ${
               typeof meta.fred.spread === 'number'
                 ? meta.fred.spread.toFixed(2)
                 : meta.fred.spread
             }%.`
           : typeof meta.answer === 'string'
             ? meta.answer
             : `path: ${meta.path} | usedFRED: ${String(meta.usedFRED)} | confidence: ${meta.confidence ?? '-'}`);

      setMessages((m) => [...m, { id: uid(), role: 'assistant', content: friendly, meta }]);
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
    <>
      {/* Sidebar */}
      <aside className="sidebar" style={{ position: "relative", zIndex: 1000 }}>
        <div className="side-top">
          {/* Clickable mark in the corner */}
          <div className="brand" style={{ position: "relative", zIndex: 10000 }}>
            <Link
              href="/"
              aria-label="HomeRates.ai home"
              style={{ display: "inline-flex", alignItems: "center", pointerEvents: "auto" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/homerates-mark.svg"
                alt="HomeRates.ai"
                width={28}
                height={28}
                style={{ display: "block" }}
              />
            </Link>
          </div>

          <button className="btn primary" onClick={newChat}>New chat</button>
        </div>

        <div className="chat-list">
          {history.length === 0 && (
            <div className="chat-item" style={{ opacity: 0.7 }}>No history yet</div>
          )}
          {history.map((h) => (
            <div key={h.id} className="chat-item" title={h.title}>
              {h.title}
            </div>
          ))}
        </div>

        <div className="side-bottom">
          <button className="btn">Settings</button>
          <button className="btn">Share</button>
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
                onChange={(e) => setMode(e.target.value as 'borrower' | 'public')}
              >
                <option value="borrower">Borrower</option>
                <option value="public">Public</option>
              </select>
              <select
                value={intent}
                onChange={(e) =>
                  setIntent(e.target.value as '' | 'purchase' | 'refi' | 'investor')
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
                    {m.role === 'assistant' ? <AnswerBlock meta={m.meta} /> : m.content}
                  </Bubble>
                </div>
              ))}
              {loading && <div className="meta">...thinking</div>}
            </div>
          </div>
        </div>

        <div className="composer">
          <div className="composer-inner">
            <input
              className="input"
              placeholder="Ask about DTI, PMI, or where rates sit vs the 10-year | ..."
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
