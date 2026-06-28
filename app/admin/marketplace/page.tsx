"use client";

import { useState, useEffect, useCallback } from "react";
import AppNav from "../../components/AppNav";

const LOAN_TYPE_OPTIONS = ["conventional", "fha", "va", "jumbo", "dscr"];
const PROGRAM_TYPE_LABELS: Record<string, string> = {
  grant: "Grant",
  forgivable_loan: "Forgivable Loan",
  second_lien: "Second Lien",
  matched_savings: "Matched Savings",
};
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
  invite_token: string | null;
  invited_at: string | null;
}

interface DpaProgram {
  id: string;
  lender_id: string;
  program_name: string;
  program_type: string;
  max_assistance: number | null;
  income_limit: number | null;
  coverage_type: string;
  eligible_states: string[];
  eligible_county_fips: string[];
  min_credit_score: number;
  loan_types: string[];
  notes: string | null;
  active: boolean;
}

const EMPTY_FORM = {
  lender_name: "", nmls_number: "", contact_email: "", contact_name: "",
  margin_over_par: "0.625", loan_types: ["conventional"] as string[],
  eligible_states: "CA", min_loan_amount: "100000", max_loan_amount: "3000000",
  min_credit_score: "620", max_ltv: "97", lock_15_adj: "-0.125",
  lock_45_adj: "0.125", lock_60_adj: "0.250",
};

const EMPTY_DPA = {
  program_name: "", program_type: "grant", max_assistance: "",
  income_limit: "", coverage_type: "state", eligible_states: "",
  eligible_county_fips: "", min_credit_score: "620", notes: "",
  loan_types: ["conventional", "fha"] as string[],
};

