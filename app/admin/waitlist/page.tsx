"use client";
// app/admin/waitlist/page.tsx
// Founding 500 waitlist management — view applicants, send invite waves

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppNav from "../../components/AppNav";
import { useAdminStatus } from "../../hooks/useAdminStatus";

type WaitlistEntry = {
  id: string;
  position: number;
  full_name: string;
  email: string;
  pro_type: "lo" | "agent";
  state: string;
  nmls: string | null;
  license_number: string | null;
  brokerage: string | null;
  status: "waiting" | "invited" | "joined" | "expired";
  referral_points: number;
  invited_at: string | null;
  invite_expires_at: string | null;
  joined_at: string | null;
  founding_number: number | null;
  created_at: string;
};

type Summary = { waiting: number; invited: number; joined: number; expired: number };

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  waiting:  { bg: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)" },
  invited:  { bg: "rgba(217,119,6,0.12)",   color: "#d97706" },
  joined:   { bg: "rgba(0,232,122,0.1)",    color: "#00e87a" },
  expired:  { bg: "rgba(255,95,95,0.1)",    color: "#ff5f5f" },
};

export default function AdminWaitlistPage() {
  const router = useRouter();
  const { isAdmin, loading: adminLoading } = useAdminStatus();

  const [entries, setEntries]       = useState<WaitlistEntry[]>([]);
  const [summary, setSummary]       = useState<Summary | null>(null);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading]       = useState(true);

  const [waveCount, setWaveCount]   = useState("10");
  const [waving, setWaving]         = useState(false);
  const [waveResult, setWaveResult] = useState<string | null>(null);
  const [expiring, setExpiring]     = useState(false);

  // Direct invite form
  const [showAddForm, setShowAddForm]   = useState(false);
  const [addName, setAddName]           = useState("");
  const [addEmail, setAddEmail]         = useState("");
  const [addProType, setAddProType]     = useState<"lo"|"agent">("lo");
  const [addState, setAddState]         = useState("");
  const [addNmls, setAddNmls]           = useState("");
  const [addBrokerage, setAddBrokerage] = useState("");
  const [adding, setAdding]             = useState(false);
  const [addResult, setAddResult]       = useState<{ok:boolean;msg:string}|null>(null);

  useEffect(() => {
    if (adminLoading) return;
    if (!isAdmin) { router.replace("/"); return; }
    load(0, statusFilter);
  }, [adminLoading, isAdmin]);

  function load(p: number, s: string) {
    setLoading(true);
    fetch(`/api/admin/waitlist?page=${p}&status=${s}`)
      .then(r => r.json())
      .then(d => {
        setEntries(d.entries ?? []);
        setTotal(d.total ?? 0);
        setSummary(d.summary ?? null);
        setPage(p);
      })
      .finally(() => setLoading(false));
  }

  function handleFilterChange(s: string) {
    setStatusFilter(s);
    load(0, s);
  }

  async function handleWave() {
    const n = parseInt(waveCount, 10);
    if (!n || n < 1) return;
    if (!confirm(`Send founding invites to the top ${n} waiting applicants? They'll have 72 hours to claim.`)) return;
    setWaving(true);
    setWaveResult(null);
    const res = await fetch("/api/admin/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "invite_wave", count: n }),
    });
    const d = await res.json();
    setWaving(false);
    if (!res.ok) {
      setWaveResult(`Error: ${d.error ?? "Failed"}`);
    } else {
      setWaveResult(`Invited ${d.sent} applicants. Invites expire in 72h.`);
      load(0, statusFilter);
    }
  }

  async function handleExpire() {
    setExpiring(true);
    await fetch("/api/admin/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "expire" }),
    });
    setExpiring(false);
    load(0, statusFilter);
  }

  async function handleReinvite(id: string) {
    await fetch("/api/admin/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reinvite", entryId: id }),
    });
    load(page, statusFilter);
  }

  async function handleDirectInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!addName.trim() || !addEmail.trim() || !addState) return;
    setAdding(true);
    setAddResult(null);
    const res = await fetch("/api/admin/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "direct_invite",
        email: addEmail.trim().toLowerCase(),
        fullName: addName.trim(),
        proType: addProType,
        state: addState,
        nmls: addNmls.trim() || null,
        brokerage: addBrokerage.trim() || null,
      }),
    });
    const d = await res.json();
    setAdding(false);
    if (!res.ok || !d.ok) {
      setAddResult({ ok: false, msg: d.error ?? d.message ?? "Failed" });
    } else {
      setAddResult({ ok: true, msg: d.wasExisting ? `Re-invited — already position #${d.position}` : `Invited as #${d.position} — email sent ✓` });
      setAddName(""); setAddEmail(""); setAddNmls(""); setAddBrokerage(""); setAddState("");
      load(0, statusFilter);
    }
  }

  if (adminLoading) return null;
  if (!isAdmin) return null;

  const LIMIT = 50;

  return (
    <>
      <style>{`
        body:has(.wl-root){display:block!important;height:auto!important;overflow-y:auto!important;background:#080c12!important}
        html:has(.wl-root){height:auto!important;overflow:visible!important;background:#080c12!important}
        .wl-root{min-height:100vh;background:#080c12;color:#f0f4ff;font-family:'DM Sans',system-ui,sans-serif;}
        .wl-root *{box-sizing:border-box;}

        .wl-nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 2rem;height:56px;background:rgba(8,12,18,0.96);border-bottom:1px solid rgba(255,255,255,0.07);backdrop-filter:blur(8px);}
        .wl-logo img{height:26px;display:block;}
        .wl-nav-links{display:flex;gap:1.5rem;align-items:center;}
        .wl-nav-link{font-size:0.84rem;color:rgba(255,255,255,0.5);text-decoration:none;}
        .wl-nav-link:hover,.wl-nav-link.active{color:#f0f4ff;}
        .wl-nav-badge{font-size:0.68rem;font-weight:700;padding:2px 8px;border-radius:99px;background:rgba(255,95,95,0.15);color:#ff5f5f;border:1px solid rgba(255,95,95,0.25);}

        .wl-shell{max-width:1100px;margin:0 auto;padding:2.5rem 1.5rem 5rem;}
        .wl-eyebrow{font-size:0.72rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#d97706;margin-bottom:0.4rem;}
        .wl-h1{font-size:1.8rem;font-weight:800;letter-spacing:-0.03em;margin:0 0 2rem;}

        .wl-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:2rem;}
        .wl-stat{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:1rem 1.25rem;}
        .wl-stat-val{font-size:1.8rem;font-weight:800;line-height:1;margin-bottom:4px;}
        .wl-stat-label{font-size:0.7rem;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.06em;}

        .wl-actions{display:flex;align-items:center;gap:0.75rem;margin-bottom:1.5rem;flex-wrap:wrap;}
        .wl-input{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:8px 12px;color:#f0f4ff;font-size:0.85rem;outline:none;width:80px;text-align:center;}
        .wl-input:focus{border-color:rgba(217,119,6,0.4);}
        .wl-btn{display:inline-flex;align-items:center;padding:0.5rem 1rem;border-radius:8px;font-size:0.8rem;font-weight:700;cursor:pointer;border:none;transition:opacity 0.2s;white-space:nowrap;}
        .wl-btn:hover{opacity:0.85;}
        .wl-btn:disabled{opacity:0.35;cursor:not-allowed;}
        .wl-btn.wave{background:rgba(217,119,6,0.15);color:#d97706;border:1px solid rgba(217,119,6,0.3);}
        .wl-btn.expire{background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.5);border:1px solid rgba(255,255,255,0.1);}
        .wl-btn.sm{padding:3px 10px;font-size:0.72rem;}
        .wl-btn.reinvite{background:rgba(217,119,6,0.1);color:#d97706;border:1px solid rgba(217,119,6,0.2);}

        .wl-filter-row{display:flex;gap:0.5rem;margin-bottom:1rem;flex-wrap:wrap;}
        .wl-filter{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:5px 12px;font-size:0.78rem;font-weight:600;color:rgba(255,255,255,0.4);cursor:pointer;transition:all .2s;}
        .wl-filter.active{background:rgba(0,232,122,0.1);border-color:rgba(0,232,122,0.3);color:#00e87a;}

        .wl-table{width:100%;border-collapse:collapse;font-size:0.82rem;}
        .wl-table th{text-align:left;padding:8px 10px;font-size:0.7rem;font-weight:600;color:rgba(255,255,255,0.3);letter-spacing:0.06em;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.07);}
        .wl-table td{padding:9px 10px;border-bottom:1px solid rgba(255,255,255,0.04);color:rgba(255,255,255,0.7);vertical-align:middle;}
        .wl-table tr:last-child td{border-bottom:none;}
        .wl-table tr:hover td{background:rgba(255,255,255,0.02);}

        .wl-pos{font-size:1rem;font-weight:800;color:#f0f4ff;font-family:monospace;}
        .wl-founding{font-size:0.75rem;color:#00e87a;font-weight:700;}

        .wl-status-pill{font-size:0.67rem;font-weight:700;padding:3px 8px;border-radius:99px;border:1px solid transparent;white-space:nowrap;}

        .wl-pagination{display:flex;gap:0.5rem;align-items:center;margin-top:1rem;font-size:0.8rem;color:rgba(255,255,255,0.35);}

        .wl-result{font-size:0.82rem;padding:8px 12px;border-radius:8px;margin-top:0;}
        .wl-result.ok{background:rgba(0,232,122,0.08);color:#00e87a;border:1px solid rgba(0,232,122,0.2);}
        .wl-result.err{background:rgba(255,95,95,0.08);color:#ff5f5f;border:1px solid rgba(255,95,95,0.2);}

        .wl-add-panel{background:rgba(217,119,6,0.06);border:1px solid rgba(217,119,6,0.2);border-radius:12px;padding:20px 24px;margin-bottom:1.5rem;}
        .wl-add-title{font-size:0.78rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#d97706;margin-bottom:14px;}
        .wl-add-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px;}
        .wl-add-field{display:flex;flex-direction:column;gap:4px;}
        .wl-add-label{font-size:0.68rem;font-weight:600;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.06em;}
        .wl-add-input{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:7px;padding:7px 10px;color:#f0f4ff;font-size:0.85rem;outline:none;}
        .wl-add-input:focus{border-color:rgba(217,119,6,0.4);}
        .wl-type-row{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
        .wl-type-opt{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:7px;padding:6px;font-size:0.82rem;font-weight:600;color:rgba(255,255,255,0.4);cursor:pointer;text-align:center;}
        .wl-type-opt.active{background:rgba(217,119,6,0.12);border-color:rgba(217,119,6,0.35);color:#d97706;}
        .wl-add-row{display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;margin-top:6px;}

        @media(max-width:768px){
          .wl-summary{grid-template-columns:repeat(2,1fr);}
          .wl-shell{padding:1.5rem 1rem 4rem;}
        }
      `}</style>

      <div className="wl-root">
        <nav className="wl-nav">
          <Link href="/" className="wl-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" />
          </Link>
          <div className="wl-nav-links">
            <Link href="/admin" className="wl-nav-link">Dashboard</Link>
            <Link href="/admin/directory" className="wl-nav-link">Directory</Link>
            <Link href="/admin/waitlist" className="wl-nav-link active">Waitlist</Link>
            <span className="wl-nav-badge">ADMIN</span>
            <AppNav drawerOnly />
          </div>
        </nav>

        <div className="wl-shell">
          <div className="wl-eyebrow">Admin · Founding 500</div>
          <h1 className="wl-h1">Waitlist</h1>

          {/* Summary stats */}
          {summary && (
            <div className="wl-summary">
              <div className="wl-stat">
                <div className="wl-stat-val" style={{ color: "rgba(255,255,255,0.8)" }}>{summary.waiting}</div>
                <div className="wl-stat-label">Waiting</div>
              </div>
              <div className="wl-stat">
                <div className="wl-stat-val" style={{ color: "#d97706" }}>{summary.invited}</div>
                <div className="wl-stat-label">Invited</div>
              </div>
              <div className="wl-stat">
                <div className="wl-stat-val" style={{ color: "#00e87a" }}>{summary.joined}</div>
                <div className="wl-stat-label">Joined</div>
              </div>
              <div className="wl-stat">
                <div className="wl-stat-val" style={{ color: "#ff5f5f" }}>{summary.expired}</div>
                <div className="wl-stat-label">Expired</div>
              </div>
            </div>
          )}

          {/* Add & Invite — direct outbound invite */}
          <div style={{ marginBottom: "1.5rem" }}>
            <button
              className="wl-btn wave"
              onClick={() => { setShowAddForm(v => !v); setAddResult(null); }}
              style={{ marginBottom: showAddForm ? "1rem" : 0 }}
            >
              {showAddForm ? "✕ Cancel" : "+ Add & invite someone directly →"}
            </button>

            {showAddForm && (
              <form className="wl-add-panel" onSubmit={handleDirectInvite}>
                <div className="wl-add-title">Direct Founding Invite</div>

                <div className="wl-add-grid">
                  <div className="wl-add-field">
                    <label className="wl-add-label">Full name *</label>
                    <input className="wl-add-input" placeholder="Jane Smith" value={addName} onChange={e => setAddName(e.target.value)} required />
                  </div>
                  <div className="wl-add-field">
                    <label className="wl-add-label">Email *</label>
                    <input className="wl-add-input" type="email" placeholder="jane@example.com" value={addEmail} onChange={e => setAddEmail(e.target.value)} required />
                  </div>
                  <div className="wl-add-field">
                    <label className="wl-add-label">State *</label>
                    <input className="wl-add-input" placeholder="CA" maxLength={2} value={addState} onChange={e => setAddState(e.target.value.toUpperCase())} required />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr", gap: 10, marginBottom: 12 }}>
                  <div className="wl-add-field">
                    <label className="wl-add-label">Type *</label>
                    <div className="wl-type-row">
                      <button type="button" className={`wl-type-opt ${addProType === "lo" ? "active" : ""}`} onClick={() => setAddProType("lo")}>LO</button>
                      <button type="button" className={`wl-type-opt ${addProType === "agent" ? "active" : ""}`} onClick={() => setAddProType("agent")}>Agent</button>
                    </div>
                  </div>
                  <div className="wl-add-field">
                    <label className="wl-add-label">{addProType === "lo" ? "NMLS #" : "License #"}</label>
                    <input className="wl-add-input" placeholder="optional" value={addNmls} onChange={e => setAddNmls(e.target.value)} />
                  </div>
                  <div className="wl-add-field">
                    <label className="wl-add-label">Brokerage</label>
                    <input className="wl-add-input" placeholder="optional" value={addBrokerage} onChange={e => setAddBrokerage(e.target.value)} />
                  </div>
                </div>

                <div className="wl-add-row">
                  <button type="submit" className="wl-btn wave" disabled={adding}>
                    {adding ? "Sending invite…" : "Send founding invite →"}
                  </button>
                  {addResult && (
                    <span className={`wl-result ${addResult.ok ? "ok" : "err"}`} style={{ margin: 0 }}>
                      {addResult.msg}
                    </span>
                  )}
                </div>
              </form>
            )}
          </div>

          {/* Invite wave controls */}
          <div className="wl-actions">
            <span style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)" }}>Invite wave:</span>
            <input
              className="wl-input"
              type="number"
              min={1}
              max={200}
              value={waveCount}
              onChange={e => setWaveCount(e.target.value)}
            />
            <span style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.3)" }}>applicants</span>
            <button className="wl-btn wave" onClick={handleWave} disabled={waving}>
              {waving ? "Sending…" : "Send invites →"}
            </button>
            <button className="wl-btn expire" onClick={handleExpire} disabled={expiring}>
              {expiring ? "Expiring…" : "Expire stale invites"}
            </button>
          </div>
          {waveResult && (
            <div className={`wl-result ${waveResult.startsWith("Error") ? "err" : "ok"}`} style={{ marginBottom: "1rem" }}>
              {waveResult}
            </div>
          )}

          {/* Filter tabs */}
          <div className="wl-filter-row">
            {["all", "waiting", "invited", "joined", "expired"].map(s => (
              <button
                key={s}
                className={`wl-filter ${statusFilter === s ? "active" : ""}`}
                onClick={() => handleFilterChange(s)}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
                {summary && s !== "all" && (
                  <span style={{ marginLeft: 5, opacity: 0.6 }}>
                    {summary[s as keyof Summary]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {loading ? (
            <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.85rem", padding: "2rem 0" }}>Loading…</p>
          ) : entries.length === 0 ? (
            <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.85rem", padding: "2rem 0" }}>
              No applicants yet — share <code style={{ color: "#00e87a" }}>/founding</code> to start building the waitlist.
            </p>
          ) : (
            <>
              <table className="wl-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Type</th>
                    <th>State</th>
                    <th>NMLS / License</th>
                    <th>Status</th>
                    <th>Applied</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => {
                    const sc = STATUS_COLORS[e.status];
                    const isExpiredSoon = e.status === "invited" && e.invite_expires_at
                      && new Date(e.invite_expires_at) < new Date(Date.now() + 12 * 60 * 60 * 1000);
                    return (
                      <tr key={e.id}>
                        <td>
                          <span className="wl-pos">
                            {e.founding_number ? (
                              <span className="wl-founding">F#{e.founding_number}</span>
                            ) : `#${e.position}`}
                          </span>
                        </td>
                        <td style={{ color: "#f0f4ff", fontWeight: 600 }}>{e.full_name}</td>
                        <td style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.5)" }}>{e.email}</td>
                        <td>
                          <span style={{ fontSize: "0.72rem", fontWeight: 700, color: e.pro_type === "lo" ? "#3d8bff" : "#00e87a" }}>
                            {e.pro_type === "lo" ? "LO" : "Agent"}
                          </span>
                        </td>
                        <td style={{ fontSize: "0.82rem" }}>{e.state}</td>
                        <td style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "rgba(255,255,255,0.4)" }}>
                          {e.nmls ?? e.license_number ?? "—"}
                        </td>
                        <td>
                          <span className="wl-status-pill" style={{ background: sc.bg, color: sc.color, borderColor: sc.color + "44" }}>
                            {e.status}
                          </span>
                          {isExpiredSoon && (
                            <span style={{ fontSize: "0.65rem", color: "#ff8c42", marginLeft: 5 }}>expiring soon</span>
                          )}
                        </td>
                        <td style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.3)" }}>
                          {new Date(e.created_at).toLocaleDateString()}
                        </td>
                        <td>
                          {(e.status === "waiting" || e.status === "expired") && (
                            <button
                              className="wl-btn sm reinvite"
                              onClick={() => handleReinvite(e.id)}
                            >
                              Invite
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination */}
              {total > LIMIT && (
                <div className="wl-pagination">
                  <button className="wl-btn expire" onClick={() => load(page - 1, statusFilter)} disabled={page === 0}>← Prev</button>
                  <span>Page {page + 1} of {Math.ceil(total / LIMIT)}</span>
                  <button className="wl-btn expire" onClick={() => load(page + 1, statusFilter)} disabled={(page + 1) * LIMIT >= total}>Next →</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
