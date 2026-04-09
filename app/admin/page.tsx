"use client";
// app/admin/page.tsx
// Admin dashboard — stats overview, recent claims, activity log

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppNav from "../components/AppNav";

const ADMIN_IDS = new Set(["user_35xDE51bR0NTaKEpwZMbHtn752O"]);

const PRO_TYPE_LABEL: Record<string, string> = {
  lo:            "Loan Officer",
  lo_company:    "Mortgage Company",
  agent:         "Real Estate Agent",
  agent_broker:  "RE Broker / Corp",
};

function f$(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

export default function AdminDashboard() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user || !ADMIN_IDS.has(user.id)) { router.replace("/"); return; }
    fetch("/api/admin/stats")
      .then(r => r.json())
      .then(d => setStats(d))
      .finally(() => setLoading(false));
  }, [isLoaded, user]);

  if (!isLoaded || (isLoaded && user && !ADMIN_IDS.has(user.id))) return null;

  const claimRate = stats?.totals?.all
    ? ((stats.totals.claimed / stats.totals.all) * 100).toFixed(1)
    : "0";

  return (
    <>
      <style>{`
        body:has(.adm-root){display:block!important;height:auto!important;overflow-y:auto!important;background:#080c12!important}
        html:has(.adm-root){height:auto!important;overflow:visible!important;background:#080c12!important}
        .adm-root{min-height:100vh;background:#080c12;color:#f0f4ff;font-family:'DM Sans',system-ui,sans-serif}
        .adm-nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 2rem;height:56px;background:rgba(8,12,18,0.96);border-bottom:1px solid rgba(255,255,255,0.07);backdrop-filter:blur(8px)}
        .adm-logo img{height:26px;display:block}
        .adm-nav-links{display:flex;gap:1.5rem;align-items:center}
        .adm-nav-link{font-size:0.84rem;color:rgba(255,255,255,0.5);text-decoration:none;transition:color 0.2s}
        .adm-nav-link:hover,.adm-nav-link.active{color:#f0f4ff}
        .adm-nav-badge{font-size:0.68rem;font-weight:700;padding:2px 8px;border-radius:99px;background:rgba(255,95,95,0.15);color:#ff5f5f;border:1px solid rgba(255,95,95,0.25)}

        .adm-shell{max-width:1200px;margin:0 auto;padding:2.5rem 1.5rem 5rem}
        .adm-eyebrow{font-size:0.72rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#ff5f5f;margin-bottom:0.4rem}
        .adm-h1{font-size:1.8rem;font-weight:800;letter-spacing:-0.03em;margin:0 0 2rem}

        .adm-stat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:1rem;margin-bottom:2.5rem}
        .adm-stat{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:1.25rem 1.5rem}
        .adm-stat-val{font-size:2rem;font-weight:800;letter-spacing:-0.03em;color:#f0f4ff;line-height:1}
        .adm-stat-label{font-size:0.72rem;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.06em;margin-top:6px}
        .adm-stat.green .adm-stat-val{color:#00e87a}
        .adm-stat.amber .adm-stat-val{color:#ff8c42}
        .adm-stat.red   .adm-stat-val{color:#ff5f5f}

        .adm-section{margin-bottom:2.5rem}
        .adm-section-title{font-size:0.78rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:1rem;padding-bottom:0.5rem;border-bottom:1px solid rgba(255,255,255,0.06)}

        .adm-two-col{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem}

        .adm-table{width:100%;border-collapse:collapse;font-size:0.82rem}
        .adm-table th{text-align:left;padding:8px 10px;font-size:0.7rem;font-weight:600;color:rgba(255,255,255,0.3);letter-spacing:0.06em;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.07)}
        .adm-table td{padding:9px 10px;border-bottom:1px solid rgba(255,255,255,0.04);color:rgba(255,255,255,0.7);vertical-align:middle}
        .adm-table tr:last-child td{border-bottom:none}
        .adm-table tr:hover td{background:rgba(255,255,255,0.02)}

        .adm-badge{font-size:0.67rem;font-weight:700;padding:2px 7px;border-radius:99px;border:1px solid transparent;white-space:nowrap}
        .adm-badge.claimed{background:rgba(0,232,122,0.1);color:#00e87a;border-color:rgba(0,232,122,0.25)}
        .adm-badge.self{background:rgba(61,139,255,0.1);color:#3d8bff;border-color:rgba(61,139,255,0.25)}
        .adm-badge.dre{background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.4);border-color:rgba(255,255,255,0.1)}
        .adm-badge.flagged{background:rgba(255,95,95,0.1);color:#ff5f5f;border-color:rgba(255,95,95,0.25)}

        .adm-btn{display:inline-block;padding:0.5rem 1rem;border-radius:8px;font-size:0.8rem;font-weight:700;text-decoration:none;cursor:pointer;border:none;transition:opacity 0.2s}
        .adm-btn.primary{background:#00e87a;color:#080c12}
        .adm-btn.secondary{background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.7)}
        .adm-btn:hover{opacity:0.85}

        .adm-bar-row{display:flex;align-items:center;gap:0.75rem;margin-bottom:0.6rem;font-size:0.8rem}
        .adm-bar-label{width:140px;color:rgba(255,255,255,0.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:0.75rem}
        .adm-bar-track{flex:1;height:6px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden}
        .adm-bar-fill{height:100%;border-radius:3px;background:#3d8bff}
        .adm-bar-count{width:40px;text-align:right;color:rgba(255,255,255,0.35);font-size:0.72rem}

        .adm-loading{text-align:center;padding:5rem;color:rgba(255,255,255,0.25)}

        .adm-action-log-row{display:flex;gap:0.75rem;padding:0.6rem 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:0.8rem;align-items:flex-start}
        .adm-action-log-row:last-child{border-bottom:none}
        .adm-log-time{color:rgba(255,255,255,0.2);font-size:0.72rem;white-space:nowrap;min-width:90px;font-family:monospace}
        .adm-log-action{font-weight:700;text-transform:uppercase;font-size:0.68rem;padding:2px 6px;border-radius:4px;white-space:nowrap}
        .adm-log-claim{background:rgba(0,232,122,0.1);color:#00e87a}
        .adm-log-register{background:rgba(61,139,255,0.1);color:#3d8bff}
        .adm-log-flag{background:rgba(255,95,95,0.1);color:#ff5f5f}
        .adm-log-edit{background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.4)}
        .adm-log-name{color:rgba(255,255,255,0.65)}

        @media(max-width:768px){
          .adm-two-col{grid-template-columns:1fr}
          .adm-stat-grid{grid-template-columns:repeat(2,1fr)}
          .adm-shell{padding:1.5rem 1rem 4rem}
        }
      `}</style>

      <div className="adm-root">
        <nav className="adm-nav">
          <Link href="/" className="adm-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" />
          </Link>
          <div className="adm-nav-links">
            <Link href="/admin" className="adm-nav-link active">Dashboard</Link>
            <Link href="/admin/directory" className="adm-nav-link">Directory</Link>
            <span className="adm-nav-badge">ADMIN</span>
            <AppNav drawerOnly />
          </div>
        </nav>

        <div className="adm-shell">
          <div className="adm-eyebrow">Admin</div>
          <h1 className="adm-h1">Platform Dashboard</h1>

          {loading ? (
            <div className="adm-loading">Loading stats…</div>
          ) : !stats ? (
            <div className="adm-loading">Failed to load stats.</div>
          ) : (
            <>
              {/* ── Stat cards ── */}
              <div className="adm-stat-grid">
                <div className="adm-stat">
                  <div className="adm-stat-val">{f$(stats.totals.all)}</div>
                  <div className="adm-stat-label">Total Listings</div>
                </div>
                <div className="adm-stat green">
                  <div className="adm-stat-val">{stats.totals.claimed}</div>
                  <div className="adm-stat-label">Claimed Profiles</div>
                </div>
                <div className="adm-stat">
                  <div className="adm-stat-val">{claimRate}%</div>
                  <div className="adm-stat-label">Claim Rate</div>
                </div>
                <div className="adm-stat">
                  <div className="adm-stat-val">{f$(stats.totals.unclaimed)}</div>
                  <div className="adm-stat-label">Unclaimed</div>
                </div>
                <div className="adm-stat" style={{ borderColor: "rgba(61,139,255,0.2)" }}>
                  <div className="adm-stat-val" style={{ color: "#3d8bff" }}>{stats.totals.self}</div>
                  <div className="adm-stat-label">Self-Registered</div>
                </div>
                {stats.totals.flagged > 0 && (
                  <div className="adm-stat red">
                    <div className="adm-stat-val">{stats.totals.flagged}</div>
                    <div className="adm-stat-label">Flagged</div>
                  </div>
                )}
              </div>

              <div className="adm-two-col">
                {/* ── By type ── */}
                <div className="adm-section">
                  <div className="adm-section-title">By License Type</div>
                  {Object.entries(stats.byType as Record<string, number>)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => {
                      const max = Math.max(...Object.values(stats.byType as Record<string, number>));
                      return (
                        <div key={type} className="adm-bar-row">
                          <div className="adm-bar-label">{PRO_TYPE_LABEL[type] ?? type}</div>
                          <div className="adm-bar-track">
                            <div className="adm-bar-fill" style={{ width: `${(count / max) * 100}%` }} />
                          </div>
                          <div className="adm-bar-count">{count >= 1000 ? `${(count / 1000).toFixed(0)}k` : count}</div>
                        </div>
                      );
                    })}
                </div>

                {/* ── Top cities ── */}
                <div className="adm-section">
                  <div className="adm-section-title">Top Cities</div>
                  {(stats.topCities as { city: string; count: number }[]).map(({ city, count }) => {
                    const max = stats.topCities[0]?.count ?? 1;
                    return (
                      <div key={city} className="adm-bar-row">
                        <div className="adm-bar-label">{city}</div>
                        <div className="adm-bar-track">
                          <div className="adm-bar-fill" style={{ width: `${(count / max) * 100}%`, background: "#00e87a" }} />
                        </div>
                        <div className="adm-bar-count">{count >= 1000 ? `${(count / 1000).toFixed(0)}k` : count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Recent claims ── */}
              <div className="adm-section">
                <div className="adm-section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Recent Claims</span>
                  <Link href="/admin/directory?status=claimed" className="adm-btn secondary" style={{ padding: "3px 10px", fontSize: "0.72rem" }}>View all →</Link>
                </div>
                {stats.recentClaims.length === 0 ? (
                  <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.85rem" }}>No claims yet — listings are seeded and waiting.</p>
                ) : (
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>City</th>
                        <th>Source</th>
                        <th>Claimed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recentClaims.map((c: any) => (
                        <tr key={c.id}>
                          <td style={{ color: "#f0f4ff", fontWeight: 600 }}>{c.name}</td>
                          <td><span className="adm-badge dre">{PRO_TYPE_LABEL[c.pro_type] ?? c.pro_type}</span></td>
                          <td>{c.city ?? "—"}</td>
                          <td><span className={`adm-badge ${c.source === "self" ? "self" : "dre"}`}>{c.source === "self" ? "Self" : "DRE"}</span></td>
                          <td style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.72rem" }}>
                            {c.claimed_at ? new Date(c.claimed_at).toLocaleDateString() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* ── Activity log ── */}
              <div className="adm-section">
                <div className="adm-section-title">Activity Log</div>
                {stats.recentActivity.length === 0 ? (
                  <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.85rem" }}>No admin actions logged yet.</p>
                ) : (
                  <div>
                    {stats.recentActivity.map((entry: any) => (
                      <div key={entry.id} className="adm-action-log-row">
                        <span className="adm-log-time">
                          {new Date(entry.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className={`adm-log-action adm-log-${entry.action}`}>{entry.action}</span>
                        <span className="adm-log-name">{entry.target_name}</span>
                        {entry.notes && <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.72rem" }}>{entry.notes}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Quick actions ── */}
              <div className="adm-section">
                <div className="adm-section-title">Quick Actions</div>
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                  <Link href="/admin/directory" className="adm-btn primary">Browse Directory →</Link>
                  <Link href="/admin/directory?status=flagged" className="adm-btn secondary">Review Flagged</Link>
                  <Link href="/professionals" className="adm-btn secondary">View Public Directory</Link>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
