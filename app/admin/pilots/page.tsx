"use client";
// app/admin/pilots/page.tsx
// Admin: create and manage company pilot links for CEO/owner outreach.

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

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
}

const BASE_URL = "https://chat.homerates.ai";

export default function AdminPilotsPage() {
  const [pilots, setPilots] = useState<Pilot[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    company_name: "",
    slug: "",
    contact_name: "",
    contact_email: "",
    credits_per_lo: "1000",
    notes: "",
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/admin/pilots");
    const d = await r.json();
    setPilots(d.pilots ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Auto-generate slug from company name
  function handleCompanyName(val: string) {
    setForm(f => ({
      ...f,
      company_name: val,
      slug: val.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    if (!form.company_name.trim() || !form.slug.trim()) {
      setCreateError("Company name and slug are required.");
      return;
    }
    setCreating(true);
    const r = await fetch("/api/admin/pilots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        credits_per_lo: parseInt(form.credits_per_lo) || 1000,
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      setCreateError(d.error ?? "Failed to create pilot.");
      setCreating(false);
      return;
    }
    setForm({ company_name: "", slug: "", contact_name: "", contact_email: "", credits_per_lo: "1000", notes: "" });
    setCreating(false);
    void load();
  }

  async function toggleActive(pilot: Pilot) {
    await fetch("/api/admin/pilots", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: pilot.id, is_active: !pilot.is_active }),
    });
    void load();
  }

  function copyLink(slug: string) {
    navigator.clipboard.writeText(`${BASE_URL}/pilot/${slug}`);
    setCopied(slug);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#080c12", color: "#f0f4ff", fontFamily: "'DM Sans', system-ui, sans-serif", padding: "2rem" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
          <Link href="/admin" style={{ color: "#3d8bff", textDecoration: "none", fontSize: "0.875rem" }}>← Admin</Link>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800 }}>Company Pilot Links</h1>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "#8fa3b8", marginTop: 4 }}>
              Create a unique link per mortgage company. Send to CEO/owner. LOs activate instantly — no waitlist, no pricing, full founding access.
            </p>
          </div>
        </div>

        {/* Create form */}
        <div style={{ background: "#0e1420", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "1.75rem", marginBottom: 32 }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#00e87a", marginBottom: 16 }}>
            Create New Pilot Link
          </div>
          <form onSubmit={handleCreate} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={field}>
              <label style={label}>Company Name *</label>
              <input style={input} placeholder="e.g. NEXA Mortgage" value={form.company_name}
                onChange={e => handleCompanyName(e.target.value)} required />
            </div>
            <div style={field}>
              <label style={label}>URL Slug * <span style={{ color: "#8fa3b8", fontWeight: 400 }}>(auto-generated)</span></label>
              <input style={input} placeholder="e.g. nexa" value={form.slug}
                onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))} required />
            </div>
            <div style={field}>
              <label style={label}>CEO / Contact Name</label>
              <input style={input} placeholder="e.g. Mike Kortas" value={form.contact_name}
                onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
            </div>
            <div style={field}>
              <label style={label}>CEO / Contact Email</label>
              <input style={input} type="email" placeholder="e.g. mike@nexamortgage.com" value={form.contact_email}
                onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} />
            </div>
            <div style={field}>
              <label style={label}>Credits per LO</label>
              <input style={input} type="number" min="100" step="100" value={form.credits_per_lo}
                onChange={e => setForm(f => ({ ...f, credits_per_lo: e.target.value }))} />
            </div>
            <div style={field}>
              <label style={label}>Notes (internal)</label>
              <input style={input} placeholder="e.g. LinkedIn DM sent 2026-06-16" value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              {form.slug && (
                <div style={{ fontSize: "0.8rem", color: "#8fa3b8", marginBottom: 10, padding: "8px 12px", background: "rgba(0,232,122,0.06)", borderRadius: 8, border: "1px solid rgba(0,232,122,0.12)" }}>
                  Link preview: <span style={{ color: "#00e87a", fontWeight: 600 }}>{BASE_URL}/pilot/{form.slug}</span>
                </div>
              )}
              {createError && (
                <div style={{ fontSize: "0.85rem", color: "#ff5f5f", marginBottom: 10 }}>{createError}</div>
              )}
              <button type="submit" disabled={creating} style={{
                padding: "11px 24px", background: "#00e87a", color: "#080c12",
                border: "none", borderRadius: 999, fontWeight: 700, fontSize: "0.9rem",
                cursor: creating ? "not-allowed" : "pointer", opacity: creating ? 0.6 : 1,
                fontFamily: "inherit",
              }}>
                {creating ? "Creating…" : "Create pilot link →"}
              </button>
            </div>
          </form>
        </div>

        {/* Pilot list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {loading ? (
            <div style={{ color: "#8fa3b8", fontSize: "0.875rem" }}>Loading…</div>
          ) : pilots.length === 0 ? (
            <div style={{ color: "#8fa3b8", fontSize: "0.875rem" }}>No pilots created yet. Use the form above to create the first one.</div>
          ) : pilots.map(p => (
            <div key={p.id} style={{
              background: "#0e1420", border: `1px solid ${p.is_active ? "rgba(255,255,255,0.08)" : "rgba(255,95,95,0.12)"}`,
              borderRadius: 14, padding: "1.25rem 1.5rem",
              display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
            }}>
              {/* Info */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{p.company_name}</span>
                  {!p.is_active && (
                    <span style={{ fontSize: "0.65rem", fontWeight: 700, background: "rgba(255,95,95,0.15)", color: "#ff5f5f", padding: "2px 8px", borderRadius: 999, letterSpacing: "0.06em", textTransform: "uppercase" }}>Inactive</span>
                  )}
                </div>
                <div style={{ fontSize: "0.78rem", color: "#8fa3b8", display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
                  <span>/{p.slug}</span>
                  {p.contact_name && <span>👤 {p.contact_name}</span>}
                  {p.contact_email && <span>✉️ {p.contact_email}</span>}
                  <span>⚡ {p.credits_per_lo.toLocaleString()} credits/LO</span>
                  <span style={{ color: p.activations > 0 ? "#00e87a" : "#8fa3b8", fontWeight: p.activations > 0 ? 700 : 400 }}>
                    🏦 {p.activations} LO{p.activations !== 1 ? "s" : ""} activated
                  </span>
                </div>
                {p.notes && <div style={{ fontSize: "0.75rem", color: "#eaf8f7", marginTop: 4, fontStyle: "italic" }}>{p.notes}</div>}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button
                  onClick={() => copyLink(p.slug)}
                  style={{
                    padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(0,232,122,0.3)",
                    background: copied === p.slug ? "rgba(0,232,122,0.12)" : "transparent",
                    color: copied === p.slug ? "#00e87a" : "#8fa3b8",
                    fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    transition: "all 0.15s",
                  }}
                >
                  {copied === p.slug ? "✓ Copied" : "Copy link"}
                </button>
                <a
                  href={`/pilot/${p.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: "7px 14px", borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "transparent", color: "#8fa3b8",
                    fontSize: "0.8rem", fontWeight: 600,
                    textDecoration: "none", display: "inline-flex", alignItems: "center",
                  }}
                >
                  Preview ↗
                </a>
                <button
                  onClick={() => toggleActive(p)}
                  style={{
                    padding: "7px 14px", borderRadius: 8,
                    border: `1px solid ${p.is_active ? "rgba(255,95,95,0.2)" : "rgba(0,232,122,0.2)"}`,
                    background: "transparent",
                    color: p.is_active ? "#ff5f5f" : "#00e87a",
                    fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {p.is_active ? "Deactivate" : "Reactivate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const label: React.CSSProperties = { fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8fa3b8" };
const input: React.CSSProperties = {
  padding: "10px 14px", background: "#141b28", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10, color: "#f0f4ff", fontSize: "0.875rem",
  outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box",
};
