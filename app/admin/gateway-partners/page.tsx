"use client";
// app/admin/gateway-partners/page.tsx
// Admin: manage HomeRates Intelligence Gateway partners and credentials.
// Phase C only -- no usage/analytics/rate-limit/quota-editing/kill-switch UI
// here; those belong to Phases D/E.

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import AppNav from "../../components/AppNav";

interface Credential {
  id: string;
  partner_id: string;
  key_prefix: string;
  scopes: string[];
  status: "active" | "revoked" | "disabled";
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface Partner {
  id: string;
  name: string;
  contact_email: string;
  status: "pending" | "active" | "suspended" | "cancelled";
  rate_limit_tier: string;
  quota_tier: string;
  created_at: string;
  updated_at: string;
  credentials: Credential[];
}

const STATUS_COLOR: Record<string, string> = {
  pending: "#8fa3b8", active: "#00e87a", suspended: "#f0c040", cancelled: "#ff5a5a",
  revoked: "#ff5a5a", disabled: "#8fa3b8",
};

export default function GatewayPartnersAdminPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", contact_email: "" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issuingFor, setIssuingFor] = useState<string | null>(null);
  const [justIssued, setJustIssued] = useState<{ partnerId: string; plaintextKey: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/gateway-partners");
    if (r.ok) { const d = await r.json(); setPartners(d.partners ?? []); }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createPartner() {
    if (!form.name.trim() || !form.contact_email.trim()) { setError("Name and contact email required."); return; }
    setCreating(true); setError(null);
    const r = await fetch("/api/admin/gateway-partners", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await r.json();
    setCreating(false);
    if (!r.ok) { setError(d.error ?? "Create failed."); return; }
    setForm({ name: "", contact_email: "" });
    void load();
  }

  async function updateStatus(partnerId: string, status: string) {
    await fetch(`/api/admin/gateway-partners/${partnerId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    void load();
  }

  async function issueCredential(partnerId: string) {
    setIssuingFor(partnerId); setError(null); setJustIssued(null);
    const r = await fetch("/api/admin/gateway-credentials", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partner_id: partnerId }),
    });
    const d = await r.json();
    setIssuingFor(null);
    if (!r.ok) { setError(d.error ?? "Issuance failed."); return; }
    // Shown ONCE, from this response only -- never persisted, never fetchable again.
    setJustIssued({ partnerId, plaintextKey: d.plaintext_key });
    void load();
  }

  async function revokeCredential(credentialId: string) {
    if (!confirm("Revoke this credential? This cannot be undone.")) return;
    await fetch(`/api/admin/gateway-credentials/${credentialId}`, { method: "DELETE" });
    void load();
  }

  function copyKey(key: string) {
    navigator.clipboard?.writeText(key).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
  const inputStyle: React.CSSProperties = {
    padding: "10px 14px", background: "#141b28", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10, color: "#f0f4ff", fontSize: "0.875rem", fontFamily: "inherit", outline: "none",
  };
  const labelStyle: React.CSSProperties = { fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8fa3b8" };
  const btnStyle: React.CSSProperties = { padding: "9px 16px", borderRadius: 8, border: "none", background: "#00e87a", color: "#080c12", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" };
  const cardStyle: React.CSSProperties = { background: "#0e1420", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "20px 22px", marginBottom: 16 };

  return (
    <div className="page-standalone" style={{ minHeight: "100vh", width: "100%", background: "#080c12", color: "#f0f4ff", fontFamily: "'DM Sans', system-ui, sans-serif", overflowY: "auto" }}>
      <AppNav />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1.5rem", boxSizing: "border-box" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
          <Link href="/admin" style={{ color: "#3d8bff", textDecoration: "none", fontSize: "0.875rem" }}>← Admin</Link>
        </div>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 800, margin: "0 0 4px" }}>Gateway Partners</h1>
        <p style={{ color: "#8fa3b8", fontSize: "0.85rem", margin: "0 0 24px" }}>
          HomeRates Intelligence Gateway V1 — Phase C. Partner identity and API credential management only.
          The Gateway itself has no public endpoint yet.
        </p>

        {error && <div style={{ ...cardStyle, borderColor: "rgba(255,90,90,0.4)", color: "#ff5a5a" }}>{error}</div>}

        {/* Create partner */}
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>New partner</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={field}>
              <label style={labelStyle}>Name</label>
              <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Acme AI" />
            </div>
            <div style={field}>
              <label style={labelStyle}>Contact email</label>
              <input style={inputStyle} value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} placeholder="contact@partner.com" />
            </div>
            <button style={btnStyle} disabled={creating} onClick={createPartner}>{creating ? "Creating…" : "Create partner"}</button>
          </div>
        </div>

        {loading ? <p style={{ color: "#8fa3b8" }}>Loading…</p> : partners.length === 0 ? (
          <p style={{ color: "#8fa3b8" }}>No partners yet.</p>
        ) : partners.map((p) => (
          <div key={p.id} style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: "1rem" }}>{p.name}</div>
                <div style={{ color: "#8fa3b8", fontSize: "0.8rem" }}>{p.contact_email}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: STATUS_COLOR[p.status], textTransform: "uppercase" }}>{p.status}</span>
                <select
                  value={p.status}
                  onChange={(e) => updateStatus(p.id, e.target.value)}
                  style={{ ...inputStyle, padding: "6px 10px", fontSize: "0.78rem" }}
                >
                  {["pending", "active", "suspended", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div style={{ fontSize: "0.78rem", color: "#8fa3b8", marginBottom: 12 }}>
              rate_limit_tier: {p.rate_limit_tier} · quota_tier: {p.quota_tier}
            </div>

            {justIssued && justIssued.partnerId === p.id && (
              <div style={{ background: "rgba(0,232,122,0.08)", border: "1px solid rgba(0,232,122,0.35)", borderRadius: 10, padding: 14, marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: "0.82rem", marginBottom: 6, color: "#00e87a" }}>New credential issued — shown once only</div>
                <code style={{ display: "block", background: "#080c12", padding: "8px 10px", borderRadius: 6, fontSize: "0.78rem", wordBreak: "break-all", marginBottom: 8 }}>
                  {justIssued.plaintextKey}
                </code>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <button style={{ ...btnStyle, padding: "6px 12px", fontSize: "0.75rem" }} onClick={() => copyKey(justIssued.plaintextKey)}>
                    {copied ? "Copied ✓" : "Copy"}
                  </button>
                  <span style={{ color: "#f0c040", fontSize: "0.72rem" }}>This key cannot be retrieved again after you leave this page.</span>
                </div>
              </div>
            )}

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ color: "#8fa3b8", textAlign: "left" }}>
                  <th style={{ padding: "4px 8px 4px 0" }}>Prefix</th>
                  <th style={{ padding: "4px 8px" }}>Status</th>
                  <th style={{ padding: "4px 8px" }}>Created</th>
                  <th style={{ padding: "4px 8px" }}>Last used</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {p.credentials.length === 0 ? (
                  <tr><td colSpan={5} style={{ color: "#8fa3b8", padding: "6px 0" }}>No credentials issued.</td></tr>
                ) : p.credentials.map((c) => (
                  <tr key={c.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding: "6px 8px 6px 0", fontFamily: "monospace" }}>hrg_{c.key_prefix}…</td>
                    <td style={{ padding: "6px 8px", color: STATUS_COLOR[c.status], fontWeight: 700 }}>{c.status}</td>
                    <td style={{ padding: "6px 8px", color: "#8fa3b8" }}>{new Date(c.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: "6px 8px", color: "#8fa3b8" }}>{c.last_used_at ? new Date(c.last_used_at).toLocaleString() : "never"}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>
                      {c.status === "active" && (
                        <button onClick={() => revokeCredential(c.id)} style={{ background: "none", border: "1px solid rgba(255,90,90,0.4)", color: "#ff5a5a", borderRadius: 6, padding: "4px 10px", fontSize: "0.72rem", cursor: "pointer" }}>
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button
              style={{ ...btnStyle, marginTop: 12 }}
              disabled={issuingFor === p.id}
              onClick={() => issueCredential(p.id)}
            >
              {issuingFor === p.id ? "Issuing…" : "Issue new credential"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
