'use client';
import Link from "next/link";
import { useEffect, useRef, useState } from 'react';

type Role = 'user' | 'assistant';

/* =========================
   Calc helpers (UI)
   ========================= */
function isPaymentQuery(q: string) {
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

  // generic “$400k at 6.5% for 30 years”
  if (/\$?\s*\d[\d.,]*(?:\s*[km])?\s+at\s+\d+(\.\d+)?\s*%\s+for\s+\d+/.test(s)) return true;

  // generic “$400k @ 6.5% for 30y”
  if (/\$?\s*\d[\d.,]*(?:\s*[km])?\s+@\s+\d+(\.\d+)?\s*%\s+for\s+\d+\s*(years?|yrs?|yr|y)?\b/.test(s)) return true;

  return false;
}

/* =========================
   Robust parsing helpers
   ========================= */
function isFiniteNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/** Parse $400k, 400k, $1.2m, 1200000 → number of dollars (rounded) */
function parseMoney(raw: string | undefined | null): number | undefined {
  if (!raw) return undefined;
  const s = String(raw).trim().toLowerCase().replace(/,/g, "");
  // capture number + optional k/m suffix that is directly attached to the number
  const m = s.match(/^\$?\s*([\d]+(?:\.[\d]+)?)\s*([km])?\b/);
  if (!m) return undefined;
  let n = parseFloat(m[1]);
  const unit = m[2];
  if (unit === 'k') n *= 1_000;
  if (unit === 'm') n *= 1_000_000;
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n);
}

/** Parse 6.5 or 6.5% → 6.5 */
function parsePercent(raw: string | undefined | null): number | undefined {
  if (!raw) return undefined;
  const m = String(raw).match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : undefined;
}

// parses: "$500k with 20% down at 6.5% for 30 years"
// also supports: "$400k loan at 6.5% for 15 years", "15 year loan of 500k at 6%", "$1.2m loan ..."
function parsePaymentQuery(q: string) {
  const clean = q.replace(/,/g, "").toLowerCase();

  // money tokens ($, k, m). Track context so we don't pick up percent rates as amounts.
  const moneyRe = /\$?\s*\d+(?:\.\d+)?\s*[km]?\b/g;
  const toMoney = (s: string | undefined) => (s ? parseMoney(s) : undefined);

  const tokens = Array.from(clean.matchAll(moneyRe)).map((m) => {
    const start = m.index ?? 0;
    const text = m[0];
    const end = start + text.length;
    const next = clean.slice(end, end + 3); // tiny lookahead for %
    return {
      text,
      index: start,
      end,
      value: toMoney(text),
      followedByPercent: /^\s*%/.test(next),
      hasCurrency: /\$/.test(text),
      hasSuffix: /[km]\b/.test(text),
    };
  });

  // explicit "loan amount: 400k" style
  const loanExplicit = clean.match(
    /\bloan(?:\s*amount)?(?:\s*[:=])?\s*(?:of\s*)?(\$?\s*\d+(?:\.\d+)?\s*[km]?)\b/
  );

  let loanAmount: number | undefined;
  if (loanExplicit) {
    loanAmount = toMoney(loanExplicit[1]);
  } else if (/\bloan\b/.test(clean) && tokens.length > 0) {
    // prefer the first money-like token AFTER "loan" that is NOT a % and looks like money ($ or k/m)
    const loanIdx = clean.indexOf("loan");
    const afterLoanMoney = tokens.find(
      (t) => t.index > loanIdx && !t.followedByPercent && (t.hasCurrency || t.hasSuffix)
    );
    loanAmount =
      afterLoanMoney?.value ??
      // fallback: first non-% token after "loan"
      tokens.find((t) => t.index > loanIdx && !t.followedByPercent)?.value ??
      // last fallback: first token overall that isn't a %
      tokens.find((t) => !t.followedByPercent)?.value;
  }

  // purchase price if no explicit loan picked up
  let purchasePrice: number | undefined;
  if (!loanAmount && tokens.length > 0) {
    const hintsPrice = /\b(purchase|purchase\s*price|price|home|house|pp)\b/.test(clean);
    if (hintsPrice) {
      // prefer a non-% money token that looks like money; else first non-%
      purchasePrice =
        tokens.find((t) => !t.followedByPercent && (t.hasCurrency || t.hasSuffix))?.value ??
        tokens.find((t) => !t.followedByPercent)?.value ??
        tokens[0].value;
    } else if (!/\bloan\b/.test(clean)) {
      // if no "loan" keyword at all, assume amount is PP (but avoid rates)
      purchasePrice =
        tokens.find((t) => !t.followedByPercent && (t.hasCurrency || t.hasSuffix))?.value ??
        tokens.find((t) => !t.followedByPercent)?.value ??
        tokens[0].value;
    }
  }

  // down % (e.g., "20% down")
  const downMatch = clean.match(/(\d+(?:\.\d+)?)\s*%\s*down\b/);
  const downPercent = downMatch ? parsePercent(downMatch[1]) : undefined;

  // rate % (prefer near "rate"/"at"/"@")
  let annualRatePct: number | undefined;
  const rateNear = clean.match(/(?:rate|at|@)\s*:?[\s]*([0-9]+(?:\.[0-9]+)?)\s*%/i);
  if (rateNear) {
    annualRatePct = parsePercent(rateNear[1]);
  } else {
    const anyPct = clean.match(/([0-9]+(?:\.[0-9]+)?)\s*%/i);
    annualRatePct = anyPct ? parsePercent(anyPct[1]) : undefined;
  }

  // term years (yrs/yr/y/yeards)
  const yearsMatch = clean.match(/(\d+)\s*(years?|yrs?|yr|y|yeards?)/i);
  let termYears = yearsMatch ? parseInt(yearsMatch[1], 10) : undefined;

  // Default to 30y if user gave amount + rate but no term
  if (!termYears && (loanAmount || purchasePrice) && typeof annualRatePct === "number") {
    termYears = 30;
  }

  return { loanAmount, purchasePrice, downPercent, annualRatePct, termYears };
}

