'use client';
// app/components/DiscoverDock.tsx
// HomeRates Discover — dual-channel truth test.
// scenario + loanType are optional; when absent a setup form collects them first.

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  getQuestions,
  DISCLOSURE_TEXT,
  type LoanTypeKey,
  type ScenarioSnapshot,
  type GapStatus,
} from '../../lib/discoverQuestions';

const GAP_COLORS: Record<GapStatus, { bg: string; border: string; text: string; label: string }> = {
  match:   { bg: 'rgba(0,232,122,0.10)',  border: 'rgba(0,232,122,0.30)',  text: '#00e87a', label: '✓ Match'   },
  check:   { bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.30)', text: '#fbbf24', label: '⚡ Review'  },
  alert:   { bg: 'rgba(248,113,113,0.10)',border: 'rgba(248,113,113,0.30)',text: '#f87171', label: '⚠ Alert'   },
  pending: { bg: 'rgba(148,163,184,0.06)',border: 'rgba(148,163,184,0.12)',text: 'rgba(185,208,192,0.40)', label: '⏳ Pending' },
};

const LOAN_LABELS: Record<LoanTypeKey, string> = {
  fha: 'FHA', conventional: 'Conventional', va: 'VA', jumbo: 'Jumbo',
};

const DEFAULT_DOWN: Record<LoanTypeKey, string> = {
  fha: '3.5', conventional: '3', va: '0', jumbo: '20',
};

type Props = {
  loanType?: LoanTypeKey;
  scenario?: ScenarioSnapshot;
  threadId?: string;
};

