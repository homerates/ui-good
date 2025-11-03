'use client';

import { useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';

type Role = 'user' | 'assistant';

const LS_KEY = 'hr.chat.v1';

type Thread = {
  id: string;
  messages: { role: Role; content: string; at: number }[];
  updatedAt: number;
};

function loadThreads(): Thread[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Thread[];
    return Array.isArray(arr)
      ? arr.sort((a, b) => b.updatedAt - a.updatedAt)
      : [];
  } catch {
    return [];
  }
}
function saveThreads(threads: Thread[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(threads));
}

/* =========================
   Calc helpers (parsing + URL)
   ========================= */
function isFiniteNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function parseCalcIntent(q: string) {
  const s = q.toLowerCase();

  // percent / rate
  const rateMatch = s.match(/(\d+(?:\.\d+)?)\s*%/);
  const annualRatePct = rateMatch ? parseFloat(rateMatch[1]) : undefined;

  // term years (15, 30, etc.)
  const termMatch = s.match(/(\d+)\s*(?:yr|year|years|y)\b/);
  const termYears = termMatch ? parseInt(termMatch[1], 10) : undefined;

  // amounts like $500k, 500,000, 400k loan
  const moneyK = s.match(/(\d+(?:\.\d+)?)\s*k\b/);
  const moneyPlain = s.match(/\$?\s*([\d,]+)\b/);

  let amount: number | undefined;
  if (moneyK) amount = parseFloat(moneyK[1]) * 1000;
  else if (moneyPlain) amount = parseFloat(moneyPlain[1].replace(/,/g, ''));

  // down %
  const downMatch = s.match(/(\d+(?:\.\d+)?)\s*%\s*(?:down|dp)/);
  const downPercent = downMatch ? parseFloat(downMatch[1]) : undefined;

  const mentionsLoan = /\bloan\b/.test(s);
  const mentionsPayment = /\b(payment|p&i|principal\s*&\s*interest)\b/.test(s);

  return {
    annualRatePct,
    termYears,
    amount,
    downPercent,
    mentionsLoan,
    mentionsPayment,
  };
}

function buildCalcUrl(path: string, params: Record<string, unknown>) {
  const u = new URL(
    path,
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
  );
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  });
  return u.toString();
}

