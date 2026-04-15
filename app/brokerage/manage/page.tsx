"use client";
// app/brokerage/manage/page.tsx
// Organization admin dashboard — Mortgage Brokerage / Lender / Credit Union / RE Brokerage
// Individuals manage their own subscriptions; this dashboard tracks team activity only.

import { useEffect, useState } from "react";
import AppNav from "../../components/AppNav";
import Link from "next/link";

const ORG_TYPES = [
  { value: "brokerage",    label: "Mortgage Brokerage" },
  { value: "lender",       label: "Lender / Bank" },
  { value: "credit_union", label: "Credit Union" },
  { value: "re_brokerage", label: "Real Estate Brokerage" },
] as const;

type OrgType = typeof ORG_TYPES[number]["value"];

function orgLabel(t: string) {
  return ORG_TYPES.find(o => o.value === t)?.label ?? "Organization";
}

function planBadge(plan: string) {
  if (plan === "pro")  return { label: "Pro",  bg: "rgba(0,232,122,0.12)",  color: "#00e87a",  border: "rgba(0,232,122,0.3)" };
  if (plan === "plus") return { label: "Plus", bg: "rgba(61,139,255,0.12)", color: "#3d8bff",  border: "rgba(61,139,255,0.3)" };
  return                       { label: "Free", bg: "rgba(255,255,255,0.05)", color: "#6b7a99", border: "rgba(255,255,255,0.1)" };
}

interface Member {
  user_id: string;
  name: string;
  email: string | null;
  role: string;
  joined_at: string;
  plan: string;
  borrowers: number;
  chat_messages_mo: number;
}

interface OrgData {
  id: string;
  name: string;
  org_type: OrgType;
  website: string | null;
  invite_token: string;
  invite_link: string;
  created_at: string;
  members: Member[];
}

