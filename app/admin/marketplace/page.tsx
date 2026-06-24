"use client";
// app/admin/marketplace/page.tsx
// Admin: onboard and manage lenders in the anonymous rate marketplace.

import { useState, useEffect, useCallback } from "react";
import AppNav from "../../components/AppNav";

const LOAN_TYPE_OPTIONS = ["conventional", "fha", "va", "jumbo", "dscr"];
const STATUS_COLORS: Record<string, string> = {
  pending:   "#f59e0b",
  active:    "#4ade80",
  suspended: "#f87171",
  cancelled: "#6b7280",
};

interface Lender {
  id: string;
  lender_name: string;
  nmls_number: string | null;
  contact_email: string;
  contact_name: string | null;
  margin_over_par: number;
  loan_types: string[];
  eligible_states: string[];
  min_loan_amount: number;
  max_loan_amount: number;
  min_credit_score: number;
  max_ltv: number;
  lock_15_adj: number;
  lock_45_adj: number;
  lock_60_adj: number;
  status: string;
  total_views: number;
  total_opt_ins: number;
  created_at: string;
}

const EMPTY_FORM = {
  lender_name: "",
  nmls_number: "",
  contact_email: "",
  contact_name: "",
  margin_over_par: "0.625",
  loan_types: ["conventional"] as string[],
  eligible_states: "CA",
  min_loan_amount: "100000",
  max_loan_amount: "3000000",
  min_credit_score: "620",
  max_ltv: "97",
  lock_15_adj: "-0.125",
  lock_45_adj: "0.125",
  lock_60_adj: "0.250",
};

