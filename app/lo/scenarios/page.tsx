"use client";
// app/lo/scenarios/page.tsx
// LO board: see anonymous borrower scenarios and respond

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import AppNav from "../../components/AppNav";

interface Scenario {
  id: string;
  loan_type: string;
  loan_purpose: string;
  price_range: string;
  down_payment_pct: number;
  income_range?: string;
  credit_tier: string;
  timeline: string;
  state: string;
  notes?: string;
  response_count: number;
  max_responses?: number;
  response_window_hours?: number;
  closes_at?: string;
  created_at: string;
  already_responded: boolean;
  visibility?: string;         // 'public' | 'private'
  referred_pro_id?: string;
  // Card data — present when borrower posted from an AI analysis card
  has_card_data?: boolean;
  card_price?: number;
  card_dp_pct?: number;
  card_rate?: number;
  card_monthly?: number;
  card_term?: number;
}

const LOAN_TYPES = ["All", "conventional", "fha", "va", "jumbo", "dscr"];
const LABEL_MAP: Record<string, string> = {
  conventional: "Conventional", fha: "FHA", va: "VA",
  jumbo: "Jumbo", dscr: "DSCR", other: "Other",
};
const BADGE_BG: Record<string, string> = {
  conventional: "rgba(61,139,255,0.12)",
  fha: "rgba(167,139,250,0.12)",
  va: "rgba(0,232,122,0.10)",
  jumbo: "rgba(255,140,66,0.12)",
  dscr: "rgba(255,95,95,0.10)",
};
const BADGE_BORDER: Record<string, string> = {
  conventional: "rgba(61,139,255,0.3)",
  fha: "rgba(167,139,250,0.3)",
  va: "rgba(0,232,122,0.3)",
  jumbo: "rgba(255,140,66,0.3)",
  dscr: "rgba(255,95,95,0.3)",
};
const BADGE_COLOR: Record<string, string> = {
  conventional: "#3d8bff", fha: "#a78bfa",
  va: "#00e87a", jumbo: "#ff8c42", dscr: "#ff5f5f",
};

interface RespondModal {
  scenario: Scenario;
}

const SAMPLE_SCENARIOS: Scenario[] = [
  { id: "s1", loan_type: "jumbo", loan_purpose: "purchase", price_range: "$1.5M+", down_payment_pct: 25, income_range: "$200k+", credit_tier: "Excellent (740+)", timeline: "ASAP (under 30 days)", state: "CA", response_count: 1, max_responses: 3, already_responded: false, created_at: new Date(Date.now() - 2 * 3600000).toISOString(), has_card_data: true, card_price: 1800000, card_rate: 6.875, card_monthly: 9420 },
  { id: "s2", loan_type: "conventional", loan_purpose: "purchase", price_range: "$500k–$750k", down_payment_pct: 20, income_range: "$150k–$200k", credit_tier: "Good (700–739)", timeline: "1–2 months", state: "TX", response_count: 2, max_responses: 3, already_responded: false, created_at: new Date(Date.now() - 5 * 3600000).toISOString() },
  { id: "s3", loan_type: "fha", loan_purpose: "purchase", price_range: "$300k–$400k", down_payment_pct: 3.5, income_range: "$80k–$100k", credit_tier: "Fair (660–699)", timeline: "3–6 months", state: "FL", response_count: 0, max_responses: 3, already_responded: false, created_at: new Date(Date.now() - 8 * 3600000).toISOString() },
  { id: "s4", loan_type: "dscr", loan_purpose: "purchase", price_range: "$750k–$1M", down_payment_pct: 30, income_range: "$200k+", credit_tier: "Excellent (740+)", timeline: "1–2 months", state: "AZ", response_count: 1, max_responses: 2, already_responded: false, created_at: new Date(Date.now() - 24 * 3600000).toISOString() },
];

