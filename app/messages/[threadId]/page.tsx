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

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/messages/${threadId}`);
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    setThread(data.thread);
    setMessages(data.messages ?? []);
    setContactShare(data.contact_share ?? null);
    setProCard(data.pro_card ?? null);

    // Hydrate Discover dock if scenario card data is available
    const ds = data.discover_scenario;
    const VALID_LOAN_TYPES: LoanTypeKey[] = ['fha', 'conventional', 'va', 'jumbo'];
    if (ds && VALID_LOAN_TYPES.includes(ds.loanType)) {
      setDiscoverScenario({
        loanType: ds.loanType as LoanTypeKey,
        snapshot: {
          price: ds.price,
          loanAmount: ds.loanAmount,
          downPct: ds.downPct,
          rate: ds.rate,
          term: ds.term,
          ltv: ds.ltv,
          monthlyPayment: ds.monthlyPayment,
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

  const isBorrower = thread?.is_borrower ?? true;
  const proType = thread?.professional_type === "agent" ? "Agent" : "Loan Officer";
  const hasDiscoverMessages = messages.some(m => m.metadata?.type === "discover_question");
  const LOAN_LABELS: Record<string, string> = { fha: "FHA", conventional: "Conventional", va: "VA", jumbo: "Jumbo" };
  // Nav title: always shows who you're talking TO
  // Borrower → "Loan Officer" or "Agent" (+ name once contact shared)
  // LO/Agent → borrower's real name (resolved server-side) or "Borrower"
  const navTitle = isBorrower
    ? (proCard?.name ? `${proType} · ${proCard.name}` : proType)
    : (thread?.borrower_name ? `Borrower · ${thread.borrower_name}` : "Borrower");
  const isClosed = thread?.status === "closed";
  const contactShared = thread?.status === "contact_shared" || !!contactShare;

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

        {/* Page body — centers the portal card */}
        <div className="ch-page-body">
          <div className="ch-portal">

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

            {/* Discover dock — only shown when discover hasn't been fired yet */}
            {isBorrower && !hasDiscoverMessages && (
              <div style={{ padding: "0 16px 4px" }}>
                <DiscoverDock
                  loanType={discoverScenario?.loanType}
                  scenario={discoverScenario?.snapshot}
                  threadId={threadId}
                />
              </div>
            )}

            {/* Discover scenario header — shown when discovery is active in thread */}
            {hasDiscoverMessages && discoverScenario && (
              <div className="ch-scenario-header">
                <span style={{ color: "rgba(0,232,122,0.4)", marginRight: 6 }}>⚡ Private Exchange</span>
                <span style={{ color: "rgba(0,232,122,0.25)", marginRight: 6 }}>Discover thread</span>
                <span style={{ color: "rgba(255,255,255,0.15)", marginRight: 6 }}>·</span>
                Based on scenario: {LOAN_LABELS[discoverScenario.loanType] ?? discoverScenario.loanType} · ${Math.round(discoverScenario.snapshot.price).toLocaleString()} · {discoverScenario.snapshot.downPct}% down · {discoverScenario.snapshot.rate.toFixed(2)}% · ${Math.round(discoverScenario.snapshot.monthlyPayment).toLocaleString()}/mo
              </div>
            )}

            {/* Messages scroll area */}
            <div className="ch-messages-wrap">
              {loading && <div className="ch-loading">Loading conversation…</div>}

              {!loading && messages.length === 0 && (
                <div className="ch-empty">Start the conversation below.</div>
              )}

              {!loading && messages.map((m, idx) => {
                const type = m.metadata?.type;
                const prevMsg = idx > 0 ? messages[idx - 1] : null;
                const isAfterBenchmark = prevMsg?.metadata?.type === "ai_benchmark";

                // AI benchmark block — "HOMERATES AI" green card
                if (type === "ai_benchmark") {
                  return (
                    <div key={m.id} className="ch-benchmark-block">
                      <div className="ch-benchmark-label">HOMERATES AI</div>
                      <div className="ch-benchmark-value">{m.metadata?.ai_value}</div>
                      {m.metadata?.ai_sub && (
                        <div className="ch-benchmark-sub">{m.metadata.ai_sub}</div>
                      )}
                      <div className="ch-benchmark-time">{fmt(m.created_at)}</div>
                    </div>
                  );
                }

                // Discover question — "YOU · VIA DISCOVER" teal card
                if (type === "discover_question") {
                  return (
                    <div key={m.id} className="ch-discover-q">
                      <div className="ch-discover-q-label">
                        <span>{m.metadata?.icon ?? "🔍"}</span>
                        <span className="ch-discover-q-via">YOU · VIA DISCOVER</span>
                        {m.metadata?.title && (
                          <span className="ch-discover-q-title">{m.metadata.title}</span>
                        )}
                      </div>
                      <div className="ch-discover-q-text">{m.content}</div>
                      <div className="ch-discover-q-time">{fmt(m.created_at)}</div>
                    </div>
                  );
                }

                // Old single-block discover system message — backward compat
                if (type === "discover" && m.sender_role === "system") {
                  return (
                    <div key={m.id} className="ch-discover-msg">
                      <div className="ch-discover-header">🔍 Discover · Lender Verification Questions</div>
                      {m.content.split("\n").map((line, i) => (
                        <span key={i}>{line}<br /></span>
                      ))}
                    </div>
                  );
                }

                // Regular system message
                if (m.sender_role === "system") {
                  return (
                    <div key={m.id} className="ch-system-msg">
                      {m.content.split("\n").map((line, i) => (
                        <span key={i}>{line}<br /></span>
                      ))}
                    </div>
                  );
                }

                // Professional message answering a discover question — "YOUR LOAN OFFICER"
                if (m.sender_role === "professional" && isAfterBenchmark) {
                  return (
                    <div key={m.id} className="ch-lo-answer">
                      <div className="ch-lo-answer-label">YOUR LOAN OFFICER</div>
                      <div className="ch-lo-answer-text">
                        {m.content.split("\n").map((line, i) => (
                          <span key={i}>{line}{i < m.content.split("\n").length - 1 ? <br /> : null}</span>
                        ))}
                      </div>
                      <div className="ch-lo-answer-time">{fmt(m.created_at)}</div>
                    </div>
                  );
                }

                // Regular chat bubble
                const mine = (isBorrower && m.sender_role === "borrower") || (!isBorrower && m.sender_role === "professional");
                return (
                  <div key={m.id} className={`ch-bubble-row ${mine ? "ch-mine" : "ch-theirs"}`}>
                    {!mine && (
                      <div className="ch-avatar">
                        {(isBorrower ? proType : "B").charAt(0).toUpperCase()}
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
              {!isBorrower && (
                <div className="ch-lo-disclaimer">Rate indications only — not a Loan Estimate. Disclosure is auto-appended when you mention a rate.</div>
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
        </div>{/* /ch-page-body */}

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

        /* Page body — centers the portal card horizontally */
        .ch-page-body {
          flex: 1; min-height: 0;
          display: flex; justify-content: center;
          padding: 0 16px 16px;
          overflow: hidden;
        }

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
        }

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
          font-size: 0.7rem; color: #3a4560;
          margin-bottom: 8px; line-height: 1.4;
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

        /* ── Responsive ── */
        @media (max-width: 520px) {
          .ch-page-body { padding: 0 0 0; }
          .ch-portal { border-radius: 0; border-left: none; border-right: none; }
          .ch-bubble { max-width: 86%; }
          .ch-share-cards { flex-direction: column; }
          .ch-share-arrow { transform: rotate(90deg); }
        }
      `}</style>
    </>
  );
}