function buildSnapshot(price: number, downPct: number, rate: number, lt: LoanTypeKey): ScenarioSnapshot {
  const term = 30;
  const down = price * downPct / 100;
  const baseLoan = price - down;
  const loanAmount = lt === 'fha' ? baseLoan * 1.0175 : baseLoan;
  const ltv = baseLoan / price;
  const r = rate / 100 / 12;
  const n = term * 12;
  const pi = r > 0 ? (loanAmount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : loanAmount / n;
  const monthlyMIP   = lt === 'fha' && ltv > 0.90 ? loanAmount * 0.0055 / 12
    : lt === 'fha' ? loanAmount * 0.0050 / 12 : undefined;
  const monthlyPMI   = lt === 'conventional' && ltv > 0.80 ? loanAmount * 0.005 / 12 : undefined;
  return {
    price, loanAmount, downPct, rate, term, ltv,
    monthlyPayment: pi + (monthlyMIP ?? 0) + (monthlyPMI ?? 0),
    monthlyMIP, monthlyPMI,
  };
}

export default function DiscoverDock({ loanType: propLoanType, scenario: propScenario, threadId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [firing, setFiring] = useState(false);
  const [fired, setFired] = useState(false);
  const sessionCreatedRef = useRef(false);

  // Setup form state — used when no scenario prop provided
  const [localLoanType, setLocalLoanType] = useState<LoanTypeKey>(propLoanType ?? 'conventional');
  const [localScenario, setLocalScenario] = useState<ScenarioSnapshot | null>(propScenario ?? null);
  const [setupPrice, setSetupPrice] = useState('');
  const [setupDown, setSetupDown] = useState(DEFAULT_DOWN[propLoanType ?? 'conventional']);
  const [setupRate, setSetupRate] = useState('');
  const [setupError, setSetupError] = useState('');

  const activeLoanType: LoanTypeKey = propLoanType ?? localLoanType;
  const activeScenario: ScenarioSnapshot | null = propScenario ?? localScenario;
  const needsSetup = !activeScenario;

  const questions = getQuestions(activeLoanType);
  const gaps = activeScenario
    ? questions.map(q => q.evaluateGap(inputs[q.id] ?? '', activeScenario))
    : questions.map(() => ({ status: 'pending' as GapStatus, note: '' }));

  const alertCount   = gaps.filter(g => g.status === 'alert').length;
  const checkCount   = gaps.filter(g => g.status === 'check').length;
  const matchCount   = gaps.filter(g => g.status === 'match').length;
  const pendingCount = gaps.filter(g => g.status === 'pending').length;

  // Auto-create session when scenario is hydrated from DB (not just manual entry)
  useEffect(() => {
    if (propScenario && propLoanType && !sessionCreatedRef.current) {
      sessionCreatedRef.current = true;
      createSession(propLoanType, propScenario);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propScenario]);

  async function handleFireToExchange() {
    if (firing || fired || !threadId) return;
    setFiring(true);
    try {
      let sid = sessionId;
      if (!sid && activeScenario) {
        const res = await fetch('/api/discover/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ loanType: activeLoanType, scenarioSnapshot: activeScenario }),
        });
        if (res.ok) { const d = await res.json(); sid = d.id; setSessionId(d.id); }
      }
      if (!sid) { setFiring(false); return; }
      const r = await fetch(`/api/discover/session/${sid}/fire-to-pe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId }),
      });
      if (r.ok) {
        setFired(true);
        router.refresh();
      }
    } catch { /* non-blocking */ } finally {
      setFiring(false);
    }
  }

  const handleOpen = useCallback(() => {
    if (open) { setOpen(false); return; }
    const disclosed = typeof window !== 'undefined' && localStorage.getItem('hr_discover_disclosed');
    if (!disclosed) { setShowDisclosure(true); return; }
    setOpen(true);
  }, [open]);

  function acceptDisclosure() {
    if (typeof window !== 'undefined') localStorage.setItem('hr_discover_disclosed', '1');
    setShowDisclosure(false);
    setOpen(true);
  }

  function handleLoanTypeChange(lt: LoanTypeKey) {
    setLocalLoanType(lt);
    setSetupDown(DEFAULT_DOWN[lt]);
  }

  function handleSetup() {
    const price = parseFloat(setupPrice.replace(/[$,]/g, ''));
    const down  = parseFloat(setupDown);
    const rate  = parseFloat(setupRate);
    if (!price || price < 50_000)  { setSetupError('Enter a valid purchase price'); return; }
    if (isNaN(down) || down < 0)   { setSetupError('Enter a valid down payment %'); return; }
    if (!rate || rate < 1 || rate > 20) { setSetupError('Enter a valid rate (e.g. 6.875)'); return; }
    setSetupError('');
    const snap = buildSnapshot(price, down, rate, localLoanType);
    setLocalScenario(snap);
    createSession(localLoanType, snap);
  }

  async function createSession(lt: LoanTypeKey, snap: ScenarioSnapshot) {
    try {
      const res = await fetch('/api/discover/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loanType: lt, scenarioSnapshot: snap }),
      });
      if (res.ok) {
        const { id } = await res.json();
        setSessionId(id);
      }
    } catch { /* non-blocking */ }
  }

  async function saveInput(questionId: string, value: string) {
    if (!sessionId || !activeScenario || !value.trim()) return;
    const q = questions.find(q => q.id === questionId);
    const gap = q ? q.evaluateGap(value, activeScenario) : { status: 'pending' as GapStatus, note: '' };
    try {
      await fetch(`/api/discover/session/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, raw: value, gapStatus: gap.status, gapNote: gap.note }),
      });
    } catch { /* silent */ }
  }

  const headerStatus = needsSetup
    ? { text: 'Set up scenario', color: 'rgba(148,163,184,0.50)' }
    : alertCount > 0 ? { text: `${alertCount} alert${alertCount > 1 ? 's' : ''}`, color: '#f87171' }
    : checkCount > 0 ? { text: `${checkCount} to review`, color: '#fbbf24' }
    : pendingCount === questions.length ? { text: 'Enter lender quotes', color: 'rgba(148,163,184,0.50)' }
    : { text: `${matchCount}/${questions.length} match`, color: '#00e87a' };

  return (
    <>
      {/* Disclosure modal */}
      {showDisclosure && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: 20,
        }}>
          <div style={{
            background: '#0d1420', border: '1px solid rgba(148,163,184,0.20)',
            borderRadius: 14, maxWidth: 460, width: '100%', padding: '28px 24px',
          }}>
            <div style={{ color: '#f0f4ff', fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
              🔍 About HomeRates Discover
            </div>
            <p style={{ color: 'rgba(185,208,192,0.80)', fontSize: 12.5, lineHeight: 1.7, margin: '0 0 20px' }}>
              {DISCLOSURE_TEXT}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={acceptDisclosure} style={{
                flex: 1, padding: '10px 0', borderRadius: 8,
                background: 'rgba(0,232,122,0.15)', color: '#00e87a',
                fontWeight: 700, fontSize: 13, cursor: 'pointer',
                border: '1px solid rgba(0,232,122,0.25)',
              } as React.CSSProperties}>
                I understand — continue
              </button>
              <button onClick={() => setShowDisclosure(false)} style={{
                padding: '10px 16px', borderRadius: 8,
                border: '1px solid rgba(148,163,184,0.15)',
                background: 'none', color: 'rgba(148,163,184,0.60)', fontSize: 13, cursor: 'pointer',
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dock */}
      <div style={{
        marginTop: 10, background: '#090e1a',
        border: '1px solid rgba(148,163,184,0.13)',
        borderRadius: 11, overflow: 'hidden', fontFamily: 'inherit',
        display: 'flex', flexDirection: 'column',
        height: open && activeScenario ? 420 : undefined,
      }}>
        {/* Header */}
        <button onClick={handleOpen} style={{
          width: '100%', display: 'flex', alignItems: 'center',
          gap: 10, padding: '11px 16px',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 15, flexShrink: 0 }}>🔍</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ color: '#c8dfc8', fontWeight: 700, fontSize: 12.5 }}>Discover</span>
            <span style={{ color: 'rgba(148,163,184,0.45)', fontSize: 11.5, marginLeft: 6 }}>
              {needsSetup ? 'compare your lender quote to AI benchmark' : `${LOAN_LABELS[activeLoanType]} · AI vs lender`}
            </span>
          </div>
          <span style={{
            fontSize: 11, fontWeight: 600, color: headerStatus.color,
            background: 'rgba(255,255,255,0.04)', padding: '2px 8px',
            borderRadius: 20, border: '1px solid rgba(148,163,184,0.10)',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {headerStatus.text}
          </span>
          <span style={{ color: 'rgba(148,163,184,0.35)', fontSize: 10, flexShrink: 0 }}>
            {open ? '▲' : '▼'}
          </span>
        </button>

        {/* ── DEBUG STRIP (remove before launch) ── */}
        <div style={{
          padding: '4px 16px', fontSize: 10, fontFamily: 'monospace',
          background: propScenario ? 'rgba(0,232,122,0.08)' : 'rgba(248,113,113,0.08)',
          borderTop: `1px solid ${propScenario ? 'rgba(0,232,122,0.20)' : 'rgba(248,113,113,0.20)'}`,
          color: propScenario ? '#00e87a' : '#f87171',
          lineHeight: 1.6,
        }}>
          <strong>DBG</strong> · source={propScenario ? 'DB ✓' : 'null — showing setup form'} ·
          propLoanType={propLoanType ?? 'none'} ·
          price={propScenario?.price ?? '—'} ·
          rate={propScenario?.rate ?? '—'} ·
          sessionId={sessionId ? sessionId.slice(0,8)+'…' : 'none'}
        </div>

        {open && needsSetup && (
          /* ── Setup form ── */
          <div style={{
            borderTop: '1px solid rgba(148,163,184,0.08)',
            padding: '16px',
            overflowY: 'auto', flex: 1,
          }}>
            <div style={{ color: 'rgba(185,208,192,0.70)', fontSize: 11.5, marginBottom: 14, lineHeight: 1.5 }}>
              Enter your loan details so AI can benchmark against your lender's quote.
            </div>

            {/* Loan type selector */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: 'rgba(148,163,184,0.50)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Loan Type
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(['fha', 'conventional', 'va', 'jumbo'] as LoanTypeKey[]).map(lt => (
                  <button key={lt} onClick={() => handleLoanTypeChange(lt)} style={{
                    padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.15s',
                    background: localLoanType === lt ? 'rgba(0,232,122,0.15)' : 'rgba(255,255,255,0.04)',
                    border: localLoanType === lt ? '1px solid rgba(0,232,122,0.35)' : '1px solid rgba(148,163,184,0.15)',
                    color: localLoanType === lt ? '#00e87a' : 'rgba(148,163,184,0.70)',
                  }}>
                    {LOAN_LABELS[lt]}
                  </button>
                ))}
              </div>
            </div>

            {/* Price + Down + Rate */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
              {[
                { label: 'Purchase Price', placeholder: 'e.g. 650000', value: setupPrice, onChange: setSetupPrice },
                { label: `Down Payment %`, placeholder: DEFAULT_DOWN[localLoanType], value: setupDown, onChange: setSetupDown },
                { label: 'Benchmark Rate %', placeholder: 'e.g. 6.875', value: setupRate, onChange: setSetupRate },
              ].map(f => (
                <div key={f.label}>
                  <div style={{ color: 'rgba(148,163,184,0.50)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    {f.label}
                  </div>
                  <input
                    type="text"
                    placeholder={f.placeholder}
                    value={f.value}
                    onChange={e => f.onChange(e.target.value)}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(148,163,184,0.18)',
                      borderRadius: 6, padding: '7px 8px',
                      color: '#e2e8f0', fontSize: 13, outline: 'none',
                    }}
                  />
                </div>
              ))}
            </div>

            {setupError && (
              <div style={{ color: '#f87171', fontSize: 11.5, marginBottom: 10 }}>{setupError}</div>
            )}

            <button onClick={handleSetup} style={{
              padding: '8px 18px', borderRadius: 7,
              background: 'rgba(0,232,122,0.14)',
              border: '1px solid rgba(0,232,122,0.28)',
              color: '#00e87a', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            }}>
              Start Discover →
            </button>
          </div>
        )}

        {open && activeScenario && (
          <>
            {/* Scrollable section: column headers + question rows */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
            {/* Column headers */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              padding: '8px 16px 6px',
              borderTop: '1px solid rgba(148,163,184,0.07)',
              gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#00e87a', flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#00e87a' }}>
                  HomeRates AI
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#60a5fa', flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#60a5fa' }}>
                  Your Lender
                </span>
              </div>
            </div>

            {/* Question rows */}
            {questions.map((q, i) => {
              const gap = gaps[i];
              const gapStyle = GAP_COLORS[gap.status];
              const inputVal = inputs[q.id] ?? '';
              return (
                <div key={q.id} style={{
                  borderTop: '1px solid rgba(148,163,184,0.06)',
                  padding: '10px 16px',
                  display: 'flex', flexDirection: 'column', gap: 7,
                }}>
                  {/* Row label */}
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(185,208,192,0.7)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13 }}>{q.icon}</span>
                    {q.title}
                  </div>

                  {/* 2-col answer cells */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {/* AI cell */}
                    <div style={{
                      background: 'rgba(0,232,122,0.04)', border: '1px solid rgba(0,232,122,0.14)',
                      borderRadius: 7, padding: '8px 10px', minHeight: 52,
                      display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2,
                    }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#00e87a', lineHeight: 1.2 }}>
                        {q.aiValue(activeScenario)}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(185,208,192,0.5)', marginTop: 1 }}>
                        {q.aiSub(activeScenario)}
                      </div>
                    </div>

                    {/* Lender cell — input styled as cell content */}
                    <div style={{
                      background: inputVal ? gapStyle.bg : 'transparent',
                      border: `1px ${inputVal ? 'solid' : 'dashed'} ${inputVal ? gapStyle.border : 'rgba(148,163,184,0.12)'}`,
                      borderRadius: 7, padding: '8px 10px', minHeight: 52,
                      display: 'flex', flexDirection: 'column', justifyContent: 'center',
                    }}>
                      <input
                        type={q.inputType === 'pct' || q.inputType === 'number' ? 'number' : 'text'}
                        step={q.inputType === 'pct' ? '0.001' : q.inputType === 'number' ? '0.5' : undefined}
                        placeholder={typeof q.inputPlaceholder === 'function'
                          ? (q.inputPlaceholder as (s: ScenarioSnapshot) => string)(activeScenario)
                          : (q.inputPlaceholder as string) ?? 'Enter quote…'}
                        value={inputVal}
                        onChange={e => setInputs(prev => ({ ...prev, [q.id]: e.target.value }))}
                        onBlur={() => saveInput(q.id, inputVal)}
                        style={{
                          width: '100%', boxSizing: 'border-box' as const,
                          background: 'transparent', border: 'none',
                          color: inputVal ? gapStyle.text : 'rgba(185,208,192,0.30)',
                          fontSize: inputVal ? 15 : 11,
                          fontWeight: inputVal ? 700 : 400,
                          fontStyle: inputVal ? 'normal' : 'italic',
                          outline: 'none', padding: 0,
                        }}
                      />
                    </div>
                  </div>

                  {/* Gap tag */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                      background: gapStyle.bg, color: gapStyle.text, border: `1px solid ${gapStyle.border}`,
                    }}>
                      {gapStyle.label}
                    </span>
                    {gap.note && (
                      <span style={{ fontSize: 10.5, color: 'rgba(185,208,192,0.60)', lineHeight: 1.4 }}>
                        {gap.note}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            </div>{/* /scrollable section */}

            {/* Action bar */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              padding: '11px 16px',
              borderTop: '1px solid rgba(148,163,184,0.08)',
              background: 'rgba(0,0,0,0.18)',
              flexShrink: 0,
            }}>
              <button onClick={handleFireToExchange} disabled={firing || fired || !threadId} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 11.5, fontWeight: 600, padding: '7px 14px', borderRadius: 7,
                background: fired ? 'rgba(0,232,122,0.20)' : 'rgba(0,232,122,0.10)',
                border: '1px solid rgba(0,232,122,0.25)',
                color: fired ? '#00e87a' : firing ? 'rgba(0,232,122,0.5)' : '#00e87a',
                cursor: firing || fired ? 'default' : 'pointer',
                opacity: !threadId ? 0.4 : 1,
              }}>
                {fired ? '✓ Sent to Exchange' : firing ? 'Sending…' : `🤖 Ask AI all ${questions.length} questions`}
              </button>
              <div style={{ flex: 1 }} />
              {threadId && (
                <a href={`/messages/${threadId}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 11.5, fontWeight: 600, padding: '7px 14px', borderRadius: 7,
                  background: 'rgba(139,92,246,0.10)', border: '1px solid rgba(139,92,246,0.25)', color: '#a78bfa',
                  cursor: 'pointer', textDecoration: 'none',
                }}>
                  ⚡ View in Exchange
                </a>
              )}
            </div>

            {/* CTA footer */}
            <div style={{
              padding: '10px 16px',
              borderTop: '1px solid rgba(148,163,184,0.06)',
              background: 'rgba(0,0,0,0.20)',
              fontSize: 11, color: 'rgba(185,208,192,0.45)',
              fontStyle: 'italic', lineHeight: 1.55, textAlign: 'center',
              flexShrink: 0,
            }}>
              The goal is not to avoid lenders. The goal is to choose who has earned the right to advise you.
            </div>
          </>
        )}
      </div>
    </>
  );
}
