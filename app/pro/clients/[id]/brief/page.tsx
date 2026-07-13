"use client";
// app/pro/clients/[id]/brief/page.tsx
// Pre-call brief — first visible surface of the CRM memory engine.
//
// Shows an LO:
//   1. Seed context — structured buyer profile from the borrowers row
//   2. Active touchpoints — non-superseded CRM touchpoints, newest first,
//      with key_facts rendered in human-readable form
//   3. Add touchpoint form — log a new interaction with structured facts + note
//
// COMPLIANCE (see COMPLIANCE_DECISIONS.md):
//   Decision 1:  Denylist fields don't exist in the data — nothing to filter.
//   Decision 2:  NoteFact displayed clearly as "LO-only" — excluded from
//                generation by construction (toGenerationTouchpoint). This UI
//                surfaces notes but labels them explicitly so no LO is confused
//                about what reaches AI drafts.
//   Decision 4:  All CRM data fetched via /api/crm/touchpoints, which enforces
//                lo_user_id = clerk userId on every query.
//   Decision 7:  Freeform fact fields (life_event, preference_expressed,
//                concern_raised, concern_resolved) display guidance text at
//                the point of entry per the documented requirement.

import * as React from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import PageShell from "../../../../components/PageShell";
import type {
  CrmKeyFact,
  CrmTouchpoint,
  TouchpointType,
  BuyerType,
  LoanTypePref,
  LeadSource,
} from "../../../../../lib/crm/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type Borrower = {
  id: string;
  name: string;
  email: string | null;
  property_address: string | null;
  // Seed context fields (migration 066)
  buyer_type:          BuyerType | null;
  target_price_min:    number | null;
  target_price_max:    number | null;
  down_payment_target: number | null;
  down_payment_type:   "amount" | "pct" | null;
  timeline_months:     number | null;
  loan_type_pref:      LoanTypePref[] | null;
  state_of_focus:      string | null;
  lead_source:         LeadSource | null;
  lead_source_detail:  string | null;
  seed_notes:          string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const BUYER_TYPE_LABELS: Record<BuyerType, string> = {
  first_time: "First-time buyer",
  move_up:    "Move-up buyer",
  investor:   "Investor",
  refinance:  "Refinance",
  homeowner:  "Homeowner",
};

const LOAN_TYPE_LABELS: Record<LoanTypePref, string> = {
  conventional: "Conventional",
  fha:          "FHA",
  va:           "VA",
  jumbo:        "Jumbo",
  dscr:         "DSCR",
  usda:         "USDA",
  nonqm:        "Non-QM",
};

const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  referral: "Referral",
  platform: "Platform",
  direct:   "Direct",
  pilot:    "Pilot",
  other:    "Other",
};

const TOUCHPOINT_TYPE_LABELS: Record<TouchpointType, string> = {
  call:             "Phone call",
  email:            "Email",
  in_app_message:   "In-app message",
  manual_note:      "Manual note",
  platform_event:   "Platform event",
};

const TOUCHPOINT_TYPE_ICONS: Record<TouchpointType, string> = {
  call:             "📞",
  email:            "✉️",
  in_app_message:   "💬",
  manual_note:      "📝",
  platform_event:   "⚡",
};

function fmt$( n: number ) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Render a single key_fact as a human-readable React element. */
function FactChip({ fact }: { fact: CrmKeyFact }) {
  const base: React.CSSProperties = {
    display: "inline-block", padding: "3px 10px", borderRadius: 999,
    fontSize: "0.77rem", fontWeight: 500, lineHeight: 1.5,
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
    color: "#c8d6e0",
  };

  switch (fact.key) {
    case "budget_updated":
      return (
        <span style={{ ...base, borderColor: "rgba(0,232,122,0.2)", color: "#00e87a" }}>
          Budget {fmt$(fact.from)} → {fmt$(fact.to)}
        </span>
      );
    case "timeline_updated":
      return (
        <span style={{ ...base, borderColor: "rgba(99,179,237,0.2)", color: "#63b3ed" }}>
          Timeline {fact.from_months}mo → {fact.to_months}mo
        </span>
      );
    case "concern_raised":
      return (
        <span style={{ ...base, borderColor: "rgba(251,191,36,0.3)", color: "#fbbf24" }}>
          ⚠ {fact.concern}
        </span>
      );
    case "concern_resolved":
      return (
        <span style={{ ...base, borderColor: "rgba(0,232,122,0.15)", color: "rgba(0,232,122,0.7)" }}>
          ✓ Resolved: {fact.concern}
        </span>
      );
    case "life_event":
      return <span style={base}>🗓 {fact.event}</span>;
    case "preference_expressed":
      return <span style={base}>✦ {fact.preference}</span>;
    case "property_of_interest":
      return <span style={{ ...base, color: "#93c5fd" }}>📍 {fact.address}</span>;
    case "competitor_mentioned":
      return <span style={{ ...base, color: "#f87171" }}>🏢 Mentioned: {fact.competitor}</span>;
    case "note":
      return null; // Notes rendered separately
  }
}