function buildCalcUrl(
  base: string,
  p: {
    loanAmount?: number;
    purchasePrice?: number;
    downPercent?: number;
    annualRatePct?: number;
    termYears?: number;
  }
) {
  const sp = new URLSearchParams();
  if (isFiniteNum(p.loanAmount))    sp.set("loanAmount",    String(p.loanAmount));
  if (isFiniteNum(p.purchasePrice)) sp.set("purchasePrice", String(p.purchasePrice));
  if (isFiniteNum(p.downPercent))   sp.set("downPercent",   String(p.downPercent));
  if (isFiniteNum(p.annualRatePct)) sp.set("annualRatePct", String(p.annualRatePct));
  if (isFiniteNum(p.termYears))     sp.set("termYears",     String(p.termYears));
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

/* =========================
   Types
   ========================= */
type CalcAnswer = {
  loanAmount: number;
  monthlyPI: number;
  sensitivities: Array<{ rate: number; pi: number }>;
  // Optional PITI fields if backend supplies them
  monthlyTax?: number;
  monthlyIns?: number;
  monthlyHOA?: number;
  monthlyMI?: number;
  monthlyTotalPITI?: number;
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

const fmtMoney = (n: unknown) => {
  const v = typeof n === 'number' && isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

// Normalize calc API response without using `any`
type CalcApiMeta = { path?: ApiResponse['path']; usedFRED?: boolean; at?: string };
type CalcApiRaw = { meta?: CalcApiMeta; tldr?: string | string[]; summary?: string; message?: string; answer?: unknown; path?: ApiResponse['path']; usedFRED?: boolean; generatedAt?: string };

function normalizeCalcResponse(raw: unknown, status: number): ApiResponse {
  const r = (typeof raw === 'object' && raw !== null ? raw as CalcApiRaw : {}) as CalcApiRaw;

  const path: ApiResponse['path'] =
    (r.meta?.path ?? r.path ?? 'calc') as ApiResponse['path'];

  const usedFRED: boolean = typeof r.meta?.usedFRED === 'boolean'
    ? r.meta!.usedFRED!
    : (typeof r.usedFRED === 'boolean' ? r.usedFRED : false);

  const generatedAt = r.meta?.at ?? r.generatedAt;

  const tldr = (r.tldr ?? r.summary ?? r.message) as string | string[] | undefined;

  // If the backend returns answer in the top-level shape
  const answer = (r as { answer?: unknown }).answer ?? r;

  return {
    path,
    usedFRED,
    tldr,
    answer: answer as string | CalcAnswer,
    generatedAt,
    status,
  };
}

/* =========================
   Rendering
   ========================= */
function AnswerBlock({ meta }: { meta?: ApiResponse }) {
  if (!meta) return null;

  type NestedMeta = { meta?: { path?: ApiResponse['path']; usedFRED?: boolean; at?: string } };
  const m = meta as ApiResponse & NestedMeta;

  const headerPath: ApiResponse['path'] | '—' = m.path ?? m.meta?.path ?? '—';
  const headerUsedFRED: boolean = (typeof m.usedFRED === 'boolean' ? m.usedFRED : (m.meta?.usedFRED ?? false));
  const headerAt: string | undefined = m.generatedAt ?? m.meta?.at ?? undefined;

  // ---- CALC RENDERING ----
  if (headerPath === 'calc' && m.answer && typeof m.answer === 'object') {
    const a = m.answer as CalcAnswer;
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div className="meta">
          <span>path: <b>{String(headerPath)}</b></span>
          <span> | usedFRED: <b>{String(headerUsedFRED)}</b></span>
          {headerAt && <span> | at: <b>{fmtISOshort(headerAt)}</b></span>}
        </div>

        <div>
          <div><b>Loan amount:</b> ${fmtMoney(a.loanAmount)}</div>
          <div><b>Monthly P&I:</b> ${fmtMoney(a.monthlyPI)}</div>
        </div>

        {typeof a.monthlyTotalPITI === 'number' && a.monthlyTotalPITI > 0 && (
          <div className="panel">
            <div style={{ fontWeight: 600, marginBottom: 6 }}>PITI breakdown</div>
            <ul style={{ marginTop: 0 }}>
              <li>Taxes: ${fmtMoney(a.monthlyTax)}</li>
              <li>Insurance: ${fmtMoney(a.monthlyIns)}</li>
              <li>HOA: ${fmtMoney(a.monthlyHOA)}</li>
              <li>MI: ${fmtMoney(a.monthlyMI)}</li>
              <li><b>Total PITI: ${fmtMoney(a.monthlyTotalPITI)}</b></li>
            </ul>
          </div>
        )}

        {Array.isArray(a.sensitivities) && a.sensitivities.length > 0 && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>±0.25% Sensitivity</div>
            <ul style={{ marginTop: 0 }}>
              {a.sensitivities.map((s, i) => (
                <li key={i}>
                  Rate: {(Number(s.rate) * 100).toFixed(2)}% → P&I ${fmtMoney(s.pi)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {typeof m.tldr === 'string' && <div style={{ fontStyle: 'italic' }}>{m.tldr}</div>}
      </div>
    );
  }
  // ---- END CALC RENDERING ----

  // --- existing non-calc rendering (unchanged) ---
  const primary =
    m.message ??
    m.summary ??
    (m.fred &&
     m.fred.tenYearYield != null &&
     m.fred.mort30Avg != null &&
     m.fred.spread != null
      ? `As of ${m.fred.asOf ?? 'recent data'}: 10Y ${
          typeof m.fred.tenYearYield === 'number'
            ? m.fred.tenYearYield.toFixed(2)
            : m.fred.tenYearYield
        }%, 30Y ${
          typeof m.fred.mort30Avg === 'number'
            ? m.fred.mort30Avg.toFixed(2)
            : m.fred.mort30Avg
        }%, spread ${
          typeof m.fred.spread === 'number'
            ? m.fred.spread.toFixed(2)
            : m.fred.spread
        }%.`
      : typeof m.answer === 'string' ? m.answer : '');

  const lines = (typeof m.answer === 'string' ? m.answer : '').split('\n').map((s) => s.trim());
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

      {Array.isArray(m.tldr) && m.tldr.length > 0 && (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>TL;DR</div>
          <ul style={{ marginTop: 0 }}>
            {m.tldr.map((t, i) => <li key={i}>{t}</li>)}
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

      {headerPath === 'market' && headerUsedFRED && m.borrowerSummary && (
        <div className="panel">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Borrower Summary</div>
          <ul style={{ marginTop: 0 }}>
            {m.borrowerSummary.split('\n').map((l, i) => (
              <li key={i}>{l.replace(/^\s*[-|*]\s*/, '')}</li>
            ))}
          </ul>
        </div>
      )}

      {m.paymentDelta && (
        <div style={{ fontSize: 13 }}>
          Every 0.25% ~ <b>${m.paymentDelta.perQuarterPt}/mo</b> on ${m.paymentDelta.loanAmount.toLocaleString()}.
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
        const parsed = parsePaymentQuery(q); // { loanAmount?, purchasePrice?, downPercent?, annualRatePct?, termYears? }

        // Guard: do not call calc with zeros/empties
        const okByLoan =
          isFiniteNum(parsed.loanAmount) &&
          isFiniteNum(parsed.annualRatePct);

        const okByPP =
          isFiniteNum(parsed.purchasePrice) &&
          isFiniteNum(parsed.downPercent) &&
          isFiniteNum(parsed.annualRatePct);

        if (!okByLoan && !okByPP) {
          setMessages((m) => [
            ...m,
            {
              id: uid(),
              role: "assistant",
              content:
                "I need at least a loan amount + rate (e.g., “$400k loan at 6.5% for 30 years”), or purchase price + down % + rate (e.g., “$500k with 20% down at 6.25% for 30 years”).",
            },
          ]);
          return;
        }

        // Shim: if API ignores raw loanAmount, convert to PP + 0% down
        const patched = { ...parsed };
        if (isFiniteNum(patched.loanAmount) && !isFiniteNum(patched.purchasePrice)) {
          patched.purchasePrice = patched.loanAmount;
          if (!isFiniteNum(patched.downPercent)) patched.downPercent = 0;
        }

        const url = buildCalcUrl("/api/calc/payment", patched);
        const r = await fetch(url, { method: "GET", headers: { "cache-control": "no-store" } });
        const raw: unknown = await r.json().catch(() => ({}));

        const meta = normalizeCalcResponse(raw, r.status);

        let friendly = "Calculated principal & interest payment.";
        if (meta.path === "calc" && meta.answer && typeof meta.answer === "object") {
          const a = meta.answer as CalcAnswer;
          friendly = `Monthly P&I: $${fmtMoney(a.monthlyPI)} on $${fmtMoney(a.loanAmount)}`;
        }
        if (!r.ok) {
          friendly = `Calc service returned ${r.status}. Showing raw data.`;
        }

        setMessages((m) => [...m, { id: uid(), role: "assistant", content: friendly, meta }]);
        return; // don’t fall through to /api/answers
      }
      // ---- end calc short-circuit ----

      // /api/answers flow (unchanged)
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