export default function LOScenariosPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<"board" | "referrals">("board");
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [referrals, setReferrals] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("All");
  const [filterState, setFilterState] = useState("");
  const [modal, setModal] = useState<RespondModal | null>(null);

  // Response form state
  const [rateEstimate, setRateEstimate] = useState("");
  const [approach, setApproach] = useState("");
  const [loName, setLoName] = useState("");
  const [loNmls, setLoNmls] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    load();
  }, [filterType, filterState]);

  // Redirect signed-out users to sign-in
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/sign-in?redirect_url=" + encodeURIComponent("/lo/scenarios"));
    }
  }, [isLoaded, isSignedIn, router]);

  // Load referrals once on mount (private scenarios — not filter-dependent)
  useEffect(() => {
    fetch("/api/scenarios?my_referrals=1")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setReferrals(d.scenarios ?? []); })
      .catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterType !== "All") params.set("loan_type", filterType);
    if (filterState) params.set("state", filterState);
    const res = await fetch(`/api/scenarios?${params}`);
    if (res.ok) {
      const data = await res.json();
      // Public board only — separate out private referrals
      setScenarios((data.scenarios ?? []).filter((s: Scenario) => s.visibility !== "private"));
      setReferrals(prev => {
        // Merge any private scenarios returned here with our existing referrals list
        const privates = (data.scenarios ?? []).filter((s: Scenario) => s.visibility === "private");
        const ids = new Set(prev.map(s => s.id));
        const merged = [...prev, ...privates.filter((s: Scenario) => !ids.has(s.id))];
        return merged;
      });
    }
    setLoading(false);
  }

  function openModal(scenario: Scenario) {
    setModal({ scenario });
    setRateEstimate(""); setApproach(""); setLoName(""); setLoNmls("");
    setSubmitError(""); setSubmitSuccess(false);
  }

  async function submitResponse() {
    if (!modal) return;
    setSubmitting(true);
    setSubmitError("");
    const res = await fetch(`/api/scenarios/${modal.scenario.id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rate_estimate: rateEstimate,
        approach,
        lo_name: loName,
        lo_nmls: loNmls,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSubmitError(data.error ?? "Failed to submit");
      setSubmitting(false);
      return;
    }
    setSubmitSuccess(true);
    setSubmitting(false);
    // Mark as responded in list
    setScenarios(prev => prev.map(s =>
      s.id === modal.scenario.id ? { ...s, already_responded: true, response_count: s.response_count + 1 } : s
    ));
  }

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return "just now";
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const timeLeft = (closes_at?: string) => {
    if (!closes_at) return null;
    const diff = new Date(closes_at).getTime() - Date.now();
    if (diff <= 0) return "Closing";
    const h = Math.ceil(diff / 3600000);
    if (h < 24) return `${h}h left`;
    return `${Math.ceil(h / 24)}d left`;
  };

  const filtered = scenarios.filter(s => !filterState || s.state === filterState);

  // Teaser view for signed-out users — sample board with lock overlay
  if (isLoaded && !isSignedIn) {
    return (
      <div className="los-root">
        <nav className="los-nav">
          <Link href="/" className="los-nav-logo">
            <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" />
          </Link>
          <Link href="/sign-in" className="los-nav-link" style={{ marginLeft: "auto" }}>Sign in →</Link>
        </nav>
        <div className="los-container" style={{ position: "relative" }}>
          <div className="los-header">
            <div>
              <h1 className="los-title">Match Board</h1>
              <p className="los-sub">Anonymous borrower scenarios open to verified professionals.</p>
            </div>
            <span className="los-stat" style={{ background: "rgba(0,232,122,0.1)", color: "#00e87a", border: "1px solid rgba(0,232,122,0.2)", borderRadius: 999, padding: "4px 14px", fontSize: "0.82rem", fontWeight: 700 }}>Live now</span>
          </div>
          {/* Sample scenario cards — blurred */}
          <div style={{ position: "relative" }}>
            <div style={{ filter: "blur(3px)", pointerEvents: "none", userSelect: "none", opacity: 0.7 }}>
              {SAMPLE_SCENARIOS.map(s => (
                <div key={s.id} className="los-card">
                  <div className="los-card-top">
                    <span className="los-badge" style={{ background: BADGE_BG[s.loan_type] ?? "rgba(255,255,255,0.08)", border: `1px solid ${BADGE_BORDER[s.loan_type] ?? "rgba(255,255,255,0.15)"}`, color: BADGE_COLOR[s.loan_type] ?? "#f0f4ff" }}>{LABEL_MAP[s.loan_type] ?? s.loan_type}</span>
                    <span className="los-card-state">{s.state}</span>
                    <span className="los-card-purpose">{s.loan_purpose}</span>
                    <span className="los-card-age" style={{ marginLeft: "auto" }}>{Math.round((Date.now() - new Date(s.created_at).getTime()) / 3600000)}h ago</span>
                  </div>
                  <div className="los-card-grid">
                    <div className="los-card-field"><div className="los-card-label">PRICE RANGE</div><div className="los-card-value">{s.price_range}</div></div>
                    <div className="los-card-field"><div className="los-card-label">DOWN</div><div className="los-card-value">{s.down_payment_pct}%</div></div>
                    <div className="los-card-field"><div className="los-card-label">CREDIT</div><div className="los-card-value">{s.credit_tier}</div></div>
                    <div className="los-card-field"><div className="los-card-label">TIMELINE</div><div className="los-card-value">{s.timeline}</div></div>
                  </div>
                  <div className="los-card-footer">
                    <span className="los-resp-count">{s.response_count}/{s.max_responses} responses</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Lock overlay */}
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
              <div style={{ background: "rgba(8,12,18,0.92)", backdropFilter: "blur(8px)", border: "1px solid rgba(0,232,122,0.2)", borderRadius: 20, padding: "32px 40px", textAlign: "center", maxWidth: 380 }}>
                <div style={{ fontSize: "2rem", marginBottom: 12 }}>🔒</div>
                <div style={{ fontFamily: "var(--font-dm-sans, sans-serif)", fontSize: "1.1rem", fontWeight: 700, color: "#f0f4ff", marginBottom: 8 }}>Verified professionals only</div>
                <div style={{ fontSize: "0.85rem", color: "#8fa3b8", marginBottom: 20, lineHeight: 1.5 }}>Create a free account to see live borrower scenarios and respond directly in your area.</div>
                <Link href="/sign-up" style={{ display: "inline-block", background: "#00e87a", color: "#080c12", fontWeight: 700, fontSize: "0.9rem", borderRadius: 999, padding: "10px 28px", textDecoration: "none" }}>Create free account →</Link>
                <div style={{ marginTop: 10, fontSize: "0.78rem", color: "#3a4560" }}>Already have an account? <Link href="/sign-in?redirect_url=/lo/scenarios" style={{ color: "#3d8bff" }}>Sign in</Link></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="los-root">

        <nav className="los-nav">
          <Link href="/lo/dashboard" className="los-nav-logo">
            <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" />
          </Link>
          <div className="los-nav-links">
            <Link href="/lo/dashboard" className="los-nav-link">Dashboard</Link>
            <Link href="/lo/borrowers" className="los-nav-link">Borrowers</Link>
            <Link href="/messages" className="los-nav-link">Messages</Link>
            <span className="los-nav-active">Scenario Board</span>
          </div>
          <AppNav drawerOnly />
        </nav>

        <div className="los-container">

          <div className="los-header">
            <div>
              <h1 className="los-title">{tab === "referrals" ? "My Referrals" : "Match Board"}</h1>
              <p className="los-sub">
                {tab === "referrals"
                  ? "Private scenarios from borrowers you referred. Only you can see these."
                  : "Anonymous borrower scenarios open to all verified professionals. Respond to earn an introduction."}
              </p>
            </div>
            <div className="los-stats">
              {tab === "board" && <span className="los-stat">{scenarios.filter(s => !s.already_responded).length} new</span>}
              {tab === "referrals" && referrals.length > 0 && <span className="los-stat los-stat-private">🔒 {referrals.length} private</span>}
            </div>
          </div>

          {/* Tab switcher */}
          <div className="los-tabs">
            <button
              className={`los-tab ${tab === "board" ? "active" : ""}`}
              onClick={() => setTab("board")}
            >
              Match Board
              {scenarios.filter(s => !s.already_responded).length > 0 && (
                <span className="los-tab-badge">{scenarios.filter(s => !s.already_responded).length}</span>
              )}
            </button>
            <button
              className={`los-tab ${tab === "referrals" ? "active" : ""}`}
              onClick={() => setTab("referrals")}
            >
              My Referrals
              {referrals.length > 0 && <span className="los-tab-badge los-tab-badge-private">{referrals.length}</span>}
            </button>
          </div>

          {/* Filters — only on Match Board tab */}
          {tab === "board" && (
            <div className="los-filters">
              <div className="los-filter-group">
                {LOAN_TYPES.map(t => (
                  <button
                    key={t}
                    className={`los-filter-chip ${filterType === t ? "active" : ""}`}
                    onClick={() => setFilterType(t)}
                  >
                    {t === "All" ? "All types" : LABEL_MAP[t]}
                  </button>
                ))}
              </div>
              <input
                className="los-state-input"
                placeholder="Filter by state (e.g. CA)"
                value={filterState}
                onChange={e => setFilterState(e.target.value.toUpperCase().slice(0, 2))}
                maxLength={2}
              />
            </div>
          )}

          {/* My Referrals tab */}
          {tab === "referrals" && (
            referrals.length === 0 ? (
              <div className="los-empty">
                <div className="los-empty-icon">🔒</div>
                <p>No private referrals yet.</p>
                <p className="los-empty-sub">When you invite a borrower and they post a scenario, it will appear here — exclusively for you.</p>
              </div>
            ) : (
              <div className="los-board">
                {referrals.map(s => (
                  <div key={s.id} className="los-card los-card-private" onClick={() => openModal(s)}>
                    <div className="los-card-private-badge">🔒 Private — only you</div>
                    <div className="los-card-top">
                      <span className="los-loan-badge">{LABEL_MAP[s.loan_type] ?? s.loan_type}</span>
                      <span className="los-state-badge">{s.state}</span>
                      {s.has_card_data && <span className="los-ai-badge">⚡ AI card</span>}
                    </div>
                    <div className="los-card-grid">
                      <div className="los-card-field"><div className="los-card-label">Price</div><div className="los-card-value">{s.price_range}</div></div>
                      <div className="los-card-field"><div className="los-card-label">Down</div><div className="los-card-value">{s.down_payment_pct}%</div></div>
                      <div className="los-card-field"><div className="los-card-label">Credit</div><div className="los-card-value">{s.credit_tier?.split(" ")[0]}</div></div>
                      <div className="los-card-field"><div className="los-card-label">Timeline</div><div className="los-card-value">{s.timeline?.split(" ")[0]}</div></div>
                    </div>
                    <div className="los-card-footer">
                      {s.already_responded
                        ? <span className="los-responded-badge">✓ Responded</span>
                        : <span className="los-respond-cta">View & respond →</span>}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Match Board tab */}
          {tab === "board" && loading ? (
            <div className="los-loading">Loading scenarios...</div>
          ) : tab === "board" && filtered.length === 0 ? (
            <div className="los-empty">
              <div className="los-empty-icon">📋</div>
              <p>No active scenarios match your filters. Check back soon.</p>
            </div>
          ) : (
            <div className="los-grid">
              {filtered.map(scenario => (
                <div key={scenario.id} className={`los-card ${scenario.already_responded ? "los-card-done" : ""}`}>
                  <div className="los-card-header">
                    <span
                      className="los-loan-badge"
                      style={{
                        background: BADGE_BG[scenario.loan_type] ?? "rgba(61,139,255,0.12)",
                        borderColor: BADGE_BORDER[scenario.loan_type] ?? "rgba(61,139,255,0.3)",
                        color: BADGE_COLOR[scenario.loan_type] ?? "#3d8bff",
                      }}
                    >
                      {LABEL_MAP[scenario.loan_type] ?? scenario.loan_type}
                    </span>
                    <span className="los-card-state">{scenario.state}</span>
                    <span className="los-card-purpose">{scenario.loan_purpose}</span>
                    <span className="los-card-time">{timeAgo(scenario.created_at)}</span>
                  </div>

                  <div className="los-card-grid">
                    <div className="los-card-field">
                      <div className="los-cf-label">Price range</div>
                      <div className="los-cf-value">{scenario.price_range}</div>
                    </div>
                    <div className="los-card-field">
                      <div className="los-cf-label">Down</div>
                      <div className="los-cf-value">{scenario.down_payment_pct}%</div>
                    </div>
                    <div className="los-card-field">
                      <div className="los-cf-label">Credit</div>
                      <div className="los-cf-value">{scenario.credit_tier}</div>
                    </div>
                    <div className="los-card-field">
                      <div className="los-cf-label">Timeline</div>
                      <div className="los-cf-value">{scenario.timeline}</div>
                    </div>
                    {scenario.income_range && (
                      <div className="los-card-field">
                        <div className="los-cf-label">Income</div>
                        <div className="los-cf-value">{scenario.income_range}</div>
                      </div>
                    )}
                    <div className="los-card-field">
                      <div className="los-cf-label">Purpose</div>
                      <div className="los-cf-value">{scenario.loan_purpose}</div>
                    </div>
                  </div>

                  {/* AI card data badge */}
                  {scenario.has_card_data && (
                    <div className="los-card-ai-badge">
                      <span className="los-card-ai-icon">⚡</span>
                      <span>AI analysis attached</span>
                      <span className="los-card-ai-nums">
                        {scenario.card_rate ? `${scenario.card_rate.toFixed(2)}%` : ""}
                        {scenario.card_monthly ? ` · $${Math.round(scenario.card_monthly).toLocaleString()}/mo` : ""}
                      </span>
                    </div>
                  )}

                  {scenario.notes && (
                    <p className="los-card-note">"{scenario.notes}"</p>
                  )}

                  <div className="los-card-footer">
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span className="los-card-responses">
                        {scenario.response_count}{scenario.max_responses ? `/${scenario.max_responses}` : ""} response{scenario.response_count !== 1 ? "s" : ""}
                      </span>
                      {scenario.closes_at && (
                        <span className="los-card-timeleft">{timeLeft(scenario.closes_at)}</span>
                      )}
                    </div>
                    {scenario.already_responded ? (
                      <span className="los-responded-badge">✓ Responded</span>
                    ) : scenario.max_responses && scenario.response_count >= scenario.max_responses ? (
                      <span className="los-full-badge">Response limit reached</span>
                    ) : (
                      <button className="los-respond-btn" onClick={() => openModal(scenario)}>
                        Respond →
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Response Modal */}
        {modal && (
          <div className="los-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
            <div className="los-modal">
              {submitSuccess ? (
                <div className="los-modal-success">
                  <div className="los-modal-success-icon">✓</div>
                  <h3>Response submitted</h3>
                  <p>
                    The borrower will see your response and compare it against their HomeRates.ai analysis.
                    If they choose you, you'll receive their contact info by email.
                  </p>
                  <button className="los-modal-close-btn" onClick={() => setModal(null)}>Done</button>
                </div>
              ) : (
                <>
                  <div className="los-modal-header">
                    <div>
                      <h3 className="los-modal-title">Respond to scenario</h3>
                      <p className="los-modal-sub">
                        {LABEL_MAP[modal.scenario.loan_type]} · {modal.scenario.price_range} · {modal.scenario.state}
                        {modal.scenario.closes_at && (
                          <span className="los-modal-timeleft"> · {timeLeft(modal.scenario.closes_at)}</span>
                        )}
                      </p>
                    </div>
                    <button className="los-modal-x" onClick={() => setModal(null)}>✕</button>
                  </div>

                  {/* Full scenario breakdown */}
                  <div className="los-modal-scenario">

                    {/* AI card block — shown when borrower posted from analysis */}
                    {modal.scenario.has_card_data && (
                      <div className="los-ms-card-block">
                        <div className="los-ms-card-label">⚡ Borrower's AI analysis — real numbers</div>
                        <div className="los-ms-card-row">
                          {modal.scenario.card_price && (
                            <div className="los-ms-card-stat">
                              <span className="los-ms-label">Purchase price</span>
                              <span className="los-ms-card-val">${Math.round(modal.scenario.card_price).toLocaleString()}</span>
                            </div>
                          )}
                          {modal.scenario.card_dp_pct && modal.scenario.card_price && (
                            <div className="los-ms-card-stat">
                              <span className="los-ms-label">Down payment</span>
                              <span className="los-ms-card-val">
                                {modal.scenario.card_dp_pct}% · ${Math.round(modal.scenario.card_price * modal.scenario.card_dp_pct / 100).toLocaleString()}
                              </span>
                            </div>
                          )}
                          {modal.scenario.card_price && modal.scenario.card_dp_pct && (
                            <div className="los-ms-card-stat">
                              <span className="los-ms-label">Loan amount</span>
                              <span className="los-ms-card-val">
                                ${Math.round(modal.scenario.card_price * (1 - modal.scenario.card_dp_pct / 100)).toLocaleString()}
                              </span>
                            </div>
                          )}
                          {modal.scenario.card_rate && (
                            <div className="los-ms-card-stat">
                              <span className="los-ms-label">AI rate estimate</span>
                              <span className="los-ms-card-val los-ms-card-rate">{modal.scenario.card_rate.toFixed(3)}%</span>
                            </div>
                          )}
                          {modal.scenario.card_monthly && (
                            <div className="los-ms-card-stat">
                              <span className="los-ms-label">Est. P&amp;I / mo</span>
                              <span className="los-ms-card-val">${Math.round(modal.scenario.card_monthly).toLocaleString()}</span>
                            </div>
                          )}
                          {modal.scenario.card_term && (
                            <div className="los-ms-card-stat">
                              <span className="los-ms-label">Term</span>
                              <span className="los-ms-card-val">{modal.scenario.card_term}-year</span>
                            </div>
                          )}
                        </div>
                        <p className="los-ms-card-note">
                          The borrower ran this through HomeRates.ai before posting. Beat or match this rate to earn the introduction.
                        </p>
                      </div>
                    )}

                    <div className="los-ms-header">Borrower profile</div>
                    <div className="los-ms-grid">
                      <div>
                        <span className="los-ms-label">Price range</span>
                        <span className="los-ms-val">{modal.scenario.price_range}</span>
                      </div>
                      <div>
                        <span className="los-ms-label">Down</span>
                        <span className="los-ms-val">{modal.scenario.down_payment_pct}%</span>
                      </div>
                      <div>
                        <span className="los-ms-label">Credit</span>
                        <span className="los-ms-val">{modal.scenario.credit_tier}</span>
                      </div>
                      <div>
                        <span className="los-ms-label">Timeline</span>
                        <span className="los-ms-val">{modal.scenario.timeline}</span>
                      </div>
                      {modal.scenario.income_range && (
                        <div>
                          <span className="los-ms-label">Income</span>
                          <span className="los-ms-val">{modal.scenario.income_range}</span>
                        </div>
                      )}
                      <div>
                        <span className="los-ms-label">Purpose</span>
                        <span className="los-ms-val">{modal.scenario.loan_purpose}</span>
                      </div>
                    </div>
                    {modal.scenario.notes && (
                      <p className="los-ms-note">"{modal.scenario.notes}"</p>
                    )}
                    {modal.scenario.max_responses && (
                      <p className="los-ms-slots">
                        {modal.scenario.max_responses - modal.scenario.response_count} response slot{(modal.scenario.max_responses - modal.scenario.response_count) !== 1 ? "s" : ""} remaining — borrower set a max of {modal.scenario.max_responses}
                      </p>
                    )}
                  </div>

                  <div className="los-modal-fields">
                    <div className="los-mf">
                      <label>Your name <span className="los-mf-req">*</span></label>
                      <input
                        className="los-input"
                        placeholder="First name only is fine"
                        value={loName}
                        onChange={e => setLoName(e.target.value)}
                      />
                    </div>
                    <div className="los-mf">
                      <label>NMLS # <span className="los-mf-req">*</span></label>
                      <input
                        className="los-input"
                        placeholder="123456"
                        value={loNmls}
                        onChange={e => setLoNmls(e.target.value.replace(/\D/g, ""))}
                      />
                    </div>
                    <div className="los-mf">
                      <label>Rate estimate <span className="los-mf-req">*</span></label>
                      <input
                        className="los-input"
                        placeholder="e.g. 6.50%–6.75%"
                        value={rateEstimate}
                        onChange={e => setRateEstimate(e.target.value)}
                      />
                      <span className="los-mf-hint">The borrower will compare this to their HomeRates.ai analysis. Be accurate.</span>
                    </div>
                    <div className="los-mf">
                      <label>Your approach <span className="los-mf-req">*</span></label>
                      <textarea
                        className="los-textarea"
                        placeholder={`Tell the borrower:\n• Why you're the right LO for this loan type and scenario\n• Estimated closing costs or lender fees at this rate\n• Your turn time and what to expect\n• Any key conditions or caveats they should know\n\nMax 800 characters — be specific, not generic.`}
                        maxLength={800}
                        rows={8}
                        value={approach}
                        onChange={e => setApproach(e.target.value)}
                      />
                      <div className="los-mf-footer">
                        <span className="los-mf-hint">The borrower compares your response against their HomeRates.ai analysis. Specific details earn the introduction.</span>
                        <span className="los-mf-count">{approach.length}/800</span>
                      </div>
                    </div>
                  </div>

                  {submitError && <div className="los-modal-error">{submitError}</div>}

                  <div className="los-modal-footer">
                    <button className="los-modal-cancel" onClick={() => setModal(null)}>Cancel</button>
                    <button
                      className="los-modal-submit"
                      disabled={submitting || !rateEstimate || !approach || !loName || !loNmls}
                      onClick={submitResponse}
                    >
                      {submitting ? "Submitting..." : "Submit Response →"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

      </div>

      <style>{`
        body:has(.los-root) {
          display: block !important; height: auto !important;
          overflow-y: auto !important; background: #080c12 !important;
        }
        html:has(.los-root) { background: #080c12 !important; height: auto !important; overflow-y: auto !important; }
        body:has(.los-root) .app-footer { display: none; }

        .los-root { font-family: 'DM Sans', system-ui, sans-serif; color: #f0f4ff; min-height: 100vh; background: #080c12; }

        .los-nav {
          position: sticky; top: 0; z-index: 100;
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 24px;
          background: rgba(8,12,18,0.95); backdrop-filter: blur(8px);
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .los-nav-logo img { height: 28px; }
        .los-nav-links { display: flex; align-items: center; gap: 20px; }
        .los-nav-link { color: #8fa3b8; text-decoration: none; font-size: 0.875rem; transition: color 0.15s; }
        .los-nav-link:hover { color: #f0f4ff; }
        .los-nav-active { font-size: 0.875rem; color: #f0f4ff; font-weight: 600; }
        @media (max-width: 640px) { .los-nav-links { display: none; } }

        .los-container { max-width: 960px; margin: 0 auto; padding: 3rem 1.5rem 5rem; }

        .los-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 2rem; }
        .los-title { font-family: 'DM Sans', sans-serif; font-size: 1.75rem; font-weight: 700; margin: 0 0 0.3rem; }
        .los-sub { font-size: 0.9rem; color: #8fa3b8; margin: 0; }
        .los-stat {
          font-size: 0.82rem; font-weight: 700; color: #00e87a;
          background: rgba(0,232,122,0.1); border: 1px solid rgba(0,232,122,0.25);
          border-radius: 99px; padding: 4px 14px;
        }

        .los-filters { display: flex; align-items: center; gap: 12px; margin-bottom: 1.75rem; flex-wrap: wrap; }
        .los-filter-group { display: flex; gap: 8px; flex-wrap: wrap; }
        .los-filter-chip {
          padding: 6px 14px; border-radius: 99px;
          border: 1px solid rgba(255,255,255,0.08); background: transparent;
          color: #8fa3b8; font-size: 0.82rem; cursor: pointer; transition: all 0.15s;
        }
        .los-filter-chip:hover { border-color: rgba(255,255,255,0.2); color: #f0f4ff; }
        .los-filter-chip.active { background: rgba(0,232,122,0.1); border-color: rgba(0,232,122,0.35); color: #00e87a; font-weight: 600; }
        .los-state-input {
          padding: 6px 12px; border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.08); background: #0e1420;
          color: #f0f4ff; font-size: 0.85rem; width: 80px; outline: none;
          text-transform: uppercase;
        }
        .los-state-input:focus { border-color: rgba(0,232,122,0.35); }

        .los-loading, .los-empty { text-align: center; padding: 4rem 0; color: #8fa3b8; }
        .los-empty-icon { font-size: 2rem; margin-bottom: 0.75rem; }
        .los-empty-sub { font-size: 0.82rem; color: #3a4560; margin-top: 0.5rem; max-width: 340px; margin-left: auto; margin-right: auto; }

        /* Tab switcher */
        .los-tabs {
          display: flex; gap: 4px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          margin-bottom: 1.25rem;
        }
        .los-tab {
          padding: 10px 18px; border: none; background: none;
          color: #8fa3b8; font-size: 0.875rem; font-weight: 600;
          cursor: pointer; border-bottom: 2px solid transparent;
          margin-bottom: -1px; display: flex; align-items: center; gap: 7px;
          transition: color 0.15s;
        }
        .los-tab:hover { color: #f0f4ff; }
        .los-tab.active { color: #f0f4ff; border-bottom-color: #00e87a; }
        .los-tab-badge {
          background: #3d8bff; color: #fff;
          font-size: 0.68rem; font-weight: 800;
          border-radius: 99px; padding: 1px 7px;
        }
        .los-tab-badge-private { background: #ff8c42; }

        /* Private referral cards */
        .los-board { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
        .los-card-private {
          background: rgba(255,140,66,0.04);
          border: 1px solid rgba(255,140,66,0.25) !important;
          cursor: pointer;
        }
        .los-card-private:hover { border-color: rgba(255,140,66,0.5) !important; }
        .los-card-private-badge {
          font-size: 0.7rem; font-weight: 700; color: #ff8c42;
          text-transform: uppercase; letter-spacing: 0.06em;
          margin-bottom: 10px;
        }
        .los-card-top { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
        .los-card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
        .los-card-label { font-size: 0.68rem; color: #3a4560; text-transform: uppercase; letter-spacing: 0.05em; }
        .los-card-value { font-size: 0.88rem; font-weight: 600; color: #f0f4ff; }
        .los-card-footer { display: flex; align-items: center; justify-content: flex-end; }
        .los-respond-cta { font-size: 0.8rem; color: #00e87a; font-weight: 600; }
        .los-responded-badge { font-size: 0.78rem; color: #3a4560; }
        .los-stat-private { color: #ff8c42 !important; border-color: rgba(255,140,66,0.25) !important; }

        .los-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }

        .los-card {
          background: #0e1420;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px; padding: 1.25rem;
          transition: border-color 0.15s;
        }
        .los-card:hover { border-color: rgba(255,255,255,0.15); }
        .los-card-done { opacity: 0.6; }

        .los-card-header {
          display: flex; align-items: center; gap: 8px;
          margin-bottom: 1rem; flex-wrap: wrap;
        }
        .los-loan-badge {
          font-size: 0.72rem; font-weight: 700; padding: 3px 10px;
          border-radius: 99px; border: 1px solid;
        }
        .los-card-state { font-size: 0.82rem; font-weight: 600; color: #f0f4ff; }
        .los-card-purpose { font-size: 0.75rem; color: #8fa3b8; }
        .los-card-time { font-size: 0.72rem; color: #3a4560; margin-left: auto; }

        .los-card-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 0.75rem; }
        .los-cf-label { font-size: 0.68rem; color: #3a4560; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 2px; }
        .los-cf-value { font-size: 0.88rem; font-weight: 600; color: #f0f4ff; }

        /* AI card badge on board card */
        .los-card-ai-badge {
          display: flex; align-items: center; gap: 6px;
          font-size: 0.75rem; font-weight: 600; color: #00e87a;
          background: rgba(0,232,122,0.07); border: 1px solid rgba(0,232,122,0.2);
          border-radius: 8px; padding: 6px 10px; margin-bottom: 0.6rem;
        }
        .los-card-ai-icon { font-size: 0.85rem; }
        .los-card-ai-nums { margin-left: auto; font-weight: 700; color: #00e87a; }

        .los-card-note { font-size: 0.8rem; color: #8fa3b8; font-style: italic; margin: 0 0 0.75rem; line-height: 1.45; }

        .los-card-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.06); }
        .los-card-responses { font-size: 0.75rem; color: #3a4560; }
        .los-card-timeleft { font-size: 0.72rem; color: #ff8c42; margin-top: 2px; }
        .los-full-badge { font-size: 0.75rem; color: #3a4560; }
        .los-respond-btn {
          padding: 7px 18px; background: #00e87a; color: #080c12;
          border: none; border-radius: 999px;
          font-size: 0.82rem; font-weight: 700; cursor: pointer; transition: opacity 0.15s;
        }
        .los-respond-btn:hover { opacity: 0.88; }
        .los-responded-badge { font-size: 0.78rem; color: #00e87a; font-weight: 600; }

        /* Modal */
        .los-modal-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(8,12,18,0.85); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center; padding: 1rem;
        }
        .los-modal {
          background: #0e1420; border: 1px solid rgba(255,255,255,0.10);
          border-radius: 20px; padding: 2rem;
          width: 100%; max-width: 660px;
          max-height: 92vh; overflow-y: auto;
        }
        .los-modal-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; }
        .los-modal-title { font-family: 'DM Sans', sans-serif; font-size: 1.2rem; font-weight: 700; margin: 0 0 3px; }
        .los-modal-sub { font-size: 0.82rem; color: #8fa3b8; margin: 0; }
        .los-modal-x { background: none; border: none; color: #3a4560; font-size: 1.1rem; cursor: pointer; padding: 4px; }
        .los-modal-x:hover { color: #f0f4ff; }

        .los-modal-scenario {
          background: #141b28; border-radius: 12px; padding: 1.25rem;
          margin-bottom: 1.5rem; border: 1px solid rgba(255,255,255,0.06);
        }
        /* AI card block inside modal */
        .los-ms-card-block {
          background: rgba(0,232,122,0.05);
          border: 1px solid rgba(0,232,122,0.2);
          border-radius: 10px; padding: 1rem;
          margin-bottom: 1.25rem;
        }
        .los-ms-card-label {
          font-size: 0.72rem; font-weight: 700; color: #00e87a;
          text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 0.75rem;
        }
        .los-ms-card-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 0.75rem; }
        .los-ms-card-stat { display: flex; flex-direction: column; gap: 2px; }
        .los-ms-card-val { font-size: 0.95rem; font-weight: 700; color: #f0f4ff; }
        .los-ms-card-rate { color: #00e87a; font-size: 1.05rem; }
        .los-ms-card-note {
          font-size: 0.78rem; color: rgba(0,232,122,0.6);
          margin: 0; line-height: 1.5; border-top: 1px solid rgba(0,232,122,0.12);
          padding-top: 0.6rem;
        }

        .los-ms-header {
          font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em;
          text-transform: uppercase; color: #3a4560;
          margin-bottom: 0.75rem;
        }
        .los-ms-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 0.75rem; }
        .los-ms-label { display: block; font-size: 0.68rem; color: #3a4560; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
        .los-ms-val { font-size: 0.88rem; font-weight: 600; color: #f0f4ff; }
        .los-ms-note { font-size: 0.82rem; color: #8fa3b8; font-style: italic; margin: 0.75rem 0 0; line-height: 1.5; }
        .los-ms-slots {
          font-size: 0.78rem; color: #ff8c42;
          margin: 0.5rem 0 0; background: rgba(255,140,66,0.08);
          border: 1px solid rgba(255,140,66,0.2); border-radius: 7px;
          padding: 6px 10px;
        }
        .los-modal-timeleft { color: #ff8c42; font-size: 0.8rem; }

        .los-modal-fields { display: flex; flex-direction: column; gap: 1rem; }
        .los-mf { display: flex; flex-direction: column; }
        .los-mf label { font-size: 0.78rem; font-weight: 600; color: #8fa3b8; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
        .los-mf-req { color: #ff5f5f; }
        .los-input, .los-textarea {
          padding: 10px 14px; background: #141b28;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px; color: #f0f4ff; font-size: 0.9rem;
          outline: none; font-family: inherit;
        }
        .los-input:focus, .los-textarea:focus { border-color: rgba(0,232,122,0.4); }
        .los-textarea { resize: vertical; line-height: 1.5; }
        .los-mf-hint { font-size: 0.75rem; color: #3a4560; line-height: 1.4; }
        .los-mf-footer { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-top: 5px; }
        .los-mf-count { font-size: 0.72rem; color: #3a4560; white-space: nowrap; flex-shrink: 0; }

        .los-modal-error {
          font-size: 0.85rem; color: #ff5f5f;
          background: rgba(255,95,95,0.08); border: 1px solid rgba(255,95,95,0.2);
          border-radius: 8px; padding: 10px 14px; margin-top: 1rem;
        }

        .los-modal-footer {
          display: flex; justify-content: flex-end; gap: 10px;
          margin-top: 1.5rem; padding-top: 1.25rem;
          border-top: 1px solid rgba(255,255,255,0.07);
        }
        .los-modal-cancel {
          padding: 10px 20px; background: transparent;
          border: 1px solid rgba(255,255,255,0.10); color: #8fa3b8;
          border-radius: 999px; font-size: 0.875rem; cursor: pointer;
        }
        .los-modal-cancel:hover { border-color: rgba(255,255,255,0.2); color: #f0f4ff; }
        .los-modal-submit {
          padding: 10px 24px; background: #00e87a; color: #080c12;
          border: none; border-radius: 999px;
          font-size: 0.9rem; font-weight: 700; cursor: pointer; transition: opacity 0.15s;
        }
        .los-modal-submit:disabled { opacity: 0.4; cursor: not-allowed; }
        .los-modal-submit:not(:disabled):hover { opacity: 0.88; }

        .los-modal-success { text-align: center; padding: 1rem 0; }
        .los-modal-success-icon {
          width: 56px; height: 56px; border-radius: 50%;
          background: rgba(0,232,122,0.12); color: #00e87a;
          display: flex; align-items: center; justify-content: center;
          font-size: 1.5rem; font-weight: 700; margin: 0 auto 1rem;
        }
        .los-modal-success h3 { font-family: 'DM Sans', sans-serif; font-size: 1.2rem; margin: 0 0 0.75rem; }
        .los-modal-success p { font-size: 0.9rem; color: #8fa3b8; line-height: 1.6; margin: 0 0 1.5rem; }
        .los-modal-close-btn {
          padding: 10px 28px; background: #00e87a; color: #080c12;
          border: none; border-radius: 999px; font-weight: 700;
          font-size: 0.9rem; cursor: pointer;
        }

        @media (max-width: 600px) {
          .los-grid { grid-template-columns: 1fr; }
          .los-header { flex-direction: column; gap: 12px; }
        }
      `}</style>
    </>
  );
}