// ── Fact form state ────────────────────────────────────────────────────────────

type FactDraft =
  | { key: "budget_updated";      from: string; to: string }
  | { key: "timeline_updated";    from_months: string; to_months: string }
  | { key: "concern_raised";      concern: string }
  | { key: "concern_resolved";    concern: string }
  | { key: "life_event";          event: string }
  | { key: "preference_expressed"; preference: string }
  | { key: "property_of_interest"; address: string }
  | { key: "competitor_mentioned"; competitor: string };

type FactKey = FactDraft["key"];

function draftToFact(d: FactDraft): CrmKeyFact | null {
  switch (d.key) {
    case "budget_updated": {
      const from = parseFloat(d.from.replace(/[^0-9.]/g, ""));
      const to   = parseFloat(d.to.replace(/[^0-9.]/g, ""));
      if (!from || !to) return null;
      return { key: "budget_updated", from, to };
    }
    case "timeline_updated": {
      const f = parseInt(d.from_months, 10);
      const t = parseInt(d.to_months, 10);
      if (!f || !t) return null;
      return { key: "timeline_updated", from_months: f, to_months: t };
    }
    case "concern_raised":
      if (!d.concern.trim()) return null;
      return { key: "concern_raised", concern: d.concern.trim() };
    case "concern_resolved":
      if (!d.concern.trim()) return null;
      return { key: "concern_resolved", concern: d.concern.trim() };
    case "life_event":
      if (!d.event.trim()) return null;
      return { key: "life_event", event: d.event.trim() };
    case "preference_expressed":
      if (!d.preference.trim()) return null;
      return { key: "preference_expressed", preference: d.preference.trim() };
    case "property_of_interest":
      if (!d.address.trim()) return null;
      return { key: "property_of_interest", address: d.address.trim() };
    case "competitor_mentioned":
      if (!d.competitor.trim()) return null;
      return { key: "competitor_mentioned", competitor: d.competitor.trim() };
  }
}

const FACT_KEY_LABELS: Record<FactKey, string> = {
  budget_updated:       "Budget update",
  timeline_updated:     "Timeline update",
  concern_raised:       "Concern raised",
  concern_resolved:     "Concern resolved",
  life_event:           "Life event",
  preference_expressed: "Preference",
  property_of_interest: "Property of interest",
  competitor_mentioned: "Competitor mentioned",
};

// Decision 7: fields that need entry guidance
const D7_GUIDANCE: Partial<Record<FactKey, string>> = {
  life_event:
    "Record home-search milestones (starting house hunting, received inheritance, sold existing home). Do not record family composition, health status, age, or other personal circumstances.",
  preference_expressed:
    "Record buyer preferences about property or loan features. Do not record information about personal characteristics, family, or protected-class status.",
  concern_raised:
    "Record financing or transaction concerns. Do not record personal circumstances unrelated to the mortgage.",
  concern_resolved:
    "Record how a financing or transaction concern was addressed.",
};

// ── Fact sub-form ─────────────────────────────────────────────────────────────

