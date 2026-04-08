"use client";
// app/messages/page.tsx
// Unified inbox for borrowers and professionals — thread list

import { useEffect, useState } from "react";
import Link from "next/link";
import AppNav from "../components/AppNav";

interface Thread {
  id: string;
  other_name: string;
  other_role: string;
  status: string;
  unread: number;
  last_message_at: string | null;
  created_at: string;
}

export default function MessagesPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/messages")
      .then(r => r.json())
      .then(d => {
        setThreads(d.threads ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const timeAgo = (iso: string | null) => {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return "just now";
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const roleLabel = (role: string) => {
    if (role === "lo") return "Loan Officer";
    if (role === "agent") return "Agent";
    return "Borrower";
  };

  const totalUnread = threads.reduce((sum, t) => sum + (t.unread ?? 0), 0);

  return (
    <>
      <div className="mb-root">
        <AppNav activePage="messages" unreadCount={totalUnread} />

        <div className="mb-container">
          <h1 className="mb-heading">
            Inbox
            {totalUnread > 0 && <span className="mb-heading-badge">{totalUnread}</span>}
          </h1>

          {loading && <div className="mb-loading">Loading messages...</div>}

          {!loading && threads.length === 0 && (
            <div className="mb-empty">
              <div className="mb-empty-icon">💬</div>
              <h2>No conversations yet</h2>
              <p>
                When a borrower messages you — or you message a professional from your scenario —
                threads will appear here.
              </p>
              <Link href="/connect/my-scenario" className="mb-btn">View my scenario →</Link>
            </div>
          )}

          {!loading && threads.length > 0 && (
            <div className="mb-threads">
              {threads.map(t => (
                <Link key={t.id} href={`/messages/${t.id}`} className={`mb-thread ${t.unread > 0 ? "mb-unread" : ""}`}>
                  <div className="mb-thread-avatar">
                    {t.other_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="mb-thread-body">
                    <div className="mb-thread-top">
                      <span className="mb-thread-name">{t.other_name}</span>
                      <span className="mb-thread-time">{timeAgo(t.last_message_at ?? t.created_at)}</span>
                    </div>
                    <div className="mb-thread-meta">
                      <span className="mb-thread-role">{roleLabel(t.other_role)}</span>
                      {t.status === "contact_shared" && (
                        <span className="mb-thread-shared">Contact shared</span>
                      )}
                      {t.status === "closed" && (
                        <span className="mb-thread-closed">Closed</span>
                      )}
                    </div>
                  </div>
                  {t.unread > 0 && (
                    <div className="mb-thread-unread">{t.unread}</div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        body:has(.mb-root) {
          display: block !important; height: auto !important;
          overflow-y: auto !important; background: #080c12 !important;
        }
        html:has(.mb-root) { background: #080c12 !important; height: auto !important; overflow-y: auto !important; }
        body:has(.mb-root) .app-footer { display: none; }

        .mb-root { font-family: 'DM Sans', system-ui, sans-serif; color: #f0f4ff; min-height: 100vh; background: #080c12; }

        .mb-container { max-width: 600px; margin: 0 auto; padding: 2.5rem 1.5rem 5rem; }

        .mb-heading {
          font-family: 'DM Sans', sans-serif; font-size: 1.5rem; font-weight: 800;
          color: #f0f4ff; margin: 0 0 1.5rem;
          display: flex; align-items: center; gap: 10px;
        }
        .mb-heading-badge {
          background: #ff5f5f; color: #fff;
          font-size: 0.72rem; font-weight: 800;
          border-radius: 99px; padding: 2px 9px; min-width: 22px;
          text-align: center;
        }

        .mb-loading { color: #3a4560; padding: 3rem 0; text-align: center; }

        .mb-empty { text-align: center; padding: 4rem 0; }
        .mb-empty-icon { font-size: 2.5rem; margin-bottom: 1rem; }
        .mb-empty h2 { font-family: 'DM Sans', sans-serif; font-size: 1.3rem; color: #f0f4ff; margin: 0 0 0.75rem; }
        .mb-empty p { font-size: 0.9rem; color: #8fa3b8; line-height: 1.6; margin: 0 0 1.75rem; max-width: 360px; margin-left: auto; margin-right: auto; }

        .mb-btn {
          display: inline-block; padding: 11px 24px;
          background: #00e87a; color: #080c12;
          border-radius: 999px; font-weight: 700;
          text-decoration: none; font-size: 0.9rem;
        }

        .mb-threads { display: flex; flex-direction: column; gap: 2px; }

        .mb-thread {
          display: flex; align-items: center; gap: 14px;
          padding: 14px 16px;
          background: #0e1420;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 14px;
          text-decoration: none; color: inherit;
          transition: border-color 0.15s, background 0.15s;
          margin-bottom: 4px;
        }
        .mb-thread:hover { border-color: rgba(255,255,255,0.14); background: #121929; }
        .mb-thread.mb-unread { border-color: rgba(61,139,255,0.25); }

        .mb-thread-avatar {
          width: 44px; height: 44px; border-radius: 50%;
          background: rgba(61,139,255,0.15); color: #3d8bff;
          display: flex; align-items: center; justify-content: center;
          font-weight: 800; font-size: 1.1rem; flex-shrink: 0;
        }
        .mb-thread.mb-unread .mb-thread-avatar { background: rgba(61,139,255,0.22); }

        .mb-thread-body { flex: 1; min-width: 0; }
        .mb-thread-top {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          margin-bottom: 3px;
        }
        .mb-thread-name {
          font-weight: 700; font-size: 0.95rem; color: #f0f4ff;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .mb-thread-time { font-size: 0.72rem; color: #3a4560; flex-shrink: 0; }

        .mb-thread-meta { display: flex; align-items: center; gap: 8px; }
        .mb-thread-role { font-size: 0.75rem; color: #8fa3b8; }
        .mb-thread-shared {
          font-size: 0.7rem; color: #00e87a;
          background: rgba(0,232,122,0.1); border-radius: 99px; padding: 1px 8px;
          font-weight: 600;
        }
        .mb-thread-closed {
          font-size: 0.7rem; color: #3a4560;
          background: rgba(255,255,255,0.05); border-radius: 99px; padding: 1px 8px;
        }

        .mb-thread-unread {
          background: #3d8bff; color: #fff;
          font-size: 0.72rem; font-weight: 800;
          border-radius: 99px; padding: 2px 8px; min-width: 22px;
          text-align: center; flex-shrink: 0;
        }

        @media (max-width: 480px) {
          .mb-thread-name { font-size: 0.88rem; }
        }
      `}</style>
    </>
  );
}
