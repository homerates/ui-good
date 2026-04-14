"use client";
// app/brokerage/manage/page.tsx
// Brokerage admin dashboard — create team or manage existing

import { useEffect, useState } from "react";
import AppNav from "../../components/AppNav";
import Link from "next/link";

interface Member {
  user_id: string;
  name: string;
  email: string | null;
  role: string;
  joined_at: string;
}

interface BrokerageData {
  id: string;
  name: string;
  invite_token: string;
  invite_link: string;
  created_at: string;
  members: Member[];
}

export default function BrokerageManagePage() {
  const [brokerage, setBrokerage] = useState<BrokerageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createErr, setCreateErr] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/brokerage/manage");
    if (res.status === 404) { setNotFound(true); setLoading(false); return; }
    if (res.ok) { setBrokerage(await res.json()); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setCreateErr("");
    const res = await fetch("/api/brokerage/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const d = await res.json();
    if (!res.ok) { setCreateErr(d.error ?? "Failed to create"); setCreating(false); return; }
    await load();
    setCreating(false);
  }

  async function resetToken() {
    setResetting(true);
    const res = await fetch("/api/brokerage/manage", { method: "POST" });
    if (res.ok) { await load(); }
    setResetting(false);
  }

  return (
    <>
      <div className="bk-root">
        <AppNav activePage="brokerage" />
        <div className="bk-container">

          {loading && <div className="bk-loading">Loading…</div>}

          {!loading && notFound && (
            <div className="bk-create-wrap">
              <h1 className="bk-title">Create your team</h1>
              <p className="bk-sub">Set up a brokerage team and invite your loan officers with a single link.</p>
              <form onSubmit={handleCreate} className="bk-form">
                <div className="bk-field">
                  <label className="bk-label">Team / brokerage name</label>
                  <input
                    className="bk-input"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="e.g. Pacific Coast Lending"
                    required
                  />
                </div>
                {createErr && <div className="bk-error">{createErr}</div>}
                <button type="submit" className="bk-btn" disabled={creating || !newName.trim()}>
                  {creating ? "Creating…" : "Create team"}
                </button>
              </form>
            </div>
          )}

          {!loading && brokerage && (
            <>
              <div className="bk-header">
                <h1 className="bk-title">{brokerage.name}</h1>
                <p className="bk-sub">{brokerage.members.length} {brokerage.members.length === 1 ? "member" : "members"}</p>
              </div>

              {/* Invite link */}
              <div className="bk-section">
                <div className="bk-section-title">Invite link</div>
                <p style={{ fontSize: "0.85rem", color: "#8fa3b8", margin: "0 0 12px" }}>
                  Share this link with loan officers to add them to your team.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <div className="bk-readonly" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {brokerage.invite_link}
                  </div>
                  <button
                    type="button"
                    className="bk-copy-btn"
                    style={{ background: copySuccess ? "rgba(0,232,122,0.15)" : "#141b28", color: copySuccess ? "#00e87a" : "#8fa3b8" }}
                    onClick={() => {
                      navigator.clipboard.writeText(brokerage.invite_link).then(() => {
                        setCopySuccess(true);
                        setTimeout(() => setCopySuccess(false), 2000);
                      });
                    }}
                  >
                    {copySuccess ? "Copied!" : "Copy"}
                  </button>
                </div>
                <button
                  type="button"
                  className="bk-text-btn"
                  disabled={resetting}
                  onClick={resetToken}
                >
                  {resetting ? "Regenerating…" : "Regenerate link (invalidates old link)"}
                </button>
              </div>

              {/* Members */}
              <div className="bk-section">
                <div className="bk-section-title">Members</div>
                <div className="bk-member-list">
                  {brokerage.members.map(m => (
                    <div key={m.user_id} className="bk-member">
                      <div>
                        <div style={{ fontWeight: 600, color: "#f0f4ff", fontSize: "0.9rem" }}>{m.name}</div>
                        {m.email && <div style={{ color: "#8fa3b8", fontSize: "0.8rem" }}>{m.email}</div>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {m.role === "owner" && (
                          <span className="bk-badge-owner">Owner</span>
                        )}
                        <span style={{ fontSize: "0.75rem", color: "#3a4560" }}>
                          {new Date(m.joined_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </>
          )}

          <div style={{ marginTop: "2rem" }}>
            <Link href="/dashboard" style={{ fontSize: "0.875rem", color: "#8fa3b8", textDecoration: "none" }}>
              ← Back to dashboard
            </Link>
          </div>

        </div>
      </div>

      <style>{`
        body:has(.bk-root) {
          display: block !important; height: auto !important;
          overflow-y: auto !important; background: #080c12 !important;
        }
        html:has(.bk-root) { background: #080c12 !important; height: auto !important; overflow-y: auto !important; }
        body:has(.bk-root) .app-footer { display: none; }

        .bk-root { font-family: 'DM Sans', system-ui, sans-serif; color: #f0f4ff; min-height: 100vh; background: #080c12; }
        .bk-container { max-width: 560px; margin: 0 auto; padding: 3rem 1.5rem 5rem; }

        .bk-loading { text-align: center; padding: 4rem 0; color: #8fa3b8; }

        .bk-header { margin-bottom: 2rem; }
        .bk-title { font-size: 1.75rem; font-weight: 700; margin: 0 0 0.4rem; }
        .bk-sub { font-size: 0.9rem; color: #8fa3b8; margin: 0; }

        .bk-create-wrap { display: flex; flex-direction: column; gap: 1.25rem; }
        .bk-form { display: flex; flex-direction: column; gap: 1.25rem; }

        .bk-section {
          background: #0e1420;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px; padding: 1.5rem;
          display: flex; flex-direction: column; gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .bk-section-title {
          font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em;
          text-transform: uppercase; color: #8fa3b8;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          padding-bottom: 0.75rem;
        }

        .bk-field { display: flex; flex-direction: column; gap: 5px; }
        .bk-label { font-size: 0.78rem; font-weight: 600; color: #8fa3b8; text-transform: uppercase; letter-spacing: 0.05em; }
        .bk-input {
          padding: 11px 14px; background: #141b28;
          border: 1px solid rgba(255,255,255,0.08); border-radius: 10px;
          color: #f0f4ff; font-size: 0.9rem; outline: none; font-family: inherit;
          transition: border-color 0.15s;
        }
        .bk-input:focus { border-color: rgba(0,232,122,0.4); }

        .bk-readonly {
          padding: 11px 14px; background: #141b28;
          border: 1px solid rgba(255,255,255,0.06); border-radius: 10px;
          color: #8fa3b8; font-size: 0.82rem; font-family: inherit;
        }

        .bk-btn {
          padding: 11px 28px; background: #00e87a; color: #080c12;
          border: none; border-radius: 999px;
          font-size: 0.9rem; font-weight: 700; cursor: pointer;
          transition: opacity 0.15s; font-family: inherit; align-self: flex-start;
        }
        .bk-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .bk-btn:not(:disabled):hover { opacity: 0.88; }

        .bk-copy-btn {
          flex-shrink: 0; padding: 11px 18px;
          border: 1px solid rgba(255,255,255,0.1); border-radius: 10px;
          font-size: 0.82rem; font-weight: 600; cursor: pointer;
          font-family: inherit; transition: all 0.15s;
        }

        .bk-text-btn {
          background: none; border: none; padding: 0;
          font-size: 0.78rem; color: #3a5070; cursor: pointer;
          font-family: inherit; text-decoration: underline;
          text-align: left;
        }
        .bk-text-btn:hover { color: #8fa3b8; }
        .bk-text-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .bk-member-list { display: flex; flex-direction: column; gap: 0; }
        .bk-member {
          display: flex; justify-content: space-between; align-items: center;
          padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .bk-member:last-child { border-bottom: none; }

        .bk-badge-owner {
          font-size: 0.7rem; font-weight: 700; letter-spacing: 0.06em;
          text-transform: uppercase; padding: 3px 10px; border-radius: 999px;
          background: rgba(0,232,122,0.12); color: #00e87a;
        }

        .bk-error {
          background: rgba(255,95,95,0.08); border: 1px solid rgba(255,95,95,0.2);
          border-radius: 10px; padding: 12px 16px;
          font-size: 0.875rem; color: #ff5f5f;
        }
      `}</style>
    </>
  );
}
