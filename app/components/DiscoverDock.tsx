'use client';
// app/components/DiscoverDock.tsx
// HomeRates Discover — 4-chip sequential evaluation dock.
// Matches preview-discover-v2.html exactly.

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  getQuestions,
  DISCLOSURE_TEXT,
  type LoanTypeKey,
  type ScenarioSnapshot,
  type GapStatus,
} from '../../lib/discoverQuestions';

const GAP_COLORS: Record<GapStatus, { bg: string; border: string; text: string; label: string }> = {
  match:   { bg: 'rgba(0,232,122,0.05)',   border: 'rgba(0,232,122,0.18)',   text: '#00e87a', label: '✓ Match'   },
  check:   { bg: 'rgba(251,191,36,0.06)',  border: 'rgba(251,191,36,0.22)',  text: '#fbbf24', label: '⚡ Review'  },
  alert:   { bg: 'rgba(248,113,113,0.06)', border: 'rgba(248,113,113,0.22)', text: '#f87171', label: '⚠ Alert'   },
  pending: { bg: 'transparent',            border: 'rgba(148,163,184,0.13)', text: 'rgba(185,208,192,0.30)', label: '⏳ Pending' },
};

const LOAN_LABELS: Record<LoanTypeKey, string> = {
  fha: 'FHA', conventional: 'Conventional', va: 'VA', jumbo: 'Jumbo',
};

const DEFAULT_DOWN: Record<LoanTypeKey, string> = {
  fha: '3.5', conventional: '5', va: '0', jumbo: '20',
};

type AiMsg = { q: string; a: string; loading?: boolean };

type Props = {
  loanType?:          LoanTypeKey;
  scenario?:          ScenarioSnapshot;
  threadId?:          string;
  sentChipIds?:       string[];              // chips already sent (derived from thread messages by page)
  loRepliedChipIds?:  string[];              // chips where the LO has already replied in chat
  loReplies?:         Record<string, string>; // chipId → LO's reply text for auto-analysis
};

// Extract the key answer value from an LO's free-text chat reply.
// Always returns something when the LO has replied — never leaves the dock
// waiting for the borrower to manually act.
function extractFromReply(inputType: string, text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (inputType === 'pct') {
    // Strip APR values first — APR is compliance disclosure; comparison is the interest rate for P&I
    const stripped = trimmed.replace(/APR\s*(?:of\s*|:?\s*)(\d+\.\d+)\s*%/gi, '');
    const matches  = Array.from(stripped.matchAll(/(\d+\.\d+)\s*%/g));
    const rates    = matches.map(m => parseFloat(m[1])).filter(v => v >= 1 && v <= 20);
    // If a specific rate was found, return it; else return the LO's reply for analysis
    return rates.length > 0 ? String(rates[0]) : trimmed.slice(0, 150);
  }
  if (inputType === 'dollar') {
    const matches = Array.from(trimmed.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g));
    const vals    = matches.map(m => parseFloat(m[1].replace(/,/g, ''))).filter(v => v > 1000);
    return vals.length > 0 ? String(Math.max(...vals)) : trimmed.slice(0, 150);
  }
  // text / number chips
  const dayMatch = trimmed.match(/(\d+)\s*(?:to\s*\d+\s*)?days?/i);
  if (dayMatch) return dayMatch[0].trim();
  return trimmed.slice(0, 200);
}