async function fetchPayment(q: string) {
  const parsed = parseCalcIntent(q);
  const patched: Record<string, any> = {
    purchasePrice: undefined as number | undefined,
    loanAmount: undefined as number | undefined,
    downPercent: parsed.downPercent,
    annualRatePct: parsed.annualRatePct,
    termYears: parsed.termYears ?? 30,
  };

  // If user said "loan 400k at 7% 30 yr", treat 400k as loanAmount.
  if (parsed.mentionsLoan && isFiniteNum(parsed.amount)) {
    patched.loanAmount = parsed.amount;
  } else if (isFiniteNum(parsed.amount)) {
    patched.purchasePrice = parsed.amount;
  }

  // Guard: if we have loanAmount but no purchasePrice, assume 0% down
  if (isFiniteNum(patched.loanAmount) && !isFiniteNum(patched.purchasePrice)) {
    patched.purchasePrice = patched.loanAmount;
    if (!isFiniteNum(patched.downPercent)) patched.downPercent = 0;
  }

  const url = buildCalcUrl('/api/calc/payment', patched);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Calc request failed: ${res.status}`);
  return res.json();
}

/* =========================
   Page
   ========================= */
export default function Page() {
  const [input, setInput] = useState('');
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Load threads on mount
  useEffect(() => {
    const t = loadThreads();
    setThreads(t);
    setActiveId(t[0]?.id ?? 'default');
  }, []);

  // Save threads when changed
  useEffect(() => {
    saveThreads(threads);
  }, [threads]);

  // Hotkeys: Cmd/Ctrl+K for overlay, ignore while typing
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          (target as HTMLElement).isContentEditable);

      const cmdOrCtrl = e.metaKey || e.ctrlKey;
      if (cmdOrCtrl && e.key.toLowerCase() === 'k' && !isTyping) {
        e.preventDefault();
        setOverlayOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Keep chat scrolled
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  });

  async function handleSend() {
    const q = input.trim();
    if (!q) return;

    const id = activeId ?? 'default';
    const now = Date.now();
    setThreads((prev) => {
      const existing = prev.find((t) => t.id === id);
      if (existing) {
        const clone = [...prev];
        const idx = clone.findIndex((t) => t.id === id);
        const cur = clone[idx];
        clone[idx] = {
          ...cur,
          messages: [...cur.messages, { role: 'user', content: q, at: now }],
          updatedAt: now,
        };
        return clone.sort((a, b) => b.updatedAt - a.updatedAt);
      }
      return [
        { id, messages: [{ role: 'user', content: q, at: now }], updatedAt: now },
        ...prev,
      ];
    });
    setActiveId(id);
    setInput('');

    try {
      const looksCalc =
        /\bpayment\b|\bp&i\b|\bprincipal\s*&\s*interest\b|\bloan\b|\bdown\b|\b%/.test(
          q.toLowerCase()
        );
      if (looksCalc) {
        const data = await fetchPayment(q);
        const tldr = formatPaymentTLDR(data);
        appendAssistant(id, tldr);
      } else {
        appendAssistant(
          id,
          `You asked: "${q}". Try: payment $500k with 20% down at 6.5% for 30 years`
        );
      }
    } catch (err: any) {
      appendAssistant(id, `Calc error: ${err?.message ?? 'unknown error'}`);
    }
  }

  function appendAssistant(id: string, content: string) {
    const now = Date.now();
    setThreads((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx === -1) return prev;
      const clone = [...prev];
      const cur = clone[idx];
      clone[idx] = {
        ...cur,
        messages: [...cur.messages, { role: 'assistant', content, at: now }],
        updatedAt: now,
      };
      return clone.sort((a, b) => b.updatedAt - a.updatedAt);
    });
  }

  const messages = threads.find((t) => t.id === activeId)?.messages ?? [];

  return (
    <div className="flex h-[100dvh]">
      {/* Left rail */}
      <aside className="hidden md:block w-64 border-r bg-white">
        <Sidebar />
      </aside>

      {/* Main column */}
      <section className="main flex-1 h-[100dvh] overflow-y-auto flex flex-col">
        {/* Header (visibly different: pinned, subtle shadow) */}
        <header className="sticky top-0 z-10 px-4 py-3 bg-white/90 backdrop-blur border-b shadow-[0_1px_0_0_rgba(0,0,0,0.02)] flex items-center justify-between">
          <div className="font-medium">HomeRates.Ai — Chat & Calculators</div>
          <button
            className="px-3 py-1.5 rounded border text-sm hover:bg-zinc-50"
            onClick={() => setOverlayOpen(true)}
            aria-label="Open overlay"
          >
            Open Search (Cmd/Ctrl+K)
          </button>
        </header>

        {/* Scrollable chat area */}
        <div ref={scrollRef} className="scroll flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-sm text-zinc-500">
                Ask: <code>payment $500k with 20% down at 6.5% for 30 years</code>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`rounded-2xl px-3 py-2 ${m.role === 'user'
                    ? 'bg-zinc-100'
                    : 'bg-white border shadow-sm'
                  }`}
              >
                <div className="text-[12px] opacity-60 mb-1">{m.role}</div>
                <div className="whitespace-pre-wrap">{m.content}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Composer (sticky, visible) */}
        <div className="composer px-4 py-3 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/70 border-t sticky bottom-0">
          <div className="max-w-3xl mx-auto flex gap-2">
            <textarea
              ref={composerRef}
              className="flex-1 min-h-[44px] max-h-40 p-2 rounded border outline-none"
              placeholder="Type a question…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button
              onClick={handleSend}
              className="px-4 h-[44px] rounded bg-black text-white"
            >
              Send
            </button>
          </div>
        </div>
      </section>

      {/* Overlay (click scrim to close) */}
      {overlayOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOverlayOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)' }}
          className="z-50 flex items-start md:items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl rounded-2xl bg-white shadow-xl border p-4"
          >
            <div className="text-sm font-medium mb-2">Quick Search</div>
            <input
              className="w-full border rounded p-2"
              placeholder="Type to search… (click backdrop to close)"
              autoFocus
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================
   TL;DR formatter for API result
   ========================= */
function formatPaymentTLDR(data: any) {
  // Expected payload:
  // { monthlyPI, monthlyTax, monthlyIns, monthlyHOA, monthlyMI, monthlyTotalPITI, sensitivity: { up025, down025 } }
  const pi = fmt(data?.monthlyPI);
  const piti = fmt(data?.monthlyTotalPITI);
  const up = fmt(data?.sensitivity?.up025);
  const dn = fmt(data?.sensitivity?.down025);

  return [
    'TL;DR — Payment',
    pi && `• P&I: ${pi}/mo`,
    piti && `• PITI: ${piti}/mo`,
    (up || dn) && `• Sensitivity: +0.25% → ${up} | -0.25% → ${dn}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function fmt(n: unknown) {
  if (!isFiniteNum(n)) return null;
  return (n as number).toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}
