"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const PROGRAM_TYPE_LABELS: Record<string, string> = {
  grant:           "Grant",
  forgivable_loan: "Forgivable Loan",
  second_lien:     "Second Lien",
  matched_savings: "Matched Savings",
};

interface LenderData {
  name: string;
  nmls: string | null;
  contactName: string | null;
  states: string[];
  loanTypes: string[];
  status: string;
  views: number;
  optIns: number;
  invitedAt: string;
}

interface DpaProgram {
  id: string;
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

const fmt = (n: number) => `$${n.toLocaleString()}`;
const STATUS_COLORS: Record<string, string> = {
  active: "#4ade80", pending: "#f59e0b", suspended: "#f87171",
};

export default function LenderPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [lender, setLender]     = useState<LenderData | null>(null);
  const [programs, setPrograms] = useState<DpaProgram[]>([]);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/lender-portal?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (!d.ok) { setNotFound(true); setLoading(false); return; }
        setLender(d.lender);
        setPrograms(d.programs);
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [token]);

  if (loading) return (
    <div style={pageStyle}>
      <div style={{ color: "rgba(185,208,192,0.35)", fontSize: "0.9rem", paddingTop: 80, textAlign: "center" }}>
        Loading your portal…
      </div>
    </div>
  );

  if (notFound || !lender) return (
    <div style={pageStyle}>
      <div style={{ textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: "2rem", marginBottom: 12 }}>🔗</div>
        <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f0f4ff", marginBottom: 8 }}>Invalid or expired link</div>
        <div style={{ fontSize: "0.85rem", color: "rgba(185,208,192,0.45)" }}>
          Contact HomeRates to request a new invitation link.
        </div>
      </div>
    </div>
  );

  const activePrograms = programs.filter(p => p.active);

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 20px 80px" }}>

        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <img src="/Green.png" alt="HomeRates.ai" style={{ height: 22, opacity: 0.85 }} />
            <span style={{ fontSize: "0.7rem", color: "rgba(185,208,192,0.3)", fontWeight: 600 }}>
              Lender Partner Portal
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ fontSize: "1.7rem", fontWeight: 800, color: "#f0f4ff", margin: 0 }}>
                {lender.name}
              </h1>
              {lender.nmls && (
                <div style={{ fontSize: "0.75rem", color: "rgba(185,208,192,0.4)", marginTop: 4 }}>
                  NMLS #{lender.nmls}
                  {lender.contactName ? ` · ${lender.contactName}` : ""}
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 14px", background: "rgba(0,0,0,0.3)", border: `1px solid ${STATUS_COLORS[lender.status] ?? "#6b7280"}33`, borderRadius: 20 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLORS[lender.status] ?? "#6b7280" }} />
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: STATUS_COLORS[lender.status] ?? "#6b7280", textTransform: "capitalize" }}>
                {lender.status}
              </span>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 32 }}>
          {[
            { label: "Profile views",    value: lender.views,            color: "#f0f4ff" },
            { label: "Borrower opt-ins", value: lender.optIns,           color: "#00e87a" },
            { label: "Active programs",  value: activePrograms.length,   color: "#4ade80" },
          ].map(s => (
            <div key={s.label} style={{ background: "#0e1420", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "18px 20px" }}>
              <div style={{ fontSize: "1.8rem", fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: "0.72rem", color: "rgba(185,208,192,0.4)", marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Coverage */}
        <div style={{ background: "#0e1420", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "20px 22px", marginBottom: 20 }}>
          <div style={sectionLabel}>Your listing</div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 10 }}>
            <div>
              <div style={metaLabel}>Eligible states</div>
              <div style={metaValue}>{lender.states.join(", ") || "—"}</div>
            </div>
            <div>
              <div style={metaLabel}>Loan types</div>
              <div style={metaValue}>{lender.loanTypes.map(t => t.toUpperCase()).join(", ")}</div>
            </div>
          </div>
          <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(0,232,122,0.04)", border: "1px solid rgba(0,232,122,0.1)", borderRadius: 8 }}>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "rgba(185,208,192,0.5)", lineHeight: 1.6 }}>
              Your institution is never shown to borrowers by name until they opt in to connect.
              Borrowers see only a match count and program type.
            </p>
          </div>
        </div>

        {/* DPA Programs */}
        <div style={{ background: "#0e1420", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={sectionLabel}>DPA Programs</div>
            <div style={{ fontSize: "0.72rem", color: "rgba(185,208,192,0.3)" }}>
              {activePrograms.length} active · {programs.length} total
            </div>
          </div>

          {programs.length === 0 ? (
            <div style={{ padding: "32px 22px", textAlign: "center" }}>
              <div style={{ fontSize: "0.88rem", color: "rgba(185,208,192,0.3)" }}>
                No programs declared yet.
              </div>
              <div style={{ fontSize: "0.78rem", color: "rgba(185,208,192,0.2)", marginTop: 6 }}>
                Contact HomeRates to add your DPA programs to your listing.
              </div>
            </div>
          ) : (
            programs.map((p, i) => (
              <div key={p.id} style={{
                padding: "16px 22px",
                borderBottom: i < programs.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                opacity: p.active ? 1 : 0.45,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "#f0f4ff" }}>{p.program_name}</span>
                      {!p.active && (
                        <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "#f87171", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 4, padding: "1px 6px" }}>
                          PAUSED
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "rgba(185,208,192,0.5)", lineHeight: 1.6 }}>
                      {PROGRAM_TYPE_LABELS[p.program_type] ?? p.program_type}
                      {p.max_assistance ? ` · Up to ${fmt(p.max_assistance)}` : ""}
                      {p.income_limit ? ` · Income ≤ ${fmt(p.income_limit)}` : ""}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "rgba(185,208,192,0.35)", marginTop: 3 }}>
                      {p.coverage_type === "nationwide"
                        ? "Nationwide"
                        : p.coverage_type === "state"
                        ? `States: ${p.eligible_states.join(", ")}`
                        : `${p.eligible_county_fips.length} county FIPS`}
                      {" · "}Min FICO {p.min_credit_score}
                      {" · "}{p.loan_types.map(t => t.toUpperCase()).join(", ")}
                    </div>
                    {p.notes && (
                      <div style={{ fontSize: "0.72rem", color: "rgba(185,208,192,0.3)", marginTop: 4, fontStyle: "italic" }}>{p.notes}</div>
                    )}
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.active ? "#4ade80" : "#6b7280", marginTop: 6 }} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* How matching works */}
        <div style={{ background: "#0e1420", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "20px 22px", marginBottom: 20 }}>
          <div style={sectionLabel}>How borrower matching works</div>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { step: "1", title: "Borrower runs AMI Qualifier", desc: "They enter a ZIP code and income. The tool checks against FHFA 2026 AMI thresholds — the same data Fannie Mae and Freddie Mac use in DU/LPA." },
              { step: "2", title: "Program match fires", desc: "If their income qualifies and your program covers their geography, they see a match count. Your institution name is not shown at this stage." },
              { step: "3", title: "Borrower opts in", desc: "When a borrower chooses to connect, HomeRates introduces them to you. You receive their scenario, they receive your contact." },
            ].map(s => (
              <div key={s.step} style={{ display: "flex", gap: 14 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(0,232,122,0.1)", border: "1px solid rgba(0,232,122,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "0.72rem", fontWeight: 800, color: "#00e87a" }}>
                  {s.step}
                </div>
                <div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#f0f4ff", marginBottom: 2 }}>{s.title}</div>
                  <div style={{ fontSize: "0.78rem", color: "rgba(185,208,192,0.45)", lineHeight: 1.6 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Contact footer */}
        <div style={{ textAlign: "center", padding: "12px 0" }}>
          <p style={{ margin: 0, fontSize: "0.78rem", color: "rgba(185,208,192,0.3)" }}>
            Questions about your listing or DPA programs?{" "}
            <a href="mailto:support@homerates.ai" style={{ color: "rgba(0,232,122,0.6)", textDecoration: "none" }}>
              Contact HomeRates
            </a>
          </p>
          <p style={{ margin: "6px 0 0", fontSize: "0.7rem", color: "rgba(185,208,192,0.18)" }}>
            Keep this link private — it provides access to your lender portal.
          </p>
        </div>

      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#090d12",
  fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
  color: "#f0f4ff",
};
const sectionLabel: React.CSSProperties = {
  fontSize: "0.7rem", fontWeight: 700, color: "rgba(185,208,192,0.4)",
  textTransform: "uppercase", letterSpacing: "0.08em",
};
const metaLabel: React.CSSProperties = {
  fontSize: "0.65rem", fontWeight: 700, color: "rgba(185,208,192,0.3)",
  textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3,
};
const metaValue: React.CSSProperties = {
  fontSize: "0.88rem", fontWeight: 600, color: "#f0f4ff",
};
