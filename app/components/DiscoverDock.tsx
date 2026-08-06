'use client';
// app/components/DiscoverDock.tsx
// HomeRates Discover — 4-chip sequential evaluation dock.
// Matches preview-discover-v2.html exactly.

import { useState, useEffect, useRef } from 'react';
import {
  getQuestions,
  DISCLOSURE_TEXT,
  type LoanTypeKey,
  type ScenarioSnapshot,
  type GapStatus,
} from '../../lib/discoverQuestions';
import { AIDisclosureTag } from './AIDisclosureTag';

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

export type ChipSummary = {
  id: string; title: string; icon: string;
  status: 'idle' | 'next' | 'waiting' | 'analyzing' | 'match' | 'check' | 'alert';
};

type Props = {
  loanType?:          LoanTypeKey;
  scenario?:          ScenarioSnapshot;
  threadId?:          string;
  sentChipIds?:       string[];              // chips already sent (derived from thread messages by page)
  loRepliedChipIds?:  string[];              // chips where the LO has already replied in chat
  loReplies?:         Record<string, string>; // chipId → LO's reply text for auto-analysis
  onGapSummary?:      (chips: ChipSummary[]) => void; // fires whenever chip states change
  isAgentProxy?:      boolean;               // true when an agent posts on behalf of a client
};

// Extract a short, clean key value from the LO's reply for display in the lender cell.
// Returns '' when no specific value is found — the AI analysis bar handles the insight.
// Never dumps full reply text into the cell.
function extractFromReply(inputType: string, text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (inputType === 'pct') {
    // Strip APR — comparison is always the interest rate used for P&I, not APR
    const stripped = trimmed.replace(/APR\s*(?:of\s*|:?\s*)(\d+\.\d+)\s*%/gi, '');
    const matches  = Array.from(stripped.matchAll(/(\d+\.\d+)\s*%/g));
    const rates    = matches.map(m => parseFloat(m[1])).filter(v => v >= 1 && v <= 20);
    return rates.length > 0 ? String(rates[0]) : '';
  }
  if (inputType === 'dollar') {
    const matches = Array.from(trimmed.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g));
    const vals    = matches.map(m => parseFloat(m[1].replace(/,/g, ''))).filter(v => v > 1000);
    return vals.length > 0 ? String(Math.max(...vals)) : '';
  }
  // text chips — first try to extract a day count (process/timeline chips)
  const dayMatch = trimmed.match(/(\d+)[\s-]*(?:to[\s-]*\d+[\s-]*)?days?/i);
  if (dayMatch) return dayMatch[0].trim();
  // For after-close commitment chips — surface key signals so evaluateGap
  // can produce a match/check/alert instead of staying on pending forever
  const lower = trimmed.toLowerCase();
  const signals: string[] = [];
  if (lower.includes('monitor') || lower.includes('alert') || lower.includes('track') || lower.includes('notify')) signals.push('monitoring');
  if (lower.includes('no-cost') || lower.includes('no cost') || lower.includes('refi') || lower.includes('refinan')) signals.push('no-cost refi');
  if (lower.includes('lifetime') || lower.includes('guarantee') || lower.includes('certificate')) signals.push('guarantee');
  if (signals.length > 0) return signals.join(' + ');
  return '';
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

