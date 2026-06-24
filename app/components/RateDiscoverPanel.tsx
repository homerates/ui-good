'use client';
// app/components/RateDiscoverPanel.tsx
// Inline discover dialogue for a specific rate offer.
// Phase 1: AI-assisted Q&A about the rate (no contact pressure).
// Phase 2: Connect CTA surfaces naturally after 3 user messages.

import { useState, useRef, useEffect } from 'react';
import type { MarketplaceInput } from '../../lib/pricing/marketplace-engine';

// ─── Types ─────────────────────────────────────────────────────────────────────

type Msg = { role: 'user' | 'assistant'; content: string };

interface Props {
  lenderId: string;
  label: string;
  rate: number;
  apr: number;
  monthly: number;
  estClosingCosts: number;
  scenario: MarketplaceInput;
  onClose: () => void;
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const S = {
  panel: {
    background: '#0e1420',
    border: '1px solid rgba(0,232,122,0.2)',
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 8,
    fontFamily: "'DM Sans', system-ui, sans-serif",
  } as React.CSSProperties,

  header: {
    padding: '14px 18px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12,
  } as React.CSSProperties,

  rateChip: {
    background: 'rgba(0,232,122,0.09)',
    border: '1px solid rgba(0,232,122,0.22)',
    borderRadius: 9, padding: '6px 13px', textAlign: 'center' as const,
    flexShrink: 0,
  } as React.CSSProperties,

  msgArea: {
    padding: '14px 18px',
    display: 'flex', flexDirection: 'column' as const, gap: 8,
    maxHeight: 360, overflowY: 'auto' as const,
  } as React.CSSProperties,

  msgAI: {
    background: 'rgba(255,255,255,0.04)',
    borderRadius: '0 10px 10px 10px',
    padding: '10px 13px',
    fontSize: '0.83rem', color: 'rgba(185,208,192,0.78)',
    lineHeight: 1.55, maxWidth: '90%',
  } as React.CSSProperties,

  msgUser: {
    background: 'rgba(0,232,122,0.07)',
    border: '1px solid rgba(0,232,122,0.15)',
    borderRadius: '10px 0 10px 10px',
    padding: '10px 13px',
    fontSize: '0.83rem', color: 'rgba(185,208,192,0.88)',
    lineHeight: 1.55, maxWidth: '88%', marginLeft: 'auto',
  } as React.CSSProperties,

  inputRow: {
    display: 'flex', gap: 8,
    padding: '0 18px 14px',
    borderTop: '1px solid rgba(255,255,255,0.04)',
    paddingTop: 10,
  } as React.CSSProperties,

  inputField: {
    flex: 1, padding: '9px 12px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 9, color: '#f0f4ff',
    fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none',
  } as React.CSSProperties,

  sendBtn: {
    padding: '9px 16px',
    background: 'rgba(0,232,122,0.1)',
    border: '1px solid rgba(0,232,122,0.25)',
    borderRadius: 9, color: '#4ade80',
    fontWeight: 700, fontSize: '0.8rem',
    fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,

  connectSurface: {
    margin: '0 18px 14px',
    background: 'linear-gradient(135deg, rgba(0,232,122,0.07), rgba(0,232,122,0.03))',
    border: '1px solid rgba(0,232,122,0.22)',
    borderRadius: 12, padding: 15,
  } as React.CSSProperties,

  connectBtn: {
    flex: 1, padding: '11px',
    background: '#4ade80', border: 'none',
    borderRadius: 9, color: '#080c12',
    fontWeight: 800, fontSize: '0.87rem',
    fontFamily: 'inherit', cursor: 'pointer',
  } as React.CSSProperties,

  notYetBtn: {
    padding: '11px 14px', background: 'none',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 9, color: 'rgba(185,208,192,0.35)',
    fontSize: '0.75rem', fontFamily: 'inherit', cursor: 'pointer',
  } as React.CSSProperties,

  textInput: {
    flex: 1, padding: '9px 12px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, color: '#f0f4ff',
    fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none',
  } as React.CSSProperties,
};

// ─── Component ─────────────────────────────────────────────────────────────────

export default function RateDiscoverPanel({
  lenderId, label, rate, apr, monthly, estClosingCosts, scenario, onClose,
}: Props) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      content: `This offer is at ${rate.toFixed(3)}% — PAR rate, no discount points and no lender credits. Your scenario fully qualifies for this lender's eligibility criteria. What would you like to understand about this offer — the APR, closing costs, program requirements, or what to expect at closing?`,
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showConnectCTA, setShowConnectCTA] = useState(false);
  const [connectStep, setConnectStep] = useState<'idle' | 'form' | 'done'>('idle');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, showConnectCTA, connectStep]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;

    const newMessages: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setSending(true);

    try {
      const res = await fetch('/api/rate-marketplace/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rate, apr, monthly, estClosingCosts, scenario, messages: newMessages }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.response ?? 'Error generating response.' }]);
      if (data.showConnectCTA) setShowConnectCTA(true);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error — please try again.' }]);
    } finally {
      setSending(false);
    }
  }

  async function submitOptIn() {
    if (!contactName.trim() || !contactEmail.trim()) {
      setConnectError('Name and email are required.');
      return;
    }
    setConnecting(true);
    setConnectError('');
    try {
      const res = await fetch('/api/rate-marketplace/opt-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lenderId, scenario, contactName, contactEmail }),
      });
      const data = await res.json();
      if (!res.ok) { setConnectError(data.error ?? 'Something went wrong.'); return; }
      setConnectStep('done');
    } catch {
      setConnectError('Connection error — please try again.');
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div style={S.panel}>

      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#00e87a', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 2 }}>
            {label} · Discover
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#f0f4ff' }}>Explore this rate offer</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={S.rateChip}>
            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#4ade80' }}>{rate.toFixed(3)}%</div>
            <div style={{ fontSize: '0.6rem', color: 'rgba(185,208,192,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>APR {apr.toFixed(3)}%</div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(185,208,192,0.3)', fontSize: '1.1rem', padding: '4px 6px', lineHeight: 1,
          }}>✕</button>
        </div>
      </div>

      {/* Context note */}
      <div style={{ margin: '12px 18px 0', padding: '9px 12px', background: 'rgba(255,255,255,0.025)', borderRadius: 8, borderLeft: '2px solid rgba(0,232,122,0.3)', fontSize: '0.72rem', color: 'rgba(185,208,192,0.4)', lineHeight: 1.5 }}>
        AI context loaded — ${scenario.loanAmount.toLocaleString()} {scenario.loanType}, {scenario.ltv}% LTV, {scenario.lockDays}-day lock, {scenario.state}. Ask anything about this rate offer.
      </div>

      {/* Message area */}
      <div style={S.msgArea}>
        {messages.map((m, i) => (
          <div key={i} style={m.role === 'assistant' ? S.msgAI : S.msgUser}>
            {m.content}
          </div>
        ))}
        {sending && (
          <div style={{ ...S.msgAI, color: 'rgba(185,208,192,0.3)', fontStyle: 'italic' }}>Thinking…</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Connect CTA — surfaces after dialogue */}
      {showConnectCTA && connectStep === 'idle' && (
        <div style={S.connectSurface}>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'rgba(0,232,122,0.55)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 5 }}>
            Ready to connect?
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(185,208,192,0.55)', lineHeight: 1.5, marginBottom: 11 }}>
            Share your name and email to open a direct conversation with this lender. They see your rate scenario only — not this chat.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={S.connectBtn} onClick={() => setConnectStep('form')}>Connect with {label} →</button>
            <button style={S.notYetBtn} onClick={() => setShowConnectCTA(false)}>Not yet</button>
          </div>
        </div>
      )}

      {/* Contact form */}
      {connectStep === 'form' && (
        <div style={{ ...S.connectSurface, marginTop: 0 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'rgba(0,232,122,0.55)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 10 }}>
            Your contact details
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
            <input
              style={S.textInput}
              placeholder="Full name"
              value={contactName}
              onChange={e => setContactName(e.target.value)}
            />
            <input
              style={S.textInput}
              placeholder="Email address"
              type="email"
              value={contactEmail}
              onChange={e => setContactEmail(e.target.value)}
            />
          </div>
          {connectError && (
            <div style={{ fontSize: '0.72rem', color: '#ff5f5f', marginBottom: 8 }}>{connectError}</div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...S.connectBtn, opacity: connecting ? 0.6 : 1 }} onClick={submitOptIn} disabled={connecting}>
              {connecting ? 'Connecting…' : 'Share & connect →'}
            </button>
            <button style={S.notYetBtn} onClick={() => setConnectStep('idle')}>Back</button>
          </div>
          <div style={{ fontSize: '0.65rem', color: 'rgba(185,208,192,0.25)', marginTop: 9, lineHeight: 1.5 }}>
            Your details are shared with this lender only. No unsolicited contact. You control the conversation.
          </div>
        </div>
      )}

      {/* Connected state */}
      {connectStep === 'done' && (
        <div style={{ ...S.connectSurface, background: 'rgba(0,232,122,0.06)', marginTop: 0 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#4ade80', marginBottom: 5 }}>
            ✓ Connected with {label}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'rgba(185,208,192,0.55)', lineHeight: 1.55 }}>
            This lender has your scenario and contact info. You can continue asking questions here while you wait to hear from them.
          </div>
        </div>
      )}

      {/* Input row */}
      <div style={S.inputRow}>
        <input
          style={S.inputField}
          placeholder={connectStep === 'done' ? 'Keep asking questions…' : 'Ask about this rate, APR, costs, program requirements…'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          disabled={sending}
        />
        <button style={S.sendBtn} onClick={sendMessage} disabled={sending || !input.trim()}>
          {sending ? '…' : 'Send →'}
        </button>
      </div>

    </div>
  );
}
