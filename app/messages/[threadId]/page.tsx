"use client";
// app/messages/[threadId]/page.tsx
// Private async chat between borrower and professional
// Compliance: rate disclosure auto-appended server-side, PII blocked server-side
// Contact share: borrower-triggered, shows both emails + phones

import { useEffect, useRef, useState, use } from "react";
import Link from "next/link";

interface Message {
  id: string;
  sender_role: "borrower" | "professional" | "system";
  content: string;
  read_at: string | null;
  created_at: string;
}

interface Thread {
  id: string;
  borrower_id: string;
  professional_id: string;
  professional_type: string;
  status: string;
  is_borrower: boolean;
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

export default function ThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = use(params);

  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [contactShare, setContactShare] = useState<ContactShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [showShareConfirm, setShowShareConfirm] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    load();
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
  const proLabel = thread?.professional_type === "agent" ? "Agent" : "Loan Officer";
  const isClosed = thread?.status === "closed";
  const contactShared = thread?.status === "contact_shared" || !!contactShare;

  return (
    <>
      <div className="ch-root">
        {/* Nav */}
        <nav className="ch-nav">
          <Link href="/messages" className="ch-back">← Inbox</Link>
          <div className="ch-nav-title">
            {isBorrower ? proLabel : "Borrower"}
            {contactShared && <span className="ch-contact-badge">Contact shared</span>}
          </div>
          <div style={{ width: 80 }} />
        </nav>

        {/* Contact share banner (shown after share) */}
        {contactShared && contactShare && (
          <div className="ch-share-banner">
            <div className="ch-share-banner-title">Contact information exchanged</div>
            <div className="ch-share-grid">
              <div className="ch-share-party">
                <div className="ch-share-party-label">Your contact</div>
                {isBorrower ? (
                  <>
                    <div className="ch-share-field">{contactShare.borrower_email ?? "—"}</div>
                    <div className="ch-share-field">{contactShare.borrower_phone ?? "—"}</div>
                  </>
                ) : (
                  <>
                    <div className="ch-share-field">{contactShare.pro_email ?? "—"}</div>
                    <div className="ch-share-field">{contactShare.pro_phone ?? "—"}</div>
                  </>
                )}
              </div>
              <div className="ch-share-divider">↔</div>
              <div className="ch-share-party">
                <div className="ch-share-party-label">{isBorrower ? proLabel : "Borrower"}</div>
                {isBorrower ? (
                  <>
                    <div className="ch-share-field">{contactShare.pro_email ?? "—"}</div>
                    <div className="ch-share-field">{contactShare.pro_phone ?? "—"}</div>
                  </>
                ) : (
                  <>
                    <div className="ch-share-field">{contactShare.borrower_email ?? "—"}</div>
                    <div className="ch-share-field">{contactShare.borrower_phone ?? "—"}</div>
                  </>
                )}
              </div>
            </div>
            <div className="ch-share-portal">
              Ready to proceed? Continue your full application in your lender's secure portal.
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="ch-messages-wrap">
          {loading && <div className="ch-loading">Loading conversation...</div>}

          {!loading && messages.length === 0 && (
            <div className="ch-empty">Start the conversation below.</div>
          )}

          {!loading && messages.map(m => {
            if (m.sender_role === "system") {
              return (
                <div key={m.id} className="ch-system-msg">
                  {m.content.split("\n").map((line, i) => (
                    <span key={i}>{line}<br /></span>
                  ))}
                </div>
              );
            }
            const mine = (isBorrower && m.sender_role === "borrower") || (!isBorrower && m.sender_role === "professional");
            return (
              <div key={m.id} className={`ch-bubble-row ${mine ? "ch-mine" : "ch-theirs"}`}>
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

        {/* Footer */}
        <div className="ch-footer">
          {/* LO disclaimer */}
          {!isBorrower && (
            <div className="ch-lo-disclaimer">Rate indications only — not a Loan Estimate. Disclosure is auto-appended when you mention a rate.</div>
          )}

          {/* Share contact CTA (borrower only, not yet shared) */}
          {isBorrower && !contactShared && !isClosed && messages.length >= 2 && (
            <div className="ch-share-cta">
              <span>Ready to move forward?</span>
              <button className="ch-share-btn" onClick={() => setShowShareConfirm(true)}>
                Share contact info →
              </button>
            </div>
          )}

          {/* Confirm share modal */}
          {showShareConfirm && (
            <div className="ch-share-confirm">
              <div className="ch-share-confirm-box">
                <div className="ch-share-confirm-title">Share contact information?</div>
                <p className="ch-share-confirm-body">
                  This will share your email and phone number with the {proLabel.toLowerCase()},
                  and give you theirs. This is irreversible for this conversation.
                </p>
                <div className="ch-share-confirm-actions">
                  <button className="ch-share-confirm-cancel" onClick={() => setShowShareConfirm(false)}>Cancel</button>
                  <button className="ch-share-confirm-ok" onClick={shareContact} disabled={sharing}>
                    {sharing ? "Sharing..." : "Yes, share contact →"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {isClosed ? (
            <div className="ch-closed-msg">This conversation is closed.</div>
          ) : (
            <div className="ch-compose">
              <textarea
                ref={textareaRef}
                className="ch-input"
                placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
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
                  {sending ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        body:has(.ch-root) {
          display: block !important; height: 100vh !important; overflow: hidden !important;
          background: #080c12 !important;
        }
        html:has(.ch-root) { background: #080c12 !important; height: 100% !important; overflow: hidden !important; }
        body:has(.ch-root) .app-footer { display: none; }

        .ch-root {
          font-family: 'DM Sans', system-ui, sans-serif;
          color: #f0f4ff;
          height: 100vh;
          display: flex; flex-direction: column;
          background: #080c12;
        }

        /* Nav */
        .ch-nav {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 20px;
          background: rgba(8,12,18,0.97); backdrop-filter: blur(8px);
          border-bottom: 1px solid rgba(255,255,255,0.07);
          flex-shrink: 0;
        }
        .ch-back {
          font-size: 0.85rem; color: #3d8bff; text-decoration: none; font-weight: 600;
          padding: 6px 0; min-width: 80px;
        }
        .ch-back:hover { text-decoration: underline; }
        .ch-nav-title {
          font-size: 0.95rem; font-weight: 700; color: #f0f4ff;
          display: flex; align-items: center; gap: 10px;
        }
        .ch-contact-badge {
          font-size: 0.7rem; font-weight: 600; color: #00e87a;
          background: rgba(0,232,122,0.12); border: 1px solid rgba(0,232,122,0.25);
          border-radius: 99px; padding: 2px 9px;
        }

        /* Contact share banner */
        .ch-share-banner {
          background: rgba(0,232,122,0.06);
          border-bottom: 1px solid rgba(0,232,122,0.2);
          padding: 1rem 1.5rem;
          flex-shrink: 0;
        }
        .ch-share-banner-title { font-size: 0.8rem; font-weight: 700; color: #00e87a; margin-bottom: 0.6rem; text-transform: uppercase; letter-spacing: 0.06em; }
        .ch-share-grid { display: flex; align-items: center; gap: 12px; margin-bottom: 0.75rem; }
        .ch-share-party { flex: 1; }
        .ch-share-party-label { font-size: 0.72rem; color: #3a4560; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px; }
        .ch-share-field { font-size: 0.85rem; font-weight: 600; color: #f0f4ff; }
        .ch-share-divider { font-size: 0.9rem; color: #3a4560; }
        .ch-share-portal { font-size: 0.78rem; color: #8fa3b8; }

        /* Messages area */
        .ch-messages-wrap {
          flex: 1; overflow-y: auto;
          padding: 1.25rem 1rem;
          display: flex; flex-direction: column; gap: 6px;
        }
        .ch-loading, .ch-empty { text-align: center; color: #3a4560; padding: 3rem; font-size: 0.9rem; }

        .ch-bubble-row { display: flex; }
        .ch-mine { justify-content: flex-end; }
        .ch-theirs { justify-content: flex-start; }

        .ch-bubble {
          max-width: 72%; padding: 10px 14px;
          border-radius: 18px;
          font-size: 0.9rem; line-height: 1.5;
        }
        .ch-bubble-mine {
          background: #1a3d6e; color: #e8f0ff;
          border-bottom-right-radius: 4px;
        }
        .ch-bubble-theirs {
          background: #0e1420; color: #f0f4ff;
          border: 1px solid rgba(255,255,255,0.09);
          border-bottom-left-radius: 4px;
        }
        .ch-bubble-content { word-break: break-word; white-space: pre-wrap; }
        .ch-bubble-time { font-size: 0.68rem; color: rgba(255,255,255,0.35); margin-top: 5px; text-align: right; }

        .ch-system-msg {
          text-align: center;
          background: rgba(0,232,122,0.06);
          border: 1px solid rgba(0,232,122,0.15);
          border-radius: 12px;
          padding: 0.75rem 1rem;
          font-size: 0.82rem; color: #8fa3b8; line-height: 1.6;
          margin: 8px auto; max-width: 90%;
        }

        /* Footer */
        .ch-footer {
          flex-shrink: 0;
          border-top: 1px solid rgba(255,255,255,0.07);
          background: #080c12;
          padding: 10px 16px 16px;
        }
        .ch-lo-disclaimer {
          font-size: 0.72rem; color: #3a4560;
          margin-bottom: 6px; line-height: 1.4;
        }

        .ch-share-cta {
          display: flex; align-items: center; justify-content: space-between;
          background: rgba(0,232,122,0.06); border: 1px solid rgba(0,232,122,0.18);
          border-radius: 10px; padding: 8px 14px; margin-bottom: 8px;
          font-size: 0.82rem; color: #8fa3b8;
        }
        .ch-share-btn {
          font-size: 0.8rem; font-weight: 700; color: #00e87a;
          background: none; border: none; cursor: pointer; padding: 0;
        }
        .ch-share-btn:hover { text-decoration: underline; }

        /* Share confirm */
        .ch-share-confirm {
          position: fixed; inset: 0; background: rgba(0,0,0,0.7);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; padding: 1rem;
        }
        .ch-share-confirm-box {
          background: #0e1420; border: 1px solid rgba(255,255,255,0.12);
          border-radius: 16px; padding: 1.75rem; max-width: 420px; width: 100%;
        }
        .ch-share-confirm-title { font-size: 1.1rem; font-weight: 700; color: #f0f4ff; margin-bottom: 0.75rem; }
        .ch-share-confirm-body { font-size: 0.875rem; color: #8fa3b8; line-height: 1.6; margin: 0 0 1.25rem; }
        .ch-share-confirm-actions { display: flex; gap: 10px; justify-content: flex-end; }
        .ch-share-confirm-cancel {
          padding: 9px 18px; background: none; color: #8fa3b8;
          border: 1px solid rgba(255,255,255,0.12); border-radius: 999px;
          font-size: 0.875rem; cursor: pointer;
        }
        .ch-share-confirm-ok {
          padding: 9px 20px; background: #00e87a; color: #080c12;
          border: none; border-radius: 999px;
          font-size: 0.875rem; font-weight: 700; cursor: pointer;
        }
        .ch-share-confirm-ok:disabled { opacity: 0.4; cursor: not-allowed; }

        .ch-closed-msg { text-align: center; color: #3a4560; font-size: 0.85rem; padding: 0.75rem 0; }

        /* Compose */
        .ch-compose { display: flex; flex-direction: column; gap: 8px; }
        .ch-input {
          width: 100%; background: #0e1420;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 12px; color: #f0f4ff;
          font-family: 'DM Sans', sans-serif; font-size: 0.9rem;
          padding: 10px 14px; resize: none; outline: none;
          transition: border-color 0.15s;
          box-sizing: border-box;
        }
        .ch-input:focus { border-color: rgba(61,139,255,0.45); }
        .ch-input::placeholder { color: #3a4560; }
        .ch-input:disabled { opacity: 0.5; }

        .ch-compose-bottom { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
        .ch-char-count { font-size: 0.72rem; color: #3a4560; }
        .ch-send-error { font-size: 0.78rem; color: #ff5f5f; flex: 1; }
        .ch-send-btn {
          padding: 9px 22px; background: #00e87a; color: #080c12;
          border: none; border-radius: 999px;
          font-size: 0.875rem; font-weight: 700; cursor: pointer;
          transition: opacity 0.15s;
        }
        .ch-send-btn:hover:not(:disabled) { opacity: 0.88; }
        .ch-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        @media (max-width: 500px) {
          .ch-bubble { max-width: 88%; }
          .ch-share-grid { flex-direction: column; gap: 8px; }
        }
      `}</style>
    </>
  );
}