export default function DiscoverDock({ loanType: propLoanType, scenario: propScenario, threadId, sentChipIds = [], loRepliedChipIds = [], loReplies = {}, onGapSummary, isAgentProxy = false }: Props) {
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
  const [aiNotes, setAiNotes]             = useState<Record<string, { analysis: string; followUp: string }>>({});
  const [aiNoteLoading, setAiNoteLoading] = useState<Record<string, boolean>>({});
  const [followUpSent, setFollowUpSent]   = useState<Set<string>>(new Set());

  // ── Full Grok Scorecard (auto-fires when all 4 chips replied) ─────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [fullAnalysis, setFullAnalysis]       = useState<Record<string, any> | null>(null);
  const [fullAnalysisLoading, setFullAnalysisLoading] = useState(false);
  const [fullAnalysisError, setFullAnalysisError]     = useState('');
  const [scorecardQSent, setScorecardQSent]   = useState<Set<number>>(new Set());
  const scorecardTriggeredRef = useRef(false);

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

  // Auto-trigger full Grok scorecard when all 4 chips have LO replies
  useEffect(() => {
    if (loRepliedChipIds.length < questions.length) return;
    if (!threadId || scorecardTriggeredRef.current || fullAnalysis) return;
    scorecardTriggeredRef.current = true;
    fetchFullScorecard();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loRepliedChipIds.length, threadId]);

  async function fetchFullScorecard() {
    if (!threadId) return;
    setFullAnalysisLoading(true);
    setFullAnalysisError('');
    try {
      const res = await fetch('/api/discover/full-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId,
          loanType: activeLoanType,
          scenario: activeScenario,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setFullAnalysisError(data.error ?? 'Analysis failed'); return; }
      setFullAnalysis(data.analysis ?? null);
    } catch {
      setFullAnalysisError('Could not reach AI');
    } finally {
      setFullAnalysisLoading(false);
    }
  }

  async function sendScorecardQuestion(index: number, question: string) {
    if (!threadId || scorecardQSent.has(index)) return;
    setScorecardQSent(prev => new Set([...prev, index]));
    try {
      await fetch(`/api/messages/${threadId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question.trim() }),
      });
    } catch { /* silent */ }
  }

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

    for (const [chipId, replyText] of toProcess) {
      processedRepliesRef.current.add(chipId);
      const q   = questions.find(q => q.id === chipId);
      if (!q) continue;
      const val = extractFromReply(q.inputType, replyText);
      extracted[chipId] = val; // may be empty string — lender cell shows "Not quoted yet"
      // AI analysis always runs for every chip the LO has replied to
      analyzeLoReply(chipId, replyText);
    }

    setInputs(prev => ({ ...prev, ...extracted }));
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
      const res  = await fetch('/api/discover/analyze-reply', {
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
        setAiNotes(prev => ({ ...prev, [chipId]: { analysis: data.analysis, followUp: data.followUp ?? '' } }));
      }
    } catch { /* silent */ } finally {
      setAiNoteLoading(prev => ({ ...prev, [chipId]: false }));
    }
  }

  async function sendFollowUp(chipId: string, question: string) {
    if (!threadId || !question.trim() || followUpSent.has(chipId)) return;
    setFollowUpSent(prev => new Set([...prev, chipId]));
    try {
      await fetch(`/api/messages/${threadId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question.trim() }),
      });
    } catch { /* silent — optimistic UI already applied */ }
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

  // Push chip summary to parent whenever states change
  const onGapSummaryRef = useRef(onGapSummary);
  useEffect(() => { onGapSummaryRef.current = onGapSummary; });

  const _gapKey = questions.map((q, i) => {
    const isSent   = allSentChips.includes(q.id);
    const isNext   = !isSent && i === nextChipIndex;
    const replied  = loRepliedChipIds.includes(q.id);
    const hasInput = !!(inputs[q.id] ?? '');
    if (!isSent && isNext) return `${q.id}:next`;
    if (!isSent)           return `${q.id}:idle`;
    if (!replied)          return `${q.id}:waiting`;
    if (!hasInput)         return `${q.id}:analyzing`;
    return `${q.id}:${gaps[i].status}`;
  }).join(',');

  useEffect(() => {
    if (!onGapSummaryRef.current) return;
    const chips: ChipSummary[] = _gapKey.split(',').map((seg, i) => {
      const [id, status] = seg.split(':');
      return { id, title: questions[i].title, icon: questions[i].icon, status: status as ChipSummary['status'] };
    });
    onGapSummaryRef.current(chips);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_gapKey]);

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

        {/* Agent proxy banner — shown when agent is evaluating on behalf of a client */}
        {isAgentProxy && (
          <div className="dd-agent-banner">
            <span className="dd-agent-icon">🤝</span>
            <span>You&apos;re evaluating this loan <strong>on behalf of a client</strong> — your AI benchmark analysis is independent of any lender relationship.</span>
          </div>
        )}

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
                if (!isSent && isNext) { pillClass += 'pill-next';  pillText = isSending ? 'Sending…' : 'Tap to ask'; }
                else if (!isSent)      { pillClass += 'pill-idle';  pillText = 'Pending'; }
                else if (!loReplied)   { pillClass += 'pill-sent';  pillText = 'Waiting…'; }
                else if (!inputVal)    { pillClass += 'pill-check'; pillText = 'Analyzing…'; }
                else                   { pillClass += `pill-${gap.status}`; pillText = gapStyle.label; }

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
                          {/* AI benchmark cell */}
                          <div className="dd-cell dd-cell-ai">
                            <div className="dd-cell-col ai">HomeRates AI</div>
                            <div className="dd-cell-val ai">{q.aiValue(benchmarkSnap)}</div>
                            <div className="dd-cell-sub">{q.aiSub(benchmarkSnap)}</div>
                          </div>

                          {/* Lender cell — read-only, no manual input ever */}
                          <div className={`dd-cell dd-cell-lo${inputVal ? ` filled ${gap.status}` : loReplied ? ' replied' : ''}`}>
                            <div className="dd-cell-col lo">Your Lender</div>
                            {inputVal ? (
                              <div className="dd-cell-val lo" style={{ color: gapStyle.text }}>
                                {inputVal}
                              </div>
                            ) : loReplied ? (
                              <div className="dd-lo-not-quoted">Not quoted yet</div>
                            ) : (
                              <div className="dd-lo-waiting">Awaiting reply…</div>
                            )}
                          </div>
                        </div>

                        {/* Waiting pulse — only when LO hasn't replied yet */}
                        {!loReplied && (
                          <div className="dd-waiting">
                            <span className="dd-dots"><span /><span /><span /></span>
                            Waiting for lender to reply in chat
                          </div>
                        )}

                        {/* AI analysis bar — shown as soon as LO has replied */}
                        {loReplied && (
                          <div className={`dd-analysis ${aiNoteLoading[q.id] ? 'loading' : gap.status}`}>
                            {aiNoteLoading[q.id] ? (
                              <>
                                <span className="dd-analysis-icon">✨</span>
                                <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
                                  Analyzing lender response
                                  <span className="dd-dots" style={{ marginLeft: 4 }}><span /><span /><span /></span>
                                </span>
                              </>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                                {/* aiNotes[q.id]?.analysis is real AI-generated text from /api/discover/analyze-reply;
                                    gap.note (the fallback) is a deterministic string — only the AI path needs the tag */}
                                {aiNotes[q.id]?.analysis && <AIDisclosureTag variant="inline" />}
                                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                                  <span className="dd-analysis-icon">
                                    {gap.status === 'match' ? '✓' : gap.status === 'check' ? '⚡' : '⚠'}
                                  </span>
                                  <span>{aiNotes[q.id]?.analysis ?? gap.note}</span>
                                </div>
                                {aiNotes[q.id]?.followUp && (
                                  <button
                                    className={`dd-followup-btn${followUpSent.has(q.id) ? ' sent' : ''}`}
                                    onClick={() => sendFollowUp(q.id, aiNotes[q.id].followUp)}
                                    disabled={followUpSent.has(q.id)}
                                  >
                                    {followUpSent.has(q.id)
                                      ? '✓ Sent to lender'
                                      : `💬 Ask: "${aiNotes[q.id].followUp.length > 70 ? aiNotes[q.id].followUp.slice(0, 70) + '…' : aiNotes[q.id].followUp}"`
                                    }
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Full AI Scorecard — auto-renders when all 4 chips answered ── */}
            {(fullAnalysisLoading || fullAnalysis || fullAnalysisError) && (
              <div className="da-shell">
                <div className="da-header">
                  <span style={{ fontSize: 14 }}>🤖</span>
                  <span className="da-header-title">AI Full Scorecard</span>
                  <span className="da-header-sub">all 4 chips analyzed</span>
                  {fullAnalysis && !fullAnalysisLoading && <AIDisclosureTag variant="inline" />}
                  {!fullAnalysisLoading && !fullAnalysis && (
                    <button className="da-retry-btn" onClick={() => { scorecardTriggeredRef.current = false; setFullAnalysisError(''); fetchFullScorecard(); }}>
                      Retry
                    </button>
                  )}
                </div>

                {fullAnalysisLoading && (
                  <div className="da-loading">
                    <span className="dd-dots"><span /><span /><span /></span>
                    Grok is analyzing all 4 lender responses…
                  </div>
                )}

                {fullAnalysisError && !fullAnalysisLoading && (
                  <div className="da-error">{fullAnalysisError}</div>
                )}

                {fullAnalysis && !fullAnalysisLoading && (() => {
                  const a = fullAnalysis;
                  const score: number = a.decision_score ?? 0;
                  const scoreCol = score >= 70 ? '#00e87a' : score >= 50 ? '#fbbf24' : '#f87171';
                  const scoreLabel = score >= 70 ? 'Proceed' : score >= 50 ? 'Negotiate' : 'Shop Around';
                  const strengths: string[] = a.key_strengths ?? [];
                  const concerns: string[]  = a.key_concerns ?? [];
                  const mc = a.market_context ?? {};
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const scenarios: Array<Record<string, any>> = a.personalized_scenarios ?? [];
                  const risks = a.risk_assessment ?? {};
                  const questions_nxt: string[] = a.next_best_questions ?? [];
                  const wealth: string = a.wealth_building_tie_in ?? '';

                  return (
                    <div className="da-body">
                      {/* Score + recommendation */}
                      <div className="da-score-row">
                        <div className="da-score-badge" style={{ background: `${scoreCol}12`, border: `2px solid ${scoreCol}40`, color: scoreCol }}>
                          <span className="da-score-num">{score}</span>
                          <span className="da-score-lbl">{scoreLabel}</span>
                        </div>
                        <div className="da-score-meta">
                          <div className="da-confidence">{a.confidence ?? ''} confidence</div>
                          <div className="da-recommendation">{a.overall_recommendation ?? ''}</div>
                        </div>
                      </div>

                      {/* Strengths / Concerns */}
                      {(strengths.length > 0 || concerns.length > 0) && (
                        <div className="da-two-col">
                          {strengths.length > 0 && (
                            <div className="da-col">
                              <div className="da-col-hdr da-green">✓ Strengths</div>
                              {strengths.map((s, i) => (
                                <div key={i} className="da-bullet da-bullet-green">· {s}</div>
                              ))}
                            </div>
                          )}
                          {concerns.length > 0 && (
                            <div className="da-col">
                              <div className="da-col-hdr da-yellow">⚠ Concerns</div>
                              {concerns.map((c, i) => (
                                <div key={i} className="da-bullet da-bullet-yellow">· {c}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Market context */}
                      {mc.quoted_vs_market && (
                        <div className="da-market">
                          <div className="da-market-lbl">📊 Market Context</div>
                          <div className="da-market-row">
                            {mc.quoted_rate && <span className="da-market-val">Quoted <strong>{mc.quoted_rate}%</strong></span>}
                            <span className="da-market-val">Market <strong>{mc.current_market_rate}%</strong></span>
                            <span className="da-market-val" style={{ color: parseFloat(String(mc.quoted_vs_market)) > 0 ? '#fbbf24' : '#00e87a' }}>
                              {mc.quoted_vs_market} vs market
                            </span>
                          </div>
                          {mc.monthly_impact > 0 && (
                            <div className="da-market-impact">
                              ≈ <strong style={{ color: '#fbbf24' }}>${mc.monthly_impact}/mo</strong> above market rate
                            </div>
                          )}
                          {mc.lock_strategy && (
                            <div className="da-market-lock">🔒 {mc.lock_strategy}</div>
                          )}
                        </div>
                      )}

                      {/* Scenarios */}
                      {scenarios.length >= 2 && (
                        <div className="da-scenarios">
                          <div className="da-section-lbl">💡 Scenarios</div>
                          <div className="da-scen-grid">
                            {scenarios.map((sc, i) => (
                              <div key={i} className={`da-scen-card ${i === 1 ? 'da-scen-better' : ''}`}>
                                <div className="da-scen-name">{String(sc.scenario_name ?? '')}</div>
                                {sc.monthly_pi != null && (
                                  <div className="da-scen-val">${Number(sc.monthly_pi).toLocaleString()}/mo</div>
                                )}
                                {sc.savings_per_month != null && (
                                  <div className="da-scen-save">saves ${Number(sc.savings_per_month).toLocaleString()}/mo</div>
                                )}
                                {(sc['5yr_savings'] ?? sc.total_interest_5yrs) && (
                                  <div className="da-scen-sub">
                                    {sc['5yr_savings'] ? `${sc['5yr_savings']} saved over 5yr` : `${sc.total_interest_5yrs} interest 5yr`}
                                  </div>
                                )}
                                {sc.notes && <div className="da-scen-note">{String(sc.notes)}</div>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Risk assessment */}
                      {Object.keys(risks).length > 0 && (
                        <div className="da-risks">
                          <div className="da-section-lbl">⚡ Risk Assessment</div>
                          {Object.values(risks).filter(Boolean).map((r, i) => (
                            <div key={i} className="da-risk-item">· {String(r)}</div>
                          ))}
                        </div>
                      )}

                      {/* Next best questions — clickable send buttons */}
                      {questions_nxt.length > 0 && (
                        <div className="da-nextqs">
                          <div className="da-section-lbl">💬 Ask Your Lender Next</div>
                          {questions_nxt.map((q, i) => (
                            <button
                              key={i}
                              className={`da-q-btn${scorecardQSent.has(i) ? ' sent' : ''}`}
                              onClick={() => sendScorecardQuestion(i, q)}
                              disabled={scorecardQSent.has(i)}
                            >
                              {scorecardQSent.has(i) ? `✓ Sent` : `Send → `}
                              <span className="da-q-text">{q}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Wealth tie-in */}
                      {wealth && (
                        <div className="da-wealth">
                          <span className="da-wealth-icon">🏡</span>
                          <span>{wealth}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

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
                          {m.loading ? (
                            <div className="dd-ai-loading"><span /><span /><span /></div>
                          ) : (
                            <>
                              <AIDisclosureTag variant="inline" />
                              <div className="dd-ai-a">{m.a}</div>
                            </>
                          )}
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
        .dd-cell-lo              { background: rgba(255,255,255,0.02); border: 1px dashed rgba(148,163,184,0.13); }
        .dd-cell-lo.replied      { border-color: rgba(148,163,184,0.20); }
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

        .dd-lo-not-quoted { font-size: 11px; font-style: italic; color: rgba(148,163,184,0.35); margin-top: 4px; }
        .dd-lo-waiting    { font-size: 11px; font-style: italic; color: rgba(148,163,184,0.22); margin-top: 4px; }

        /* Waiting dots */
        .dd-waiting {
          display: flex; align-items: center; gap: 6px;
          font-size: 11px; color: rgba(139,92,246,0.60); font-style: italic;
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
        .dd-analysis.pending { background: rgba(148,163,184,0.04); border: 1px solid rgba(148,163,184,0.13); color: rgba(185,208,192,0.60); }
        .dd-analysis-icon  { font-size: 11px; flex-shrink: 0; margin-top: 1px; }

        .dd-followup-btn {
          display: block; width: 100%;
          padding: 7px 10px; border-radius: 6px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(148,163,184,0.20);
          color: rgba(185,208,192,0.80); font-size: 11px;
          text-align: left; cursor: pointer;
          font-family: inherit; line-height: 1.4;
          transition: background 0.15s, border-color 0.15s;
        }
        .dd-followup-btn:hover:not(:disabled) {
          background: rgba(139,92,246,0.10);
          border-color: rgba(139,92,246,0.30);
          color: #c4b5fd;
        }
        .dd-followup-btn.sent {
          background: rgba(0,232,122,0.07);
          border-color: rgba(0,232,122,0.22);
          color: #00e87a; cursor: default;
        }

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

        /* Agent proxy banner */
        .dd-agent-banner {
          display: flex; align-items: flex-start; gap: 8px;
          padding: 9px 14px;
          background: rgba(251,191,36,0.06);
          border-bottom: 1px solid rgba(251,191,36,0.16);
          font-size: 11.5px; color: rgba(253,230,138,0.85); line-height: 1.5;
        }
        .dd-agent-icon { font-size: 13px; flex-shrink: 0; margin-top: 1px; }
        .dd-agent-banner strong { color: #fde68a; font-weight: 700; }

        /* Footer */
        .dd-footer {
          padding: 9px 14px;
          border-top: 1px solid rgba(148,163,184,0.06);
          background: rgba(0,0,0,0.22);
          font-size: 10px; color: rgba(185,208,192,0.28);
          font-style: italic; text-align: center; line-height: 1.5;
          flex-shrink: 0;
        }

        /* ── Full AI Scorecard ── */
        .da-shell {
          margin: 0 10px 10px;
          border: 1px solid rgba(99,102,241,0.28);
          border-radius: 12px; overflow: hidden;
          background: rgba(99,102,241,0.04);
        }
        .da-header {
          display: flex; align-items: center; gap: 7px;
          padding: 10px 13px;
          background: rgba(99,102,241,0.08);
          border-bottom: 1px solid rgba(99,102,241,0.15);
          flex-shrink: 0;
        }
        .da-header-title { font-size: 12px; font-weight: 700; color: #c7d2fe; }
        .da-header-sub   { font-size: 10px; color: rgba(148,163,184,0.45); flex: 1; }
        .da-retry-btn {
          font-size: 10px; font-weight: 700; color: #a78bfa;
          background: rgba(139,92,246,0.10);
          border: 1px solid rgba(139,92,246,0.25);
          border-radius: 6px; padding: 2px 9px;
          cursor: pointer; font-family: inherit;
        }
        .da-loading {
          display: flex; align-items: center; gap: 8px;
          padding: 14px; font-size: 11.5px; color: rgba(196,181,253,0.70);
          font-style: italic;
        }
        .da-error { padding: 12px 14px; font-size: 11px; color: #f87171; }
        .da-body  { padding: 12px 13px; display: flex; flex-direction: column; gap: 12px; }

        /* Score row */
        .da-score-row { display: flex; gap: 12px; align-items: flex-start; }
        .da-score-badge {
          flex-shrink: 0; width: 64px; height: 64px; border-radius: 12px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 1px;
        }
        .da-score-num { font-size: 26px; font-weight: 800; line-height: 1; }
        .da-score-lbl { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.75; }
        .da-score-meta { flex: 1; min-width: 0; }
        .da-confidence { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: rgba(148,163,184,0.50); margin-bottom: 4px; }
        .da-recommendation { font-size: 11.5px; color: rgba(185,208,192,0.80); line-height: 1.55; }

        /* Strengths / Concerns */
        .da-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .da-col { display: flex; flex-direction: column; gap: 3px; }
        .da-col-hdr { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 2px; }
        .da-col-hdr.da-green  { color: rgba(0,232,122,0.65); }
        .da-col-hdr.da-yellow { color: rgba(251,191,36,0.65); }
        .da-bullet { font-size: 10.5px; line-height: 1.45; }
        .da-bullet-green  { color: rgba(157,232,188,0.75); }
        .da-bullet-yellow { color: rgba(253,230,138,0.75); }

        /* Market context */
        .da-market {
          background: rgba(0,0,0,0.20); border: 1px solid rgba(148,163,184,0.10);
          border-radius: 9px; padding: 10px 12px;
          display: flex; flex-direction: column; gap: 5px;
        }
        .da-market-lbl { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: rgba(148,163,184,0.45); margin-bottom: 2px; }
        .da-market-row { display: flex; gap: 12px; flex-wrap: wrap; }
        .da-market-val { font-size: 11.5px; color: rgba(185,208,192,0.65); }
        .da-market-val strong { color: #f0f4ff; }
        .da-market-impact { font-size: 11.5px; color: rgba(185,208,192,0.65); }
        .da-market-lock { font-size: 10.5px; color: rgba(148,163,184,0.55); font-style: italic; line-height: 1.45; margin-top: 2px; }

        /* Scenarios */
        .da-section-lbl { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: rgba(148,163,184,0.40); margin-bottom: 4px; }
        .da-scen-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
        .da-scen-card {
          background: rgba(255,255,255,0.03); border: 1px solid rgba(148,163,184,0.12);
          border-radius: 8px; padding: 8px 10px;
          display: flex; flex-direction: column; gap: 2px;
        }
        .da-scen-card.da-scen-better {
          background: rgba(0,232,122,0.04); border-color: rgba(0,232,122,0.18);
        }
        .da-scen-name { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(148,163,184,0.50); margin-bottom: 3px; }
        .da-scen-val  { font-size: 15px; font-weight: 800; color: #f0f4ff; }
        .da-scen-save { font-size: 10.5px; color: #00e87a; font-weight: 600; }
        .da-scen-sub  { font-size: 9.5px; color: rgba(148,163,184,0.50); margin-top: 1px; }
        .da-scen-note { font-size: 10px; color: rgba(185,208,192,0.55); line-height: 1.4; margin-top: 2px; }

        /* Risk assessment */
        .da-risks { display: flex; flex-direction: column; gap: 4px; }
        .da-risk-item { font-size: 11px; color: rgba(185,208,192,0.65); line-height: 1.5; padding-left: 4px; }

        /* Next best questions */
        .da-nextqs { display: flex; flex-direction: column; gap: 5px; }
        .da-q-btn {
          display: flex; align-items: flex-start; gap: 6px;
          padding: 7px 10px; border-radius: 7px;
          background: rgba(99,102,241,0.07);
          border: 1px solid rgba(99,102,241,0.20);
          color: #c7d2fe; font-size: 10.5px;
          text-align: left; cursor: pointer;
          font-family: inherit; line-height: 1.45;
          transition: background 0.15s, border-color 0.15s;
        }
        .da-q-btn:hover:not(:disabled):not(.sent) {
          background: rgba(99,102,241,0.14); border-color: rgba(99,102,241,0.32);
        }
        .da-q-btn.sent {
          background: rgba(0,232,122,0.06); border-color: rgba(0,232,122,0.20);
          color: #9de8bc; cursor: default;
        }
        .da-q-text { flex: 1; }

        /* Wealth tie-in */
        .da-wealth {
          display: flex; gap: 7px; align-items: flex-start;
          background: rgba(0,232,122,0.05); border: 1px solid rgba(0,232,122,0.14);
          border-radius: 8px; padding: 9px 11px;
          font-size: 11px; color: #9de8bc; line-height: 1.55;
        }
        .da-wealth-icon { font-size: 13px; flex-shrink: 0; margin-top: 1px; }

        /* Mobile adjustments */
        @media (max-width: 700px) {
          .dd-setup-fields { grid-template-columns: 1fr; }
          .dd-expand-grid  { grid-template-columns: 1fr 1fr; }
          .da-two-col      { grid-template-columns: 1fr; }
          .da-scen-grid    { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  );
}
