"use client";
// app/admin/corporate/page.tsx
// Admin: send corporate invitations, view nominations, track org onboarding status

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppNav from "../../components/AppNav";
import { useAdminStatus } from "../../hooks/useAdminStatus";

const ORG_TYPES = [
  { value: "brokerage",    label: "Mortgage Brokerage" },
  { value: "lender",       label: "Lender / Bank" },
  { value: "credit_union", label: "Credit Union" },
  { value: "re_brokerage", label: "Real Estate Brokerage" },
];

const ORG_LABEL: Record<string, string> = {
  brokerage: "Mortgage Brokerage", lender: "Lender / Bank",
  credit_union: "Credit Union", re_brokerage: "Real Estate Brokerage",
};

const INV_STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending:  { bg: "rgba(245,158,11,0.12)",  color: "#f59e0b" },
  accepted: { bg: "rgba(0,232,122,0.12)",   color: "#00e87a" },
  declined: { bg: "rgba(255,95,95,0.1)",    color: "#ff5f5f" },
};
const NOM_STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending:   { bg: "rgba(245,158,11,0.12)",  color: "#f59e0b" },
  contacted: { bg: "rgba(61,139,255,0.12)",  color: "#3d8bff" },
  converted: { bg: "rgba(0,232,122,0.12)",   color: "#00e87a" },
  dismissed: { bg: "rgba(255,255,255,0.06)", color: "#6b7a99" },
};

interface Invitation {
  id: string;
  org_name: string;
  org_type: string;
  contact_name: string | null;
  contact_email: string;
  status: string;
  notes: string | null;
  brokerage_id: string | null;
  created_at: string;
}