export default function MarketplaceLendersPage() {
  const [lenders, setLenders] = useState<Lender[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/admin/marketplace-lenders");
    const d = await r.json();
    setLenders(d.lenders ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  function toggleLoanType(type: string) {
    setForm(f => ({
      ...f,
      loan_types: f.loan_types.includes(type)
        ? f.loan_types.filter(t => t !== type)
        : [...f.loan_types, type],
    }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    if (!form.lender_name.trim() || !form.contact_email.trim()) {
      setCreateError("Lender name and contact email are required.");
      return;
    }
    if (form.loan_types.length === 0) {
      setCreateError("Select at least one loan type.");
      return;
    }
    setCreating(true);
    const states = form.eligible_states
      .split(/[,\s]+/)
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);

    const r = await fetch("/api/admin/marketplace-lenders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        eligible_states: states,
        margin_over_par: parseFloat(form.margin_over_par),
        min_loan_amount: parseInt(form.min_loan_amount),
        max_loan_amount: parseInt(form.max_loan_amount),
        min_credit_score: parseInt(form.min_credit_score),
        max_ltv: parseFloat(form.max_ltv),
        lock_15_adj: parseFloat(form.lock_15_adj),
        lock_45_adj: parseFloat(form.lock_45_adj),
        lock_60_adj: parseFloat(form.lock_60_adj),
      }),
    });
    const d = await r.json();
    if (!r.ok) { setCreateError(d.error ?? "Failed to create."); setCreating(false); return; }
    setForm(EMPTY_FORM);
    setShowAdvanced(false);
    setCreating(false);
    void load();
  }

  async function setStatus(lender: Lender, status: string) {
    setUpdating(lender.id);
    await fetch("/api/admin/marketplace-lenders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lender.id, status }),
    });
    setUpdating(null);
    void load();
  }

  async function updateMargin(lender: Lender, margin: string) {
    const val = parseFloat(margin);
    if (isNaN(val)) return;
    setUpdating(lender.id);
    await fetch("/api/admin/marketplace-lenders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lender.id, margin_over_par: val }),
    });
    setUpdating(null);
    void load();
  }

  return (
    <div className="page-standalone" style={{ overflowY: "auto" }}>
      <AppNav />
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px 80px" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "rgba(185,208,192,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
            Admin · Rate Marketplace
          </div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#f0f4ff", margin: 0 }}>
            Lender Onboarding
          </h1>
          <p style={{ fontSize: "0.88rem", color: "rgba(185,208,192,0.5)", marginTop: 6 }}>
            Manage lenders listed in the anonymous rate marketplace. Lender identity is never shown to borrowers until they explicitly initiate contact.
          </p>
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 12, marginBottom: 32, flexWrap: "wrap" }}>
          {[
            { label: "Total listed", value: lenders.length },
            { label: "Active", value: lenders.filter(l => l.status === "active").length },
            { label: "Pending review", value: lenders.filter(l => l.status === "pending").length },
            { label: "Total opt-ins", value: lenders.reduce((a, l) => a + l.total_opt_ins, 0) },
            { label: "Total views", value: lenders.reduce((a, l) => a + l.total_views, 0) },
          ].map(s => (
            <div key={s.label} style={{ background: "#0e1420", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "12px 18px", minWidth: 120 }}>
              <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#00e87a" }}>{s.value}</div>
              <div style={{ fontSize: "0.72rem", color: "rgba(185,208,192,0.45)", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Add lender form */}
        <div style={{ background: "#0e1420", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 24, marginBottom: 32 }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "rgba(185,208,192,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 18 }}>
            Add new lender
          </div>
          <form onSubmit={handleCreate}>
            {/* Row 1: identity */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Lender name *</label>
                <input style={inputStyle} value={form.lender_name} onChange={e => setForm(f => ({ ...f, lender_name: e.target.value }))} placeholder="e.g. Pacific Home Lending" />
              </div>
              <div>
                <label style={labelStyle}>NMLS #</label>
                <input style={inputStyle} value={form.nmls_number} onChange={e => setForm(f => ({ ...f, nmls_number: e.target.value }))} placeholder="e.g. 123456" />
              </div>
              <div>
                <label style={labelStyle}>Contact email *</label>
                <input style={inputStyle} type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="contact@lender.com" />
              </div>
              <div>
                <label style={labelStyle}>Contact name</label>
                <input style={inputStyle} value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="e.g. Jane Smith" />
              </div>
            </div>

            {/* Row 2: pricing + states */}
            <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Margin over par (%)</label>
                <input style={{ ...inputStyle, fontWeight: 700, color: "#4ade80" }} type="number" step="0.125" min="0" max="3" value={form.margin_over_par} onChange={e => setForm(f => ({ ...f, margin_over_par: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Eligible states (comma-separated)</label>
                <input style={inputStyle} value={form.eligible_states} onChange={e => setForm(f => ({ ...f, eligible_states: e.target.value }))} placeholder="CA, TX, FL, WA" />
              </div>
              <div>
                <label style={labelStyle}>Loan types</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingTop: 4 }}>
                  {LOAN_TYPE_OPTIONS.map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => toggleLoanType(type)}
                      style={{
                        padding: "5px 11px", borderRadius: 6, fontSize: "0.72rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                        background: form.loan_types.includes(type) ? "rgba(0,232,122,0.12)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${form.loan_types.includes(type) ? "rgba(0,232,122,0.3)" : "rgba(255,255,255,0.08)"}`,
                        color: form.loan_types.includes(type) ? "#4ade80" : "rgba(185,208,192,0.45)",
                      }}
                    >
                      {type.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Advanced overlay options */}
            <button type="button" onClick={() => setShowAdvanced(a => !a)} style={{ background: "none", border: "none", color: "rgba(185,208,192,0.35)", fontSize: "0.75rem", cursor: "pointer", padding: "4px 0", marginBottom: showAdvanced ? 12 : 0, fontFamily: "inherit" }}>
              {showAdvanced ? "▲ Hide" : "▼ Show"} overlay limits + lock adjustments
            </button>

            {showAdvanced && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10, marginBottom: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 14 }}>
                {[
                  { label: "Min loan $", key: "min_loan_amount", placeholder: "100000" },
                  { label: "Max loan $", key: "max_loan_amount", placeholder: "3000000" },
                  { label: "Min FICO", key: "min_credit_score", placeholder: "620" },
                  { label: "Max LTV %", key: "max_ltv", placeholder: "97" },
                  { label: "15-day adj", key: "lock_15_adj", placeholder: "-0.125" },
                  { label: "45-day adj", key: "lock_45_adj", placeholder: "0.125" },
                  { label: "60-day adj", key: "lock_60_adj", placeholder: "0.250" },
                ].map(({ label, key, placeholder }) => (
                  <div key={key}>
                    <label style={labelStyle}>{label}</label>
                    <input
                      style={inputStyle}
                      type="number"
                      step={key.includes("adj") || key === "max_ltv" ? "0.125" : "1"}
                      placeholder={placeholder}
                      value={form[key as keyof typeof form] as string}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            )}

            {createError && <div style={{ color: "#f87171", fontSize: "0.8rem", marginBottom: 10 }}>{createError}</div>}
            <button type="submit" disabled={creating} style={btnStyle}>
              {creating ? "Adding…" : "+ Add lender"}
            </button>
          </form>
        </div>

        {/* Lender table */}
        <div style={{ background: "#0e1420", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: "0.75rem", fontWeight: 700, color: "rgba(185,208,192,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {loading ? "Loading…" : `${lenders.length} lender${lenders.length !== 1 ? "s" : ""}`}
          </div>

          {lenders.length === 0 && !loading && (
            <div style={{ padding: 40, textAlign: "center", color: "rgba(185,208,192,0.3)", fontSize: "0.88rem" }}>
              No lenders yet. Add one above to populate the rate marketplace.
            </div>
          )}

          {lenders.map((lender, i) => (
            <div key={lender.id} style={{ padding: "16px 20px", borderBottom: i < lenders.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>

              {/* Identity */}
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLORS[lender.status] ?? "#6b7280", flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "#f0f4ff" }}>{lender.lender_name}</span>
                </div>
                <div style={{ fontSize: "0.72rem", color: "rgba(185,208,192,0.4)" }}>
                  {lender.nmls_number ? `NMLS ${lender.nmls_number} · ` : ""}{lender.contact_email}
                </div>
                <div style={{ fontSize: "0.7rem", color: "rgba(185,208,192,0.3)", marginTop: 3 }}>
                  {lender.eligible_states.join(", ")} · {lender.loan_types.map(t => t.toUpperCase()).join(", ")}
                </div>
              </div>

              {/* Margin — editable inline */}
              <div style={{ textAlign: "center", minWidth: 90 }}>
                <div style={{ fontSize: "0.65rem", color: "rgba(185,208,192,0.35)", marginBottom: 4 }}>MARGIN</div>
                <input
                  type="number"
                  step="0.125"
                  min="0"
                  max="3"
                  defaultValue={lender.margin_over_par}
                  onBlur={e => updateMargin(lender, e.target.value)}
                  style={{ background: "rgba(0,232,122,0.06)", border: "1px solid rgba(0,232,122,0.2)", borderRadius: 7, padding: "5px 8px", color: "#4ade80", fontWeight: 700, fontSize: "0.88rem", width: 80, textAlign: "center", fontFamily: "inherit" }}
                />
                <div style={{ fontSize: "0.6rem", color: "rgba(185,208,192,0.25)", marginTop: 2 }}>% over par</div>
              </div>

              {/* Stats */}
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#f0f4ff" }}>{lender.total_views}</div>
                  <div style={{ fontSize: "0.62rem", color: "rgba(185,208,192,0.35)" }}>views</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#00e87a" }}>{lender.total_opt_ins}</div>
                  <div style={{ fontSize: "0.62rem", color: "rgba(185,208,192,0.35)" }}>opt-ins</div>
                </div>
              </div>

              {/* Status actions */}
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                {lender.status !== "active" && (
                  <button onClick={() => setStatus(lender, "active")} disabled={updating === lender.id} style={{ ...actionBtn, borderColor: "rgba(74,222,128,0.3)", color: "#4ade80" }}>
                    Activate
                  </button>
                )}
                {lender.status === "active" && (
                  <button onClick={() => setStatus(lender, "suspended")} disabled={updating === lender.id} style={{ ...actionBtn, borderColor: "rgba(248,113,113,0.3)", color: "#f87171" }}>
                    Suspend
                  </button>
                )}
                {lender.status !== "cancelled" && (
                  <button onClick={() => { if (confirm(`Remove ${lender.lender_name}?`)) setStatus(lender, "cancelled"); }} disabled={updating === lender.id} style={{ ...actionBtn, borderColor: "rgba(107,114,128,0.3)", color: "#6b7280" }}>
                    Remove
                  </button>
                )}
                {updating === lender.id && <span style={{ fontSize: "0.72rem", color: "rgba(185,208,192,0.4)" }}>Saving…</span>}
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "0.7rem", fontWeight: 700,
  color: "rgba(185,208,192,0.4)", textTransform: "uppercase",
  letterSpacing: "0.07em", marginBottom: 5,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)", borderRadius: 9,
  color: "#f0f4ff", fontSize: "0.88rem", fontFamily: "inherit", outline: "none",
};

const btnStyle: React.CSSProperties = {
  background: "rgba(0,232,122,0.1)", border: "1px solid rgba(0,232,122,0.25)",
  color: "#00e87a", fontWeight: 700, fontSize: "0.85rem", padding: "10px 20px",
  borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
};

const actionBtn: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)", border: "1px solid",
  borderRadius: 8, padding: "6px 12px", fontSize: "0.75rem",
  fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};
