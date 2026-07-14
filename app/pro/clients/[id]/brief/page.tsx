"use client";
// app/pro/clients/[id]/brief/page.tsx
// Pre-call brief — CRM memory engine.
//
// Shows an LO:
//   1. Seed context — structured buyer profile from the borrowers row
//   2. Memory — chronological timeline of notes and extracted facts
//   3. Add note form — LO pastes/types raw notes; AI extracts structured facts
//
// COMPLIANCE (see COMPLIANCE_DECISIONS.md):
//   Decision 1:  Denylist fields don't exist in the data — nothing to filter.
//   Decision 2:  NoteFact (raw note text) displayed with "not used for AI drafts"
//                label — excluded from generation by construction (toGenerationTouchpoint).
//   Decision 4:  All CRM data fetched via /api/crm/touchpoints, which enforces
//                lo_user_id = clerk userId on every query.
//   Decision 7:  Blocklist runs server-side on raw note + extracted freeform strings
//                in /api/crm/notes before any write (see that route for detail).

import * as React from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import PageShell from "../../../../components/PageShell";
import type {
  CrmKeyFact,
  CrmTouchpoint,
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

function fmt$(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Human-readable provenance label derived from touchpoint_type.
 *  The LO no longer picks this — it comes from how the record was created. */
function provenanceLabel(touchpointType: string): string {
  switch (touchpointType) {
    case "platform_event":  return "from platform activity";
    case "in_app_message":  return "from in-app message";
    case "email":           return "from email";
    case "call":            return "from a call";
    default:                return "from a note";
  }
}

/** Render a single key_fact as a human-readable chip. */
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
      return null; // Raw notes rendered separately
  }
}