function buildSnapshot(price: number, downPct: number, rate: number, lt: LoanTypeKey): ScenarioSnapshot {
  const term      = 30;
  const down      = price * downPct / 100;
  const baseLoan  = price - down;
  const loanAmt   = lt === 'fha' ? baseLoan * 1.0175 : baseLoan;
  const ltv       = baseLoan / price;
  const r         = rate / 100 / 12;
  const n         = term * 12;
  const pi        = r > 0 ? (loanAmt * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : loanAmt / n;
  const monthlyMIP = lt === 'fha' && ltv > 0.90 ? loanAmt * 0.0055 / 12
    : lt === 'fha' ? loanAmt * 0.0050 / 12 : undefined;
  const monthlyPMI = lt === 'conventional' && ltv > 0.80 ? loanAmt * 0.005 / 12 : undefined;
  return {
    price, loanAmount: loanAmt, downPct, rate, term, ltv,
    monthlyPayment: pi + (monthlyMIP ?? 0) + (monthlyPMI ?? 0),
    monthlyMIP, monthlyPMI,
  };
}

export default function DiscoverDock({ loanType: propLoanType, scenario: propScenario, threadId, sentChipIds = [], loRepliedChipIds = [], loReplies = {} }: Props) {
  // ── Session ──────────────────────────────────────────────────────────────
  const [sessionId, setSessionId]   = useState<string | null>(null);
  const sessionCreatedRef           = useRef(false);

  // ── Setup form (when no propScenario) ────────────────────────────────────
  const [localLoanType, setLocalLoanType] = useState<LoanTypeKey>(propLoanType ?? 'conventional');
  const [localScenario, setLocalScenario] = useState<ScenarioSnapshot | null>(propScenario ?? null);
  const [setupPrice, setSetupPrice]       = useState('');
  const [setupDown, setSetupDown]         = useState(DEFAULT_DOWN[propLoanType ?? 'conventional']);
  const [setupRate, setSetupRate]         = useState('');
  const [setupError, setSetupError]       = useState('');

  // ── Active state ─────────────────────────────────────────────────────────
  const activeLoanType: LoanTypeKey     = propLoanType ?? localLoanType;
  const activeScenario: ScenarioSnapshot | null = propScenario ?? localScenario;
  const needsSetup = !activeScenario;

  const questions = getQuestions(activeLoanType);

  // ── Chip state ───────────────────────────────────────────────────────────
  const [localSentChips, setLocalSentChips] = useState<string[]>([]);
  const [sendingChip, setSendingChip]       = useState<string | null>(null);
  const [inputs, setInputs]                 = useState<Record<string, string>>({});

  // ── Live FRED benchmark rate ─────────────────────────────────────────────
  const [fredRate, setFredRate] = useState<number | null>(null);
  const fredFetchedRef = useRef(false);

  // ── Auto-extract tracking ────────────────────────────────────────────────
  const processedRepliesRef = useRef<Set<string>>(new Set());

  const allSentChips   = [...new Set([...sentChipIds, ...localSentChips])];
  const nextChipIndex  = allSentChips.length;

  // ── Disclosure ───────────────────────────────────────────────────────────
  const [showDisclosure, setShowDisclosure] = useState(false);
  const disclosureChecked = useRef(false);

  // ── Ask AI ───────────────────────────────────────────────────────────────
  const [askAiOpen, setAskAiOpen]   = useState(false);
  const [askAiInput, setAskAiInput] = useState('');
  const [aiMessages, setAiMessages] = useState<AiMsg[]>([]);
  const aiConvoRef = useRef<HTMLDivElement>(null);

  // ── Per-chip AI analysis of LO replies ───────────────────────────────────
  const [aiNotes, setAiNotes]       = useState<Record<string, string>>({});
  const [aiNoteLoading, setAiNoteLoading] = useState<Record<string, boolean>>({});

  // ─────────────────────────────────────────────────────────────────────────
  // Auto-create session when scenario is available
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (propScenario && propLoanType && !sessionCreatedRef.current) {
      sessionCreatedRef.current = true;
      createSession(propLoanType, propScenario);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propScenario]);

  // Show disclosure on first encounter with an active scenario
  useEffect(() => {
    if (activeScenario && !disclosureChecked.current) {
      disclosureChecked.current = true;
      const accepted = typeof window !== 'undefined' && localStorage.getItem('hr_discover_v2_disclosed');
      if (!accepted) setShowDisclosure(true);
    }
  }, [activeScenario]);

  // Scroll AI convo to bottom when new messages arrive
  useEffect(() => {
    if (aiConvoRef.current) aiConvoRef.current.scrollTop = aiConvoRef.current.scrollHeight;
  }, [aiMessages]);

  // Fetch live FRED 30yr benchmark rate (once, when scenario is active)
  useEffect(() => {
    if (!activeScenario || fredFetchedRef.current) return;
    fredFetchedRef.current = true;
    fetch('/api/fred')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.ok && d.mort30Avg) setFredRate(d.mort30Avg); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!activeScenario]);

  // Auto-extract lender answers from LO's chat replies — always sets something
  // so the borrower never needs to manually enter or press anything.
  // If the extraction produces non-numeric text (LO didn't quote a number),
  // also triggers AI analysis for richer, contextual feedback.
  useEffect(() => {
    const entries = Object.entries(loReplies);
    if (entries.length === 0) return;
    const toProcess = entries.filter(
      ([chipId]) => !processedRepliesRef.current.has(chipId)
    );
    if (toProcess.length === 0) return;

    const extracted: Record<string, string> = {};
    const needsAiAnalysis: Array<{ chipId: string; replyText: string }> = [];

    for (const [chipId, replyText] of toProcess) {
      processedRepliesRef.current.add(chipId);
      const q   = questions.find(q => q.id === chipId);
      if (!q) continue;
      const val = extractFromReply(q.inputType, replyText);
      if (val) {
        extracted[chipId] = val;
        // For pct/dollar chips: if the extracted value is non-numeric, use AI to analyze
        if ((q.inputType === 'pct' || q.inputType === 'dollar') && isNaN(parseFloat(val))) {
          needsAiAnalysis.push({ chipId, replyText });
        }
      }
    }

    if (Object.keys(extracted).length > 0) {
      setInputs(prev => ({ ...prev, ...extracted }));
    }
    // Kick off AI analysis for non-numeric replies (async, non-blocking)
    for (const { chipId, replyText } of needsAiAnalysis) {
      analyzeLoReply(chipId, replyText);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loReplies]);

  // ─────────────────────────────────────────────────────────────────────────
  // Session management
  // ─────────────────────────────────────────────────────────────────────────
  async function createSession(lt: LoanTypeKey, snap: ScenarioSnapshot) {
    try {
      const res = await fetch('/api/discover/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loanType: lt, scenarioSnapshot: snap }),
      });
      if (res.ok) { const { id } = await res.json(); setSessionId(id); }
    } catch { /* non-blocking */ }
  }

  async function ensureSession(): Promise<string | null> {
    if (sessionId) return sessionId;
    if (!activeScenario || !activeLoanType) return null;
    try {
      const res = await fetch('/api/discover/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loanType: activeLoanType, scenarioSnapshot: activeScenario }),
      });
      if (res.ok) {
        const { id } = await res.json();
        setSessionId(id);
        return id;
      }
    } catch { /* non-blocking */ }
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Chip tap — send question to LO thread
  // ─────────────────────────────────────────────────────────────────────────
  async function handleChipSend(chipId: string) {
    if (!threadId || sendingChip) return;
    setSendingChip(chipId);
    try {
      const sid = await ensureSession();
      if (!sid) { setSendingChip(null); return; }
      const res = await fetch(`/api/discover/session/${sid}/fire-to-pe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, questionId: chipId }),
      });
      if (res.ok) {
        setLocalSentChips(prev => [...prev, chipId]);
      }
    } catch { /* non-blocking */ } finally {
      setSendingChip(null);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lender answer input
  // ─────────────────────────────────────────────────────────────────────────
  async function saveInput(questionId: string, value: string) {
    if (!value.trim() || !activeScenario) return;
    const sid = sessionId;
    if (!sid) return;
    const snap = benchmarkSnap ?? activeScenario;
    const q    = questions.find(q => q.id === questionId);
    const gap  = q ? q.evaluateGap(value, snap) : { status: 'pending' as GapStatus, note: '' };
    try {
      await fetch(`/api/discover/session/${sid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, raw: value, gapStatus: gap.status, gapNote: gap.note }),
      });
    } catch { /* silent */ }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Ask AI
  // ─────────────────────────────────────────────────────────────────────────
  async function handleAskAi() {
    const q = askAiInput.trim();
    if (!q || !activeScenario) return;
    setAskAiInput('');
    const placeholder: AiMsg = { q, a: '', loading: true };
    setAiMessages(prev => [...prev, placeholder]);
    try {
      const res = await fetch('/api/discover/ai-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, loanType: activeLoanType, scenario: activeScenario }),
      });
      const data = await res.json();
      const answer = res.ok ? (data.answer ?? 'No answer returned.') : 'AI temporarily unavailable. Try again in a moment.';
      setAiMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { q, a: answer } : m));
    } catch {
      setAiMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { q, a: 'Could not reach AI. Check your connection.' } : m));
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AI analysis of LO reply (called when extraction produces non-numeric text)
  // ─────────────────────────────────────────────────────────────────────────
  async function analyzeLoReply(chipId: string, loReply: string) {
    if (!benchmarkSnap && !activeScenario) return;
    const snap = benchmarkSnap ?? activeScenario!;
    const q    = questions.find(q => q.id === chipId);
    if (!q) return;
    setAiNoteLoading(prev => ({ ...prev, [chipId]: true }));
    try {
      const res = await fetch('/api/discover/analyze-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loReply,
          chipTitle:     q.title,
          chipSubtopics: q.subtopics,
          loanType:      activeLoanType,
          scenario:      snap,
        }),
      });
      const data = await res.json();
      if (data.analysis) {
        setAiNotes(prev => ({ ...prev, [chipId]: data.analysis }));
      }
    } catch { /* silent */ } finally {
      setAiNoteLoading(prev => ({ ...prev, [chipId]: false }));
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Setup form
  // ─────────────────────────────────────────────────────────────────────────
  function handleLoanTypeChange(lt: LoanTypeKey) {
    setLocalLoanType(lt);
    setSetupDown(DEFAULT_DOWN[lt]);
  }

  function handleSetup() {
    const price = parseFloat(setupPrice.replace(/[$,]/g, ''));
    const down  = parseFloat(setupDown);
    const rate  = parseFloat(setupRate);
    if (!price || price < 50_000)      { setSetupError('Enter a valid purchase price'); return; }
    if (isNaN(down) || down < 0)       { setSetupError('Enter a valid down payment %'); return; }
    if (!rate || rate < 1 || rate > 20){ setSetupError('Enter a valid rate (e.g. 6.875)'); return; }
    setSetupError('');
    const snap = buildSnapshot(price, down, rate, localLoanType);
    setLocalScenario(snap);
    createSession(localLoanType, snap);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Benchmark snapshot — FRED rate required; never uses stale scenario card_rate
  // ─────────────────────────────────────────────────────────────────────────
  const benchmarkSnap: ScenarioSnapshot | null = activeScenario && fredRate
    ? { ...activeScenario, rate: fredRate }
    : null;

  // ─────────────────────────────────────────────────────────────────────────
  // Derived badge
  // ─────────────────────────────────────────────────────────────────────────
  const gaps = benchmarkSnap
    ? questions.map(q => q.evaluateGap(inputs[q.id] ?? '', benchmarkSnap))
    : questions.map(() => ({ status: 'pending' as GapStatus, note: '' }));

  const alertCount   = gaps.filter(g => g.status === 'alert').length;
  const checkCount   = gaps.filter(g => g.status === 'check').length;
  const matchCount   = gaps.filter(g => g.status === 'match').length;
  const pendingCount = gaps.filter(g => g.status === 'pending').length;

  const badge = needsSetup
    ? { text: 'Set up scenario', color: 'rgba(148,163,184,0.50)', bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.12)' }
    : alertCount > 0
    ? { text: `${alertCount} alert${alertCount > 1 ? 's' : ''}`, color: '#f87171', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.28)' }
    : checkCount > 0
    ? { text: `${checkCount} to review`, color: '#fbbf24', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.28)' }
    : pendingCount === questions.length
    ? { text: 'Ask your lender', color: '#a78bfa', bg: 'rgba(139,92,246,0.10)', border: 'rgba(139,92,246,0.28)' }
    : { text: `${matchCount}/${questions.length} done`, color: '#00e87a', bg: 'rgba(0,232,122,0.10)', border: 'rgba(0,232,122,0.28)' };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Disclosure modal */}
      {showDisclosure && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: 20,
        }}>
          <div style={{
            background: '#0d1420', border: '1px solid rgba(148,163,184,0.20)',
            borderRadius: 14, maxWidth: 440, width: '100%', padding: '26px 22px',
          }}>
            <div style={{ color: '#f0f4ff', fontWeight: 700, fontSize: 15, marginBottom: 10 }}>
              🔍 About HomeRates Discover
            </div>
            <p style={{ color: 'rgba(185,208,192,0.75)', fontSize: 12.5, lineHeight: 1.7, margin: '0 0 18px' }}>
              {DISCLOSURE_TEXT}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { localStorage.setItem('hr_discover_v2_disclosed', '1'); setShowDisclosure(false); }} style={{
                flex: 1, padding: '10px 0', borderRadius: 8,
                background: 'rgba(0,232,122,0.14)', color: '#00e87a',
                fontWeight: 700, fontSize: 13, cursor: 'pointer',
                border: '1px solid rgba(0,232,122,0.28)',
              } as React.CSSProperties}>I understand — continue</button>
              <button onClick={() => setShowDisclosure(false)} style={{
                padding: '10px 16px', borderRadius: 8, background: 'none',
                border: '1px solid rgba(148,163,184,0.15)',
                color: 'rgba(148,163,184,0.60)', fontSize: 13, cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Dock shell */}
      <div className="dd-shell">
        {/* Header */}
        <div className="dd-header">
          <span style={{ fontSize: 15 }}>🔍</span>
          <span className="dd-header-title">Discover</span>
          <span className="dd-header-sub">
            {needsSetup ? 'compare your lender quote to AI benchmark' : `${LOAN_LABELS[activeLoanType]} · AI benchmark`}
          </span>
          <span className="dd-badge" style={{ background: badge.bg, border: `1px solid ${badge.border}`, color: badge.color }}>
            {badge.text}
          </span>
        </div>

        {/* Setup form — shown when no scenario */}
        {needsSetup && (
          <div className="dd-setup">
            <p className="dd-setup-intro">Enter your loan details to benchmark your lender&apos;s quote.</p>

            <div className="dd-setup-loan-types">
              {(['fha', 'conventional', 'va', 'jumbo'] as LoanTypeKey[]).map(lt => (
                <button key={lt} onClick={() => handleLoanTypeChange(lt)} className={`dd-lt-btn ${localLoanType === lt ? 'active' : ''}`}>
                  {LOAN_LABELS[lt]}
                </button>
              ))}
            </div>

            <div className="dd-setup-fields">
              {[
                { label: 'Purchase Price',  placeholder: 'e.g. 650000',            value: setupPrice, set: setSetupPrice },
                { label: 'Down Payment %',  placeholder: DEFAULT_DOWN[localLoanType], value: setupDown,  set: setSetupDown },
                { label: 'Rate Quoted %',   placeholder: 'e.g. 6.875',             value: setupRate,  set: setSetupRate },
              ].map(f => (
                <div key={f.label} className="dd-setup-field">
                  <label className="dd-field-label">{f.label}</label>
                  <input
                    type="text" placeholder={f.placeholder} value={f.value}
                    onChange={e => f.set(e.target.value)}
                    className="dd-field-input"
                  />
                </div>
              ))}
            </div>

            {setupError && <div className="dd-setup-error">{setupError}</div>}
            <button onClick={handleSetup} className="dd-setup-btn">Start Discover →</button>
          </div>
        )}

        {/* Active scenario view */}
        {!needsSetup && activeScenario && (
          <>
            {/* Scenario strip */}
            <div className="dd-scen-strip">
              {[
                { val: `$${Math.round(activeScenario.price).toLocaleString()}`,             lbl: 'Purchase' },
                { val: `${activeScenario.downPct}% down`,                                   lbl: 'Down' },
                { val: fredRate ? `${fredRate.toFixed(3)}%` : '…',                          lbl: 'FRED Benchmark' },
                { val: `$${Math.round(activeScenario.monthlyPayment).toLocaleString()}/mo`, lbl: 'Est. P&I' },
              ].map(item => (
                <div key={item.lbl} className="dd-scen-item">
                  <span className="dd-scen-val">{item.val}</span>
                  <span className="dd-scen-lbl">{item.lbl}</span>
                </div>
              ))}
            </div>

            <div className="dd-section-lbl">Evaluation questions · tap next chip to ask lender</div>

            {/* Question chips */}
            <div className="dd-chips">
              {questions.map((q, i) => {
                const isSent      = allSentChips.includes(q.id);
                const isNext      = !isSent && i === nextChipIndex;
                const inputVal    = inputs[q.id] ?? '';
                const gap         = gaps[i];
                const gapStyle    = GAP_COLORS[gap.status];
                const isSending   = sendingChip === q.id;
                const loReplied   = loRepliedChipIds.includes(q.id);

                let chipClass = 'dd-chip';
                if (isSent)  chipClass += ' sent';
                else if (isNext) chipClass += ' next';
                else chipClass += ' idle';
                if (isSent && inputVal) chipClass += ` answered-${gap.status}`;

                // Pill
                let pillClass = 'dd-pill ';
                let pillText  = '';
                if (!isSent && isNext)         { pillClass += 'pill-next';  pillText = isSending ? 'Sending…' : 'Tap to ask'; }
                else if (!isSent)              { pillClass += 'pill-idle';  pillText = 'Pending'; }
                else if (!inputVal && loReplied) { pillClass += 'pill-reply'; pillText = 'Enter answer'; }
                else if (!inputVal)            { pillClass += 'pill-sent';  pillText = 'Waiting…'; }
                else                           { pillClass += `pill-${gap.status}`; pillText = gapStyle.label; }

                return (
                  <div key={q.id} className={chipClass}>
                    <button
                      className="dd-chip-top"
                      disabled={!isNext || isSending || !threadId}
                      onClick={() => handleChipSend(q.id)}
                    >
                      <span className="dd-chip-icon">{q.icon}</span>
                      <span className="dd-chip-title">{q.title}</span>
                      <span className={pillClass}>{pillText}</span>
                    </button>
                    <div className="dd-chip-subtopics">{q.subtopics}</div>

                    {/* Expanded cell — shown once sent */}
                    {isSent && benchmarkSnap && (
                      <div className="dd-expand">
                        <div className="dd-expand-grid">
                          {/* AI cell */}
                          <div className="dd-cell dd-cell-ai">
                            <div className="dd-cell-col ai">HomeRates AI</div>
                            <div className="dd-cell-val ai">{q.aiValue(benchmarkSnap)}</div>
                            <div className="dd-cell-sub">{q.aiSub(benchmarkSnap)}</div>
                          </div>

                          {/* Lender cell */}
                          <div className={`dd-cell dd-cell-lo${inputVal ? ` filled ${gap.status}` : ''}`}>
                            <div className="dd-cell-col lo">Your Lender</div>
                            {inputVal ? (
                              <div className="dd-cell-val lo" style={{ color: gapStyle.text, fontSize: inputVal.length > 30 ? 11 : 14 }}>
                                {inputVal.length > 80 ? inputVal.slice(0, 80) + '…' : inputVal}
                              </div>
                            ) : (
                              <input
                                type={q.inputType === 'pct' || q.inputType === 'number' ? 'number' : 'text'}
                                step={q.inputType === 'pct' ? '0.001' : q.inputType === 'number' ? '0.5' : undefined}
                                placeholder={typeof q.inputPlaceholder === 'function'
                                  ? (q.inputPlaceholder as (s: ScenarioSnapshot) => string)(activeScenario)
                                  : (q.inputPlaceholder as string)}
                                className="dd-lo-input"
                                onBlur={e => {
                                  const v = e.target.value.trim();
                                  if (v) {
                                    setInputs(prev => ({ ...prev, [q.id]: v }));
                                    saveInput(q.id, v);
                                  }
                                }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    const v = (e.target as HTMLInputElement).value.trim();
                                    if (v) {
                                      setInputs(prev => ({ ...prev, [q.id]: v }));
                                      saveInput(q.id, v);
                                    }
                                  }
                                }}
                              />
                            )}
                          </div>
                        </div>

                        {/* Waiting / action prompt */}
                        {!inputVal && (
                          loReplied ? (
                            <div className="dd-waiting reply">
                              <span style={{ fontSize: 12 }}>💬</span>
                              LO replied in chat — enter their answer above for AI analysis
                            </div>
                          ) : (
                            <div className="dd-waiting">
                              <span className="dd-dots"><span /><span /><span /></span>
                              Waiting for lender to reply in chat
                            </div>
                          )
                        )}

                        {/* AI analysis bar */}
                        {inputVal && (
                          <div className={`dd-analysis ${aiNoteLoading[q.id] ? 'loading' : gap.status}`}>
                            {aiNoteLoading[q.id] ? (
                              <>
                                <span className="dd-analysis-icon">✨</span>
                                <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
                                  Analyzing response
                                  <span className="dd-dots" style={{ marginLeft: 4 }}><span /><span /><span /></span>
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="dd-analysis-icon">
                                  {gap.status === 'match' ? '✓' : gap.status === 'check' ? '⚡' : '⚠'}
                                </span>
                                <span style={{ whiteSpace: 'pre-wrap' }}>
                                  {aiNotes[q.id] ?? gap.note}
                                </span>
                              </>
                            )}
                          </div>
                        )}

                        {/* Edit link if filled */}
                        {inputVal && (
                          <button
                            className="dd-edit-btn"
                            onClick={() => setInputs(prev => { const n = { ...prev }; delete n[q.id]; return n; })}
                          >
                            Edit answer
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Ask AI section */}
            <div className="dd-ask-ai">
              <button className="dd-ask-ai-hdr" onClick={() => setAskAiOpen(v => !v)}>
                <span style={{ fontSize: 14 }}>✨</span>
                <span className="dd-ask-ai-title">Ask AI about your scenario</span>
                <span className="dd-ask-ai-sub">Open research · any question</span>
                <span className="dd-ask-ai-arrow">{askAiOpen ? '▲' : '▼'}</span>
              </button>

              {askAiOpen && (
                <div className="dd-ask-ai-body">
                  {aiMessages.length > 0 && (
                    <div className="dd-ai-convo" ref={aiConvoRef}>
                      {aiMessages.map((m, i) => (
                        <div key={i} className="dd-ai-turn">
                          <div className="dd-ai-turn-lbl">You asked</div>
                          <div className="dd-ai-q">{m.q}</div>
                          <div className="dd-ai-turn-lbl">HomeRates AI</div>
                          {m.loading
                            ? <div className="dd-ai-loading"><span /><span /><span /></div>
                            : <div className="dd-ai-a">{m.a}</div>
                          }
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="dd-ask-row">
                    <textarea
                      className="dd-ask-input"
                      rows={2}
                      placeholder="e.g. Is this rate competitive for a 740 credit score buyer in my area right now?"
                      value={askAiInput}
                      onChange={e => setAskAiInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAskAi(); } }}
                    />
                    <button className="dd-ask-send" onClick={handleAskAi} disabled={!askAiInput.trim()}>Ask</button>
                  </div>
                  <div className="dd-ask-disclaimer">AI uses your scenario data. Not financial advice.</div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="dd-footer">
          The goal is not to avoid lenders — it&apos;s to choose who has earned the right to advise you.
        </div>
      </div>

      <style>{`
        .dd-shell {
          background: #090e1a;
          border: 1px solid rgba(148,163,184,0.13);
          border-radius: 14px;
          display: flex;
          flex-direction: column;
          font-family: 'DM Sans', system-ui, sans-serif;
          font-size: 13px;
          overflow: hidden;
        }

        /* Header */
        .dd-header {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 12px 15px;
          border-bottom: 1px solid rgba(148,163,184,0.08);
          flex-shrink: 0;
        }
        .dd-header-title { font-size: 12.5px; font-weight: 700; color: #c8dfc8; }
        .dd-header-sub   { font-size: 11px; color: rgba(148,163,184,0.45); }
        .dd-badge {
          margin-left: auto;
          font-size: 10px; font-weight: 600;
          padding: 2px 9px; border-radius: 20px;
          white-space: nowrap; flex-shrink: 0;
          transition: all 0.2s;
        }

        /* Setup form */
        .dd-setup {
          padding: 14px 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          border-top: 1px solid rgba(148,163,184,0.07);
        }
        .dd-setup-intro { font-size: 12px; color: rgba(185,208,192,0.65); line-height: 1.5; }
        .dd-setup-loan-types { display: flex; gap: 6px; flex-wrap: wrap; }
        .dd-lt-btn {
          padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 600;
          cursor: pointer; transition: all 0.15s;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(148,163,184,0.15);
          color: rgba(148,163,184,0.65);
          font-family: inherit;
        }
        .dd-lt-btn.active {
          background: rgba(0,232,122,0.14);
          border-color: rgba(0,232,122,0.32);
          color: #00e87a;
        }
        .dd-setup-fields { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
        .dd-setup-field  { display: flex; flex-direction: column; gap: 4px; }
        .dd-field-label  { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(148,163,184,0.45); }
        .dd-field-input  {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(148,163,184,0.18);
          border-radius: 6px; padding: 7px 8px;
          color: #e2e8f0; font-size: 13px; outline: none;
          font-family: inherit;
        }
        .dd-field-input::placeholder { color: rgba(148,163,184,0.30); }
        .dd-setup-error  { font-size: 11.5px; color: #f87171; }
        .dd-setup-btn    {
          padding: 9px 18px; border-radius: 8px;
          background: rgba(0,232,122,0.14);
          border: 1px solid rgba(0,232,122,0.28);
          color: #00e87a; font-size: 12.5px; font-weight: 700;
          cursor: pointer; align-self: flex-start;
          font-family: inherit;
        }

        /* Scenario strip */
        .dd-scen-strip {
          padding: 8px 14px;
          background: rgba(0,232,122,0.04);
          border-bottom: 1px solid rgba(0,232,122,0.09);
          display: flex; gap: 14px; flex-wrap: wrap;
          flex-shrink: 0;
        }
        .dd-scen-item { display: flex; flex-direction: column; gap: 1px; }
        .dd-scen-val  { font-size: 13px; font-weight: 700; color: #f0f4ff; }
        .dd-scen-lbl  { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(148,163,184,0.42); font-weight: 600; }

        .dd-section-lbl {
          padding: 10px 14px 5px;
          font-size: 9.5px; font-weight: 700;
          letter-spacing: 0.09em; text-transform: uppercase;
          color: rgba(148,163,184,0.35);
          flex-shrink: 0;
        }

        /* Chips */
        .dd-chips { padding: 0 10px 10px; display: flex; flex-direction: column; gap: 6px; }
        .dd-chip  {
          border-radius: 9px; overflow: hidden;
          border: 1px solid rgba(148,163,184,0.10);
          transition: border-color 0.15s;
        }
        .dd-chip.next            { border-color: rgba(139,92,246,0.28); }
        .dd-chip.sent            { border-color: rgba(139,92,246,0.22); }
        .dd-chip.answered-match  { border-color: rgba(0,232,122,0.28); }
        .dd-chip.answered-check  { border-color: rgba(251,191,36,0.28); }
        .dd-chip.answered-alert  { border-color: rgba(248,113,113,0.30); }

        .dd-chip-top {
          display: flex; align-items: center; gap: 8px;
          padding: 9px 11px;
          background: none; border: none; width: 100%; text-align: left;
          cursor: default; font-family: inherit;
        }
        .dd-chip.next .dd-chip-top:not(:disabled) { cursor: pointer; }
        .dd-chip-icon  { font-size: 14px; flex-shrink: 0; }
        .dd-chip-title { font-size: 12px; font-weight: 600; color: rgba(185,208,192,0.72); flex: 1; }
        .dd-chip.next  .dd-chip-title { color: #c4b5fd; }
        .dd-chip.sent  .dd-chip-title { color: rgba(139,92,246,0.75); }
        .dd-chip.answered-match .dd-chip-title,
        .dd-chip.answered-check .dd-chip-title,
        .dd-chip.answered-alert .dd-chip-title { color: #f0f4ff; }

        .dd-chip-subtopics {
          font-size: 10px; color: rgba(148,163,184,0.38);
          padding: 0 11px 8px 33px; line-height: 1.5;
        }
        .dd-chip.next .dd-chip-subtopics { color: rgba(139,92,246,0.50); }

        /* Pills */
        .dd-pill {
          font-size: 10px; font-weight: 700;
          padding: 2px 8px; border-radius: 20px;
          white-space: nowrap; flex-shrink: 0; margin-left: auto;
        }
        .pill-idle  { background: rgba(148,163,184,0.06); border: 1px solid rgba(148,163,184,0.12); color: rgba(148,163,184,0.35); }
        .pill-next  { background: rgba(139,92,246,0.10); border: 1px solid rgba(139,92,246,0.28); color: #a78bfa; }
        .pill-sent  { background: rgba(139,92,246,0.12); border: 1px solid rgba(139,92,246,0.28); color: #c4b5fd; }
        .pill-reply { background: rgba(251,191,36,0.12); border: 1px solid rgba(251,191,36,0.30); color: #fbbf24; }
        .pill-match { background: rgba(0,232,122,0.10); border: 1px solid rgba(0,232,122,0.28); color: #00e87a; }
        .pill-check { background: rgba(251,191,36,0.10); border: 1px solid rgba(251,191,36,0.28); color: #fbbf24; }
        .pill-alert { background: rgba(248,113,113,0.10); border: 1px solid rgba(248,113,113,0.28); color: #f87171; }

        /* Expanded chip section */
        .dd-expand {
          border-top: 1px solid rgba(148,163,184,0.07);
          padding: 10px 11px 11px;
          display: flex; flex-direction: column; gap: 8px;
        }
        .dd-expand-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .dd-cell {
          border-radius: 7px; padding: 8px 10px;
          display: flex; flex-direction: column; gap: 2px;
          min-height: 52px;
        }
        .dd-cell-ai       { background: rgba(0,232,122,0.04); border: 1px solid rgba(0,232,122,0.13); }
        .dd-cell-lo       { background: rgba(255,255,255,0.02); border: 1px dashed rgba(148,163,184,0.13); }
        .dd-cell-lo.filled       { background: rgba(0,232,122,0.04); border: 1px solid rgba(0,232,122,0.17); }
        .dd-cell-lo.filled.check { background: rgba(251,191,36,0.05); border-color: rgba(251,191,36,0.20); }
        .dd-cell-lo.filled.alert { background: rgba(248,113,113,0.05); border-color: rgba(248,113,113,0.22); }
        .dd-cell-col {
          font-size: 9px; font-weight: 700; letter-spacing: 0.07em;
          text-transform: uppercase; margin-bottom: 3px;
        }
        .dd-cell-col.ai { color: rgba(0,232,122,0.55); }
        .dd-cell-col.lo { color: rgba(148,163,184,0.40); }
        .dd-cell-val { font-size: 14px; font-weight: 700; line-height: 1.2; }
        .dd-cell-val.ai { color: #00e87a; }
        .dd-cell-sub { font-size: 10px; color: rgba(185,208,192,0.42); margin-top: 1px; line-height: 1.4; }

        .dd-lo-input {
          background: transparent; border: none; outline: none;
          font-size: 13px; font-weight: 600; color: rgba(185,208,192,0.55);
          font-family: inherit; width: 100%; padding: 2px 0;
          margin-top: 2px;
        }
        .dd-lo-input::placeholder { color: rgba(148,163,184,0.25); font-style: italic; font-weight: 400; font-size: 11px; }

        /* Waiting dots */
        .dd-waiting {
          display: flex; align-items: center; gap: 6px;
          font-size: 11px; color: rgba(139,92,246,0.60); font-style: italic;
        }
        .dd-waiting.reply {
          color: #fbbf24; font-style: normal; font-weight: 600;
          background: rgba(251,191,36,0.06); border: 1px solid rgba(251,191,36,0.18);
          padding: 6px 9px; border-radius: 6px;
        }
        .dd-dots { display: inline-flex; gap: 3px; align-items: center; }
        .dd-dots span {
          width: 4px; height: 4px; border-radius: 50%; background: #a78bfa;
          animation: dd-pulse 1.2s ease-in-out infinite;
        }
        .dd-dots span:nth-child(2) { animation-delay: 0.2s; }
        .dd-dots span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes dd-pulse { 0%,80%,100%{opacity:.3;transform:scale(.8)} 40%{opacity:1;transform:scale(1)} }

        /* Analysis bar */
        .dd-analysis {
          display: flex; align-items: flex-start; gap: 7px;
          padding: 8px 10px; border-radius: 7px;
          font-size: 11px; line-height: 1.55;
        }
        .dd-analysis.match   { background: rgba(0,232,122,0.07); border: 1px solid rgba(0,232,122,0.18); color: #9de8bc; }
        .dd-analysis.check   { background: rgba(251,191,36,0.07); border: 1px solid rgba(251,191,36,0.18); color: #fde68a; }
        .dd-analysis.alert   { background: rgba(248,113,113,0.07); border: 1px solid rgba(248,113,113,0.18); color: #fca5a5; }
        .dd-analysis.loading { background: rgba(139,92,246,0.06); border: 1px solid rgba(139,92,246,0.18); color: rgba(196,181,253,0.70); }
        .dd-analysis-icon  { font-size: 11px; flex-shrink: 0; margin-top: 1px; }

        .dd-edit-btn {
          align-self: flex-end;
          background: none; border: none; padding: 0;
          font-size: 10px; color: rgba(148,163,184,0.35);
          cursor: pointer; text-decoration: underline; font-family: inherit;
        }
        .dd-edit-btn:hover { color: rgba(148,163,184,0.60); }

        /* Ask AI section */
        .dd-ask-ai {
          margin: 4px 10px 10px;
          border: 1px solid rgba(148,163,184,0.10);
          border-radius: 10px; overflow: hidden;
          flex-shrink: 0;
        }
        .dd-ask-ai-hdr {
          display: flex; align-items: center; gap: 7px;
          padding: 9px 12px;
          background: none; border: none; width: 100%; text-align: left;
          cursor: pointer; font-family: inherit;
        }
        .dd-ask-ai-title { font-size: 12px; font-weight: 600; color: rgba(185,208,192,0.65); }
        .dd-ask-ai-sub   { font-size: 10px; color: rgba(148,163,184,0.40); margin-left: 3px; }
        .dd-ask-ai-arrow { margin-left: auto; font-size: 10px; color: rgba(148,163,184,0.30); }

        .dd-ask-ai-body {
          border-top: 1px solid rgba(148,163,184,0.07);
          padding: 10px 12px 12px;
          display: flex; flex-direction: column; gap: 8px;
        }
        .dd-ai-convo {
          display: flex; flex-direction: column; gap: 8px;
          max-height: 220px; overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(148,163,184,0.15) transparent;
        }
        .dd-ai-turn { display: flex; flex-direction: column; gap: 3px; }
        .dd-ai-turn-lbl { font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(148,163,184,0.35); margin-top: 4px; }
        .dd-ai-q {
          font-size: 11.5px; color: rgba(185,208,192,0.65); line-height: 1.5;
          padding: 6px 9px; background: rgba(255,255,255,0.03);
          border-radius: 6px 6px 6px 2px;
          border: 1px solid rgba(148,163,184,0.08);
        }
        .dd-ai-a {
          font-size: 11.5px; color: #9de8bc; line-height: 1.6;
          padding: 7px 9px; background: rgba(0,232,122,0.05);
          border-radius: 6px 6px 2px 6px;
          border: 1px solid rgba(0,232,122,0.13);
          white-space: pre-wrap;
        }
        .dd-ai-loading {
          display: inline-flex; gap: 4px; align-items: center;
          padding: 7px 9px;
        }
        .dd-ai-loading span {
          width: 5px; height: 5px; border-radius: 50%; background: #00e87a;
          animation: dd-pulse 1.2s ease-in-out infinite;
        }
        .dd-ai-loading span:nth-child(2) { animation-delay: 0.2s; }
        .dd-ai-loading span:nth-child(3) { animation-delay: 0.4s; }

        .dd-ask-row { display: flex; gap: 7px; }
        .dd-ask-input {
          flex: 1; background: rgba(255,255,255,0.04);
          border: 1px solid rgba(148,163,184,0.15);
          border-radius: 7px; padding: 8px 10px;
          color: #e2e8f0; font-size: 12px; outline: none;
          font-family: inherit; resize: none; line-height: 1.5;
        }
        .dd-ask-input::placeholder { color: rgba(148,163,184,0.27); font-style: italic; }
        .dd-ask-send {
          padding: 8px 13px; border-radius: 7px;
          background: rgba(0,232,122,0.10); border: 1px solid rgba(0,232,122,0.22);
          color: #00e87a; font-size: 12px; font-weight: 700;
          cursor: pointer; align-self: flex-end; font-family: inherit;
        }
        .dd-ask-send:disabled { opacity: 0.35; cursor: not-allowed; }
        .dd-ask-disclaimer { font-size: 10px; color: rgba(148,163,184,0.28); font-style: italic; line-height: 1.4; }

        /* Footer */
        .dd-footer {
          padding: 9px 14px;
          border-top: 1px solid rgba(148,163,184,0.06);
          background: rgba(0,0,0,0.22);
          font-size: 10px; color: rgba(185,208,192,0.28);
          font-style: italic; text-align: center; line-height: 1.5;
          flex-shrink: 0;
        }

        /* Mobile adjustments */
        @media (max-width: 700px) {
          .dd-setup-fields { grid-template-columns: 1fr; }
          .dd-expand-grid  { grid-template-columns: 1fr 1fr; }
        }
      `}</style>
    </>
  );
}
