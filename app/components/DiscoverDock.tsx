'use client';
// app/components/DiscoverDock.tsx
// HomeRates Discover — dual-channel truth test docked to scenario cards.
// Left column: AI benchmark. Right column: lender input. Real-time gap tags.

import { useState, useCallback, useEffect } from 'react';
import {
  getQuestions,
  DISCLOSURE_TEXT,
  type LoanTypeKey,
  type ScenarioSnapshot,
  type GapStatus,
} from '../../lib/discoverQuestions';

const GAP_COLORS: Record<GapStatus, { bg: string; border: string; text: string; label: string }> = {
  match:   { bg: 'rgba(0,232,122,0.10)',  border: 'rgba(0,232,122,0.30)',  text: '#00e87a', label: '✓ Match'   },
  check:   { bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.30)', text: '#fbbf24', label: '⚠ Review'  },
  alert:   { bg: 'rgba(248,113,113,0.10)',border: 'rgba(248,113,113,0.30)',text: '#f87171', label: '✗ Alert'   },
  pending: { bg: 'rgba(148,163,184,0.06)',border: 'rgba(148,163,184,0.12)',text: 'rgba(148,163,184,0.50)', label: '— Enter' },
};

const LOAN_LABELS: Record<LoanTypeKey, string> = {
  fha:          'FHA',
  conventional: 'Conventional',
  va:           'VA',
  jumbo:        'Jumbo',
};

type Props = {
  loanType: LoanTypeKey;
  scenario: ScenarioSnapshot;
  threadId?: string;
};

