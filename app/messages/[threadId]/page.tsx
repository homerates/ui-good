"use client";
// app/messages/[threadId]/page.tsx
// Private async chat between borrower and professional
// Compliance: rate disclosure auto-appended server-side, PII blocked server-side
// Contact share: borrower-triggered, shows both emails + phones

import { useEffect, useRef, useState, use } from "react";
import { useAuth } from "@clerk/nextjs";
import AppNav from "../../components/AppNav";
import DiscoverDock from "../../components/DiscoverDock";
import type { LoanTypeKey, ScenarioSnapshot } from "../../../lib/discoverQuestions";
import type { ChipSummary } from "../../components/DiscoverDock";

interface Message {
  id: string;
  sender_role: "borrower" | "professional" | "system";
  content: string;
  read_at: string | null;
  created_at: string;
  metadata?: {
    type?: string;
    session_id?: string;
    loan_type?: string;
    question_id?: string;
    title?: string;
    icon?: string;
    ai_value?: string;
    ai_sub?: string;
  } | null;
}

interface Thread {
  id: string;
  borrower_id: string;
  professional_id: string;
  professional_type: string;
  status: string;
  is_borrower: boolean;
  borrower_name: string | null;
  scenario_id: string | null;
  last_message_at: string | null;
  created_at: string;
}

interface ContactShare {
  borrower_email: string | null;
  borrower_phone: string | null;
  pro_email: string | null;
  pro_phone: string | null;
  shared_at: string;
}

interface ProCard {
  name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  company: string | null;
  nmls: string | null;
  website: string | null;
  officeAddress: string | null;
  licenseState: string | null;
  role: string;
  imageUrl: string | null;
  isFoundingMember?: boolean;
}

