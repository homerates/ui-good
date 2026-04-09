"use client";
// app/admin/directory/page.tsx
// Admin directory — search, filter, flag/restore listings

import { useEffect, useState, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AppNav from "../../components/AppNav";

const ADMIN_IDS = new Set(["user_35xDE51bR0NTaKEpwZMbHtn752O"]);

const PRO_TYPE_LABEL: Record<string, string> = {
  lo:           "Loan Officer",
  lo_company:   "Mortgage Company",
  agent:        "Real Estate Agent",
  agent_broker: "RE Broker/Corp",
};

type Listing = {
  id: string;
  source: string;
  source_id: string;
  pro_type: string;
  name: string;
  company_name: string | null;
  city: string | null;
  state: string;
  zip: string | null;
  license_type: string | null;
  license_status: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  phone: string | null;
  website: string | null;
  bio: string | null;
  invited_at: string | null;
};

export default function AdminDirectory() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [listings, setListings] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState(searchParams?.get("status") ?? "");
  const [source, setSource] = useState("");
  const [type, setType] = useState("");

  const [actionTarget, setActionTarget] = useState<Listing | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [acting, setActing] = useState(false);

  // Invite state
  const [inviteTarget, setInviteTarget] = useState<Listing | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ ok: boolean; message?: string } | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user || !ADMIN_IDS.has(user.id)) { router.replace("/"); return; }
  }, [isLoaded, user]);

  function buildParams(overrides: Record<string, string | number> = {}) {
    const p = new URLSearchParams();
    if (q)      p.set("q", q);
    if (status) p.set("status", status);
    if (source) p.set("source", source);
    if (type)   p.set("type", type);
    p.set("page", String(page));
    Object.entries(overrides).forEach(([k, v]) => p.set(k, String(v)));
    return p.toString();
  }

  async function load(params: string) {
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/directory?${params}`);
      const data = await res.json();
      setListings(data.listings ?? []);
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isLoaded || !user || !ADMIN_IDS.has(user.id)) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(0);
      load(buildParams({ page: 0 }));
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, status, source, type, isLoaded, user]);

  useEffect(() => {
    if (!isLoaded || !user || !ADMIN_IDS.has(user.id)) return;
    load(buildParams());
  }, [page]);

  async function handleAction(listing: Listing, action: "flag" | "restore" | "unclaim") {
    setActing(true);
    try {
      const updates: Record<string, any> = { id: listing.id, action, notes: actionNote };
      if (action === "flag")    updates.license_status = "Flagged";
      if (action === "restore") updates.license_status = "Active";
      if (action === "unclaim") {
        // Separate endpoint logic — just log it for now, DB unclaim needs service role
        updates.action = "unclaim";
      }
      const res = await fetch("/api/admin/directory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        setActionTarget(null);
        setActionNote("");
        load(buildParams());
      }
    } finally {
      setActing(false);
    }
  }

  async function handleInvite() {
    if (!inviteTarget || !inviteEmail.trim()) return;
    setInviting(true);
    setInviteResult(null);
    try {
      const res = await fetch("/api/pro-directory/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pro_dir_id: inviteTarget.id, email: inviteEmail.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setInviteResult({ ok: true, message: "Invite sent!" });
        // Update the listing row locally so the badge appears without a reload
        setListings(prev => prev.map(l =>
          l.id === inviteTarget.id ? { ...l, invited_at: new Date().toISOString() } : l
        ));
      } else {
        setInviteResult({ ok: false, message: data.message ?? data.error ?? "Failed to send." });
      }
    } finally {
      setInviting(false);
    }
  }

  const isFlagged = (l: Listing) => l.license_status === "Flagged";
  const isClaimed = (l: Listing) => !!l.claimed_by;

  return (
    <>
      <style>{`
        body:has(.addir-root){display:block!important;height:auto!important;overflow-y:auto!important;background:#080c12!important}
        html:has(.addir-root){height:auto!important;overflow:visible!important;background:#080c12!important}
        .addir-root{min-height:100vh;background:#080c12;color:#f0f4ff;font-family:'DM Sans',system-ui,sans-serif}
        .addir-nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 2rem;height:56px;background:rgba(8,12,18,0.96);border-bottom:1px solid rgba(255,255,255,0.07);backdrop-filter:blur(8px)}
        .addir-logo img{height:26px;display:block}
        .addir-nav-links{display:flex;gap:1.5rem;align-items:center}
        .addir-nav-link{font-size:0.84rem;color:rgba(255,255,255,0.5);text-decoration:none;transition:color 0.2s}
        .addir-nav-link:hover,.addir-nav-link.active{color:#f0f4ff}
        .addir-badge{font-size:0.68rem;font-weight:700;padding:2px 8px;border-radius:99px;background:rgba(255,95,95,0.15);color:#ff5f5f;border:1px solid rgba(255,95,95,0.25)}

        .addir-shell{max-width:1300px;margin:0 auto;padding:2rem 1.5rem 5rem}
        .addir-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem;flex-wrap:wrap;gap:1rem}
        .addir-h1{font-size:1.5rem;font-weight:800;letter-spacing:-0.02em;margin:0}
        .addir-total{font-size:0.82rem;color:rgba(255,255,255,0.3)}

        .addir-filters{display:flex;flex-wrap:wrap;gap:0.6rem;margin-bottom:1.25rem;align-items:center}
        .addir-input{padding:0.55rem 0.9rem;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:9px;color:#f0f4ff;font-size:0.85rem;outline:none;font-family:inherit;transition:border-color 0.2s}
        .addir-input:focus{border-color:rgba(61,139,255,0.4)}
        .addir-input::placeholder{color:rgba(255,255,255,0.2)}
        .addir-select{padding:0.55rem 0.9rem;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:9px;color:#f0f4ff;font-size:0.85rem;outline:none;cursor:pointer;font-family:inherit}
        .addir-select option{background:#0e1420}

        .addir-table-wrap{overflow-x:auto}
        .addir-table{width:100%;border-collapse:collapse;font-size:0.81rem}
        .addir-table th{text-align:left;padding:8px 10px;font-size:0.68rem;font-weight:600;color:rgba(255,255,255,0.3);letter-spacing:0.06em;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.07);white-space:nowrap}
        .addir-table td{padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.04);color:rgba(255,255,255,0.65);vertical-align:middle}
        .addir-table tr:hover td{background:rgba(255,255,255,0.02)}
        .addir-table tr.flagged td{opacity:0.5}

        .addir-badge-sm{font-size:0.65rem;font-weight:700;padding:2px 6px;border-radius:99px;border:1px solid transparent;white-space:nowrap}
        .addir-badge-claimed{background:rgba(0,232,122,0.1);color:#00e87a;border-color:rgba(0,232,122,0.2)}
        .addir-badge-self{background:rgba(61,139,255,0.1);color:#3d8bff;border-color:rgba(61,139,255,0.2)}
        .addir-badge-dre{background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.35);border-color:rgba(255,255,255,0.08)}
        .addir-badge-flagged{background:rgba(255,95,95,0.1);color:#ff5f5f;border-color:rgba(255,95,95,0.2)}

        .addir-action-btn{padding:3px 8px;border-radius:6px;font-size:0.7rem;font-weight:600;cursor:pointer;border:none;transition:opacity 0.2s}
        .addir-action-btn:hover{opacity:0.8}
        .addir-flag-btn{background:rgba(255,95,95,0.12);color:#ff5f5f}
        .addir-restore-btn{background:rgba(0,232,122,0.1);color:#00e87a}

        .addir-pagination{display:flex;gap:0.5rem;justify-content:center;margin-top:1.5rem;align-items:center}
        .addir-page-btn{padding:0.4rem 0.9rem;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:7px;color:rgba(255,255,255,0.5);font-size:0.8rem;cursor:pointer;transition:all 0.2s}
        .addir-page-btn:hover:not(:disabled){background:rgba(255,255,255,0.09);color:#fff}
        .addir-page-btn:disabled{opacity:0.3;cursor:default}
        .addir-page-info{font-size:0.8rem;color:rgba(255,255,255,0.25);padding:0 0.5rem}

        .addir-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:200;display:flex;align-items:center;justify-content:center;padding:1rem}
        .addir-modal{background:#0e1420;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:1.5rem;max-width:440px;width:100%}
        .addir-modal h3{margin:0 0 0.5rem;font-size:1rem;font-weight:700}
        .addir-modal p{font-size:0.85rem;color:rgba(255,255,255,0.5);margin:0 0 1rem;line-height:1.5}
        .addir-modal-actions{display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem}
        .addir-modal-btn{padding:0.5rem 1rem;border-radius:8px;font-size:0.82rem;font-weight:700;cursor:pointer;border:none}
        .addir-modal-btn.cancel{background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.6)}
        .addir-modal-btn.confirm-flag{background:rgba(255,95,95,0.15);color:#ff5f5f}
        .addir-modal-btn.confirm-restore{background:rgba(0,232,122,0.15);color:#00e87a}
        .addir-modal-textarea{width:100%;box-sizing:border-box;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:0.6rem;color:#f0f4ff;font-size:0.82rem;resize:vertical;min-height:60px;font-family:inherit;outline:none;margin-top:0.75rem}
        .addir-invite-btn{background:rgba(61,139,255,0.12);color:#3d8bff}
        .addir-badge-invited{background:rgba(61,139,255,0.08);color:#3d8bff;border-color:rgba(61,139,255,0.2)}
        .addir-modal-input{width:100%;box-sizing:border-box;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:0.6rem 0.8rem;color:#f0f4ff;font-size:0.9rem;font-family:inherit;outline:none;margin-top:0.75rem}
        .addir-modal-input:focus{border-color:rgba(61,139,255,0.4)}
        .addir-modal-input::placeholder{color:rgba(255,255,255,0.2)}
        .addir-invite-result{font-size:0.8rem;margin-top:0.5rem;padding:0.4rem 0.6rem;border-radius:6px}
        .addir-invite-result.ok{background:rgba(0,232,122,0.08);color:#00e87a}
        .addir-invite-result.err{background:rgba(255,95,95,0.08);color:#ff5f5f}
        .confirm-invite{background:rgba(61,139,255,0.15);color:#3d8bff}

        @media(max-width:700px){.addir-shell{padding:1.5rem 1rem 4rem}.addir-filters{flex-direction:column}}
      `}</style>

      <div className="addir-root">
        <nav className="addir-nav">
          <Link href="/" className="addir-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" />
          </Link>
          <div className="addir-nav-links">
            <Link href="/admin" className="addir-nav-link">Dashboard</Link>
            <Link href="/admin/directory" className="addir-nav-link active">Directory</Link>
            <span className="addir-badge">ADMIN</span>
            <AppNav drawerOnly />
          </div>
        </nav>

        <div className="addir-shell">
          <div className="addir-header">
            <div>
              <h1 className="addir-h1">Directory Management</h1>
              {!loading && <div className="addir-total">{total.toLocaleString()} listings</div>}
            </div>
            <Link href="/professionals" className="addir-nav-link" target="_blank" style={{ fontSize: "0.8rem" }}>
              View public directory ↗
            </Link>
          </div>

          {/* Filters */}
          <div className="addir-filters">
            <input
              className="addir-input"
              placeholder="Search by name…"
              value={q}
              onChange={e => setQ(e.target.value)}
              style={{ flex: "2 1 200px" }}
            />
            <select className="addir-select" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">All status</option>
              <option value="claimed">Claimed only</option>
              <option value="unclaimed">Unclaimed only</option>
              <option value="flagged">Flagged</option>
            </select>
            <select className="addir-select" value={source} onChange={e => setSource(e.target.value)}>
              <option value="">All sources</option>
              <option value="ca_dre">CA DRE seed</option>
              <option value="nmls">NMLS seed</option>
              <option value="self">Self-registered</option>
            </select>
            <select className="addir-select" value={type} onChange={e => setType(e.target.value)}>
              <option value="">All types</option>
              <option value="lo">Loan Officers</option>
              <option value="lo_company">Mortgage Companies</option>
              <option value="agent">RE Agents</option>
              <option value="agent_broker">RE Brokers/Corps</option>
            </select>
          </div>

          {/* Table */}
          {loading ? (
            <div style={{ textAlign: "center", padding: "4rem", color: "rgba(255,255,255,0.25)" }}>Loading…</div>
          ) : listings.length === 0 ? (
            <div style={{ textAlign: "center", padding: "4rem", color: "rgba(255,255,255,0.25)" }}>No listings found.</div>
          ) : (
            <div className="addir-table-wrap">
              <table className="addir-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>City</th>
                    <th>Source</th>
                    <th>License #</th>
                    <th>Status</th>
                    <th>Claimed / Invited</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map(l => (
                    <tr key={l.id} className={isFlagged(l) ? "flagged" : ""}>
                      <td style={{ color: "#f0f4ff", fontWeight: 600, maxWidth: 200 }}>
                        {l.name}
                        {l.company_name && (
                          <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>{l.company_name}</div>
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <span className="addir-badge-sm addir-badge-dre">{PRO_TYPE_LABEL[l.pro_type] ?? l.pro_type}</span>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{l.city ?? "—"}{l.state ? `, ${l.state}` : ""}</td>
                      <td>
                        <span className={`addir-badge-sm ${l.source === "self" ? "addir-badge-self" : "addir-badge-dre"}`}>
                          {l.source === "self" ? "Self" : l.source === "nmls" ? "NMLS" : "DRE"}
                        </span>
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.72rem", color: "rgba(255,255,255,0.3)" }}>
                        {l.source_id.replace(/^co_/, "")}
                      </td>
                      <td>
                        {isFlagged(l) ? (
                          <span className="addir-badge-sm addir-badge-flagged">Flagged</span>
                        ) : (
                          <span style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.3)" }}>{l.license_status ?? "—"}</span>
                        )}
                      </td>
                      <td>
                        {isClaimed(l) ? (
                          <span className="addir-badge-sm addir-badge-claimed">✓ Claimed</span>
                        ) : l.invited_at ? (
                          <span className="addir-badge-sm addir-badge-invited" title={`Invited ${new Date(l.invited_at).toLocaleDateString()}`}>
                            ✉ Invited
                          </span>
                        ) : (
                          <span style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.25)" }}>—</span>
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap", display: "flex", gap: 4, alignItems: "center" }}>
                        {!isClaimed(l) && (
                          <button
                            className="addir-action-btn addir-invite-btn"
                            onClick={() => { setInviteTarget(l); setInviteEmail(""); setInviteResult(null); }}
                          >
                            Invite
                          </button>
                        )}
                        {isFlagged(l) ? (
                          <button
                            className="addir-action-btn addir-restore-btn"
                            onClick={() => setActionTarget({ ...l, _action: "restore" } as any)}
                          >
                            Restore
                          </button>
                        ) : (
                          <button
                            className="addir-action-btn addir-flag-btn"
                            onClick={() => setActionTarget({ ...l, _action: "flag" } as any)}
                          >
                            Flag
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pages > 1 && (
            <div className="addir-pagination">
              <button className="addir-page-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span className="addir-page-info">Page {page + 1} of {pages}</span>
              <button className="addir-page-btn" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </div>
      </div>

      {/* Invite modal */}
      {inviteTarget && (
        <div className="addir-modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setInviteTarget(null); setInviteResult(null); } }}>
          <div className="addir-modal">
            <h3>Invite to claim listing</h3>
            <p>
              <strong style={{ color: "#f0f4ff" }}>{inviteTarget.name}</strong><br />
              {PRO_TYPE_LABEL[inviteTarget.pro_type] ?? inviteTarget.pro_type}
              {inviteTarget.city ? ` · ${inviteTarget.city}, ${inviteTarget.state}` : ""}
            </p>
            <input
              className="addir-modal-input"
              type="email"
              placeholder="Pro's email address"
              value={inviteEmail}
              onChange={e => { setInviteEmail(e.target.value); setInviteResult(null); }}
              onKeyDown={e => { if (e.key === "Enter") handleInvite(); }}
            />
            {inviteResult && (
              <div className={`addir-invite-result ${inviteResult.ok ? "ok" : "err"}`}>
                {inviteResult.message}
              </div>
            )}
            <div className="addir-modal-actions">
              <button
                className="addir-modal-btn cancel"
                onClick={() => { setInviteTarget(null); setInviteResult(null); setInviteEmail(""); }}
              >
                {inviteResult?.ok ? "Close" : "Cancel"}
              </button>
              {!inviteResult?.ok && (
                <button
                  className="addir-modal-btn confirm-invite"
                  disabled={inviting || !inviteEmail.trim()}
                  onClick={handleInvite}
                >
                  {inviting ? "Sending…" : "Send invite"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action modal */}
      {actionTarget && (
        <div className="addir-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setActionTarget(null); }}>
          <div className="addir-modal">
            <h3>
              {(actionTarget as any)._action === "flag" ? "Flag this listing" : "Restore this listing"}
            </h3>
            <p>
              <strong style={{ color: "#f0f4ff" }}>{actionTarget.name}</strong><br />
              {actionTarget.city}, {actionTarget.state} · {actionTarget.license_type ?? actionTarget.pro_type}
              {(actionTarget as any)._action === "flag"
                ? " — This listing will be hidden from the public directory."
                : " — This listing will be restored to Active status."}
            </p>
            <textarea
              className="addir-modal-textarea"
              placeholder="Reason / notes (optional)"
              value={actionNote}
              onChange={e => setActionNote(e.target.value)}
            />
            <div className="addir-modal-actions">
              <button className="addir-modal-btn cancel" onClick={() => { setActionTarget(null); setActionNote(""); }}>
                Cancel
              </button>
              <button
                className={`addir-modal-btn ${(actionTarget as any)._action === "flag" ? "confirm-flag" : "confirm-restore"}`}
                disabled={acting}
                onClick={() => handleAction(actionTarget, (actionTarget as any)._action)}
              >
                {acting ? "Saving…" : (actionTarget as any)._action === "flag" ? "Flag listing" : "Restore listing"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
