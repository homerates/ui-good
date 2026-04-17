"use client";
// app/admin/brokerage/[id]/page.tsx
// Admin read-only view of any brokerage — reached from /admin/corporate "View org →"

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppNav from "../../../components/AppNav";
import { useAdminStatus } from "../../../hooks/useAdminStatus";

const ORG_LABELS: Record<string, string> = {
  brokerage:    "Mortgage Brokerage",
  lender:       "Lender / Bank",
  credit_union: "Credit Union",
  re_brokerage: "Real Estate Brokerage",
};

function planBadge(plan: string) {
  if (plan === "pro")  return { label: "Pro",  bg: "rgba(0,232,122,0.12)",   color: "#00e87a", border: "rgba(0,232,122,0.3)" };
  if (plan === "plus") return { label: "Plus", bg: "rgba(61,139,255,0.12)",  color: "#3d8bff", border: "rgba(61,139,255,0.3)" };
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
  scenarios_mo: number;
}

interface OrgData {
  id: string;
  name: string;
  org_type: string;
  website: string | null;
  invite_link: string;
  created_at: string;
  members: Member[];
}

export default function AdminBrokeragePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { isAdmin, loading: adminLoading } = useAdminStatus();

  const [org, setOrg]       = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    if (adminLoading) return;
    if (!isAdmin) { router.replace("/"); return; }
    fetch(`/api/admin/brokerage/${id}`)
      .then(async r => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return; }
        if (r.ok) setOrg(await r.json());
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [isAdmin, adminLoading, id]);

  const activeCount    = org?.members.filter(m => m.plan !== "free").length ?? 0;
  const totalBorrowers = org?.members.reduce((s, m) => s + m.borrowers, 0) ?? 0;
  const totalScenarios = org?.members.reduce((s, m) => s + m.scenarios_mo, 0) ?? 0;

  return (
    <>
      <div className="bk-root">
        <AppNav />
        <div className="bk-container">

          <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/admin/corporate" style={{ fontSize: "0.85rem", color: "#8fa3b8", textDecoration: "none" }}>
              ← Corporate accounts
            </Link>
            <span style={{ fontSize: "0.75rem", color: "#3a4560", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", padding: "2px 10px", borderRadius: 999 }}>
              Admin view · read-only
            </span>
          </div>

          {loading && <div className="bk-loading">Loading…</div>}

          {!loading && notFound && (
            <div style={{ textAlign: "center", padding: "3rem 0" }}>
              <div style={{ fontSize: "1.1rem", color: "#ff5f5f", marginBottom: 12 }}>Organization not found</div>
              <Link href="/admin/corporate" style={{ color: "#8fa3b8", fontSize: "0.875rem" }}>← Back to corporate accounts</Link>
            </div>
          )}

          {!loading && org && (
            <>
              {/* Header */}
              <div className="bk-header">
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span className="bk-org-badge">{ORG_LABELS[org.org_type] ?? "Organization"}</span>
                  {org.website && (
                    <a href={org.website} target="_blank" rel="noopener noreferrer" className="bk-website-link">
                      {org.website.replace(/^https?:\/\//, "")} ↗
                    </a>
                  )}
                </div>
                <h1 className="bk-title">{org.name}</h1>
                <p className="bk-sub">
                  {org.members.length} {org.members.length === 1 ? "member" : "members"} ·
                  Since {new Date(org.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </p>
              </div>

              {/* Stats */}
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
                <div className="bk-stat-card">
                  <div className="bk-stat-value" style={{ color: "#3d8bff" }}>{totalScenarios}</div>
                  <div className="bk-stat-label">Scenarios this month</div>
                </div>
              </div>

              {/* Members */}
              <div className="bk-section">
                <div className="bk-section-title">Members</div>
                <div className="bk-member-list">
                  {org.members.length === 0 ? (
                    <p style={{ color: "#3a4560", fontSize: "0.875rem", margin: 0 }}>No members yet — owner hasn&apos;t invited their team.</p>
                  ) : org.members.map(m => {
                    const pb = planBadge(m.plan);
                    return (
                      <div key={m.user_id} className="bk-member">
                        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "1 1 auto", minWidth: 0 }}>
                          <div className="bk-avatar">{(m.name || "?").charAt(0).toUpperCase()}</div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span
                                title={m.chat_messages_mo > 0 ? "Active this month" : "No activity this month"}
                                style={{
                                  width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                                  background: m.chat_messages_mo > 0 ? "#00e87a" : "#3a4560",
                                  boxShadow: m.chat_messages_mo > 0 ? "0 0 5px rgba(0,232,122,0.5)" : "none",
                                  display: "inline-block",
                                }}
                              />
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

                        <div className="bk-member-stats">
                          <div className="bk-member-stat">
                            <span className="bk-member-stat-value">{m.borrowers}</span>
                            <span className="bk-member-stat-label">borrowers</span>
                          </div>
                          <div className="bk-member-stat">
                            <span className="bk-member-stat-value">{m.scenarios_mo}</span>
                            <span className="bk-member-stat-label">scenarios</span>
                          </div>
                          <div className="bk-member-stat">
                            <span className="bk-member-stat-value">{m.chat_messages_mo}</span>
                            <span className="bk-member-stat-label">chats/mo</span>
                          </div>
                        </div>

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
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Invite link (read-only copy) */}
              <div className="bk-section">
                <div className="bk-section-title">Team invite link</div>
                <p style={{ fontSize: "0.85rem", color: "#8fa3b8", margin: "0 0 12px" }}>
                  This is the org&apos;s active join link. Share with the owner if needed.
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
              </div>
            </>
          )}

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

        .bk-eyebrow { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #00e87a; margin-bottom: 6px; }
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
        .bk-website-link { font-size: 0.78rem; color: #3a5070; text-decoration: none; transition: color 0.15s; }
        .bk-website-link:hover { color: #8fa3b8; }

        .bk-stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 1.5rem; }
        .bk-stat-card { background: #0e1420; border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 1.25rem 1.5rem; }
        .bk-stat-value { font-size: 1.75rem; font-weight: 800; color: #f0f4ff; line-height: 1; margin-bottom: 4px; }
        .bk-stat-label { font-size: 0.75rem; color: #8fa3b8; font-weight: 500; }

        .bk-section { background: #0e1420; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 1.5rem; margin-bottom: 1.5rem; }
        .bk-section-title { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #8fa3b8; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.75rem; margin-bottom: 1rem; }

        .bk-member-list { display: flex; flex-direction: column; }
        .bk-member { display: flex; align-items: center; gap: 16px; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .bk-member:last-child { border-bottom: none; }

        .bk-avatar {
          width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
          background: linear-gradient(135deg, rgba(0,232,122,0.15), rgba(0,232,122,0.05));
          border: 1px solid rgba(0,232,122,0.2);
          display: flex; align-items: center; justify-content: center;
          font-size: 0.9rem; font-weight: 700; color: #00e87a;
        }
        .bk-member-stats { display: flex; gap: 20px; flex-shrink: 0; }
        .bk-member-stat { display: flex; flex-direction: column; align-items: center; gap: 1px; }
        .bk-member-stat-value { font-size: 0.95rem; font-weight: 700; color: #f0f4ff; }
        .bk-member-stat-label { font-size: 0.65rem; color: #3a4560; text-transform: uppercase; letter-spacing: 0.05em; }

        .bk-badge-owner { font-size: 0.65rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; background: rgba(0,232,122,0.12); color: #00e87a; border: 1px solid rgba(0,232,122,0.25); }

        .bk-readonly { padding: 11px 14px; background: #141b28; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; color: #8fa3b8; font-size: 0.82rem; font-family: inherit; }
        .bk-copy-btn { flex-shrink: 0; padding: 11px 18px; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; font-size: 0.82rem; font-weight: 600; cursor: pointer; font-family: inherit; transition: all 0.15s; }

        @media (max-width: 700px) {
          .bk-stats-row { grid-template-columns: repeat(2, 1fr); }
          .bk-member-stats { display: none; }
          .bk-container { padding: 2rem 1rem 4rem; }
        }
      `}</style>
    </>
  );
}