export default function ThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = use(params);
  const { isLoaded, isSignedIn } = useAuth();

  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [discoverScenario, setDiscoverScenario] = useState<{ loanType: LoanTypeKey; snapshot: ScenarioSnapshot } | null>(null);
  const [contactShare, setContactShare] = useState<ContactShare | null>(null);
  const [proCard, setProCard] = useState<ProCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [showShareConfirm, setShowShareConfirm] = useState(false);
  const [mobileTab, setMobileTab] = useState<"chat" | "discover">("chat");
  const [discoverChipStates, setDiscoverChipStates] = useState<ChipSummary[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [viewerRole, setViewerRole] = useState<'borrower' | 'agent'>('borrower');
  const [fredRate, setFredRate] = useState<number | null>(null);
  const fredFetchedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Wait for Clerk to initialise before fetching — avoids 401 on cold load
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      window.location.href = `/sign-in?redirect_url=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    load();
  }, [isLoaded, isSignedIn, threadId]);

  // Poll for new messages every 5s — stop when tab hidden or component unmounts
  useEffect(() => {
    if (!threadId) return;
    const interval = setInterval(async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/messages/${threadId}`);
        if (!res.ok) return;
        const data = await res.json();
        const incoming: Message[] = data.messages ?? [];
        setMessages(prev => incoming.length > prev.length ? incoming : prev);
        if (data.contact_share) setContactShare(data.contact_share);
        if (data.thread) setThread(t => t ? { ...t, status: data.thread.status } : t);
      } catch { /* ignore network blips */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch live FRED 30yr benchmark (once, when scenario is available — used by both sides)
  useEffect(() => {
    if (!discoverScenario || fredFetchedRef.current) return;
    fredFetchedRef.current = true;
    fetch('/api/fred')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.ok && d.mort30Avg) setFredRate(d.mort30Avg); })
      .catch(() => {});
  }, [discoverScenario]);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/messages/${threadId}`);
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    setThread(data.thread);
    setMessages(data.messages ?? []);
    setContactShare(data.contact_share ?? null);
    setProCard(data.pro_card ?? null);
    if (data.viewer_role === 'agent') setViewerRole('agent');

    // Hydrate Discover dock if scenario card data is available
    const ds = data.discover_scenario;
    const VALID_LOAN_TYPES: LoanTypeKey[] = ['fha', 'conventional', 'va', 'jumbo'];
    if (ds && ds.price && ds.rate) {
      const safeLoanType: LoanTypeKey = VALID_LOAN_TYPES.includes(ds.loanType as LoanTypeKey)
        ? ds.loanType as LoanTypeKey
        : 'conventional';
      setDiscoverScenario({
        loanType: safeLoanType,
        snapshot: {
          price: ds.price,
          loanAmount: ds.loanAmount ?? ds.price * 0.965,
          downPct: ds.downPct ?? 3.5,
          rate: ds.rate,
          term: ds.term ?? 30,
          ltv: ds.ltv ?? 0.965,
          monthlyPayment: ds.monthlyPayment ?? 0,
        },
      });
    }

    setLoading(false);
  }

  async function send() {
    if (!draft.trim() || sending) return;
    setSending(true);
    setSendError("");
    const res = await fetch(`/api/messages/${threadId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: draft.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSendError(data.error ?? "Failed to send");
      setSending(false);
      return;
    }
    setMessages(prev => [...prev, data.message]);
    setDraft("");
    setSending(false);
    textareaRef.current?.focus();
  }

  async function shareContact() {
    setSharing(true);
    setShowShareConfirm(false);
    const res = await fetch(`/api/messages/${threadId}/share-contact`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setContactShare({
        borrower_email: data.borrower_email,
        borrower_phone: data.borrower_phone,
        pro_email: data.pro_email,
        pro_phone: data.pro_phone,
        shared_at: new Date().toISOString(),
      });
      setThread(prev => prev ? { ...prev, status: "contact_shared" } : prev);
      // Reload to get system message
      await load();
    }
    setSharing(false);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const fmt = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const fmtPrice = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1_000)}k`;

  const loInitials = (name: string | null | undefined) =>
    name ? name.trim().split(/\s+/).map(w => w[0].toUpperCase()).slice(0, 2).join('') : 'LO';

  const isBorrower = thread?.is_borrower ?? true;
  const proType = thread?.professional_type === "agent" ? "Agent" : "Loan Officer";
  const navTitle = isBorrower
    ? (proCard?.name ? `${proType} · ${proCard.name}` : proType)
    : (thread?.borrower_name ? `Borrower · ${thread.borrower_name}` : "Borrower");
  const isClosed = thread?.status === "closed";
  const contactShared = thread?.status === "contact_shared" || !!contactShare;
  const hasDock = isBorrower;

  // Derive which chip questions have already been sent (from thread messages)
  const sentChipIds = messages
    .filter(m => m.metadata?.type === "discover_chip")
    .map(m => (m.metadata as { chipId?: string })?.chipId ?? "")
    .filter(Boolean);

  // Derive which chips the LO has already replied to, and their reply text
  const loRepliedChipIds: string[] = [];
  const loReplies: Record<string, string> = {};
  for (const chipId of sentChipIds) {
    const chipMsg = messages.find(
      m => m.metadata?.type === "discover_chip" && (m.metadata as { chipId?: string })?.chipId === chipId
    );
    if (!chipMsg) continue;
    const loReply = messages.find(m => m.sender_role === "professional" && m.created_at > chipMsg.created_at);
    if (loReply) {
      loRepliedChipIds.push(chipId);
      loReplies[chipId] = loReply.content;
    }
  }

  return (
    <>
      <div className="ch-root">
        {/* Shared app nav */}
        <AppNav
          mode="thread"
          backHref="/messages"
          backLabel="← Inbox"
          title={navTitle}
          titleBadge={contactShared ? <span className="ch-contact-badge">Contact shared</span> : undefined}
        />

        {/* Mobile tab bar — only when dock is available */}
        {hasDock && (
          <div className="ch-tab-bar">
            <button className={`ch-tab-btn${mobileTab === "chat" ? " active" : ""}`} onClick={() => setMobileTab("chat")}>
              💬 Chat
            </button>
            <button className={`ch-tab-btn${mobileTab === "discover" ? " active" : ""}`} onClick={() => setMobileTab("discover")}>
              {viewerRole === 'agent' ? '🤝 Discover — For Client' : '🔍 Discover'}
            </button>
          </div>
        )}

        {/* Discover progress strip — 4 chip states, shown when dock is active */}
        {hasDock && discoverScenario && discoverChipStates.length > 0 && (
          <div className="ch-progress-strip">
            <div className="ch-progress-inner">
              {discoverChipStates.map(chip => (
                <div key={chip.id} className={`ch-prog-chip ch-prog-${chip.status}`}>
                  <span className="ch-prog-icon">{chip.icon}</span>
                  <span className="ch-prog-label">{chip.title.split(' &')[0]}</span>
                  <span className="ch-prog-pill">
                    {chip.status === 'idle'      ? '' :
                     chip.status === 'next'      ? 'Ask →' :
                     chip.status === 'waiting'   ? '…' :
                     chip.status === 'analyzing' ? '✨' :
                     chip.status === 'match'     ? '✓' :
                     chip.status === 'check'     ? '⚡' : '⚠'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Page body */}
        <div className={`ch-page-body${hasDock ? " ch-split-mode" : ""}`}>

          {/* ── Left: Chat column ── */}
          <div className={`ch-chat-col${hasDock && mobileTab !== "chat" ? " ch-mobile-hidden" : ""}`}>
          <div className="ch-portal">

            {/* Chat header — LO info (borrower view) or slim debug bar (LO view) */}
            <div className="ch-chat-header">
              {isBorrower ? (
                <>
                  <div className="ch-chat-header-avatar">
                    {loInitials(proCard?.name ?? null)}
                  </div>
                  <div className="ch-chat-header-body">
                    <div className="ch-chat-header-name">{proCard?.name ?? proType}</div>
                    {(proCard?.company || proCard?.nmls) && (
                      <div className="ch-chat-header-meta">
                        {[proCard.company, proCard.nmls ? `NMLS ${proCard.nmls}` : null].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  {discoverScenario && (
                    <div className="ch-chat-header-badge">
                      {{ fha: 'FHA', conventional: 'Conv.', va: 'VA', jumbo: 'Jumbo' }[discoverScenario.loanType]} · {fmtPrice(discoverScenario.snapshot.price)}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="ch-chat-header-avatar" style={{ background: 'linear-gradient(135deg,#1a3a2a,#2d5a3e)', color: '#00e87a' }}>
                    {contactShared && thread?.borrower_name
                      ? loInitials(thread.borrower_name)
                      : 'B'}
                  </div>
                  <div className="ch-chat-header-body">
                    <div className="ch-chat-header-name">
                      {contactShared && thread?.borrower_name ? thread.borrower_name : 'Borrower'}
                    </div>
                    {discoverScenario && (
                      <div className="ch-chat-header-meta">
                        {{ fha: 'FHA', conventional: 'Conventional', va: 'VA', jumbo: 'Jumbo' }[discoverScenario.loanType]}
                        {' · '}{fmtPrice(discoverScenario.snapshot.price)}
                      </div>
                    )}
                  </div>
                </>
              )}
              <button className="ch-debug-btn" title="Export thread JSON" onClick={() => setShowDebug(true)}>{'{ }'}</button>
            </div>

            {/* LO scenario strip — mirrors Discover dock scenario context */}
            {!isBorrower && discoverScenario && (
              <div className="ch-lo-scen-strip">
                {[
                  { val: fmtPrice(discoverScenario.snapshot.price),                                            lbl: 'Purchase' },
                  { val: `${discoverScenario.snapshot.downPct}% down`,                                         lbl: 'Down' },
                  { val: fredRate ? `${fredRate.toFixed(3)}%` : `${discoverScenario.snapshot.rate.toFixed(3)}%`, lbl: 'FRED Benchmark' },
                  { val: `$${Math.round(discoverScenario.snapshot.monthlyPayment).toLocaleString()}/mo`,        lbl: 'Est. P&I' },
                ].map(item => (
                  <div key={item.lbl} className="ch-lo-scen-item">
                    <span className="ch-lo-scen-val">{item.val}</span>
                    <span className="ch-lo-scen-lbl">{item.lbl}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Contact share banner — professional card */}
            {contactShared && contactShare && (
              <div className="ch-share-banner">
                <div className="ch-share-banner-inner">
                  <div className="ch-share-check">✓</div>
                  <div className="ch-share-banner-text">
                    <div className="ch-share-banner-title">Contact information exchanged</div>
                    <div className="ch-share-portal">You&apos;re connected. Reach out directly to move forward.</div>
                  </div>
                </div>

                {/* Professional card (shown to borrower) */}
                {isBorrower && proCard && (
                  <div className="ch-pro-card">
                    {proCard.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={proCard.imageUrl} alt={proCard.name ?? proType} className="ch-pro-card-avatar-img" />
                    ) : (
                      <div className="ch-pro-card-avatar">
                        {(proCard.name ?? proType).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="ch-pro-card-body">
                      <div className="ch-pro-card-name">
                        {proCard.name ?? proType}
                        {proCard.isFoundingMember && (
                          <span style={{ display: "inline-block", marginLeft: 8, fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", background: "rgba(0,232,122,0.12)", color: "#00e87a", border: "1px solid rgba(0,232,122,0.25)", borderRadius: 6, padding: "2px 7px", verticalAlign: "middle" }}>
                            🏅 Founding Member
                          </span>
                        )}
                      </div>
                      {proCard.title && <div className="ch-pro-card-title">{proCard.title}</div>}
                      {proCard.company && <div className="ch-pro-card-company">{proCard.company}</div>}
                      <div className="ch-pro-card-contacts">
                        {proCard.email && (
                          <a className="ch-pro-card-link" href={`mailto:${proCard.email}`}>
                            <span>✉</span>{proCard.email}
                          </a>
                        )}
                        {proCard.phone && (
                          <a className="ch-pro-card-link" href={`tel:${proCard.phone}`}>
                            <span>📞</span>{proCard.phone}
                          </a>
                        )}
                        {proCard.website && (
                          <a className="ch-pro-card-link" href={proCard.website} target="_blank" rel="noopener noreferrer">
                            <span>🌐</span>{proCard.website.replace(/^https?:\/\//, "")}
                          </a>
                        )}
                      </div>
                      {(proCard.nmls || proCard.officeAddress) && (
                        <div className="ch-pro-card-meta">
                          {proCard.nmls && (
                            <span className="ch-pro-card-badge">
                              {proCard.role === "agent" ? "License" : "NMLS"} #{proCard.nmls}
                              {proCard.licenseState ? ` · ${proCard.licenseState}` : ""}
                            </span>
                          )}
                          {proCard.officeAddress && (
                            <span className="ch-pro-card-office">{proCard.officeAddress}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Borrower contact (shown to professional) */}
                {!isBorrower && (
                  <div className="ch-share-cards">
                    <div className="ch-share-card">
                      <div className="ch-share-card-label">Borrower contact</div>
                      <div className="ch-share-card-value">{contactShare.borrower_email ?? "—"}</div>
                      {contactShare.borrower_phone && (
                        <div className="ch-share-card-value ch-share-card-phone">{contactShare.borrower_phone}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Scenario context strip — compact, in chat column */}
            {isBorrower && discoverScenario && (
              <div className="ch-scenario-header">
                Discover active ·&nbsp;
                <span style={{ color: "rgba(185,208,192,0.75)", fontWeight: 600 }}>
                  {({ fha: "FHA", conventional: "Conventional", va: "VA", jumbo: "Jumbo" }[discoverScenario.loanType])} · ${discoverScenario.snapshot.price.toLocaleString()} · {discoverScenario.snapshot.rate}% rate
                </span>
              </div>
            )}

            {/* Messages scroll area */}
            <div className="ch-messages-wrap">
              {loading && <div className="ch-loading">Loading conversation…</div>}

              {!loading && messages.length === 0 && (
                <div className="ch-empty">Start the conversation below.</div>
              )}

              {!loading && messages.map(m => {
                const type = m.metadata?.type;

                if (m.sender_role === "system") {
                  if (type === "ai_benchmark") {
                    return (
                      <div key={m.id} className="ch-benchmark-block">
                        <div className="ch-benchmark-label">HomeRates AI</div>
                        <div className="ch-benchmark-value">{m.metadata?.ai_value ?? m.content}</div>
                        {m.metadata?.ai_sub && <div className="ch-benchmark-sub">{m.metadata.ai_sub}</div>}
                        <div className="ch-benchmark-time">{fmt(m.created_at)}</div>
                      </div>
                    );
                  }
                  if (type === "discover" || type === "discover_question") return null; // old format, suppress
                  return (
                    <div key={m.id} className="ch-system-msg">
                      {m.content.split("\n").map((line, i) => (
                        <span key={i}>{line}<br /></span>
                      ))}
                    </div>
                  );
                }

                // Discover chip question — sent one at a time from the dock
                if (type === "discover_chip" || type === "discover_question") {
                  return (
                    <div key={m.id} className="ch-discover-q">
                      <div className="ch-discover-q-label">
                        <span className="ch-discover-q-via">You · via Discover</span>
                        {m.metadata?.icon && <span style={{ fontSize: 12 }}>{m.metadata.icon}</span>}
                        {m.metadata?.title && <span className="ch-discover-q-title">{m.metadata.title}</span>}
                      </div>
                      <div className="ch-discover-q-text">{m.content}</div>
                      <div className="ch-discover-q-time">{fmt(m.created_at)}</div>
                    </div>
                  );
                }

                const mine = (isBorrower && m.sender_role === "borrower") || (!isBorrower && m.sender_role === "professional");
                return (
                  <div key={m.id} className={`ch-bubble-row ${mine ? "ch-mine" : "ch-theirs"}`}>
                    {!mine && (
                      <div className="ch-avatar">
                        {isBorrower ? loInitials(proCard?.name ?? null) : 'B'}
                      </div>
                    )}
                    <div className={`ch-bubble ${mine ? "ch-bubble-mine" : "ch-bubble-theirs"}`}>
                      <div className="ch-bubble-content">
                        {m.content.split("\n").map((line, i) => (
                          <span key={i}>{line}{i < m.content.split("\n").length - 1 ? <br /> : null}</span>
                        ))}
                      </div>
                      <div className="ch-bubble-time">{fmt(m.created_at)}</div>
                    </div>
                  </div>
                );
              })}

              <div ref={bottomRef} />
            </div>

            {/* Footer / compose */}
            <div className="ch-footer">
              {/* AI Coach Summary Bar — visible when Discover is active and at least one chip sent */}
              {isBorrower && discoverScenario && sentChipIds.length > 0 && (
                <div className="ch-coach-bar">
                  <span className="ch-coach-icon">🛡</span>
                  <div className="ch-coach-body">
                    {loRepliedChipIds.length === 0
                      ? <><strong>{sentChipIds.length}/4</strong> question{sentChipIds.length > 1 ? 's' : ''} sent — waiting for lender reply</>
                      : loRepliedChipIds.length < sentChipIds.length
                      ? <><strong>{loRepliedChipIds.length}</strong> answered · <strong>{sentChipIds.length - loRepliedChipIds.length}</strong> waiting — AI analyzing</>
                      : <><strong>{loRepliedChipIds.length}</strong> answer{loRepliedChipIds.length > 1 ? 's' : ''} received — AI analysis ready in Discover</>
                    }
                    {sentChipIds.length < 4 && (
                      <span className="ch-coach-more"> · {4 - sentChipIds.length} more question{4 - sentChipIds.length > 1 ? 's' : ''} ready</span>
                    )}
                  </div>
                  <button className="ch-coach-btn" onClick={() => setMobileTab('discover')}>Discover →</button>
                </div>
              )}

              {!isBorrower && (
                <div className="ch-lo-disclaimer">
                  <strong style={{ color: '#4a6e58' }}>Pre-application education only</strong> — no application has been submitted, no credit has been pulled, and no Loan Estimate obligation is created by responding. You may share the same program information you would publish on your website or present at an open house. A rate disclosure is auto-appended whenever you mention a rate.
                </div>
              )}

              {isBorrower && !contactShared && !isClosed && messages.length >= 2 && (
                <div className="ch-share-cta">
                  <span>Ready to move forward?</span>
                  <button className="ch-share-btn" onClick={() => setShowShareConfirm(true)}>
                    Share contact info →
                  </button>
                </div>
              )}

              {isClosed ? (
                <div className="ch-closed-msg">This conversation is closed.</div>
              ) : (
                <div className="ch-compose">
                  <textarea
                    ref={textareaRef}
                    className="ch-input"
                    placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={handleKey}
                    rows={3}
                    maxLength={1000}
                    disabled={sending}
                  />
                  <div className="ch-compose-bottom">
                    {sendError && <span className="ch-send-error">{sendError}</span>}
                    <span className="ch-char-count">{draft.length}/1000</span>
                    <button
                      className="ch-send-btn"
                      onClick={send}
                      disabled={!draft.trim() || sending}
                    >
                      {sending ? "Sending…" : "Send"}
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>{/* /ch-portal */}
          </div>{/* /ch-chat-col */}

          {/* ── Right: Discover dock column ── */}
          {hasDock && (
            <div className={`ch-dock-col${mobileTab !== "discover" ? " ch-mobile-hidden" : ""}`}>
              <DiscoverDock
                loanType={discoverScenario?.loanType}
                scenario={discoverScenario?.snapshot}
                threadId={threadId}
                sentChipIds={sentChipIds}
                loRepliedChipIds={loRepliedChipIds}
                loReplies={loReplies}
                onGapSummary={setDiscoverChipStates}
                isAgentProxy={viewerRole === 'agent'}
              />
            </div>
          )}

        </div>{/* /ch-page-body */}

        {/* JSON Debug modal — full thread state for analysis/bug reporting */}
        {showDebug && (
          <div className="ch-debug-overlay" onClick={() => setShowDebug(false)}>
            <div className="ch-debug-modal" onClick={e => e.stopPropagation()}>
              <div className="ch-debug-header">
                <span className="ch-debug-title">Thread Debug JSON</span>
                <span className="ch-debug-hint">Share this with your dev to diagnose analysis quality</span>
                <button
                  className="ch-debug-copy"
                  onClick={() => {
                    const ALL_CHIP_IDS = ['rate', 'costs', 'process', 'after-close'];
                    const derivedChipStates = ALL_CHIP_IDS.map(id => {
                      const sent    = sentChipIds.includes(id);
                      const replied = loRepliedChipIds.includes(id);
                      return { id, sent, replied, status: !sent ? 'not_sent' : !replied ? 'waiting' : 'replied' };
                    });
                    const payload = {
                      _exported_at: new Date().toISOString(),
                      _exported_from: isBorrower ? 'borrower' : 'lo',
                      _note: 'chipStates only populated when exported from borrower side; use _derived_chip_states for structural state',
                      thread,
                      proCard,
                      discoverScenario,
                      chipStates: discoverChipStates,
                      _derived_chip_states: derivedChipStates,
                      sentChipIds,
                      loRepliedChipIds,
                      loReplies,
                      messages: messages.map(m => ({
                        id: m.id,
                        sender_role: m.sender_role,
                        content: m.content,
                        metadata: m.metadata ?? null,
                        created_at: m.created_at,
                      })),
                    };
                    navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
                      .then(() => alert('Copied to clipboard ✓'))
                      .catch(() => alert('Copy failed — select all text manually'));
                  }}
                >Copy JSON</button>
                <button className="ch-debug-close" onClick={() => setShowDebug(false)}>✕</button>
              </div>
              <pre className="ch-debug-pre">{JSON.stringify({
                _exported_at: new Date().toISOString(),
                _exported_from: isBorrower ? 'borrower' : 'lo',
                _note: 'chipStates only populated when exported from borrower side; use _derived_chip_states for structural state',
                thread,
                proCard,
                discoverScenario,
                chipStates: discoverChipStates,
                _derived_chip_states: (['rate', 'costs', 'process', 'after-close'] as const).map(id => ({
                  id, sent: sentChipIds.includes(id), replied: loRepliedChipIds.includes(id),
                  status: !sentChipIds.includes(id) ? 'not_sent' : !loRepliedChipIds.includes(id) ? 'waiting' : 'replied',
                })),
                sentChipIds,
                loRepliedChipIds,
                loReplies,
                messages: messages.map(m => ({
                  id: m.id,
                  sender_role: m.sender_role,
                  content: m.content,
                  metadata: m.metadata ?? null,
                  created_at: m.created_at,
                })),
              }, null, 2)}</pre>
            </div>
          </div>
        )}

        {/* Share confirm modal — outside portal so it overlays everything */}
        {showShareConfirm && (
          <div className="ch-share-confirm">
            <div className="ch-share-confirm-box">
              <div className="ch-share-confirm-title">Share contact information?</div>
              <p className="ch-share-confirm-body">
                This will share your email and phone number with the {proType.toLowerCase()},
                and give you theirs. This is irreversible for this conversation.
              </p>
              <div style={{
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 8, padding: "10px 12px", margin: "0 0 16px",
                fontSize: "0.75rem", color: "#4a6e58", lineHeight: 1.6,
              }}>
                <strong style={{ color: "#6b8f7a" }}>Platform notice:</strong> HomeRates.ai is an introduction service only. We do not verify contact accuracy, guarantee responsiveness, or mediate any dispute between parties after contact is shared. By continuing, you acknowledge our{" "}
                <a href="/disclosures" target="_blank" rel="noopener noreferrer" style={{ color: "#00e87a" }}>Terms &amp; Disclosures</a>.
              </div>
              <div className="ch-share-confirm-actions">
                <button className="ch-share-confirm-cancel" onClick={() => setShowShareConfirm(false)}>Cancel</button>
                <button className="ch-share-confirm-ok" onClick={shareContact} disabled={sharing}>
                  {sharing ? "Sharing…" : "Yes, share contact →"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        body:has(.ch-root) {
          display: block !important; height: 100vh !important; overflow: hidden !important;
          background: #060a14 !important;
        }
        html:has(.ch-root) { background: #060a14 !important; height: 100% !important; overflow: hidden !important; }
        body:has(.ch-root) .app-footer { display: none; }

        /* Root shell */
        .ch-root {
          font-family: 'DM Sans', system-ui, sans-serif;
          color: #f0f4ff;
          height: 100vh;
          display: flex; flex-direction: column;
          background: #060a14;
        }

        /* Contact shared badge in AppNav */
        .ch-contact-badge {
          font-size: 0.7rem; font-weight: 600; color: #00e87a;
          background: rgba(0,232,122,0.12); border: 1px solid rgba(0,232,122,0.25);
          border-radius: 99px; padding: 2px 9px;
        }

        /* Page body */
        .ch-page-body {
          flex: 1; min-height: 0;
          display: flex; justify-content: center;
          padding: 0 16px 16px;
          overflow: hidden;
        }

        /* Split mode — side-by-side on desktop */
        .ch-split-mode {
          display: grid !important;
          grid-template-columns: 1fr 400px;
          gap: 12px;
          max-width: 1180px;
          width: 100%;
          margin-left: auto;
          margin-right: auto;
          align-items: start;
          overflow: hidden;
        }

        /* Chat column */
        .ch-chat-col {
          display: flex; flex-direction: column;
          min-height: 0; overflow: hidden;
          height: 100%;
          width: 100%; max-width: 780px;
          margin-left: auto;
          margin-right: auto;
        }

        /* Discover dock column */
        .ch-dock-col {
          overflow-y: auto;
          height: 100%;
          padding-top: 0;
          scrollbar-width: thin;
          scrollbar-color: rgba(148,163,184,0.12) transparent;
        }

        /* Mobile tab bar — hidden on desktop */
        .ch-tab-bar {
          display: none;
          flex-shrink: 0;
          background: #0a1020;
          border-bottom: 1px solid rgba(148,163,184,0.12);
        }
        .ch-tab-btn {
          flex: 1; padding: 12px 0;
          font-size: 13px; font-weight: 600;
          color: rgba(148,163,184,0.50);
          background: none; border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer; letter-spacing: 0.02em;
          transition: all 0.15s;
          font-family: 'DM Sans', system-ui, sans-serif;
        }
        .ch-tab-btn.active { color: #00e87a; border-bottom-color: #00e87a; }

        /* Portal card */
        .ch-portal {
          width: 100%; max-width: 780px;
          display: flex; flex-direction: column;
          background: #0b1220;
          border: 1px solid rgba(255,255,255,0.08);
          border-top: none;
          border-radius: 0 0 20px 20px;
          box-shadow: 0 0 0 1px rgba(0,232,122,0.04),
                      0 32px 80px rgba(0,0,0,0.45);
          overflow: hidden;
          height: 100%;
        }
        .ch-split-mode .ch-portal { max-width: 100%; border-radius: 0 0 14px 14px; }

        /* ── Contact share banner ── */
        .ch-share-banner {
          flex-shrink: 0;
          background: rgba(0,232,122,0.05);
          border-bottom: 1px solid rgba(0,232,122,0.14);
          padding: 14px 20px;
        }
        .ch-share-banner-inner {
          display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px;
        }
        .ch-share-check {
          width: 22px; height: 22px; border-radius: 50%;
          background: rgba(0,232,122,0.15); color: #00e87a;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.75rem; font-weight: 800; flex-shrink: 0; margin-top: 1px;
        }
        .ch-share-banner-text { flex: 1; }
        .ch-share-banner-title {
          font-size: 0.78rem; font-weight: 700; color: #00e87a;
          text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 2px;
        }
        .ch-share-portal { font-size: 0.78rem; color: #8fa3b8; line-height: 1.4; }

        .ch-share-cards {
          display: flex; align-items: center; gap: 10px;
        }
        .ch-share-card {
          flex: 1; background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 10px; padding: 10px 14px;
        }
        .ch-share-card-label {
          font-size: 0.68rem; font-weight: 700; letter-spacing: 0.06em;
          text-transform: uppercase; color: #3a4560; margin-bottom: 4px;
        }
        .ch-share-card-value {
          font-size: 0.875rem; font-weight: 600; color: #f0f4ff;
          word-break: break-all;
        }
        .ch-share-card-phone { font-weight: 400; color: #8fa3b8; font-size: 0.82rem; margin-top: 2px; }
        .ch-share-arrow { color: #3a4560; font-size: 1rem; flex-shrink: 0; }

        /* ── Professional contact card ── */
        .ch-pro-card {
          display: flex; align-items: flex-start; gap: 14px;
          background: linear-gradient(135deg, rgba(0,232,122,0.06), rgba(0,232,122,0.02));
          border: 1px solid rgba(0,232,122,0.15);
          border-radius: 14px; padding: 16px 18px;
          margin-top: 4px;
        }
        .ch-pro-card-avatar {
          width: 56px; height: 56px; border-radius: 50%;
          background: linear-gradient(135deg, #00e87a22, #00e87a44);
          border: 2px solid rgba(0,232,122,0.3);
          display: flex; align-items: center; justify-content: center;
          font-size: 1.3rem; font-weight: 800; color: #00e87a;
          flex-shrink: 0;
        }
        .ch-pro-card-avatar-img {
          width: 56px; height: 56px; border-radius: 50%;
          object-fit: cover; border: 2px solid rgba(0,232,122,0.3);
          flex-shrink: 0;
        }
        .ch-pro-card-body { flex: 1; min-width: 0; }
        .ch-pro-card-name {
          font-size: 1rem; font-weight: 700; color: #f0f4ff;
          margin-bottom: 1px;
        }
        .ch-pro-card-title {
          font-size: 0.8rem; color: #8fa3b8; font-weight: 500; margin-bottom: 1px;
        }
        .ch-pro-card-company {
          font-size: 0.8rem; color: #00e87a; font-weight: 600; margin-bottom: 8px;
        }
        .ch-pro-card-contacts {
          display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px;
        }
        .ch-pro-card-link {
          display: flex; align-items: center; gap: 6px;
          font-size: 0.825rem; color: #8fa3b8; text-decoration: none;
          transition: color 0.15s;
        }
        .ch-pro-card-link:hover { color: #f0f4ff; }
        .ch-pro-card-link span { font-size: 0.85rem; flex-shrink: 0; }
        .ch-pro-card-meta {
          display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
        }
        .ch-pro-card-badge {
          font-size: 0.68rem; font-weight: 700; letter-spacing: 0.05em;
          background: rgba(0,232,122,0.1); color: #00e87a;
          border: 1px solid rgba(0,232,122,0.2);
          border-radius: 6px; padding: 2px 8px;
        }
        .ch-pro-card-office {
          font-size: 0.73rem; color: #3a4560;
        }

        /* ── Messages scroll area ── */
        .ch-messages-wrap {
          flex: 1; min-height: 0;
          overflow-y: auto;
          padding: 20px 20px 12px;
          display: flex; flex-direction: column; gap: 8px;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.08) transparent;
        }
        .ch-loading, .ch-empty {
          text-align: center; color: #3a4560;
          padding: 3rem; font-size: 0.875rem;
        }

        /* Message rows */
        .ch-bubble-row {
          display: flex; align-items: flex-end; gap: 8px;
        }
        .ch-mine { justify-content: flex-end; }
        .ch-theirs { justify-content: flex-start; }

        /* Sender avatar (their messages only) */
        .ch-avatar {
          width: 28px; height: 28px; border-radius: 50%;
          background: rgba(61,139,255,0.15); color: #3d8bff;
          display: flex; align-items: center; justify-content: center;
          font-weight: 800; font-size: 0.75rem; flex-shrink: 0;
        }

        .ch-bubble {
          max-width: 68%; padding: 10px 14px 8px;
          border-radius: 16px;
          font-size: 0.9rem; line-height: 1.55;
          position: relative;
        }
        .ch-bubble-mine {
          background: linear-gradient(135deg, #1e4280, #1a3468);
          color: #ddeaff;
          border-bottom-right-radius: 4px;
          box-shadow: 0 2px 8px rgba(30,66,128,0.4);
        }
        .ch-bubble-theirs {
          background: #111826;
          color: #f0f4ff;
          border: 1px solid rgba(255,255,255,0.08);
          border-bottom-left-radius: 4px;
        }
        .ch-bubble-content { word-break: break-word; white-space: pre-wrap; }
        .ch-bubble-time {
          font-size: 0.65rem; color: rgba(255,255,255,0.3);
          margin-top: 4px; text-align: right;
        }

        /* System message */
        .ch-system-msg {
          text-align: center; align-self: center;
          background: rgba(0,232,122,0.05);
          border: 1px solid rgba(0,232,122,0.12);
          border-radius: 10px;
          padding: 10px 16px;
          font-size: 0.8rem; color: #8fa3b8; line-height: 1.6;
          max-width: 85%;
        }
        /* Discover scenario header line */
        .ch-scenario-header {
          flex-shrink: 0;
          background: rgba(0,232,122,0.03);
          border-bottom: 1px solid rgba(0,232,122,0.09);
          padding: 7px 20px;
          font-size: 0.72rem; color: rgba(255,255,255,0.25);
          font-weight: 500; letter-spacing: 0.02em;
        }

        /* Discover question message — "YOU · VIA DISCOVER" */
        .ch-discover-q {
          background: rgba(0,10,30,0.5);
          border: 1px solid rgba(0,232,122,0.10);
          border-left: 3px solid rgba(0,232,122,0.35);
          border-radius: 0 10px 10px 0;
          padding: 10px 14px;
          align-self: flex-start;
          max-width: 90%;
        }
        .ch-discover-q-label {
          display: flex; align-items: center; gap: 5px; margin-bottom: 5px;
        }
        .ch-discover-q-via {
          font-size: 0.62rem; font-weight: 800; letter-spacing: 0.09em;
          color: rgba(0,232,122,0.45); text-transform: uppercase;
        }
        .ch-discover-q-title {
          font-size: 0.65rem; color: rgba(0,232,122,0.30);
        }
        .ch-discover-q-text {
          font-size: 0.875rem; color: #c8dfc8; line-height: 1.55; font-style: italic;
        }
        .ch-discover-q-time {
          font-size: 0.62rem; color: rgba(255,255,255,0.18); margin-top: 4px; text-align: right;
        }

        /* AI benchmark block — "HOMERATES AI" */
        .ch-benchmark-block {
          background: rgba(0,232,122,0.06);
          border: 1px solid rgba(0,232,122,0.18);
          border-radius: 10px;
          padding: 12px 16px;
          align-self: flex-start;
          max-width: 90%;
        }
        .ch-benchmark-label {
          font-size: 0.60rem; font-weight: 800; letter-spacing: 0.10em;
          color: #00e87a; text-transform: uppercase; margin-bottom: 5px;
        }
        .ch-benchmark-value {
          font-size: 1.05rem; font-weight: 800; color: #00e87a; margin-bottom: 3px;
        }
        .ch-benchmark-sub {
          font-size: 0.76rem; color: rgba(0,232,122,0.50); line-height: 1.45;
        }
        .ch-benchmark-time {
          font-size: 0.62rem; color: rgba(255,255,255,0.18); margin-top: 4px; text-align: right;
        }

        /* LO answer in discover context — "YOUR LOAN OFFICER" */
        .ch-lo-answer {
          align-self: flex-end;
          background: linear-gradient(135deg, rgba(26,46,82,0.9), rgba(21,36,64,0.9));
          border: 1px solid rgba(61,139,255,0.20);
          border-radius: 10px;
          padding: 12px 16px;
          max-width: 85%;
        }
        .ch-lo-answer-label {
          font-size: 0.60rem; font-weight: 800; letter-spacing: 0.10em;
          color: #3d8bff; text-transform: uppercase; margin-bottom: 5px;
        }
        .ch-lo-answer-text {
          font-size: 0.9rem; color: #ddeaff; line-height: 1.55;
          white-space: pre-wrap; word-break: break-word;
        }
        .ch-lo-answer-time {
          font-size: 0.62rem; color: rgba(255,255,255,0.18); margin-top: 4px; text-align: right;
        }

        /* Discover message — full-width, left-aligned (old format backward compat) */
        .ch-discover-msg {
          align-self: stretch;
          background: rgba(0,10,24,0.60);
          border: 1px solid rgba(0,232,122,0.15);
          border-radius: 10px;
          padding: 12px 16px;
          font-size: 0.8rem; color: #8fa3b8; line-height: 1.7;
          white-space: pre-wrap;
        }
        .ch-discover-header {
          color: #00e87a; font-weight: 700; font-size: 0.78rem;
          letter-spacing: 0.03em; margin-bottom: 8px;
          text-transform: uppercase;
        }

        /* ── Footer / compose ── */
        .ch-footer {
          flex-shrink: 0;
          border-top: 1px solid rgba(255,255,255,0.07);
          background: #0b1220;
          padding: 10px 16px 14px;
        }
        .ch-lo-disclaimer {
          font-size: 0.72rem; color: #4a6058;
          margin-bottom: 8px; line-height: 1.55;
          background: rgba(0,232,122,0.03);
          border: 1px solid rgba(0,232,122,0.08);
          border-radius: 8px; padding: 8px 11px;
        }
        .ch-share-cta {
          display: flex; align-items: center; justify-content: space-between;
          background: rgba(0,232,122,0.05); border: 1px solid rgba(0,232,122,0.16);
          border-radius: 10px; padding: 9px 14px; margin-bottom: 10px;
          font-size: 0.82rem; color: #8fa3b8;
        }
        .ch-share-btn {
          font-size: 0.82rem; font-weight: 700; color: #00e87a;
          background: none; border: none; cursor: pointer; padding: 0;
        }
        .ch-share-btn:hover { text-decoration: underline; }

        .ch-closed-msg { text-align: center; color: #3a4560; font-size: 0.85rem; padding: 0.75rem 0; }

        /* Compose box */
        .ch-compose { display: flex; flex-direction: column; gap: 8px; }
        .ch-input {
          width: 100%;
          background: #141e30;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px; color: #f0f4ff;
          font-family: 'DM Sans', sans-serif; font-size: 0.9rem;
          padding: 10px 14px; resize: none; outline: none;
          transition: border-color 0.15s, background 0.15s;
          box-sizing: border-box;
        }
        .ch-input:focus {
          border-color: rgba(61,139,255,0.4);
          background: #162236;
        }
        .ch-input::placeholder { color: #2a3550; }
        .ch-input:disabled { opacity: 0.45; }

        .ch-compose-bottom {
          display: flex; align-items: center; justify-content: flex-end; gap: 10px;
        }
        .ch-char-count { font-size: 0.7rem; color: #3a4560; }
        .ch-send-error { font-size: 0.78rem; color: #ff5f5f; flex: 1; }
        .ch-send-btn {
          padding: 9px 24px;
          background: #00e87a; color: #080c12;
          border: none; border-radius: 999px;
          font-size: 0.875rem; font-weight: 700; cursor: pointer;
          transition: opacity 0.15s, transform 0.1s;
        }
        .ch-send-btn:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
        .ch-send-btn:active:not(:disabled) { transform: translateY(0); }
        .ch-send-btn:disabled { opacity: 0.35; cursor: not-allowed; }

        /* ── Share confirm modal ── */
        .ch-share-confirm {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.72);
          backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; padding: 1rem;
        }
        .ch-share-confirm-box {
          background: #0e1826;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 20px; padding: 2rem;
          max-width: 440px; width: 100%;
          box-shadow: 0 24px 64px rgba(0,0,0,0.6);
        }
        .ch-share-confirm-title {
          font-size: 1.1rem; font-weight: 700; color: #f0f4ff; margin-bottom: 0.75rem;
        }
        .ch-share-confirm-body {
          font-size: 0.875rem; color: #8fa3b8; line-height: 1.65; margin: 0 0 1.5rem;
        }
        .ch-share-confirm-actions { display: flex; gap: 10px; justify-content: flex-end; }
        .ch-share-confirm-cancel {
          padding: 10px 20px; background: none; color: #8fa3b8;
          border: 1px solid rgba(255,255,255,0.1); border-radius: 999px;
          font-size: 0.875rem; cursor: pointer; font-family: inherit;
          transition: border-color 0.15s, color 0.15s;
        }
        .ch-share-confirm-cancel:hover { border-color: rgba(255,255,255,0.22); color: #f0f4ff; }
        .ch-share-confirm-ok {
          padding: 10px 22px; background: #00e87a; color: #080c12;
          border: none; border-radius: 999px;
          font-size: 0.875rem; font-weight: 700; cursor: pointer; font-family: inherit;
          transition: opacity 0.15s;
        }
        .ch-share-confirm-ok:hover:not(:disabled) { opacity: 0.88; }
        .ch-share-confirm-ok:disabled { opacity: 0.4; cursor: not-allowed; }

        /* ── Discover progress strip ── */
        .ch-progress-strip {
          flex-shrink: 0;
          background: rgba(0,0,0,0.25);
          border-bottom: 1px solid rgba(148,163,184,0.08);
        }
        .ch-progress-inner {
          display: flex; gap: 6px; flex-wrap: wrap;
          padding: 8px 16px;
          max-width: 1180px;
          margin-left: auto; margin-right: auto;
          width: 100%; box-sizing: border-box;
        }
        .ch-prog-chip {
          display: flex; align-items: center; gap: 5px;
          padding: 4px 10px 4px 7px;
          border-radius: 20px; font-size: 11px; font-weight: 600;
          border: 1px solid rgba(148,163,184,0.12);
          color: rgba(148,163,184,0.40);
          background: rgba(148,163,184,0.04);
          transition: all 0.15s;
        }
        .ch-prog-icon { font-size: 12px; }
        .ch-prog-label { letter-spacing: 0.01em; }
        .ch-prog-pill { margin-left: 3px; }

        .ch-prog-chip.ch-prog-next    { background: rgba(139,92,246,0.10); border-color: rgba(139,92,246,0.30); color: #c4b5fd; }
        .ch-prog-chip.ch-prog-waiting { background: rgba(139,92,246,0.08); border-color: rgba(139,92,246,0.22); color: rgba(196,181,253,0.65); }
        .ch-prog-chip.ch-prog-analyzing { background: rgba(96,165,250,0.08); border-color: rgba(96,165,250,0.22); color: rgba(147,197,253,0.75); }
        .ch-prog-chip.ch-prog-match   { background: rgba(0,232,122,0.10); border-color: rgba(0,232,122,0.28); color: #00e87a; }
        .ch-prog-chip.ch-prog-check   { background: rgba(251,191,36,0.10); border-color: rgba(251,191,36,0.28); color: #fbbf24; }
        .ch-prog-chip.ch-prog-alert   { background: rgba(248,113,113,0.10); border-color: rgba(248,113,113,0.28); color: #f87171; }

        /* ── Debug button (in chat header) ── */
        .ch-debug-btn {
          flex-shrink: 0; margin-left: 4px;
          padding: 3px 8px; border-radius: 6px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(148,163,184,0.15);
          color: rgba(148,163,184,0.35);
          font-size: 10px; font-weight: 700;
          cursor: pointer; font-family: monospace;
          transition: all 0.15s;
        }
        .ch-debug-btn:hover { background: rgba(255,255,255,0.08); color: rgba(148,163,184,0.70); border-color: rgba(148,163,184,0.28); }

        /* ── JSON Debug modal ── */
        .ch-debug-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.80);
          backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          z-index: 2000; padding: 16px;
        }
        .ch-debug-modal {
          background: #0a1020;
          border: 1px solid rgba(148,163,184,0.18);
          border-radius: 14px;
          width: 100%; max-width: 720px;
          max-height: 86vh;
          display: flex; flex-direction: column;
          overflow: hidden;
          box-shadow: 0 24px 80px rgba(0,0,0,0.7);
        }
        .ch-debug-header {
          flex-shrink: 0;
          display: flex; align-items: center; gap: 10px;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(148,163,184,0.10);
          background: rgba(0,0,0,0.25);
        }
        .ch-debug-title { font-size: 13px; font-weight: 700; color: #f0f4ff; }
        .ch-debug-hint  { font-size: 11px; color: rgba(148,163,184,0.45); flex: 1; }
        .ch-debug-copy {
          padding: 5px 12px; border-radius: 7px;
          background: rgba(0,232,122,0.12);
          border: 1px solid rgba(0,232,122,0.28);
          color: #00e87a; font-size: 11px; font-weight: 700;
          cursor: pointer; font-family: inherit;
        }
        .ch-debug-close {
          padding: 5px 9px; border-radius: 7px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(148,163,184,0.15);
          color: rgba(148,163,184,0.60);
          font-size: 12px; cursor: pointer; font-family: inherit;
        }
        .ch-debug-pre {
          flex: 1; overflow-y: auto; overflow-x: auto;
          margin: 0; padding: 14px 16px;
          font-size: 11px; line-height: 1.6;
          color: #9de8bc;
          font-family: 'Menlo', 'Monaco', 'Consolas', monospace;
          white-space: pre;
          scrollbar-width: thin;
          scrollbar-color: rgba(148,163,184,0.15) transparent;
        }

        /* ── Chat header (LO info, inside ch-portal) ── */
        .ch-chat-header {
          flex-shrink: 0;
          display: flex; align-items: center; gap: 10px;
          padding: 13px 16px;
          border-bottom: 1px solid rgba(148,163,184,0.10);
          background: rgba(0,0,0,0.18);
        }
        .ch-chat-header-avatar {
          width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
          background: linear-gradient(135deg,#1e3a5f,#2d5a8e);
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 800; color: #60a5fa;
          letter-spacing: 0.02em;
        }
        .ch-chat-header-body { flex: 1; min-width: 0; }
        .ch-chat-header-name {
          font-size: 13px; font-weight: 700; color: #f0f4ff;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .ch-chat-header-meta {
          font-size: 11px; color: rgba(148,163,184,0.50);
          margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .ch-chat-header-badge {
          flex-shrink: 0;
          font-size: 10px; font-weight: 700;
          padding: 3px 9px; border-radius: 20px;
          background: rgba(0,232,122,0.10);
          border: 1px solid rgba(0,232,122,0.25);
          color: #00e87a; white-space: nowrap;
        }

        /* ── LO scenario strip ── */
        .ch-lo-scen-strip {
          flex-shrink: 0;
          display: flex; gap: 0; flex-wrap: wrap;
          border-bottom: 1px solid rgba(0,232,122,0.09);
          background: rgba(0,232,122,0.03);
        }
        .ch-lo-scen-item {
          display: flex; flex-direction: column; gap: 1px;
          padding: 8px 16px;
          border-right: 1px solid rgba(0,232,122,0.07);
        }
        .ch-lo-scen-item:last-child { border-right: none; }
        .ch-lo-scen-val {
          font-size: 13px; font-weight: 700; color: #f0f4ff;
        }
        .ch-lo-scen-lbl {
          font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em;
          color: rgba(148,163,184,0.40); font-weight: 600;
        }

        /* ── AI Coach Summary Bar ── */
        .ch-coach-bar {
          display: flex; align-items: center; gap: 8px;
          background: rgba(139,92,246,0.07);
          border: 1px solid rgba(139,92,246,0.20);
          border-radius: 10px; padding: 8px 12px;
          margin-bottom: 10px;
          font-size: 12px; color: rgba(196,181,253,0.85);
        }
        .ch-coach-icon { font-size: 13px; flex-shrink: 0; }
        .ch-coach-body { flex: 1; line-height: 1.4; }
        .ch-coach-body strong { color: #c4b5fd; font-weight: 700; }
        .ch-coach-more { color: rgba(196,181,253,0.55); }
        .ch-coach-btn {
          flex-shrink: 0;
          font-size: 11px; font-weight: 700; color: #a78bfa;
          background: rgba(139,92,246,0.12);
          border: 1px solid rgba(139,92,246,0.28);
          border-radius: 7px; padding: 4px 10px;
          cursor: pointer; font-family: inherit;
          transition: background 0.15s;
        }
        .ch-coach-btn:hover { background: rgba(139,92,246,0.20); }

        /* ── Responsive ── */
        @media (max-width: 700px) {
          .ch-split-mode {
            grid-template-columns: 1fr !important;
            gap: 0 !important;
            overflow-y: auto !important;
            align-items: start !important;
          }
          .ch-chat-col { height: auto; min-height: 0; overflow: visible; }
          .ch-portal   { height: auto; min-height: 80vh; }
          .ch-dock-col { height: auto; overflow-y: visible; }
          .ch-tab-bar  { display: flex; }
          .ch-mobile-hidden { display: none !important; }
          .ch-page-body { overflow-y: auto; overflow-x: hidden; }
        }

        @media (max-width: 520px) {
          .ch-page-body { padding: 0; }
          .ch-portal { border-radius: 0; border-left: none; border-right: none; }
          .ch-bubble { max-width: 86%; }
          .ch-share-cards { flex-direction: column; }
          .ch-share-arrow { transform: rotate(90deg); }
        }
      `}</style>
    </>
  );
}
