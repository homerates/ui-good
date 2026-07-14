"use client";
// app/pro/clients/[id]/brief/page.tsx
// Pre-call brief — Platform Intelligence, Phase 1.
//
// Shows an LO:
//   1. Buyer Profile — structured seed context from the borrowers row
//   2. Chat — person-scoped AI chat (same infrastructure as main chat)
//      The LO relays calls, asks questions, and notes what changed.
//      Facts are extracted asynchronously into person_activity.
//
// COMPLIANCE (see COMPLIANCE_DECISIONS.md):
//   Decision 1:  Denylist fields don't exist in the data — nothing to filter.
//   Decision 2:  Raw messages (NoteFact) excluded from generation by construction.
//   Decision 4:  /api/crm/person-thread ownership check enforces lo_user_id scope.
//   Decision 7:  Blocklist runs in /api/crm/person-message before any write or AI call.

import * as React from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import PageShell from "../../../../components/PageShell";
import PersonChat from "../../../../components/PersonChat";
import type {
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
  const [loading,  setLoading]  = React.useState(true);
  const [error,    setError]    = React.useState<string | null>(null);

  // ── Fetch borrower ───────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (!isLoaded || !isSignedIn || !borrowerId) return;

    async function load() {
      try {
        const bRes  = await fetch("/api/borrowers");
        const bData = await bRes.json();
        const found: Borrower | undefined = (bData.borrowers ?? []).find(
          (b: Borrower) => b.id === borrowerId,
        );
        if (!found) { setError("Borrower not found or you don't have access."); return; }
        setBorrower(found);
      } catch {
        setError("Failed to load. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [isLoaded, isSignedIn, borrowerId]);

  // ── Guards ─────────────────────────────────────────────────────────────────

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

      {/* Buyer Profile */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ margin: "0 0 10px", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(185,208,192,0.5)" }}>
          Buyer Profile
        </h2>
        <SeedContext b={borrower} />
      </div>

      {/* Chat */}
      <div>
        <h2 style={{ margin: "0 0 12px", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(185,208,192,0.5)" }}>
          Conversation
        </h2>
        <PersonChat borrowerId={borrowerId} borrowerName={borrower.name} />
      </div>

    </PageShell>
  );
}