// ── DPA Programs panel (per lender) ────────────────────────────────────────────
function DpaPanel({ lenderId, lenderName }: { lenderId: string; lenderName: string }) {
  const [programs, setPrograms] = useState<DpaProgram[]>([]);
  const [loading, setLoading]   = useState(true);
  const [form, setForm]         = useState(EMPTY_DPA);
  const [saving, setSaving]     = useState(false);
  const [showAdd, setShowAdd]   = useState(false);
  const [err, setErr]           = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/admin/dpa-programs?lender_id=${lenderId}`);
    const d = await r.json();
    setPrograms(d.programs ?? []);
    setLoading(false);
  }, [lenderId]);

  useEffect(() => { void load(); }, [load]);

  function toggleLoanType(type: string) {
    setForm(f => ({
      ...f,
      loan_types: f.loan_types.includes(type)
        ? f.loan_types.filter(t => t !== type)
        : [...f.loan_types, type],
    }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!form.program_name.trim()) { setErr("Program name required."); return; }
    setSaving(true);
    const r = await fetch("/api/admin/dpa-programs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, lender_id: lenderId }),
    });
    const d = await r.json();
    if (!r.ok) { setErr(d.error ?? "Failed to save."); setSaving(false); return; }
    setForm(EMPTY_DPA);
    setShowAdd(false);
    setSaving(false);
    void load();
  }

  async function toggleActive(p: DpaProgram) {
    await fetch("/api/admin/dpa-programs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, active: !p.active }),
    });
    void load();
  }

  async function handleDelete(p: DpaProgram) {
    if (!confirm(`Remove "${p.program_name}"?`)) return;
    await fetch(`/api/admin/dpa-programs?id=${p.id}`, { method: "DELETE" });
    void load();
  }

  return (
    <div style={{ background: "rgba(0,232,122,0.03)", borderTop: "1px solid rgba(0,232,122,0.1)", padding: "16px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "rgba(0,232,122,0.6)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          DPA Programs · {lenderName}
        </div>
        <button
          onClick={() => setShowAdd(a => !a)}
          style={{ background: "rgba(0,232,122,0.1)", border: "1px solid rgba(0,232,122,0.25)", color: "#00e87a", fontSize: "0.72rem", fontWeight: 700, padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}
        >
          {showAdd ? "Cancel" : "+ Add Program"}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <form onSubmit={handleAdd} style={{ background: "#0a1018", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 16, marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 140px 160px", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={labelStyle}>Program name *</label>
              <input style={inputStyle} value={form.program_name} onChange={e => setForm(f => ({ ...f, program_name: e.target.value }))} placeholder="e.g. Community Advantage Grant" />
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select style={inputStyle} value={form.program_type} onChange={e => setForm(f => ({ ...f, program_type: e.target.value }))}>
                {Object.entries(PROGRAM_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Max assistance ($)</label>
              <input style={inputStyle} type="number" min="0" step="500" value={form.max_assistance} onChange={e => setForm(f => ({ ...f, max_assistance: e.target.value }))} placeholder="optional" />
            </div>
            <div>
              <label style={labelStyle}>Max income limit ($)</label>
              <input style={inputStyle} type="number" min="0" step="1000" value={form.income_limit} onChange={e => setForm(f => ({ ...f, income_limit: e.target.value }))} placeholder="optional" />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={labelStyle}>Coverage</label>
              <select style={inputStyle} value={form.coverage_type} onChange={e => setForm(f => ({ ...f, coverage_type: e.target.value }))}>
                <option value="nationwide">Nationwide</option>
                <option value="state">State(s)</option>
                <option value="county">County (FIPS)</option>
              </select>
            </div>
            {form.coverage_type === "state" && (
              <div>
                <label style={labelStyle}>Eligible states</label>
                <input style={inputStyle} value={form.eligible_states} onChange={e => setForm(f => ({ ...f, eligible_states: e.target.value }))} placeholder="CA, TX, FL" />
              </div>
            )}
            {form.coverage_type === "county" && (
              <div>
                <label style={labelStyle}>County FIPS codes</label>
                <input style={inputStyle} value={form.eligible_county_fips} onChange={e => setForm(f => ({ ...f, eligible_county_fips: e.target.value }))} placeholder="06037, 06111" />
              </div>
            )}
            <div>
              <label style={labelStyle}>Loan types</label>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", paddingTop: 4 }}>
                {["conventional", "fha", "va"].map(type => (
                  <button key={type} type="button" onClick={() => toggleLoanType(type)}
                    style={{ padding: "4px 9px", borderRadius: 5, fontSize: "0.68rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                      background: form.loan_types.includes(type) ? "rgba(0,232,122,0.12)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${form.loan_types.includes(type) ? "rgba(0,232,122,0.3)" : "rgba(255,255,255,0.08)"}`,
                      color: form.loan_types.includes(type) ? "#4ade80" : "rgba(185,208,192,0.45)" }}>
                    {type.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Notes (optional)</label>
            <input style={inputStyle} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. First-time buyer only, property must be in census tract X" />
          </div>

          {err && <div style={{ color: "#f87171", fontSize: "0.75rem", marginBottom: 8 }}>{err}</div>}
          <button type="submit" disabled={saving} style={{ background: "rgba(0,232,122,0.1)", border: "1px solid rgba(0,232,122,0.25)", color: "#00e87a", fontWeight: 700, fontSize: "0.78rem", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
            {saving ? "Saving…" : "Save Program"}
          </button>
        </form>
      )}

      {/* Programs list */}
      {loading ? (
        <div style={{ fontSize: "0.75rem", color: "rgba(185,208,192,0.3)", padding: "8px 0" }}>Loading…</div>
      ) : programs.length === 0 ? (
        <div style={{ fontSize: "0.75rem", color: "rgba(185,208,192,0.3)", padding: "8px 0" }}>No DPA programs yet. Add one above.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {programs.map(p => (
            <div key={p.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 14px", background: p.active ? "rgba(0,232,122,0.05)" : "rgba(255,255,255,0.02)", border: `1px solid ${p.active ? "rgba(0,232,122,0.15)" : "rgba(255,255,255,0.05)"}`, borderRadius: 9, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: "0.85rem", color: p.active ? "#f0f4ff" : "rgba(185,208,192,0.4)" }}>{p.program_name}</div>
                <div style={{ fontSize: "0.7rem", color: "rgba(185,208,192,0.4)", marginTop: 2 }}>
                  {PROGRAM_TYPE_LABELS[p.program_type] ?? p.program_type}
                  {p.max_assistance ? ` · Up to $${p.max_assistance.toLocaleString()}` : ""}
                  {p.income_limit ? ` · Income ≤ $${p.income_limit.toLocaleString()}` : ""}
                  {" · "}{p.coverage_type === "nationwide" ? "Nationwide" : p.coverage_type === "state" ? p.eligible_states.join(", ") : `${p.eligible_county_fips.length} county FIPS`}
                </div>
                {p.notes && <div style={{ fontSize: "0.68rem", color: "rgba(185,208,192,0.3)", marginTop: 2, fontStyle: "italic" }}>{p.notes}</div>}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                <button onClick={() => toggleActive(p)} style={{ ...actionBtn, borderColor: p.active ? "rgba(248,113,113,0.3)" : "rgba(74,222,128,0.3)", color: p.active ? "#f87171" : "#4ade80" }}>
                  {p.active ? "Pause" : "Activate"}
                </button>
                <button onClick={() => handleDelete(p)} style={{ ...actionBtn, borderColor: "rgba(107,114,128,0.3)", color: "#6b7280" }}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main admin page ─────────────────────────────────────────────────────────────
export default function MarketplaceLendersPage() {
  const [lenders, setLenders]           = useState<Lender[]>([]);
  const [loading, setLoading]           = useState(true);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [creating, setCreating]         = useState(false);
  const [createError, setCreateError]   = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [updating, setUpdating]         = useState<string | null>(null);
  const [expandedDpa, setExpandedDpa]   = useState<string | null>(null);
  const [inviting, setInviting]         = useState<string | null>(null);
  const [invitedUrl, setInvitedUrl]     = useState<Record<string, string>>({});

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
      setCreateError("Lender name and contact email are required."); return;
    }
    if (form.loan_types.length === 0) {
      setCreateError("Select at least one loan type."); return;
    }
    setCreating(true);
    const states = form.eligible_states.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
    const r = await fetch("/api/admin/marketplace-lenders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form, eligible_states: states,
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

  async function sendInvite(lender: Lender) {
    setInviting(lender.id);
    const r = await fetch("/api/admin/marketplace-lenders/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lender_id: lender.id }),
    });
    const d = await r.json();
    if (d.ok) {
      setInvitedUrl(prev => ({ ...prev, [lender.id]: d.portalUrl }));
    }
    setInviting(null);
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

        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "rgba(185,208,192,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
            Admin · Rate Marketplace
          </div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#f0f4ff", margin: 0 }}>
            Lender Onboarding
          </h1>
          <p style={{ fontSize: "0.88rem", color: "rgba(185,208,192,0.5)", marginTop: 6 }}>
            Manage lenders and their DPA programs. Lender identity is never shown to borrowers until they explicitly initiate contact.
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 12, marginBottom: 32, flexWrap: "wrap" }}>
          {[
            { label: "Total listed",    value: lenders.length },
            { label: "Active",          value: lenders.filter(l => l.status === "active").length },
            { label: "Pending review",  value: lenders.filter(l => l.status === "pending").length },
            { label: "Total opt-ins",   value: lenders.reduce((a, l) => a + l.total_opt_ins, 0) },
            { label: "Total views",     value: lenders.reduce((a, l) => a + l.total_views, 0) },
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><label style={labelStyle}>Lender name *</label><input style={inputStyle} value={form.lender_name} onChange={e => setForm(f => ({ ...f, lender_name: e.target.value }))} placeholder="e.g. Pacific Home Lending" /></div>
              <div><label style={labelStyle}>NMLS #</label><input style={inputStyle} value={form.nmls_number} onChange={e => setForm(f => ({ ...f, nmls_number: e.target.value }))} placeholder="e.g. 123456" /></div>
              <div><label style={labelStyle}>Contact email *</label><input style={inputStyle} type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="contact@lender.com" /></div>
              <div><label style={labelStyle}>Contact name</label><input style={inputStyle} value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="e.g. Jane Smith" /></div>
            </div>

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
                    <button key={type} type="button" onClick={() => toggleLoanType(type)}
                      style={{ padding: "5px 11px", borderRadius: 6, fontSize: "0.72rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                        background: form.loan_types.includes(type) ? "rgba(0,232,122,0.12)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${form.loan_types.includes(type) ? "rgba(0,232,122,0.3)" : "rgba(255,255,255,0.08)"}`,
                        color: form.loan_types.includes(type) ? "#4ade80" : "rgba(185,208,192,0.45)" }}>
                      {type.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button type="button" onClick={() => setShowAdvanced(a => !a)} style={{ background: "none", border: "none", color: "rgba(185,208,192,0.35)", fontSize: "0.75rem", cursor: "pointer", padding: "4px 0", marginBottom: showAdvanced ? 12 : 0, fontFamily: "inherit" }}>
              {showAdvanced ? "▲ Hide" : "▼ Show"} overlay limits + lock adjustments
            </button>

            {showAdvanced && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10, marginBottom: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 14 }}>
                {[
                  { label: "Min loan $", key: "min_loan_amount", placeholder: "100000" },
                  { label: "Max loan $", key: "max_loan_amount", placeholder: "3000000" },
                  { label: "Min FICO",   key: "min_credit_score", placeholder: "620" },
                  { label: "Max LTV %", key: "max_ltv", placeholder: "97" },
                  { label: "15-day adj", key: "lock_15_adj", placeholder: "-0.125" },
                  { label: "45-day adj", key: "lock_45_adj", placeholder: "0.125" },
                  { label: "60-day adj", key: "lock_60_adj", placeholder: "0.250" },
                ].map(({ label, key, placeholder }) => (
                  <div key={key}>
                    <label style={labelStyle}>{label}</label>
                    <input style={inputStyle} type="number" step={key.includes("adj") || key === "max_ltv" ? "0.125" : "1"} placeholder={placeholder}
                      value={form[key as keyof typeof form] as string}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>
            )}

            {createError && <div style={{ color: "#f87171", fontSize: "0.8rem", marginBottom: 10 }}>{createError}</div>}
            <button type="submit" disabled={creating} style={btnStyle}>{creating ? "Adding…" : "+ Add lender"}</button>
          </form>
        </div>

        {/* Lender list */}
        <div style={{ background: "#0e1420", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: "0.75rem", fontWeight: 700, color: "rgba(185,208,192,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {loading ? "Loading…" : `${lenders.length} lender${lenders.length !== 1 ? "s" : ""}`}
          </div>

          {lenders.length === 0 && !loading && (
            <div style={{ padding: 40, textAlign: "center", color: "rgba(185,208,192,0.3)", fontSize: "0.88rem" }}>
              No lenders yet. Add one above.
            </div>
          )}

          {lenders.map((lender, i) => (
            <div key={lender.id} style={{ borderBottom: i < lenders.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
              {/* Lender row */}
              <div style={{ padding: "16px 20px", display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>

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

                {/* Margin */}
                <div style={{ textAlign: "center", minWidth: 90 }}>
                  <div style={{ fontSize: "0.65rem", color: "rgba(185,208,192,0.35)", marginBottom: 4 }}>MARGIN</div>
                  <input type="number" step="0.125" min="0" max="3" defaultValue={lender.margin_over_par}
                    onBlur={e => updateMargin(lender, e.target.value)}
                    style={{ background: "rgba(0,232,122,0.06)", border: "1px solid rgba(0,232,122,0.2)", borderRadius: 7, padding: "5px 8px", color: "#4ade80", fontWeight: 700, fontSize: "0.88rem", width: 80, textAlign: "center", fontFamily: "inherit" }} />
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

                {/* Actions */}
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
                  <button
                    onClick={() => setExpandedDpa(expandedDpa === lender.id ? null : lender.id)}
                    style={{ ...actionBtn, borderColor: expandedDpa === lender.id ? "rgba(0,232,122,0.4)" : "rgba(0,232,122,0.2)", color: expandedDpa === lender.id ? "#00e87a" : "rgba(0,232,122,0.5)" }}
                  >
                    DPA {expandedDpa === lender.id ? "▲" : "▼"}
                  </button>

                  {/* Invite button */}
                  {invitedUrl[lender.id] ? (
                    <a href={invitedUrl[lender.id]} target="_blank" rel="noreferrer"
                      style={{ ...actionBtn, borderColor: "rgba(96,165,250,0.3)", color: "#60a5fa", textDecoration: "none", fontSize: "0.75rem" }}>
                      View portal ↗
                    </a>
                  ) : (
                    <button
                      onClick={() => sendInvite(lender)}
                      disabled={inviting === lender.id}
                      title={lender.invited_at ? `Re-send invite (last sent ${new Date(lender.invited_at).toLocaleDateString()})` : "Send invite email + generate portal link"}
                      style={{ ...actionBtn, borderColor: "rgba(96,165,250,0.3)", color: "#60a5fa" }}
                    >
                      {inviting === lender.id ? "Sending…" : lender.invited_at ? "Re-invite" : "Send Invite"}
                    </button>
                  )}

                  {lender.invite_token && !invitedUrl[lender.id] && (
                    <a
                      href={`/lender-portal/${lender.invite_token}`}
                      target="_blank" rel="noreferrer"
                      style={{ ...actionBtn, borderColor: "rgba(107,114,128,0.2)", color: "rgba(185,208,192,0.35)", textDecoration: "none", fontSize: "0.72rem" }}
                    >
                      Portal ↗
                    </a>
                  )}

                  {lender.status !== "active" && (
                    <button onClick={() => setStatus(lender, "active")} disabled={updating === lender.id} style={{ ...actionBtn, borderColor: "rgba(74,222,128,0.3)", color: "#4ade80" }}>Activate</button>
                  )}
                  {lender.status === "active" && (
                    <button onClick={() => setStatus(lender, "suspended")} disabled={updating === lender.id} style={{ ...actionBtn, borderColor: "rgba(248,113,113,0.3)", color: "#f87171" }}>Suspend</button>
                  )}
                  {lender.status !== "cancelled" && (
                    <button onClick={() => { if (confirm(`Remove ${lender.lender_name}?`)) setStatus(lender, "cancelled"); }} disabled={updating === lender.id} style={{ ...actionBtn, borderColor: "rgba(107,114,128,0.3)", color: "#6b7280" }}>Remove</button>
                  )}
                  {updating === lender.id && <span style={{ fontSize: "0.72rem", color: "rgba(185,208,192,0.4)" }}>Saving…</span>}
                </div>
              </div>

              {/* DPA panel */}
              {expandedDpa === lender.id && (
                <DpaPanel lenderId={lender.id} lenderName={lender.lender_name} />
              )}
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