function FactSubForm({
  draft,
  onChange,
}: {
  draft: FactDraft;
  onChange: (d: FactDraft) => void;
}) {
  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    padding: "7px 10px", borderRadius: 7,
    border: "1px solid rgba(148,163,184,0.2)",
    background: "rgba(255,255,255,0.04)", color: "#e0f0e8",
    fontSize: "0.83rem", outline: "none", fontFamily: "inherit",
  };
  const guidance = D7_GUIDANCE[draft.key];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {guidance && (
        <p style={{ margin: 0, fontSize: "0.74rem", color: "rgba(99,179,237,0.65)", lineHeight: 1.5, fontStyle: "italic" }}>
          {guidance}
        </p>
      )}
      {draft.key === "budget_updated" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <label style={{ fontSize: "0.74rem", color: "rgba(185,208,192,0.55)", display: "block", marginBottom: 4 }}>Previous budget</label>
            <input
              style={inputStyle} placeholder="$400,000"
              value={draft.from}
              onChange={e => onChange({ ...draft, from: e.target.value })}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.74rem", color: "rgba(185,208,192,0.55)", display: "block", marginBottom: 4 }}>New budget</label>
            <input
              style={inputStyle} placeholder="$550,000"
              value={draft.to}
              onChange={e => onChange({ ...draft, to: e.target.value })}
            />
          </div>
        </div>
      )}
      {draft.key === "timeline_updated" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <label style={{ fontSize: "0.74rem", color: "rgba(185,208,192,0.55)", display: "block", marginBottom: 4 }}>Previous timeline (months)</label>
            <input
              style={inputStyle} placeholder="6" type="number" min="0"
              value={draft.from_months}
              onChange={e => onChange({ ...draft, from_months: e.target.value })}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.74rem", color: "rgba(185,208,192,0.55)", display: "block", marginBottom: 4 }}>New timeline (months)</label>
            <input
              style={inputStyle} placeholder="3" type="number" min="0"
              value={draft.to_months}
              onChange={e => onChange({ ...draft, to_months: e.target.value })}
            />
          </div>
        </div>
      )}
      {(draft.key === "concern_raised" || draft.key === "concern_resolved") && (
        <input
          style={inputStyle}
          placeholder={draft.key === "concern_raised" ? "Worried about closing costs…" : "Addressed by showing seller credit options…"}
          value={draft.concern}
          onChange={e => onChange({ ...draft, concern: e.target.value })}
        />
      )}
      {draft.key === "life_event" && (
        <input
          style={inputStyle} placeholder="Listed existing home for sale"
          value={draft.event}
          onChange={e => onChange({ ...draft, event: e.target.value })}
        />
      )}
      {draft.key === "preference_expressed" && (
        <input
          style={inputStyle} placeholder="Prefers single-story, 3BR minimum"
          value={draft.preference}
          onChange={e => onChange({ ...draft, preference: e.target.value })}
        />
      )}
      {draft.key === "property_of_interest" && (
        <input
          style={inputStyle} placeholder="123 Main St, Irvine CA 92618"
          value={draft.address}
          onChange={e => onChange({ ...draft, address: e.target.value })}
        />
      )}
      {draft.key === "competitor_mentioned" && (
        <input
          style={inputStyle} placeholder="Rocket Mortgage"
          value={draft.competitor}
          onChange={e => onChange({ ...draft, competitor: e.target.value })}
        />
      )}
    </div>
  );
}

