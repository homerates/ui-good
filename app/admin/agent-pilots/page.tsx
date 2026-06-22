"use client";
// app/admin/agent-pilots/page.tsx
// Admin: create and manage agent company pilot links for principal broker outreach.

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import AppNav from "../../components/AppNav";

interface Pilot {
  id: string;
  company_name: string;
  slug: string;
  contact_name: string | null;
  contact_email: string | null;
  credits_per_lo: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  activations: number;
  invite_sent_at: string | null;
}

const BASE_URL = "https://chat.homerates.ai";

export default function AdminAgentPilotsPage() {
  const [pilots, setPilots]   = useState<Pilot[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied]   = useState<string | null>(null);
  const [inviting, setInviting] = useState<string | null>(null);
  const [invited, setInvited]   = useState<string | null>(null);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ sent: number; total: number } | null>(null);

  const [bulkText, setBulkText]     = useState("");
  const [bulkPreview, setBulkPreview] = useState<{ company_name: string; contact_name: string; contact_email: string }[]>([]);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResult, setBulkResult]   = useState<{ created: string[]; skipped: string[]; failed: { company: string; error: string }[] } | null>(null);

  const [form, setForm] = useState({
    company_name: "", slug: "", contact_name: "", contact_email: "",
    credits_per_lo: "1000", notes: "",
  });
  const [creating, setCreating]   = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/agent-pilots");
    if (r.ok) { const d = await r.json(); setPilots(d); }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  function autoSlug(name: string) {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  async function createPilot() {
    if (!form.company_name.trim()) { setCreateError("Company name required"); return; }
    setCreating(true); setCreateError(null); setCreateSuccess(null);
    const r = await fetch("/api/admin/agent-pilots", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, credits_per_lo: Number(form.credits_per_lo) || 1000 }),
    });
    const d = await r.json();
    if (!r.ok) { setCreateError(d.error ?? "Create failed"); }
    else {
      setCreateSuccess(`${BASE_URL}/agent-pilot/${d.pilot.slug}`);
      setForm({ company_name: "", slug: "", contact_name: "", contact_email: "", credits_per_lo: "1000", notes: "" });
      void load();
    }
    setCreating(false);
  }

  async function sendInvite(pilot: Pilot) {
    if (!pilot.contact_email) return;
    setInviting(pilot.id);
    await fetch("/api/admin/agent-pilots/invite", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pilotId: pilot.id }),
    });
    setInviting(null); setInvited(pilot.id);
    setTimeout(() => setInvited(null), 3000);
    void load();
  }

  async function toggleActive(pilot: Pilot) {
    await fetch("/api/admin/agent-pilots", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: pilot.id, is_active: !pilot.is_active }),
    });
    void load();
  }

  function parseBulkText(text: string) {
    const rows = text.split("\n").map(l => l.trim()).filter(Boolean);
    setBulkPreview(rows.map(row => {
      const cols = row.split(",").map(s => s.trim());
      return { company_name: cols[0] ?? "", contact_name: cols[1] ?? "", contact_email: cols[2] ?? "" };
    }).filter(r => r.company_name));
  }

  async function runBulkImport(sendInvites: boolean) {
    if (!bulkPreview.length) return;
    setBulkImporting(true); setBulkResult(null);
    const r = await fetch("/api/admin/agent-pilots/bulk", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacts: bulkPreview, sendInvites }),
    });
    const d = await r.json();
    setBulkResult(d); setBulkImporting(false);
    if (r.ok) { setBulkText(""); setBulkPreview([]); void load(); }
  }

  async function sendAllUnsent() {
    const unsent = pilots.filter(p => p.contact_email && p.is_active && !p.invite_sent_at);
    if (!unsent.length) return;
    setBulkSending(true); setBulkProgress({ sent: 0, total: unsent.length });
    for (let i = 0; i < unsent.length; i++) {
      await fetch("/api/admin/agent-pilots/invite", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pilotId: unsent[i].id }),
      });
      setBulkProgress({ sent: i + 1, total: unsent.length });
    }
    setBulkSending(false); setBulkProgress(null); void load();
  }

  const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
  const inputStyle: React.CSSProperties = {
    padding: "10px 14px", background: "#141b28", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10, color: "#f0f4ff", fontSize: "0.875rem", fontFamily: "inherit", outline: "none",
  };
  const labelStyle: React.CSSProperties = { fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8fa3b8" };

  return (
    <div className="page-standalone" style={{ minHeight: "100vh", width: "100%", background: "#080c12", color: "#f0f4ff", fontFamily: "'DM Sans', system-ui, sans-serif", overflowY: "auto" }}>
      <AppNav />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1.5rem", boxSizing: "border-box" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32, flexWrap: "wrap" }}>
          <Link href="/admin" style={{ color: "#3d8bff", textDecoration: "none", fontSize: "0.875rem" }}>← Admin</Link>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800 }}>Agent Pilot Links</h1>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "#8fa3b8", marginTop: 4 }}>
              Create a unique link per real estate brokerage. Send to principal broker. Agents activate instantly — no waitlist, no pricing, full founding access.
            </p>
          </div>
          {(() => {
            const unsent = pilots.filter(p => p.contact_email && p.is_active && !p.invite_sent_at);
            if (!unsent.length) return null;
            return (
              <button onClick={sendAllUnsent} disabled={bulkSending} style={{
                padding: "10px 20px", borderRadius: 10,
                background: bulkSending ? "rgba(0,232,122,0.1)" : "rgba(0,232,122,0.12)",
                border: "1px solid rgba(0,232,122,0.35)", color: "#00e87a",
                fontSize: "0.85rem", fontWeight: 700, cursor: bulkSending ? "not-allowed" : "pointer",
                fontFamily: "inherit", whiteSpace: "nowrap", opacity: bulkSending ? 0.7 : 1,
              }}>
                {bulkSending && bulkProgress ? `Sending ${bulkProgress.sent}/${bulkProgress.total}…` : `Send all unsent ✉ (${unsent.length})`}
              </button>
            );
          })()}
        </div>

        {/* Create form */}
        <div style={{ background: "#0e1420", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "1.75rem", marginBottom: 32 }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "#00e87a", marginBottom: 16 }}>
            Create New Agent Pilot Link
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={field}>
              <label style={labelStyle}>Brokerage Name *</label>
              <input style={inputStyle} value={form.company_name} placeholder="Compass Real Estate"
                onChange={e => { const v = e.target.value; setForm(f => ({ ...f, company_name: v, slug: f.slug || autoSlug(v) })); }} />
            </div>
            <div style={field}>
              <label style={labelStyle}>URL Slug * (auto-generated)</label>
              <input style={inputStyle} value={form.slug} placeholder="compass-real-estate"
                onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))} />
            </div>
            <div style={field}>
              <label style={labelStyle}>Principal Broker / Contact Name</label>
              <input style={inputStyle} value={form.contact_name} placeholder="Robert Reffkin"
                onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
            </div>
            <div style={field}>
              <label style={labelStyle}>Principal Broker / Contact Email</label>
              <input style={inputStyle} type="email" value={form.contact_email} placeholder="robert@compass.com"
                onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} />
            </div>
            <div style={field}>
              <label style={labelStyle}>Credits per Agent</label>
              <input style={inputStyle} type="number" value={form.credits_per_lo}
                onChange={e => setForm(f => ({ ...f, credits_per_lo: e.target.value }))} />
            </div>
            <div style={field}>
              <label style={labelStyle}>Notes (Internal)</label>
              <input style={inputStyle} value={form.notes} placeholder="e.g. LinkedIn DM sent 2026-06-22"
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              {form.slug && (
                <div style={{ fontSize: "0.8rem", color: "#8fa3b8", marginBottom: 10, padding: "8px 12px", background: "rgba(0,232,122,0.06)", borderRadius: 8, border: "1px solid rgba(0,232,122,0.12)" }}>
                  Link preview: <a href={`${BASE_URL}/agent-pilot/${form.slug}`} target="_blank" rel="noreferrer" style={{ color: "#00e87a", textDecoration: "none", fontWeight: 600 }}>{BASE_URL}/agent-pilot/{form.slug}</a>
                </div>
              )}
              {createError && <div style={{ fontSize: "0.85rem", color: "#ff5f5f", marginBottom: 10 }}>{createError}</div>}
              {createSuccess && (
                <div style={{ fontSize: "0.8rem", color: "#00e87a", marginBottom: 10, wordBreak: "break-all" }}>
                  ✓ Created: <span style={{ fontWeight: 600 }}>{createSuccess}</span>
                </div>
              )}
              <button onClick={createPilot} disabled={creating} style={{
                padding: "11px 28px", borderRadius: 10, background: "#00e87a", color: "#080c12",
                border: "none", fontWeight: 700, fontSize: "0.9rem", cursor: creating ? "not-allowed" : "pointer",
                fontFamily: "inherit", opacity: creating ? 0.7 : 1,
              }}>
                {creating ? "Creating…" : "Create agent pilot link →"}
              </button>
            </div>
          </div>
        </div>

        {/* Bulk import */}
        <div style={{ background: "#0e1420", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "1.75rem", marginBottom: 32 }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "#3d8bff", marginBottom: 8 }}>
            Bulk Import
          </div>
          <p style={{ margin: "0 0 12px", fontSize: "0.8rem", color: "#8fa3b8" }}>
            Paste one contact per line: <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 6px", borderRadius: 4, color: "#eaf8f7" }}>Brokerage Name, Contact Name, email@domain.com</code>
          </p>
          <textarea value={bulkText}
            onChange={e => { setBulkText(e.target.value); parseBulkText(e.target.value); setBulkResult(null); }}
            placeholder={"Compass Real Estate, Robert Reffkin, robert@compass.com\nKeller Williams, Gary Keller, gary@kw.com\nRemax, Nick Bailey, nick@remax.com"}
            rows={6} style={{ width: "100%", boxSizing: "border-box" as const, padding: "10px 14px", background: "#141b28", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f0f4ff", fontSize: "0.8rem", fontFamily: "'DM Mono', monospace", resize: "vertical" as const, outline: "none" }}
          />
          {bulkPreview.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: "0.72rem", color: "#8fa3b8", marginBottom: 6 }}>{bulkPreview.length} contact{bulkPreview.length !== 1 ? "s" : ""} parsed</div>
              <div style={{ background: "#0a1018", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 14 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      {["Brokerage", "Contact", "Email"].map(h => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left" as const, color: "#8fa3b8", fontWeight: 600, fontSize: "0.7rem", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bulkPreview.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "7px 12px", color: "#f0f4ff", fontWeight: 600 }}>{r.company_name || <span style={{ color: "#ff5f5f" }}>missing</span>}</td>
                        <td style={{ padding: "7px 12px", color: "#c8d8ea" }}>{r.contact_name || <span style={{ color: "#8fa3b8" }}>—</span>}</td>
                        <td style={{ padding: "7px 12px", color: "#c8d8ea" }}>{r.contact_email || <span style={{ color: "#ff9966" }}>no email</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
                <button onClick={() => runBulkImport(true)} disabled={bulkImporting} style={{ padding: "10px 20px", borderRadius: 10, background: "#00e87a", color: "#080c12", border: "none", fontWeight: 700, fontSize: "0.85rem", cursor: bulkImporting ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: bulkImporting ? 0.6 : 1 }}>
                  {bulkImporting ? "Importing…" : `Create ${bulkPreview.length} + send invites →`}
                </button>
                <button onClick={() => runBulkImport(false)} disabled={bulkImporting} style={{ padding: "10px 20px", borderRadius: 10, background: "transparent", color: "#8fa3b8", border: "1px solid rgba(255,255,255,0.12)", fontWeight: 600, fontSize: "0.85rem", cursor: bulkImporting ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: bulkImporting ? 0.6 : 1 }}>
                  Create only (send later)
                </button>
              </div>
            </div>
          )}
          {bulkResult && (
            <div style={{ marginTop: 12, fontSize: "0.8rem", display: "flex", flexDirection: "column" as const, gap: 4 }}>
              {bulkResult.created.length > 0 && <div style={{ color: "#00e87a" }}>✓ Created: {bulkResult.created.join(", ")}</div>}
              {bulkResult.skipped.length > 0 && <div style={{ color: "#8fa3b8" }}>↩ Already existed (skipped): {bulkResult.skipped.join(", ")}</div>}
              {bulkResult.failed.length > 0 && <div style={{ color: "#ff5f5f" }}>✗ Failed: {bulkResult.failed.map(f => `${f.company} (${f.error})`).join(", ")}</div>}
            </div>
          )}
        </div>

        {/* Pilot list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {loading && <div style={{ color: "#8fa3b8", fontSize: "0.875rem" }}>Loading…</div>}
          {!loading && pilots.length === 0 && <div style={{ color: "#8fa3b8", fontSize: "0.875rem" }}>No agent pilots yet. Create one above.</div>}
          {pilots.map(pilot => (
            <div key={pilot.id} style={{ background: "#0e1420", border: `1px solid ${pilot.is_active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)"}`, borderRadius: 14, padding: "1.25rem 1.5rem", opacity: pilot.is_active ? 1 : 0.55 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" as const }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#f0f4ff" }}>{pilot.company_name}</span>
                    {!pilot.is_active && <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "2px 8px", background: "rgba(255,255,255,0.06)", borderRadius: 99, color: "#8fa3b8", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Inactive</span>}
                    {pilot.invite_sent_at && <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "2px 8px", background: "rgba(0,232,122,0.08)", borderRadius: 99, color: "#00e87a", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Invited</span>}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "#8fa3b8", display: "flex", gap: 16, flexWrap: "wrap" as const }}>
                    {pilot.contact_name && <span>{pilot.contact_name}</span>}
                    {pilot.contact_email && <span>{pilot.contact_email}</span>}
                    <span>{pilot.credits_per_lo.toLocaleString()} credits/agent</span>
                    <span>{pilot.activations} activated</span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: "0.75rem" }}>
                    <a href={`${BASE_URL}/agent-pilot/${pilot.slug}`} target="_blank" rel="noreferrer" style={{ color: "#3d8bff", textDecoration: "none" }}>{BASE_URL}/agent-pilot/{pilot.slug}</a>
                  </div>
                  {pilot.invite_sent_at && (
                    <div style={{ marginTop: 4, fontSize: "0.7rem", color: "#8fa3b8" }}>
                      Invite sent {new Date(pilot.invite_sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                  )}
                  {pilot.notes && <div style={{ marginTop: 4, fontSize: "0.72rem", color: "#8fa3b8", fontStyle: "italic" }}>{pilot.notes}</div>}
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" as const, alignItems: "center" }}>
                  <button onClick={() => { navigator.clipboard.writeText(`${BASE_URL}/agent-pilot/${pilot.slug}`); setCopied(pilot.id); setTimeout(() => setCopied(null), 2000); }}
                    style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: copied === pilot.id ? "#00e87a" : "#f0f4ff", fontSize: "0.78rem", cursor: "pointer", fontFamily: "inherit" }}>
                    {copied === pilot.id ? "Copied!" : "Copy link"}
                  </button>
                  {pilot.contact_email && pilot.is_active && (
                    <button onClick={() => sendInvite(pilot)} disabled={inviting === pilot.id}
                      style={{ padding: "6px 14px", borderRadius: 8, background: invited === pilot.id ? "rgba(0,232,122,0.1)" : "rgba(0,232,122,0.08)", border: "1px solid rgba(0,232,122,0.25)", color: "#00e87a", fontSize: "0.78rem", cursor: inviting === pilot.id ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: inviting === pilot.id ? 0.6 : 1 }}>
                      {inviting === pilot.id ? "Sending…" : invited === pilot.id ? "✓ Sent!" : pilot.invite_sent_at ? "Resend invite" : "Send invite ✉"}
                    </button>
                  )}
                  <button onClick={() => toggleActive(pilot)}
                    style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "#8fa3b8", fontSize: "0.78rem", cursor: "pointer", fontFamily: "inherit" }}>
                    {pilot.is_active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