export default function DiscoverDock({ loanType, scenario, threadId }: Props) {
  const questions = getQuestions(loanType);

  const [open, setOpen] = useState(false);
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [firedToPE, setFiredToPE] = useState(false);
  const [firing, setFiring] = useState(false);
  const [savingInput, setSavingInput] = useState<string | null>(null);

  // Gap results computed inline
  const gaps = questions.map(q => q.evaluateGap(inputs[q.id] ?? '', scenario));
  const alertCount  = gaps.filter(g => g.status === 'alert').length;
  const checkCount  = gaps.filter(g => g.status === 'check').length;
  const matchCount  = gaps.filter(g => g.status === 'match').length;
  const pendingCount = gaps.filter(g => g.status === 'pending').length;

  // Create session on first open
  const handleOpen = useCallback(async () => {
    if (open) { setOpen(false); return; }

    // Show disclosure if not yet seen
    const disclosed = typeof window !== 'undefined' && localStorage.getItem('hr_discover_disclosed');
    if (!disclosed) { setShowDisclosure(true); return; }

    setOpen(true);
    if (!sessionId) createSession();
  }, [open, sessionId, loanType, scenario]);

  function acceptDisclosure() {
    if (typeof window !== 'undefined') localStorage.setItem('hr_discover_disclosed', '1');
    setShowDisclosure(false);
    setOpen(true);
    if (!sessionId) createSession();
  }

  async function createSession() {
    try {
      const res = await fetch('/api/discover/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loanType, scenarioSnapshot: scenario }),
      });
      if (res.ok) {
        const { id } = await res.json();
        setSessionId(id);
      }
    } catch { /* silent — session creation is non-blocking */ }
  }

  async function saveInput(questionId: string, value: string) {
    if (!sessionId || !value.trim()) return;
    setSavingInput(questionId);
    const q = questions.find(q => q.id === questionId);
    const gap = q ? q.evaluateGap(value, scenario) : { status: 'pending' as GapStatus, note: '' };
    try {
      await fetch(`/api/discover/session/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId,
          raw: value,
          gapStatus: gap.status,
          gapNote: gap.note,
        }),
      });
    } catch { /* silent */ }
    setSavingInput(null);
  }

  async function fireToPE() {
    if (!threadId || !sessionId) return;
    setFiring(true);
    try {
      await fetch(`/api/discover/session/${sessionId}/fire-to-pe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId }),
      });
      setFiredToPE(true);
    } catch { /* silent */ }
    setFiring(false);
  }

  const headerStatus = alertCount > 0
    ? { text: `${alertCount} alert${alertCount > 1 ? 's' : ''}`, color: '#f87171' }
    : checkCount > 0
    ? { text: `${checkCount} to review`, color: '#fbbf24' }
    : pendingCount === questions.length
    ? { text: 'Enter lender quotes', color: 'rgba(148,163,184,0.50)' }
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
              <button
                onClick={acceptDisclosure}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8,
                  background: 'rgba(0,232,122,0.15)', color: '#00e87a',
                  fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  border: '1px solid rgba(0,232,122,0.25)',
                } as React.CSSProperties}
              >
                I understand — continue
              </button>
              <button
                onClick={() => setShowDisclosure(false)}
                style={{
                  padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(148,163,184,0.15)',
                  background: 'none', color: 'rgba(148,163,184,0.60)', fontSize: 13, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dock */}
      <div style={{
        marginTop: 10,
        background: '#090e1a',
        border: '1px solid rgba(148,163,184,0.13)',
        borderRadius: 11,
        overflow: 'hidden',
        fontFamily: 'inherit',
      }}>
        {/* Header toggle */}
        <button
          onClick={handleOpen}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            gap: 10, padding: '11px 16px',
            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span style={{ fontSize: 15, flexShrink: 0 }}>🔍</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ color: '#c8dfc8', fontWeight: 700, fontSize: 12.5 }}>
              Discover
            </span>
            <span style={{ color: 'rgba(148,163,184,0.45)', fontSize: 11.5, marginLeft: 6 }}>
              {LOAN_LABELS[loanType]} · compare lender quote to AI benchmark
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

        {open && (
          <>
            {/* Column headers */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1px 1fr',
              borderTop: '1px solid rgba(148,163,184,0.08)',
              borderBottom: '1px solid rgba(148,163,184,0.08)',
            }}>
              <div style={{ padding: '7px 14px', textAlign: 'center' }}>
                <span style={{ color: '#00e87a', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  AI Benchmark
                </span>
              </div>
              <div style={{ background: 'rgba(148,163,184,0.08)' }} />
              <div style={{ padding: '7px 14px', textAlign: 'center' }}>
                <span style={{ color: 'rgba(148,163,184,0.55)', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Your Lender Said
                </span>
              </div>
            </div>

            {/* Question rows */}
            {questions.map((q, i) => {
              const gap = gaps[i];
              const gapStyle = GAP_COLORS[gap.status];
              const inputVal = inputs[q.id] ?? '';
              const isLast = i === questions.length - 1;

              return (
                <div
                  key={q.id}
                  style={{
                    display: 'grid', gridTemplateColumns: '1fr 1px 1fr',
                    borderBottom: isLast ? 'none' : '1px solid rgba(148,163,184,0.07)',
                  }}
                >
                  {/* AI benchmark cell */}
                  <div style={{ padding: '12px 14px', background: 'rgba(0,232,122,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 13 }}>{q.icon}</span>
                      <span style={{ color: '#c8dfc8', fontWeight: 700, fontSize: 12 }}>{q.title}</span>
                    </div>
                    <div style={{ color: '#00e87a', fontWeight: 700, fontSize: 15, marginBottom: 2 }}>
                      {q.aiValue(scenario)}
                    </div>
                    <div style={{ color: 'rgba(148,163,184,0.50)', fontSize: 10.5, lineHeight: 1.4 }}>
                      {q.aiSub(scenario)}
                    </div>
                  </div>

                  {/* Divider */}
                  <div style={{ background: 'rgba(148,163,184,0.08)' }} />

                  {/* Lender input cell */}
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ marginBottom: 6 }}>
                      <input
                        type={q.inputType === 'pct' || q.inputType === 'number' ? 'number' : 'text'}
                        step={q.inputType === 'pct' ? '0.001' : q.inputType === 'number' ? '0.5' : undefined}
                        placeholder={typeof q.inputPlaceholder === 'function'
                          ? (q.inputPlaceholder as (s: ScenarioSnapshot) => string)(scenario)
                          : q.inputPlaceholder}
                        value={inputVal}
                        onChange={e => setInputs(prev => ({ ...prev, [q.id]: e.target.value }))}
                        onBlur={() => saveInput(q.id, inputVal)}
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          background: 'rgba(255,255,255,0.04)',
                          border: `1px solid ${inputVal ? gapStyle.border : 'rgba(148,163,184,0.15)'}`,
                          borderRadius: 6, padding: '6px 8px',
                          color: '#e2e8f0', fontSize: 13, fontWeight: 600,
                          outline: 'none',
                          transition: 'border-color 0.2s',
                        }}
                      />
                    </div>

                    {/* Gap tag + note */}
                    <div style={{
                      display: 'flex', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap',
                    }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px',
                        borderRadius: 20, background: gapStyle.bg,
                        border: `1px solid ${gapStyle.border}`, color: gapStyle.text,
                        flexShrink: 0, whiteSpace: 'nowrap',
                      }}>
                        {gapStyle.label}
                      </span>
                      {gap.note && (
                        <span style={{ color: 'rgba(185,208,192,0.60)', fontSize: 10.5, lineHeight: 1.4 }}>
                          {gap.note}
                        </span>
                      )}
                    </div>

                    {/* Question to ask */}
                    {!inputVal && (
                      <div style={{
                        marginTop: 8, padding: '6px 8px',
                        background: 'rgba(148,163,184,0.04)',
                        border: '1px solid rgba(148,163,184,0.10)',
                        borderRadius: 5,
                      }}>
                        <span style={{ color: 'rgba(148,163,184,0.45)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Ask:&nbsp;
                        </span>
                        <span style={{ color: 'rgba(185,208,192,0.60)', fontSize: 10.5, lineHeight: 1.5, fontStyle: 'italic' }}>
                          "{q.prompt(scenario)}"
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Action bar */}
            <div style={{
              borderTop: '1px solid rgba(148,163,184,0.10)',
              padding: '11px 14px',
              background: 'rgba(0,0,0,0.12)',
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            }}>
              {threadId ? (
                firedToPE ? (
                  <span style={{ color: '#00e87a', fontSize: 11.5, fontWeight: 600 }}>
                    ✓ Questions sent to Private Exchange
                  </span>
                ) : (
                  <button
                    onClick={fireToPE}
                    disabled={firing}
                    style={{
                      padding: '7px 14px', borderRadius: 7,
                      background: 'rgba(0,232,122,0.12)',
                      border: '1px solid rgba(0,232,122,0.25)',
                      color: '#00e87a', fontSize: 11.5, fontWeight: 700,
                      cursor: firing ? 'wait' : 'pointer',
                      opacity: firing ? 0.7 : 1,
                    }}
                  >
                    {firing ? 'Sending…' : '↑ Send questions to Private Exchange'}
                  </button>
                )
              ) : (
                <span style={{ color: 'rgba(148,163,184,0.40)', fontSize: 11, fontStyle: 'italic' }}>
                  Start a Private Exchange thread to send these questions to your lender
                </span>
              )}
              <span style={{ marginLeft: 'auto', color: 'rgba(148,163,184,0.30)', fontSize: 10 }}>
                Responses stored anonymously · AI training only
              </span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