interface Nomination {
  id: string;
  nominated_by: string;
  org_name: string;
  org_type: string;
  contact_email: string | null;
  website: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

export default function AdminCorporatePage() {
  const router = useRouter();
  const { isAdmin, loading: adminLoading } = useAdminStatus();

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [nominations, setNominations] = useState<Nomination[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // New invite form
  const [orgName, setOrgName]             = useState("");
  const [orgType, setOrgType]             = useState("brokerage");
  const [contactName, setContactName]     = useState("");
  const [contactEmail, setContactEmail]   = useState("");
  const [notes, setNotes]                 = useState("");
  const [sending, setSending]             = useState(false);
  const [sendErr, setSendErr]             = useState("");
  const [sentLink, setSentLink]           = useState<string | null>(null);

  useEffect(() => {
    if (adminLoading) return;
    if (!isAdmin) { router.replace("/"); return; }
    loadData();
  }, [isAdmin, adminLoading]);

  async function loadData() {
    setDataLoading(true);
    const res = await fetch("/api/admin/corporate-invite");
    if (res.ok) {
      const d = await res.json();
      setInvitations(d.invitations ?? []);
      setNominations(d.nominations ?? []);
    }
    setDataLoading(false);
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setSending(true); setSendErr(""); setSentLink(null);
    const res = await fetch("/api/admin/corporate-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_name: orgName, org_type: orgType, contact_name: contactName, contact_email: contactEmail, notes }),
    });
    const d = await res.json();
    if (!res.ok) { setSendErr(d.error ?? "Failed to send"); setSending(false); return; }
    setSentLink(d.claim_url);
    setOrgName(""); setOrgType("brokerage"); setContactName(""); setContactEmail(""); setNotes("");
    await loadData();
    setSending(false);
  }

  async function updateStatus(id: string, type: "invitation" | "nomination", status: string) {
    await fetch("/api/admin/corporate-invite", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, type, status }),
    });
    await loadData();
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const badge = (status: string, map: Record<string, { bg: string; color: string }>) => {
    const s = map[status] ?? { bg: "rgba(255,255,255,0.06)", color: "#6b7a99" };
    return (
      <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: s.bg, color: s.color, letterSpacing: "0.05em", textTransform: "capitalize" as const }}>
        {status}
      </span>
    );
  };

  return (
    <>
      <div className="ac-root">
        <AppNav />
        <div className="ac-container">
          <div className="ac-nav">
            <Link href="/admin" className="ac-back">← Admin dashboard</Link>
          </div>

          <div className="ac-header">
            <div className="ac-eyebrow">Admin</div>
            <h1 className="ac-title">Corporate Accounts</h1>
            <p className="ac-sub">Send invitations to organizations, track nominations from professionals, and manage enterprise onboarding.</p>
          </div>

          {/* ── Send invite form ── */}
          <div className="ac-section">
            <div className="ac-section-title">Send Corporate Invitation</div>
            <form onSubmit={sendInvite} className="ac-form">
              <div className="ac-row">
                <div className="ac-field">
                  <label className="ac-label">Organization type</label>
                  <select className="ac-input ac-select" value={orgType} onChange={e => setOrgType(e.target.value)}>
                    {ORG_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="ac-field" style={{ flex: 2 }}>
                  <label className="ac-label">Organization name</label>
                  <input className="ac-input" value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Pacific Coast Lending Group" required />
                </div>
              </div>
              <div className="ac-row">
                <div className="ac-field">
                  <label className="ac-label">Contact name</label>
                  <input className="ac-input" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Jane Smith" />
                </div>
                <div className="ac-field" style={{ flex: 2 }}>
                  <label className="ac-label">Contact email *</label>
                  <input className="ac-input" type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="jane@company.com" required />
                </div>
              </div>
              <div className="ac-field">
                <label className="ac-label">Personal note <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(shown in email)</span></label>
                <textarea className="ac-input ac-textarea" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. We spoke at the NAMB conference — great to connect…" rows={2} />
              </div>
              {sendErr && <div className="ac-error">{sendErr}</div>}
              {sentLink && (
                <div className="ac-success">
                  ✓ Invitation sent. Claim link: <a href={sentLink} target="_blank" rel="noopener noreferrer" style={{ color: "#00e87a", wordBreak: "break-all" }}>{sentLink}</a>
                </div>
              )}
              <button type="submit" className="ac-btn" disabled={sending || !orgName.trim() || !contactEmail.trim()}>
                {sending ? "Sending…" : "Send invitation →"}
              </button>
            </form>
          </div>

          {/* ── Invitations list ── */}
          <div className="ac-section">
            <div className="ac-section-title">Sent Invitations — {invitations.length}</div>
            {dataLoading ? (
              <div className="ac-loading">Loading…</div>
            ) : invitations.length === 0 ? (
              <p className="ac-empty">No invitations sent yet.</p>
            ) : (
              <div className="ac-table">
                {invitations.map(inv => (
                  <div key={inv.id} className="ac-row-item">
                    <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, color: "#f0f4ff", fontSize: "0.9rem" }}>{inv.org_name}</span>
                        <span style={{ fontSize: "0.72rem", color: "#3a4560" }}>{ORG_LABEL[inv.org_type]}</span>
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "#8fa3b8", marginTop: 2 }}>
                        {inv.contact_name ? `${inv.contact_name} · ` : ""}{inv.contact_email}
                      </div>
                      {inv.notes && <div style={{ fontSize: "0.72rem", color: "#3a4560", marginTop: 2, fontStyle: "italic" }}>{inv.notes}</div>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      {badge(inv.status, INV_STATUS_STYLE)}
                      <span style={{ fontSize: "0.72rem", color: "#3a4560" }}>{fmtDate(inv.created_at)}</span>
                      {inv.status === "pending" && (
                        <button className="ac-ghost-btn" onClick={() => updateStatus(inv.id, "invitation", "declined")}>Decline</button>
                      )}
                      {inv.status === "accepted" && inv.brokerage_id && (
                        <Link href={`/admin/brokerage/${inv.brokerage_id}`} className="ac-link-btn">View org →</Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Nominations list ── */}
          <div className="ac-section">
            <div className="ac-section-title">Pro Nominations — {nominations.length}</div>
            {dataLoading ? (
              <div className="ac-loading">Loading…</div>
            ) : nominations.length === 0 ? (
              <p className="ac-empty">No nominations yet. Professionals can nominate their organization from their profile.</p>
            ) : (
              <div className="ac-table">
                {nominations.map(nom => (
                  <div key={nom.id} className="ac-row-item">
                    <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, color: "#f0f4ff", fontSize: "0.9rem" }}>{nom.org_name}</span>
                        <span style={{ fontSize: "0.72rem", color: "#3a4560" }}>{ORG_LABEL[nom.org_type]}</span>
                      </div>
                      {nom.contact_email && <div style={{ fontSize: "0.78rem", color: "#8fa3b8", marginTop: 2 }}>{nom.contact_email}</div>}
                      {nom.website && <div style={{ fontSize: "0.72rem", color: "#3a4560", marginTop: 1 }}>{nom.website}</div>}
                      {nom.notes && <div style={{ fontSize: "0.72rem", color: "#3a4560", marginTop: 2, fontStyle: "italic" }}>{nom.notes}</div>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      {badge(nom.status, NOM_STATUS_STYLE)}
                      <span style={{ fontSize: "0.72rem", color: "#3a4560" }}>{fmtDate(nom.created_at)}</span>
                      {nom.status === "pending" && (
                        <>
                          <button className="ac-ghost-btn" onClick={() => updateStatus(nom.id, "nomination", "contacted")}>Mark contacted</button>
                          <button className="ac-ghost-btn" onClick={() => updateStatus(nom.id, "nomination", "dismissed")}>Dismiss</button>
                        </>
                      )}
                      {nom.status === "contacted" && (
                        <>
                          <button className="ac-ghost-btn ac-ghost-green" onClick={() => updateStatus(nom.id, "nomination", "converted")}>Converted</button>
                          <button className="ac-ghost-btn" onClick={() => updateStatus(nom.id, "nomination", "dismissed")}>Dismiss</button>
                        </>
                      )}
                      {nom.contact_email && nom.status !== "dismissed" && nom.status !== "converted" && (
                        <a
                          href={`/admin/corporate#send`}
                          className="ac-link-btn"
                          onClick={e => {
                            e.preventDefault();
                            setContactEmail(nom.contact_email ?? "");
                            setOrgName(nom.org_name);
                            setOrgType(nom.org_type);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Send invite →
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      <style>{`
        body:has(.ac-root) { display: block !important; height: auto !important; overflow-y: auto !important; background: #080c12 !important; }
        html:has(.ac-root) { background: #080c12 !important; }
        body:has(.ac-root) .app-footer { display: none; }

        .ac-root { font-family: 'DM Sans', system-ui, sans-serif; color: #f0f4ff; min-height: 100vh; background: #080c12; }
        .ac-container { max-width: 860px; margin: 0 auto; padding: 2.5rem 1.5rem 5rem; }

        .ac-nav { margin-bottom: 1.5rem; }
        .ac-back { font-size: 0.85rem; color: #8fa3b8; text-decoration: none; transition: color 0.15s; }
        .ac-back:hover { color: #f0f4ff; }

        .ac-eyebrow { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #00e87a; margin-bottom: 6px; }
        .ac-header { margin-bottom: 2rem; }
        .ac-title { font-size: 1.75rem; font-weight: 700; margin: 0 0 0.4rem; }
        .ac-sub { font-size: 0.9rem; color: #8fa3b8; margin: 0; line-height: 1.6; }

        .ac-section {
          background: #0e1420; border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px; padding: 1.5rem; margin-bottom: 1.5rem;
        }
        .ac-section-title {
          font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em;
          text-transform: uppercase; color: #8fa3b8;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          padding-bottom: 0.75rem; margin-bottom: 1.25rem;
        }

        .ac-form { display: flex; flex-direction: column; gap: 14px; }
        .ac-row { display: flex; gap: 12px; flex-wrap: wrap; }
        .ac-field { display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 160px; }
        .ac-label { font-size: 0.72rem; font-weight: 600; color: #8fa3b8; text-transform: uppercase; letter-spacing: 0.05em; }
        .ac-input {
          padding: 10px 13px; background: #141b28;
          border: 1px solid rgba(255,255,255,0.08); border-radius: 9px;
          color: #f0f4ff; font-size: 0.875rem; outline: none; font-family: inherit;
          transition: border-color 0.15s;
        }
        .ac-input:focus { border-color: rgba(0,232,122,0.4); }
        .ac-select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238fa3b8' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; padding-right: 32px; cursor: pointer; }
        .ac-textarea { resize: vertical; min-height: 64px; }

        .ac-btn {
          padding: 11px 28px; background: #00e87a; color: #080c12;
          border: none; border-radius: 999px;
          font-size: 0.9rem; font-weight: 700; cursor: pointer;
          transition: opacity 0.15s; font-family: inherit; align-self: flex-start;
        }
        .ac-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .ac-btn:not(:disabled):hover { opacity: 0.88; }

        .ac-ghost-btn {
          font-size: 0.72rem; font-weight: 600; color: #3a5070;
          background: none; border: 1px solid rgba(255,255,255,0.08);
          border-radius: 999px; padding: 3px 10px; cursor: pointer;
          font-family: inherit; transition: all 0.15s; white-space: nowrap;
        }
        .ac-ghost-btn:hover { color: #8fa3b8; border-color: rgba(255,255,255,0.18); }
        .ac-ghost-green { color: #00e87a !important; border-color: rgba(0,232,122,0.25) !important; }
        .ac-link-btn { font-size: 0.72rem; font-weight: 600; color: #00e87a; text-decoration: none; white-space: nowrap; transition: opacity 0.15s; }
        .ac-link-btn:hover { opacity: 0.75; }

        /* Table */
        .ac-table { display: flex; flex-direction: column; gap: 0; }
        .ac-row-item {
          display: flex; align-items: center; gap: 16px;
          padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05);
          flex-wrap: wrap;
        }
        .ac-row-item:last-child { border-bottom: none; }

        .ac-loading { color: #8fa3b8; font-size: 0.875rem; padding: 1rem 0; }
        .ac-empty { color: #3a4560; font-size: 0.875rem; margin: 0; padding: 0.5rem 0; }

        .ac-error {
          padding: 10px 14px; background: rgba(255,95,95,0.08);
          border: 1px solid rgba(255,95,95,0.2); border-radius: 9px;
          font-size: 0.85rem; color: #ff5f5f;
        }
        .ac-success {
          padding: 10px 14px; background: rgba(0,232,122,0.08);
          border: 1px solid rgba(0,232,122,0.2); border-radius: 9px;
          font-size: 0.85rem; color: #8fa3b8; line-height: 1.5;
          word-break: break-all;
        }

        @media (max-width: 600px) {
          .ac-row { flex-direction: column; }
          .ac-row-item { flex-direction: column; align-items: flex-start; }
        }
      `}</style>
    </>
  );
}