export default function BrokerageManagePage() {
  const [org, setOrg]             = useState<OrgData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [notFound, setNotFound]   = useState(false);
  const [creating, setCreating]   = useState(false);
  const [createErr, setCreateErr] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [removing, setRemoving]   = useState<string | null>(null);

  // Create form
  const [newName, setNewName]       = useState("");
  const [newOrgType, setNewOrgType] = useState<OrgType>("brokerage");
  const [newWebsite, setNewWebsite] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/brokerage/manage");
    if (res.status === 404) { setNotFound(true); setLoading(false); return; }
    if (res.ok) { setOrg(await res.json()); setNotFound(false); }
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
      body: JSON.stringify({ name: newName.trim(), org_type: newOrgType, website: newWebsite.trim() || undefined }),
    });
    const d = await res.json();
    if (!res.ok) { setCreateErr(d.error ?? "Failed to create"); setCreating(false); return; }
    await load();
    setCreating(false);
  }

  async function resetToken() {
    setResetting(true);
    const res = await fetch("/api/brokerage/manage", { method: "POST" });
    if (res.ok) await load();
    setResetting(false);
  }

  async function removeMember(targetUserId: string) {
    if (!confirm("Remove this member from the team?")) return;
    setRemoving(targetUserId);
    const res = await fetch("/api/brokerage/manage", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: targetUserId }),
    });
    if (res.ok) await load();
    setRemoving(null);
  }

  // Derived stats
  const activeCount  = org?.members.filter(m => m.plan !== "free").length ?? 0;
  const totalBorrowers = org?.members.reduce((s, m) => s + m.borrowers, 0) ?? 0;

  return (
    <>
      <div className="bk-root">
        <AppNav />
        <div className="bk-container">

          {loading && <div className="bk-loading">Loading…</div>}

          {/* ── Create form ── */}
          {!loading && notFound && (
            <div className="bk-create-wrap">
              <div style={{ marginBottom: 24 }}>
                <div className="bk-eyebrow">Team Setup</div>
                <h1 className="bk-title">Create your organization</h1>
                <p className="bk-sub">Invite your team and track activity from one dashboard. Each member manages their own subscription.</p>
              </div>
              <form onSubmit={handleCreate} className="bk-form">
                <div className="bk-field">
                  <label className="bk-label">Organization type</label>
                  <select
                    className="bk-input bk-select"
                    value={newOrgType}
                    onChange={e => setNewOrgType(e.target.value as OrgType)}
                  >
                    {ORG_TYPES.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="bk-field">
                  <label className="bk-label">Organization name</label>
                  <input
                    className="bk-input"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="e.g. Pacific Coast Lending"
                    required
                  />
                </div>
                <div className="bk-field">
                  <label className="bk-label">Website <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
                  <input
                    className="bk-input"
                    value={newWebsite}
                    onChange={e => setNewWebsite(e.target.value)}
                    placeholder="https://yourcompany.com"
                    type="url"
                  />
                </div>
                {createErr && <div className="bk-error">{createErr}</div>}
                <button type="submit" className="bk-btn" disabled={creating || !newName.trim()}>
                  {creating ? "Creating…" : "Create organization →"}
                </button>
              </form>
            </div>
          )}

          {/* ── Dashboard ── */}
          {!loading && org && (
            <>
              {/* Header */}
              <div className="bk-header">
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span className="bk-org-badge">{orgLabel(org.org_type)}</span>
                  {org.website && (
                    <a href={org.website} target="_blank" rel="noopener noreferrer" className="bk-website-link">
                      {org.website.replace(/^https?:\/\//, "")} ↗
                    </a>
                  )}
                </div>
                <h1 className="bk-title">{org.name}</h1>
                <p className="bk-sub">
                  {org.members.length} {org.members.length === 1 ? "member" : "members"} ·
                  Team since {new Date(org.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </p>
              </div>

              {/* Stats row */}
              <div className="bk-stats-row">
                <div className="bk-stat-card">
                  <div className="bk-stat-value">{org.members.length}</div>
                  <div className="bk-stat-label">Team members</div>
                </div>
                <div className="bk-stat-card">
                  <div className="bk-stat-value" style={{ color: "#00e87a" }}>{activeCount}</div>
                  <div className="bk-stat-label">Active subscriptions</div>
                </div>
                <div className="bk-stat-card">
                  <div className="bk-stat-value">{totalBorrowers}</div>
                  <div className="bk-stat-label">Borrowers managed</div>
                </div>
              </div>

              {/* Members table */}
              <div className="bk-section">
                <div className="bk-section-title">Members</div>
                <div className="bk-member-list">
                  {org.members.map(m => {
                    const pb = planBadge(m.plan);
                    return (
                      <div key={m.user_id} className="bk-member">
                        {/* Avatar + identity */}
                        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "1 1 auto", minWidth: 0 }}>
                          <div className="bk-avatar">
                            {(m.name || "?").charAt(0).toUpperCase()}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 600, color: "#f0f4ff", fontSize: "0.9rem" }}>{m.name}</span>
                              {m.role === "owner" && <span className="bk-badge-owner">Owner</span>}
                            </div>
                            {m.email && (
                              <div style={{ color: "#8fa3b8", fontSize: "0.78rem", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {m.email}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="bk-member-stats">
                          <div className="bk-member-stat">
                            <span className="bk-member-stat-value">{m.borrowers}</span>
                            <span className="bk-member-stat-label">borrowers</span>
                          </div>
                          <div className="bk-member-stat">
                            <span className="bk-member-stat-value">{m.chat_messages_mo}</span>
                            <span className="bk-member-stat-label">chats/mo</span>
                          </div>
                        </div>

                        {/* Plan + joined + remove */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                          <span style={{
                            fontSize: "0.7rem", fontWeight: 700, padding: "3px 9px",
                            borderRadius: 999, background: pb.bg, color: pb.color,
                            border: `1px solid ${pb.border}`, letterSpacing: "0.05em",
                          }}>
                            {pb.label}
                          </span>
                          <span style={{ fontSize: "0.72rem", color: "#3a4560", whiteSpace: "nowrap" }}>
                            {new Date(m.joined_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                          {m.role !== "owner" && (
                            <button
                              className="bk-remove-btn"
                              onClick={() => removeMember(m.user_id)}
                              disabled={removing === m.user_id}
                              title="Remove from team"
                            >
                              {removing === m.user_id ? "…" : "✕"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p style={{ fontSize: "0.75rem", color: "#3a4560", margin: "12px 0 0" }}>
                  Each member is responsible for their own subscription. Plans shown are individual and billed directly to each user.
                </p>
              </div>

              {/* Invite link */}
              <div className="bk-section">
                <div className="bk-section-title">Invite link</div>
                <p style={{ fontSize: "0.85rem", color: "#8fa3b8", margin: "0 0 12px" }}>
                  Share this link with team members to add them to your organization.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <div className="bk-readonly" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {org.invite_link}
                  </div>
                  <button
                    type="button"
                    className="bk-copy-btn"
                    style={{ background: copySuccess ? "rgba(0,232,122,0.15)" : "#141b28", color: copySuccess ? "#00e87a" : "#8fa3b8" }}
                    onClick={() => {
                      navigator.clipboard.writeText(org.invite_link).then(() => {
                        setCopySuccess(true);
                        setTimeout(() => setCopySuccess(false), 2000);
                      });
                    }}
                  >
                    {copySuccess ? "Copied!" : "Copy"}
                  </button>
                </div>
                <button type="button" className="bk-text-btn" disabled={resetting} onClick={resetToken}>
                  {resetting ? "Regenerating…" : "Regenerate link (invalidates old link)"}
                </button>
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
        .bk-container { max-width: 860px; margin: 0 auto; padding: 3rem 1.5rem 5rem; }
        .bk-loading { text-align: center; padding: 4rem 0; color: #8fa3b8; }

        /* Header */
        .bk-eyebrow {
          font-size: 0.68rem; font-weight: 700; letter-spacing: 0.1em;
          text-transform: uppercase; color: #00e87a; margin-bottom: 6px;
        }
        .bk-header { margin-bottom: 2rem; }
        .bk-title { font-size: 1.75rem; font-weight: 700; margin: 0 0 0.4rem; }
        .bk-sub { font-size: 0.9rem; color: #8fa3b8; margin: 0; }
        .bk-org-badge {
          display: inline-block; font-size: 0.7rem; font-weight: 700;
          letter-spacing: 0.07em; text-transform: uppercase;
          padding: 3px 10px; border-radius: 999px;
          background: rgba(0,232,122,0.1); color: #00e87a;
          border: 1px solid rgba(0,232,122,0.25);
        }
        .bk-website-link {
          font-size: 0.78rem; color: #3a5070; text-decoration: none;
          transition: color 0.15s;
        }
        .bk-website-link:hover { color: #8fa3b8; }

        /* Stats row */
        .bk-stats-row {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
          margin-bottom: 1.5rem;
        }
        .bk-stat-card {
          background: #0e1420; border: 1px solid rgba(255,255,255,0.07);
          border-radius: 14px; padding: 1.25rem 1.5rem;
        }
        .bk-stat-value {
          font-size: 1.75rem; font-weight: 800; color: #f0f4ff; line-height: 1;
          margin-bottom: 4px;
        }
        .bk-stat-label {
          font-size: 0.75rem; color: #8fa3b8; font-weight: 500;
        }

        /* Section */
        .bk-section {
          background: #0e1420; border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px; padding: 1.5rem;
          margin-bottom: 1.5rem;
        }
        .bk-section-title {
          font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em;
          text-transform: uppercase; color: #8fa3b8;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          padding-bottom: 0.75rem; margin-bottom: 1rem;
        }

        /* Member rows */
        .bk-member-list { display: flex; flex-direction: column; }
        .bk-member {
          display: flex; align-items: center; gap: 16px;
          padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .bk-member:last-child { border-bottom: none; }

        .bk-avatar {
          width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
          background: linear-gradient(135deg, rgba(0,232,122,0.15), rgba(0,232,122,0.05));
          border: 1px solid rgba(0,232,122,0.2);
          display: flex; align-items: center; justify-content: center;
          font-size: 0.9rem; font-weight: 700; color: #00e87a;
        }

        .bk-member-stats {
          display: flex; gap: 20px; flex-shrink: 0;
        }
        .bk-member-stat {
          display: flex; flex-direction: column; align-items: center; gap: 1px;
        }
        .bk-member-stat-value {
          font-size: 0.95rem; font-weight: 700; color: #f0f4ff;
        }
        .bk-member-stat-label {
          font-size: 0.65rem; color: #3a4560; text-transform: uppercase; letter-spacing: 0.05em;
        }

        .bk-badge-owner {
          font-size: 0.65rem; font-weight: 700; letter-spacing: 0.06em;
          text-transform: uppercase; padding: 2px 8px; border-radius: 999px;
          background: rgba(0,232,122,0.12); color: #00e87a;
          border: 1px solid rgba(0,232,122,0.25);
        }

        .bk-remove-btn {
          width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;
          background: rgba(255,95,95,0.06); border: 1px solid rgba(255,95,95,0.15);
          color: rgba(255,95,95,0.5); font-size: 0.7rem; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s; padding: 0;
        }
        .bk-remove-btn:hover:not(:disabled) {
          background: rgba(255,95,95,0.15); color: #ff5f5f;
          border-color: rgba(255,95,95,0.35);
        }
        .bk-remove-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        /* Create form */
        .bk-create-wrap { display: flex; flex-direction: column; gap: 1.25rem; }
        .bk-form { display: flex; flex-direction: column; gap: 1.25rem; }
        .bk-field { display: flex; flex-direction: column; gap: 5px; }
        .bk-label { font-size: 0.78rem; font-weight: 600; color: #8fa3b8; text-transform: uppercase; letter-spacing: 0.05em; }
        .bk-input {
          padding: 11px 14px; background: #141b28;
          border: 1px solid rgba(255,255,255,0.08); border-radius: 10px;
          color: #f0f4ff; font-size: 0.9rem; outline: none; font-family: inherit;
          transition: border-color 0.15s;
        }
        .bk-input:focus { border-color: rgba(0,232,122,0.4); }
        .bk-select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238fa3b8' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 14px center; padding-right: 36px; cursor: pointer; }

        /* Misc */
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
          background: none; border: none; padding: 4px 0 0;
          font-size: 0.78rem; color: #3a5070; cursor: pointer;
          font-family: inherit; text-decoration: underline; text-align: left;
        }
        .bk-text-btn:hover { color: #8fa3b8; }
        .bk-text-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .bk-error {
          background: rgba(255,95,95,0.08); border: 1px solid rgba(255,95,95,0.2);
          border-radius: 10px; padding: 12px 16px;
          font-size: 0.875rem; color: #ff5f5f;
        }

        /* Responsive */
        @media (max-width: 600px) {
          .bk-stats-row { grid-template-columns: repeat(2, 1fr); }
          .bk-member-stats { display: none; }
          .bk-container { padding: 2rem 1rem 4rem; }
        }
      `}</style>
    </>
  );
}