// ── SeedContext ───────────────────────────────────────────────────────────────

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
    rows.push(["Down payment", b.down_payment_type === "pct"
      ? `${b.down_payment_target}%`
      : fmt$(b.down_payment_target)]);
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

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PreCallBriefPage() {
  const params = useParams<{ id: string }>();
  const borrowerId = params?.id ?? "";
  const { isLoaded, isSignedIn } = useAuth();

  const [borrower, setBorrower] = React.useState<Borrower | null>(null);
  const [touchpoints, setTouchpoints] = React.useState<CrmTouchpoint[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Add-note form
  const [showForm, setShowForm]         = React.useState(false);
  const [rawNote, setRawNote]           = React.useState("");
  const [noteDate, setNoteDate]         = React.useState(() => new Date().toISOString().slice(0, 10));
  const [extracting, setExtracting]     = React.useState(false);
  const [saveOk, setSaveOk]             = React.useState(false);
  const [saveErr, setSaveErr]           = React.useState<string | null>(null);

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
          (b: Borrower) => b.id === borrowerId,
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

  // ── Save note ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!rawNote.trim()) return;
    setExtracting(true);
    setSaveErr(null);

    try {
      const res = await fetch("/api/crm/notes", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          borrower_id: borrowerId,
          raw_note:    rawNote.trim(),
          // noon local on the selected date avoids UTC rollover issues
          note_date:   new Date(`${noteDate}T12:00:00`).toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");

      // Refresh timeline
      const tRes  = await fetch(`/api/crm/touchpoints?borrower_id=${borrowerId}`);
      const tData = await tRes.json();
      setTouchpoints(tData.touchpoints ?? []);

      setRawNote("");
      setNoteDate(new Date().toISOString().slice(0, 10));
      setShowForm(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setExtracting(false);
    }
  }

  async function handleSupersede(id: string) {
    await fetch("/api/crm/touchpoints", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id }),
    });
    setTouchpoints(prev => prev.filter(t => t.id !== id));
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

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "8px 11px",
    borderRadius: 8, border: "1px solid rgba(148,163,184,0.2)",
    background: "rgba(255,255,255,0.04)", color: "#e0f0e8",
    fontSize: "0.85rem", outline: "none", fontFamily: "inherit",
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

      {/* Memory timeline */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(185,208,192,0.5)" }}>
            Memory
          </h2>
          <button
            type="button"
            onClick={() => { setShowForm(o => !o); setSaveErr(null); }}
            style={{
              padding: "6px 14px", borderRadius: 999, fontSize: "0.78rem", fontWeight: 600,
              border: "1px solid rgba(0,232,122,0.35)",
              background: showForm ? "rgba(0,232,122,0.1)" : "transparent",
              color: "#00e87a", cursor: "pointer",
            }}
          >
            {showForm ? "Cancel" : "+ Add note"}
          </button>
        </div>

        {saveOk && (
          <div style={{ padding: "8px 14px", borderRadius: 8, background: "rgba(0,232,122,0.08)", border: "1px solid rgba(0,232,122,0.2)", marginBottom: 12, fontSize: "0.82rem", color: "#00e87a" }}>
            Note saved. Facts were extracted automatically.
          </div>
        )}

        {/* Add note form */}
        {showForm && (
          <div style={{ padding: "18px 20px", borderRadius: 12, border: "1px solid rgba(148,163,184,0.15)", background: "rgba(255,255,255,0.025)", marginBottom: 16 }}>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: "0.74rem", color: "rgba(185,208,192,0.55)", display: "block", marginBottom: 5 }}>Date</label>
              <input
                type="date"
                style={{ ...inputStyle, width: "auto", minWidth: 160 }}
                value={noteDate}
                onChange={e => setNoteDate(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: "0.74rem", color: "rgba(185,208,192,0.55)", display: "block", marginBottom: 5 }}>
                Notes{" "}
                <span style={{ color: "rgba(148,163,184,0.4)", fontWeight: 400 }}>
                  — paste or type what came up. Budget changes, concerns, preferences, and properties mentioned will be extracted automatically.
                </span>
              </label>
              <textarea
                style={{ ...inputStyle, resize: "vertical", minHeight: 110 }}
                placeholder={"Called to check in on pre-approval status. Mentioned they found a place at 245 Oak St they love — asking $520K. Concerned about closing costs on top of down payment. Timeline moved up, wants to close in 3 months. Still comparing us with Rocket Mortgage."}
                value={rawNote}
                onChange={e => setRawNote(e.target.value)}
                rows={5}
                autoFocus
              />
            </div>

            {saveErr && (
              <p style={{ margin: "0 0 10px", fontSize: "0.8rem", color: "#f87171", lineHeight: 1.5 }}>{saveErr}</p>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={extracting || !rawNote.trim()}
              style={{
                width: "100%", padding: "10px 20px", borderRadius: 999, fontSize: "0.88rem", fontWeight: 700,
                border: "none",
                background: extracting || !rawNote.trim() ? "rgba(0,232,122,0.3)" : "#00e87a",
                color:      extracting || !rawNote.trim() ? "rgba(8,12,18,0.5)" : "#080c12",
                cursor:     extracting || !rawNote.trim() ? "default" : "pointer",
              }}
            >
              {extracting ? "Extracting facts…" : "Save note"}
            </button>
          </div>
        )}

        {/* Timeline */}
        {touchpoints.length === 0 ? (
          <div style={{ padding: "20px 18px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "rgba(185,208,192,0.4)" }}>
              No notes yet. Use "+ Add note" after a call or email to start building this person&apos;s memory.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {touchpoints.map(t => {
              const activeFacts = (t.key_facts as CrmKeyFact[]).filter(f => f.key !== "note");
              const rawNotes    = (t.key_facts as CrmKeyFact[]).filter(f => f.key === "note") as Array<{ key: "note"; text: string }>;
              return (
                <div key={t.id} style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: activeFacts.length || rawNotes.length ? 10 : 0 }}>
                    <div>
                      <div style={{ fontSize: "0.92rem", fontWeight: 600, color: "#e0f0e8", marginBottom: 3 }}>
                        {t.subject}
                      </div>
                      <div style={{ fontSize: "0.73rem", color: "rgba(185,208,192,0.4)" }}>
                        {fmtDate(t.touchpoint_date)}
                        {" · "}
                        <span style={{ color: "rgba(148,163,184,0.35)" }}>
                          {provenanceLabel(t.touchpoint_type)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSupersede(t.id)}
                      title="Archive (hide from brief)"
                      style={{ background: "none", border: "none", color: "rgba(185,208,192,0.25)", cursor: "pointer", fontSize: "0.78rem", padding: 0, flexShrink: 0 }}
                    >
                      Archive
                    </button>
                  </div>

                  {activeFacts.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: rawNotes.length ? 10 : 0 }}>
                      {activeFacts.map((f, i) => <FactChip key={i} fact={f} />)}
                    </div>
                  )}

                  {rawNotes.map((n, i) => (
                    <div key={i} style={{ marginTop: 4, padding: "8px 12px", borderRadius: 7, background: "rgba(255,255,255,0.03)", borderLeft: "2px solid rgba(148,163,184,0.15)" }}>
                      <div style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(148,163,184,0.38)", marginBottom: 4 }}>
                        Your note · not used for AI drafts
                      </div>
                      <p style={{ margin: 0, fontSize: "0.82rem", color: "rgba(185,208,192,0.7)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{n.text}</p>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </PageShell>
  );
}