function emptyDraft(key: FactKey): FactDraft {
  switch (key) {
    case "budget_updated":       return { key, from: "", to: "" };
    case "timeline_updated":     return { key, from_months: "", to_months: "" };
    case "concern_raised":       return { key, concern: "" };
    case "concern_resolved":     return { key, concern: "" };
    case "life_event":           return { key, event: "" };
    case "preference_expressed": return { key, preference: "" };
    case "property_of_interest": return { key, address: "" };
    case "competitor_mentioned": return { key, competitor: "" };
  }
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PreCallBriefPage() {
  const params = useParams<{ id: string }>();
  const borrowerId = params?.id ?? "";
  const { isLoaded, isSignedIn } = useAuth();

  const [borrower, setBorrower] = React.useState<Borrower | null>(null);
  const [touchpoints, setTouchpoints] = React.useState<CrmTouchpoint[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Add-touchpoint form
  const [formOpen, setFormOpen] = React.useState(false);
  const [tpType, setTpType] = React.useState<TouchpointType>("call");
  const [tpDate, setTpDate] = React.useState(() => new Date().toISOString().slice(0, 16)); // datetime-local
  const [tpSubject, setTpSubject] = React.useState("");
  const [facts, setFacts] = React.useState<CrmKeyFact[]>([]);
  const [noteText, setNoteText] = React.useState("");
  const [factDraft, setFactDraft] = React.useState<FactDraft>(emptyDraft("budget_updated"));
  const [factKey, setFactKey] = React.useState<FactKey>("budget_updated");
  const [saving, setSaving] = React.useState(false);
  const [saveOk, setSaveOk] = React.useState(false);
  const [saveErr, setSaveErr] = React.useState<string | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (!isLoaded || !isSignedIn || !borrowerId) return;

    async function load() {
      try {
        const [bRes, tRes] = await Promise.all([
          fetch("/api/borrowers"),
          fetch(`/api/crm/touchpoints?borrower_id=${borrowerId}`),
        ]);
        const bData = await bRes.json();
        const tData = await tRes.json();

        const found: Borrower | undefined = (bData.borrowers ?? []).find(
          (b: Borrower) => b.id === borrowerId
        );
        if (!found) { setError("Borrower not found or you don't have access."); return; }
        setBorrower(found);
        setTouchpoints(tData.touchpoints ?? []);
      } catch {
        setError("Failed to load. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [isLoaded, isSignedIn, borrowerId]);

  // ── Form handlers ─────────────────────────────────────────────────────────────

  function handleFactKeyChange(k: FactKey) {
    setFactKey(k);
    setFactDraft(emptyDraft(k));
  }

  function addFact() {
    const resolved = draftToFact(factDraft);
    if (!resolved) return;
    setFacts(prev => [...prev, resolved]);
    setFactDraft(emptyDraft(factKey));
  }

  function removeFact(idx: number) {
    setFacts(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!tpSubject.trim()) return;
    setSaving(true);
    setSaveErr(null);

    const allFacts: CrmKeyFact[] = [...facts];
    if (noteText.trim()) {
      allFacts.push({ key: "note", text: noteText.trim() });
    }

    try {
      const res = await fetch("/api/crm/touchpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          borrower_id:     borrowerId,
          touchpoint_type: tpType,
          touchpoint_date: new Date(tpDate).toISOString(),
          subject:         tpSubject.trim(),
          key_facts:       allFacts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");

      // Optimistic refresh
      const tRes = await fetch(`/api/crm/touchpoints?borrower_id=${borrowerId}`);
      const tData = await tRes.json();
      setTouchpoints(tData.touchpoints ?? []);

      // Reset form
      setTpSubject("");
      setNoteText("");
      setFacts([]);
      setFactDraft(emptyDraft(factKey));
      setFormOpen(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSupersede(id: string) {
    await fetch("/api/crm/touchpoints", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setTouchpoints(prev => prev.filter(t => t.id !== id));
  }

  // ── Render helpers ─────────────────────────────────────────────────────────────

  function SeedContext({ b }: { b: Borrower }) {
    const hasSeed = b.buyer_type || b.target_price_min || b.target_price_max ||
      b.down_payment_target || b.timeline_months || b.loan_type_pref?.length ||
      b.state_of_focus || b.lead_source || b.seed_notes;

    if (!hasSeed) {
      return (
        <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", marginBottom: 24 }}>
          <p style={{ margin: 0, fontSize: "0.82rem", color: "rgba(185,208,192,0.45)" }}>
            No seed context recorded yet. Use the Borrowers page to add buyer profile details.
          </p>
        </div>
      );
    }

    const rows: Array<[string, React.ReactNode]> = [];

    if (b.buyer_type) rows.push(["Buyer type", BUYER_TYPE_LABELS[b.buyer_type]]);

    if (b.target_price_min && b.target_price_max) {
      rows.push(["Target price", `${fmt$(b.target_price_min)} – ${fmt$(b.target_price_max)}`]);
    } else if (b.target_price_min) {
      rows.push(["Target price", `${fmt$(b.target_price_min)}+`]);
    } else if (b.target_price_max) {
      rows.push(["Target price", `up to ${fmt$(b.target_price_max)}`]);
    }

    if (b.down_payment_target !== null) {
      const dp = b.down_payment_type === "pct"
        ? `${b.down_payment_target}%`
        : fmt$(b.down_payment_target);
      rows.push(["Down payment", dp]);
    }

    if (b.timeline_months) {
      rows.push(["Timeline", `${b.timeline_months} month${b.timeline_months !== 1 ? "s" : ""}`]);
    }

    if (b.loan_type_pref?.length) {
      rows.push(["Loan type pref", b.loan_type_pref.map(k => LOAN_TYPE_LABELS[k]).join(", ")]);
    }

    if (b.state_of_focus) rows.push(["State of focus", b.state_of_focus]);

    if (b.lead_source) {
      const ls = LEAD_SOURCE_LABELS[b.lead_source];
      rows.push(["Lead source", b.lead_source_detail ? `${ls} — ${b.lead_source_detail}` : ls]);
    }

    return (
      <div style={{ padding: "16px 18px", borderRadius: 10, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px 24px" }}>
          {rows.map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(185,208,192,0.45)", marginBottom: 3 }}>
                {label}
              </div>
              <div style={{ fontSize: "0.88rem", color: "#e0f0e8", fontWeight: 500 }}>{value}</div>
            </div>
          ))}
        </div>
        {b.seed_notes && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(185,208,192,0.45)", marginBottom: 6 }}>First-contact notes</div>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "rgba(224,240,232,0.8)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{b.seed_notes}</p>
          </div>
        )}
      </div>
    );
  }

  // ── Page render ────────────────────────────────────────────────────────────────

  if (!isLoaded) return null;

  if (!isSignedIn) {
    return (
      <PageShell backHref="/pro/clients" backLabel="Borrowers">
        <p style={{ color: "rgba(185,208,192,0.5)", fontSize: "0.9rem" }}>Please sign in to view this page.</p>
      </PageShell>
    );
  }

  if (loading) {
    return (
      <PageShell backHref="/pro/clients" backLabel="Borrowers">
        <p style={{ color: "rgba(185,208,192,0.4)", fontSize: "0.88rem" }}>Loading…</p>
      </PageShell>
    );
  }

  if (error || !borrower) {
    return (
      <PageShell backHref="/pro/clients" backLabel="Borrowers">
        <p style={{ color: "#f87171", fontSize: "0.88rem" }}>{error ?? "Borrower not found."}</p>
      </PageShell>
    );
  }

  const noteFacts = touchpoints.flatMap(t =>
    (t.key_facts as CrmKeyFact[]).filter(f => f.key === "note").map(f => ({
      note: (f as { key: "note"; text: string }).text,
      date: t.touchpoint_date,
      subject: t.subject,
    }))
  );

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "8px 11px",
    borderRadius: 8, border: "1px solid rgba(148,163,184,0.2)",
    background: "rgba(255,255,255,0.04)", color: "#e0f0e8",
    fontSize: "0.85rem", outline: "none", fontFamily: "inherit",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle, cursor: "pointer",
  };

  return (
    <PageShell backHref="/pro/clients" backLabel="Borrowers" maxWidth={760}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#00e87a", padding: "3px 9px", borderRadius: 999, border: "1px solid rgba(0,232,122,0.3)", background: "rgba(0,232,122,0.06)" }}>
            Pre-Call Brief
          </span>
        </div>
        <h1 style={{ margin: "0 0 4px", fontSize: "1.55rem", fontWeight: 800, color: "#f1f5f9" }}>
          {borrower.name}
        </h1>
        {borrower.email && (
          <p style={{ margin: "0 0 3px", fontSize: "0.83rem", color: "rgba(185,208,192,0.55)" }}>{borrower.email}</p>
        )}
        {borrower.property_address && (
          <p style={{ margin: 0, fontSize: "0.83rem", color: "rgba(99,179,237,0.7)" }}>
            📍 {borrower.property_address}
          </p>
        )}
      </div>

      {/* Seed context */}
      <div style={{ marginBottom: 8 }}>
        <h2 style={{ margin: "0 0 10px", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(185,208,192,0.5)" }}>
          Buyer Profile
        </h2>
        <SeedContext b={borrower} />
      </div>

      {/* Active touchpoints */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(185,208,192,0.5)" }}>
            Interaction History
          </h2>
          <button
            type="button"
            onClick={() => setFormOpen(o => !o)}
            style={{
              padding: "6px 14px", borderRadius: 999, fontSize: "0.78rem", fontWeight: 600,
              border: "1px solid rgba(0,232,122,0.35)", background: formOpen ? "rgba(0,232,122,0.1)" : "transparent",
              color: "#00e87a", cursor: "pointer",
            }}
          >
            {formOpen ? "Cancel" : "+ Log touchpoint"}
          </button>
        </div>

        {saveOk && (
          <div style={{ padding: "8px 14px", borderRadius: 8, background: "rgba(0,232,122,0.08)", border: "1px solid rgba(0,232,122,0.2)", marginBottom: 12, fontSize: "0.82rem", color: "#00e87a" }}>
            Touchpoint saved.
          </div>
        )}

        {/* Add touchpoint form */}
        {formOpen && (
          <div style={{ padding: "18px 20px", borderRadius: 12, border: "1px solid rgba(148,163,184,0.15)", background: "rgba(255,255,255,0.025)", marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: "0.74rem", color: "rgba(185,208,192,0.55)", display: "block", marginBottom: 5 }}>Type</label>
                <select style={selectStyle} value={tpType} onChange={e => setTpType(e.target.value as TouchpointType)}>
                  {(Object.keys(TOUCHPOINT_TYPE_LABELS) as TouchpointType[]).map(k => (
                    <option key={k} value={k}>{TOUCHPOINT_TYPE_ICONS[k]} {TOUCHPOINT_TYPE_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: "0.74rem", color: "rgba(185,208,192,0.55)", display: "block", marginBottom: 5 }}>Date &amp; time</label>
                <input type="datetime-local" style={inputStyle} value={tpDate} onChange={e => setTpDate(e.target.value)} />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: "0.74rem", color: "rgba(185,208,192,0.55)", display: "block", marginBottom: 5 }}>Subject — what was this about?</label>
              <input
                style={inputStyle}
                placeholder="Pre-approval discussion, rate lock question, budget check-in…"
                value={tpSubject}
                onChange={e => setTpSubject(e.target.value)}
              />
            </div>

            {/* Staged facts */}
            {facts.length > 0 && (
              <div style={{ marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {facts.map((f, i) => (
                  <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <FactChip fact={f} />
                    <button
                      type="button"
                      onClick={() => removeFact(i)}
                      style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: "0.8rem", padding: "0 2px" }}
                      aria-label="Remove"
                    >×</button>
                  </span>
                ))}
              </div>
            )}

            {/* Add a fact */}
            <div style={{ padding: "12px 14px", borderRadius: 9, border: "1px solid rgba(99,179,237,0.15)", background: "rgba(99,179,237,0.04)", marginBottom: 12 }}>
              <p style={{ margin: "0 0 10px", fontSize: "0.74rem", fontWeight: 600, color: "rgba(185,208,192,0.55)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Add a structured fact
              </p>
              <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
                <select
                  style={{ ...selectStyle, width: "auto", flex: "1 1 160px" }}
                  value={factKey}
                  onChange={e => handleFactKeyChange(e.target.value as FactKey)}
                >
                  {(Object.keys(FACT_KEY_LABELS) as FactKey[]).map(k => (
                    <option key={k} value={k}>{FACT_KEY_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              <FactSubForm draft={factDraft} onChange={setFactDraft} />
              <button
                type="button"
                onClick={addFact}
                style={{
                  marginTop: 8, padding: "6px 14px", borderRadius: 999, fontSize: "0.78rem", fontWeight: 600,
                  border: "1px solid rgba(99,179,237,0.3)", background: "rgba(99,179,237,0.06)", color: "#63b3ed", cursor: "pointer",
                }}
              >
                + Add fact
              </button>
            </div>

            {/* Private note */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: "0.74rem", color: "rgba(185,208,192,0.55)", display: "block", marginBottom: 5 }}>
                Private note <span style={{ color: "rgba(148,163,184,0.4)", fontWeight: 400 }}>— LO-visible only, not used for AI drafts</span>
              </label>
              <textarea
                style={{ ...inputStyle, resize: "vertical", minHeight: 72 }}
                placeholder="Internal context, follow-up reminders, anything you'd say in a handoff note…"
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                rows={3}
              />
            </div>

            {saveErr && (
              <p style={{ margin: "0 0 10px", fontSize: "0.8rem", color: "#f87171" }}>{saveErr}</p>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !tpSubject.trim()}
              style={{
                width: "100%", padding: "10px 20px", borderRadius: 999, fontSize: "0.88rem", fontWeight: 700,
                border: "none",
                background: saving || !tpSubject.trim() ? "rgba(0,232,122,0.3)" : "#00e87a",
                color: saving || !tpSubject.trim() ? "rgba(8,12,18,0.5)" : "#080c12",
                cursor: saving || !tpSubject.trim() ? "default" : "pointer",
              }}
            >
              {saving ? "Saving…" : "Save touchpoint"}
            </button>
          </div>
        )}

        {/* Touchpoint list */}
        {touchpoints.length === 0 ? (
          <div style={{ padding: "20px 18px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "rgba(185,208,192,0.4)" }}>
              No touchpoints logged yet. Use "+ Log touchpoint" to record a call or interaction.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {touchpoints.map(t => {
              const activeFacts = (t.key_facts as CrmKeyFact[]).filter(f => f.key !== "note");
              const tNotes = (t.key_facts as CrmKeyFact[]).filter(f => f.key === "note") as Array<{ key: "note"; text: string }>;
              return (
                <div key={t.id} style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: activeFacts.length ? 10 : (tNotes.length ? 10 : 0) }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.92rem", fontWeight: 600, color: "#e0f0e8" }}>{t.subject}</span>
                        <span style={{ fontSize: "0.72rem", color: "rgba(185,208,192,0.45)", background: "rgba(255,255,255,0.04)", padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.06)" }}>
                          {TOUCHPOINT_TYPE_ICONS[t.touchpoint_type as TouchpointType]} {TOUCHPOINT_TYPE_LABELS[t.touchpoint_type as TouchpointType]}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.73rem", color: "rgba(185,208,192,0.4)", marginTop: 3 }}>
                        {fmtDate(t.touchpoint_date)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSupersede(t.id)}
                      title="Mark as superseded (hide from brief)"
                      style={{ background: "none", border: "none", color: "rgba(185,208,192,0.25)", cursor: "pointer", fontSize: "0.78rem", padding: 0, flexShrink: 0 }}
                    >
                      Archive
                    </button>
                  </div>

                  {activeFacts.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: tNotes.length ? 10 : 0 }}>
                      {activeFacts.map((f, i) => <FactChip key={i} fact={f} />)}
                    </div>
                  )}

                  {tNotes.map((n, i) => (
                    <div key={i} style={{ marginTop: 4, padding: "8px 12px", borderRadius: 7, background: "rgba(255,255,255,0.03)", borderLeft: "2px solid rgba(148,163,184,0.2)" }}>
                      <div style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(148,163,184,0.45)", marginBottom: 4 }}>Private note · LO only</div>
                      <p style={{ margin: 0, fontSize: "0.82rem", color: "rgba(185,208,192,0.7)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{n.text}</p>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Notes roll-up (cross-touchpoint) — shown only if there are notes from multiple touchpoints */}
      {noteFacts.length > 1 && (
        <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <h2 style={{ margin: "0 0 12px", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(148,163,184,0.4)" }}>
            All private notes · LO-visible only — not used for AI drafts
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {noteFacts.map((n, i) => (
              <div key={i} style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ fontSize: "0.7rem", color: "rgba(148,163,184,0.4)", marginBottom: 4 }}>
                  {fmtDate(n.date)} — {n.subject}
                </div>
                <p style={{ margin: 0, fontSize: "0.83rem", color: "rgba(185,208,192,0.65)", lineHeight: 1.6 }}>{n.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </PageShell>
  );
}
