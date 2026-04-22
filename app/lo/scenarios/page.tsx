"use client";
// app/lo/scenarios/page.tsx
// LO board: see anonymous borrower scenarios and respond

import { useEffect, useRef, useState } from "react";
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
  is_mine?: boolean;
  visibility?: string;
  referred_pro_id?: string;
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

interface MyPipelineEntry {
  id: string;
  rate_estimate: string;
  approach: string;
  responder_type: string;
  status: string;
  created_at: string;
  scenario_id: string;
  scenario_briefs: {
    id: string;
    loan_type: string;
    loan_purpose: string;
    price_range: string;
    state: string;
    status: string;
    response_count: number;
    max_responses: number;
    closes_at: string;
    created_at: string;
  } | null;
}

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
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [myPipeline, setMyPipeline] = useState<MyPipelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("All");
  const [filterState, setFilterState] = useState("");
  const [sort, setSort] = useState<"newest" | "closing_soon" | "most_active">("newest");
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [modal, setModal] = useState<RespondModal | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [filledIds, setFilledIds] = useState<Set<string>>(new Set());
  const prevScenariosRef = useRef<Scenario[]>([]);

  // Response form state
  const [rateEstimate, setRateEstimate] = useState("");
  const [approach, setApproach] = useState("");
  const [loName, setLoName] = useState("");
  const [loNmls, setLoNmls] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const [loProfile, setLoProfile] = useState<{ full_name: string; nmls: string; license_state: string; is_agent: boolean } | null>(null);
  type GateStatus = "loading" | "ok" | "not-lo" | "no-nmls" | "no-plan";
  const [gateStatus, setGateStatus] = useState<GateStatus>("loading");

  // Load + 30s auto-refresh; resets timer on filter change
  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterState, sort]);

  // Fetch profile — gate check + form pre-fill + state default (supports both LO and Agent)
  useEffect(() => {
    fetch("/api/profile")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) { setGateStatus("not-lo"); return; }
        const isAgent = d.role === "agent" || !!d.agent;
        const isLO    = d.isLO || d.role === "lo" || !!d.lo;
        if (!isLO && !isAgent) { setGateStatus("not-lo"); return; }
        // LOs need NMLS; agents need DRE license
        if (isLO    && !d.lo?.nmls)       { setGateStatus("no-nmls"); return; }
        if (isAgent && !d.agent?.license) { setGateStatus("no-nmls"); return; }
        if (d.plan !== "pro") { setGateStatus("no-plan"); return; }
        const licenseState = d.lo?.license_state ?? "";
        const licenseNum   = isAgent ? (d.agent?.license ?? "") : (d.lo?.nmls ?? "");
        setLoProfile({ full_name: d.full_name ?? d.clerkName ?? "", nmls: licenseNum, license_state: licenseState, is_agent: isAgent });
        if (licenseState) setFilterState(licenseState);
        setGateStatus("ok");
      })
      .catch(() => setGateStatus("not-lo"));
  }, []);

  // Redirect signed-out users
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/sign-in?redirect_url=" + encodeURIComponent("/lo/scenarios"));
    }
  }, [isLoaded, isSignedIn, router]);

  // Load My Pipeline once on mount
  useEffect(() => {
    fetch("/api/scenarios?my_responses=1")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setMyPipeline(d.responses ?? []); })
      .catch(() => {});
  }, []);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    const params = new URLSearchParams();
    if (filterType !== "All") params.set("loan_type", filterType);
    if (filterState) params.set("state", filterState);
    if (sort !== "newest") params.set("sort", sort);
    const res = await fetch(`/api/scenarios?${params}`);
    if (res.ok) {
      const data = await res.json();
      const incoming = (data.scenarios ?? []) as Scenario[];

      // Detect scenarios that filled since last poll — show 3s overlay before removing
      const prevIds = new Set(prevScenariosRef.current.map(s => s.id));
      const incomingIds = new Set(incoming.map(s => s.id));
      const justFilled = prevScenariosRef.current
        .filter(s => prevIds.has(s.id) && !incomingIds.has(s.id))
        .map(s => s.id);

      if (justFilled.length > 0) {
        setFilledIds(new Set(justFilled));
        setTimeout(() => {
          setFilledIds(new Set());
          setScenarios(incoming);
          prevScenariosRef.current = incoming;
        }, 3000);
      } else {
        setScenarios(incoming);
        prevScenariosRef.current = incoming;
      }
      setLastRefreshed(new Date());
    }
    if (!silent) setLoading(false);
  }

  function openModal(scenario: Scenario) {
    setModal({ scenario });
    setApproach("");
    setSubmitError(""); setSubmitSuccess(false);
    setLoName(loProfile?.full_name ?? "");
    setLoNmls(loProfile?.nmls ?? "");
    setRateEstimate(scenario.card_rate ? `${scenario.card_rate.toFixed(2)}%` : "");
  }

  async function submitResponse() {
    if (!modal) return;
    setSubmitting(true);
    setSubmitError("");

    // Pre-flight: verify scenario is still accepting responses
    try {
      const check = await fetch(`/api/scenarios/${modal.scenario.id}`);
      if (check.ok) {
        const checkData = await check.json();
        const sc = checkData.scenario;
        if (sc && (sc.status !== "active" || (sc.response_count ?? 0) >= (sc.max_responses ?? 3))) {
          setSubmitError("This scenario just filled while you were composing. Try another.");
          setScenarios(prev => prev.filter(p => p.id !== modal.scenario.id));
          setModal(null);
          setSubmitting(false);
          return;
        }
      }
    } catch {
      // Network hiccup — proceed and let the server reject if needed
    }

    const res = await fetch(`/api/scenarios/${modal.scenario.id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rate_estimate: rateEstimate,
        approach,
        lo_name: loName,
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
    setScenarios(prev => prev.map(s =>
      s.id === modal.scenario.id ? { ...s, already_responded: true, response_count: s.response_count + 1 } : s
    ));
    // Refresh pipeline list after successful response
    fetch("/api/scenarios?my_responses=1")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setMyPipeline(d.responses ?? []); })
      .catch(() => {});
  }

  async function withdrawResponse(scenarioId: string) {
    setWithdrawingId(scenarioId);
    const res = await fetch(`/api/scenarios/${scenarioId}/respond`, { method: "DELETE" });
    if (res.ok) {
      setMyPipeline(prev => prev.filter(r => r.scenario_id !== scenarioId));
    }
    setWithdrawingId(null);
  }

  function getStatusBadge(s: Scenario): { label: string; color: string; bg: string; border: string } {
    const hoursLeft = s.closes_at ? (new Date(s.closes_at).getTime() - Date.now()) / 3600000 : Infinity;
    const fillPct = s.max_responses ? s.response_count / s.max_responses : 0;
    if (fillPct >= 0.75 || hoursLeft < 6) return { label: "Closing Soon", color: "#ff8c42", bg: "rgba(255,140,66,0.1)", border: "rgba(255,140,66,0.3)" };
    if (s.response_count > 0) return { label: "Filling Up", color: "#ffd166", bg: "rgba(255,180,0,0.08)", border: "rgba(255,180,0,0.25)" };
    return { label: "Open", color: "#00e87a", bg: "rgba(0,232,122,0.1)", border: "rgba(0,232,122,0.3)" };
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

  const shortlistedCount = myPipeline.filter(r =>
    r.scenario_briefs?.status === "matched" && r.status !== "invited"
  ).length;

  // Teaser view for signed-out users
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
              <h1 className="los-title">The Private Exchange</h1>
              <p className="los-sub">Anonymous borrower scenarios open to professionals on HomeRates.ai.</p>
            </div>
            <span className="los-stat">Live now</span>
          </div>
          <div style={{ position: "relative" }}>
            <div style={{ filter: "blur(3px)", pointerEvents: "none", userSelect: "none", opacity: 0.7 }}>
              {SAMPLE_SCENARIOS.map(s => (
                <div key={s.id} className="los-card">
                  <div className="los-card-top">
                    <span className="los-badge" style={{ background: BADGE_BG[s.loan_type] ?? "rgba(255,255,255,0.08)", border: `1px solid ${BADGE_BORDER[s.loan_type] ?? "rgba(255,255,255,0.15)"}`, color: BADGE_COLOR[s.loan_type] ?? "#f0f4ff" }}>{LABEL_MAP[s.loan_type] ?? s.loan_type}</span>
                    <span className="los-card-state">{s.state}</span>
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
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
              <div style={{ background: "rgba(8,12,18,0.92)", backdropFilter: "blur(8px)", border: "1px solid rgba(0,232,122,0.2)", borderRadius: 20, padding: "32px 40px", textAlign: "center", maxWidth: 380 }}>
                <div style={{ fontSize: "2rem", marginBottom: 12 }}>🔒</div>
                <div style={{ fontFamily: "var(--font-dm-sans, sans-serif)", fontSize: "1.1rem", fontWeight: 700, color: "#f0f4ff", marginBottom: 8 }}>For registered professionals</div>
                <div style={{ fontSize: "0.85rem", color: "#8fa3b8", marginBottom: 20, lineHeight: 1.5 }}>Create a free account to see live borrower scenarios and respond directly in your area.</div>
                <Link href="/sign-up" style={{ display: "inline-block", background: "#00e87a", color: "#080c12", fontWeight: 700, fontSize: "0.9rem", borderRadius: 999, padding: "10px 28px", textDecoration: "none" }}>Create free account →</Link>
                <div style={{ marginTop: 10, fontSize: "0.78rem", color: "#3a4560" }}>Already have an account? <Link href="/sign-in?redirect_url=/lo/scenarios" style={{ color: "#3d8bff" }}>Sign in</Link></div>
              </div>
            </div>
          </div>
        </div>
        <style>{`body:has(.los-root){display:block!important;height:auto!important;overflow-y:auto!important;background:#080c12!important}`}</style>
      </div>
    );
  }

  if (gateStatus === "loading" && isLoaded && isSignedIn) {
    return (
      <div className="los-root">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", color: "#8fa3b8" }}>
          Verifying access...
        </div>
        <style>{`body:has(.los-root){display:block!important;height:auto!important;overflow-y:auto!important;background:#080c12!important}`}</style>
      </div>
    );
  }

  const GATE_MESSAGES: Record<string, { icon: string; title: string; body: string; cta: string; href: string }> = {
    "not-lo": {
      icon: "🔒",
      title: "Professionals Only",
      body: "The Scenario Board is reserved for registered loan officers and real estate agents. Complete your professional profile to access live borrower scenarios.",
      cta: "Complete My Profile →",
      href: "/profile",
    },
    "no-nmls": {
      icon: "📋",
      title: "License Number Required",
      body: "You need a verified NMLS number (LOs) or DRE license (agents) on your profile before you can respond to borrower scenarios.",
      cta: "Add License to Profile →",
      href: "/profile",
    },
    "no-plan": {
      icon: "⚡",
      title: "Pro Subscription Required",
      body: "Access to the Scenario Board requires an active Pro plan. Upgrade to connect with live borrower scenarios in your state.",
      cta: "Upgrade to Pro →",
      href: "/pricing",
    },
  };

  if (gateStatus !== "loading" && gateStatus !== "ok" && isLoaded && isSignedIn) {
    const g = GATE_MESSAGES[gateStatus];
    return (
      <div className="los-root">
        <nav className="los-nav">
          <Link href="/lo/dashboard" className="los-nav-logo">
            <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" style={{ height: 28 }} />
          </Link>
          <AppNav drawerOnly />
        </nav>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "70vh", padding: "2rem" }}>
          <div style={{ background: "rgba(14,20,32,0.96)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 20, padding: "40px 40px", textAlign: "center", maxWidth: 420 }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 16 }}>{g.icon}</div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#f0f4ff", marginBottom: 10 }}>{g.title}</div>
            <div style={{ fontSize: "0.88rem", color: "#8fa3b8", lineHeight: 1.6, marginBottom: 28 }}>{g.body}</div>
            <Link href={g.href} style={{ display: "inline-block", background: "#00e87a", color: "#080c12", fontWeight: 700, fontSize: "0.9rem", borderRadius: 999, padding: "11px 28px", textDecoration: "none" }}>{g.cta}</Link>
          </div>
        </div>
        <style>{`body:has(.los-root){display:block!important;height:auto!important;overflow-y:auto!important;background:#080c12!important}html:has(.los-root){background:#080c12!important}.los-nav-logo img{height:28px}`}</style>
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
            <Link href="/pro/clients" className="los-nav-link">Clients</Link>
            <Link href="/messages" className="los-nav-link">Messages</Link>
            <span className="los-nav-active">Private Exchange</span>
          </div>
          <AppNav drawerOnly />
        </nav>

        <div className="los-container">

          {/* Header */}
          <div className="los-header">
            <div>
              <h1 className="los-title">The Private Exchange</h1>
              <p className="los-sub">Anonymous borrower scenarios — respond to earn an introduction.</p>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span className="los-stat">{scenarios.filter(s => !s.already_responded).length} open</span>
              <button
                className="los-pipeline-btn"
                onClick={() => setPipelineOpen(true)}
              >
                My Pipeline
                {myPipeline.length > 0 && (
                  <span className="los-pipeline-count">{myPipeline.length}</span>
                )}
                {shortlistedCount > 0 && (
                  <span className="los-pipeline-shortlisted">{shortlistedCount} shortlisted</span>
                )}
              </button>
            </div>
          </div>

          {/* Sort + Filters */}
          <div className="los-filters">
            <div style={{ display: "flex", gap: 6, marginBottom: "0.75rem", width: "100%", flexWrap: "wrap" }}>
              {(["newest", "closing_soon", "most_active"] as const).map(s => (
                <button
                  key={s}
                  className={`los-filter-chip ${sort === s ? "active" : ""}`}
                  onClick={() => setSort(s)}
                >
                  {s === "newest" ? "Newest" : s === "closing_soon" ? "Closing Soon" : "Most Active"}
                </button>
              ))}
            </div>
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
            {filterState ? (
              <div className="los-state-chip">
                <span>Your state: <strong>{filterState}</strong></span>
                <button className="los-state-chip-clear" onClick={() => setFilterState("")} title="Clear state filter">×</button>
              </div>
            ) : (
              <input
                className="los-state-input"
                placeholder="State (e.g. CA)"
                value={filterState}
                onChange={e => setFilterState(e.target.value.toUpperCase().slice(0, 2))}
                maxLength={2}
              />
            )}
          </div>

          {/* Auto-refresh indicator */}
          <div className="los-refresh-bar">
            <span className="los-refresh-dot" />
            <span className="los-refresh-text">
              Auto-refreshes every 30s
              {lastRefreshed && ` · Updated ${lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
            </span>
            <button className="los-refresh-btn" onClick={() => load()}>Refresh now</button>
          </div>

          {/* Exchange board */}
          {loading ? (
            <div className="los-loading">Loading scenarios...</div>
          ) : scenarios.length === 0 ? (
            <div className="los-empty">
              <div className="los-empty-icon">📋</div>
              <p>No active scenarios match your filters.</p>
              <p className="los-empty-sub">
                {filterState
                  ? `Try clearing the ${filterState} filter to see all states.`
                  : "Check back soon — new scenarios are posted daily."}
              </p>
            </div>
          ) : (
            <div className="los-grid">
              {scenarios.map(scenario => {
                const isFilled = filledIds.has(scenario.id);
                return (
                  <div
                    key={scenario.id}
                    className={`los-card ${scenario.already_responded ? "los-card-done" : ""} ${scenario.is_mine ? "los-card-mine" : ""}`}
                    style={{ position: "relative" }}
                  >

                    {/* Just-filled overlay — shown for 3s when scenario fills during session */}
                    {isFilled && (
                      <div className="los-filled-overlay">
                        <div className="los-filled-pill">
                          <span>⚡</span>
                          <span>Just filled — response cap reached</span>
                        </div>
                      </div>
                    )}

                    {/* Private referral badge */}
                    {scenario.visibility === "private" && (
                      <div className="los-card-private-banner">🔒 Private referral — only you can see this</div>
                    )}

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
                      {(() => {
                        const b = getStatusBadge(scenario);
                        return (
                          <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: b.bg, border: `1px solid ${b.border}`, color: b.color, flexShrink: 0 }}>
                            {b.label}
                          </span>
                        );
                      })()}
                      {scenario.is_mine && <span className="los-mine-badge">My Scenario</span>}
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
                      {scenario.is_mine ? (
                        <span className="los-mine-label">Posted by you — open to others</span>
                      ) : scenario.already_responded ? (
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
                );
              })}
            </div>
          )}
        </div>

        {/* My Pipeline — slide-over drawer */}
        {pipelineOpen && (
          <div
            className="los-pipeline-overlay"
            onClick={e => { if (e.target === e.currentTarget) setPipelineOpen(false); }}
          >
            <div className="los-pipeline-drawer">
              <div className="los-drawer-header">
                <div>
                  <h2 className="los-drawer-title">My Pipeline</h2>
                  <p className="los-drawer-sub">Scenarios you've responded to.</p>
                </div>
                <button className="los-modal-x" onClick={() => setPipelineOpen(false)}>✕</button>
              </div>

              {myPipeline.length === 0 ? (
                <div className="los-empty" style={{ paddingTop: "3rem" }}>
                  <div className="los-empty-icon">📥</div>
                  <p>Your pipeline is empty.</p>
                  <p className="los-empty-sub">Respond to scenarios in The Private Exchange. Once the response cap fills, the scenario lands here for the selected LOs.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {myPipeline.map(r => {
                    const sb = r.scenario_briefs;
                    if (!sb) return null;

                    const isConnected = r.status === "invited";
                    const isShortlisted = !isConnected && sb.status === "matched";
                    const isActive = !isConnected && !isShortlisted && sb.status === "active";

                    const stageBadge = isConnected
                      ? { label: "Connected", color: "#00e87a", bg: "rgba(0,232,122,0.1)", border: "rgba(0,232,122,0.3)" }
                      : isShortlisted
                      ? { label: "Shortlisted", color: "#3d8bff", bg: "rgba(61,139,255,0.1)", border: "rgba(61,139,255,0.3)" }
                      : isActive
                      ? { label: "Pending", color: "#8fa3b8", bg: "rgba(143,163,184,0.08)", border: "rgba(143,163,184,0.2)" }
                      : { label: "Closed", color: "#3a4560", bg: "rgba(58,69,96,0.15)", border: "rgba(58,69,96,0.3)" };

                    return (
                      <div
                        key={r.id}
                        className="los-card"
                        style={{
                          opacity: stageBadge.label === "Closed" ? 0.5 : 1,
                          borderColor: isShortlisted ? "rgba(61,139,255,0.25)" : isConnected ? "rgba(0,232,122,0.25)" : undefined,
                        }}
                      >
                        {isConnected && (
                          <div style={{ background: "rgba(0,232,122,0.07)", border: "1px solid rgba(0,232,122,0.2)", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: "0.8rem", color: "#00e87a", lineHeight: 1.5 }}>
                            <strong>Contact exchanged.</strong> Continue directly with the borrower.
                          </div>
                        )}
                        {isShortlisted && (
                          <div style={{ background: "rgba(61,139,255,0.06)", border: "1px solid rgba(61,139,255,0.2)", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: "0.8rem", color: "#3d8bff", lineHeight: 1.5 }}>
                            <strong>You're shortlisted.</strong> Borrower is reviewing {sb.max_responses} responses.
                          </div>
                        )}

                        <div className="los-card-top">
                          <span className="los-loan-badge" style={{ background: BADGE_BG[sb.loan_type] ?? "rgba(61,139,255,0.12)", border: `1px solid ${BADGE_BORDER[sb.loan_type] ?? "rgba(61,139,255,0.3)"}`, color: BADGE_COLOR[sb.loan_type] ?? "#3d8bff" }}>
                            {LABEL_MAP[sb.loan_type] ?? sb.loan_type}
                          </span>
                          <span className="los-card-state">{sb.state}</span>
                          <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: stageBadge.bg, border: `1px solid ${stageBadge.border}`, color: stageBadge.color }}>
                            {stageBadge.label}
                          </span>
                          <span className="los-card-time" style={{ marginLeft: "auto" }}>{timeAgo(r.created_at)}</span>
                        </div>

                        <div className="los-card-grid">
                          <div className="los-card-field"><div className="los-cf-label">Price</div><div className="los-cf-value">{sb.price_range}</div></div>
                          <div className="los-card-field"><div className="los-cf-label">Responses</div><div className="los-cf-value">{sb.response_count}/{sb.max_responses}</div></div>
                          <div className="los-card-field"><div className="los-cf-label">My Rate</div><div className="los-cf-value" style={{ color: "#00e87a" }}>{r.rate_estimate}</div></div>
                          <div className="los-card-field"><div className="los-cf-label">State</div><div className="los-cf-value">{sb.state}</div></div>
                        </div>

                        <div className="los-card-footer">
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            {isActive && sb.closes_at && <span className="los-card-timeleft">{timeLeft(sb.closes_at)}</span>}
                            {isActive && <span style={{ fontSize: "0.72rem", color: "#3a4560" }}>{(sb.max_responses ?? 3) - sb.response_count} slot{(sb.max_responses ?? 3) - sb.response_count !== 1 ? "s" : ""} left</span>}
                          </div>
                          {isActive && (
                            <button
                              className="los-modal-cancel"
                              style={{ fontSize: "0.75rem", padding: "5px 14px" }}
                              disabled={withdrawingId === r.scenario_id}
                              onClick={() => withdrawResponse(r.scenario_id)}
                            >
                              {withdrawingId === r.scenario_id ? "Withdrawing..." : "Withdraw"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

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

                  <div className="los-modal-scenario">

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
                      <label>{loProfile?.is_agent ? "DRE #" : "NMLS #"}</label>
                      <input
                        className="los-input"
                        value={loNmls}
                        readOnly
                        style={{ opacity: 0.6, cursor: "default" }}
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
                      disabled={submitting || !rateEstimate || !approach || !loName}
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

        .los-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 2rem; flex-wrap: wrap; gap: 12px; }
        .los-title { font-family: 'DM Sans', sans-serif; font-size: 1.75rem; font-weight: 700; margin: 0 0 0.3rem; }
        .los-sub { font-size: 0.9rem; color: #8fa3b8; margin: 0; }
        .los-stat {
          font-size: 0.82rem; font-weight: 700; color: #00e87a;
          background: rgba(0,232,122,0.1); border: 1px solid rgba(0,232,122,0.25);
          border-radius: 99px; padding: 4px 14px;
        }

        /* Pipeline button */
        .los-pipeline-btn {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 18px;
          background: rgba(61,139,255,0.1); border: 1px solid rgba(61,139,255,0.3);
          color: #3d8bff; border-radius: 99px;
          font-size: 0.85rem; font-weight: 700; cursor: pointer;
          transition: all 0.15s;
        }
        .los-pipeline-btn:hover { background: rgba(61,139,255,0.18); border-color: rgba(61,139,255,0.5); }
        .los-pipeline-count {
          background: #3d8bff; color: #fff;
          font-size: 0.72rem; font-weight: 800;
          border-radius: 99px; padding: 1px 8px;
        }
        .los-pipeline-shortlisted {
          font-size: 0.72rem; color: #3d8bff; opacity: 0.8;
        }

        /* Filters */
        .los-filters { display: flex; align-items: center; gap: 12px; margin-bottom: 0.75rem; flex-wrap: wrap; }
        .los-filter-group { display: flex; gap: 8px; flex-wrap: wrap; }
        .los-filter-chip {
          padding: 6px 14px; border-radius: 99px;
          border: 1px solid rgba(255,255,255,0.08); background: transparent;
          color: #8fa3b8; font-size: 0.82rem; cursor: pointer; transition: all 0.15s;
        }
        .los-filter-chip:hover { border-color: rgba(255,255,255,0.2); color: #f0f4ff; }
        .los-filter-chip.active { background: rgba(0,232,122,0.1); border-color: rgba(0,232,122,0.35); color: #00e87a; font-weight: 600; }

        /* State chip — shown when a state is set */
        .los-state-chip {
          display: flex; align-items: center; gap: 6px;
          padding: 6px 10px 6px 14px;
          background: rgba(0,232,122,0.08); border: 1px solid rgba(0,232,122,0.3);
          border-radius: 99px; font-size: 0.82rem; color: #00e87a;
        }
        .los-state-chip-clear {
          background: rgba(0,232,122,0.15); border: none; color: #00e87a;
          width: 18px; height: 18px; border-radius: 50%;
          font-size: 0.9rem; line-height: 1; cursor: pointer; padding: 0;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.15s;
        }
        .los-state-chip-clear:hover { background: rgba(0,232,122,0.3); }
        .los-state-input {
          padding: 6px 12px; border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.08); background: #0e1420;
          color: #f0f4ff; font-size: 0.85rem; width: 80px; outline: none;
          text-transform: uppercase;
        }
        .los-state-input:focus { border-color: rgba(0,232,122,0.35); }

        /* Auto-refresh bar */
        .los-refresh-bar {
          display: flex; align-items: center; gap: 8px;
          margin-bottom: 1.75rem;
          font-size: 0.75rem; color: #3a4560;
        }
        .los-refresh-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #00e87a;
          box-shadow: 0 0 6px rgba(0,232,122,0.6);
          animation: los-pulse 2s ease-in-out infinite;
          flex-shrink: 0;
        }
        @keyframes los-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .los-refresh-text { color: #3a4560; }
        .los-refresh-btn {
          margin-left: auto; background: none; border: none;
          color: #3d8bff; font-size: 0.75rem; cursor: pointer;
          padding: 3px 8px; border-radius: 6px;
          transition: background 0.15s;
        }
        .los-refresh-btn:hover { background: rgba(61,139,255,0.1); }

        .los-loading, .los-empty { text-align: center; padding: 4rem 0; color: #8fa3b8; }
        .los-empty-icon { font-size: 2rem; margin-bottom: 0.75rem; }
        .los-empty-sub { font-size: 0.82rem; color: #3a4560; margin-top: 0.5rem; max-width: 340px; margin-left: auto; margin-right: auto; }

        .los-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }

        .los-card {
          background: #0e1420;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px; padding: 1.25rem;
          transition: border-color 0.15s;
        }
        .los-card:hover { border-color: rgba(255,255,255,0.15); }
        .los-card-done { opacity: 0.6; }
        .los-card-mine { border-color: rgba(255,180,0,0.2) !important; background: rgba(255,180,0,0.03) !important; }

        /* Private referral banner on card */
        .los-card-private-banner {
          font-size: 0.7rem; font-weight: 700; color: #ff8c42;
          text-transform: uppercase; letter-spacing: 0.06em;
          margin-bottom: 10px;
          background: rgba(255,140,66,0.07); border: 1px solid rgba(255,140,66,0.2);
          border-radius: 6px; padding: 4px 8px;
        }

        /* Just-filled overlay */
        .los-filled-overlay {
          position: absolute; inset: 0;
          background: rgba(8,12,18,0.82); border-radius: 14px;
          display: flex; align-items: center; justify-content: center;
          z-index: 10;
          animation: los-filled-fade 0.3s ease;
        }
        @keyframes los-filled-fade { from { opacity: 0; } to { opacity: 1; } }
        .los-filled-pill {
          display: flex; align-items: center; gap: 8px;
          background: rgba(255,140,66,0.15); border: 1px solid rgba(255,140,66,0.4);
          border-radius: 99px; padding: 10px 20px;
          font-size: 0.88rem; font-weight: 700; color: #ff8c42;
        }

        .los-mine-badge {
          font-size: 0.7rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
          color: #ffd166; background: rgba(255,180,0,0.12); border: 1px solid rgba(255,180,0,0.25);
          border-radius: 4px; padding: 2px 8px;
        }
        .los-mine-label { font-size: 0.75rem; color: #ffd166; font-weight: 500; }

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

        .los-card-top { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
        .los-card-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 0.75rem; }
        .los-card-field { display: flex; flex-direction: column; }
        .los-cf-label { font-size: 0.68rem; color: #3a4560; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 2px; }
        .los-cf-value { font-size: 0.88rem; font-weight: 600; color: #f0f4ff; }

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

        /* Pipeline slide-over drawer */
        .los-pipeline-overlay {
          position: fixed; inset: 0; z-index: 300;
          background: rgba(8,12,18,0.6); backdrop-filter: blur(4px);
        }
        .los-pipeline-drawer {
          position: absolute; right: 0; top: 0; bottom: 0; width: 440px;
          background: #0e1420; border-left: 1px solid rgba(255,255,255,0.08);
          overflow-y: auto; padding: 2rem 1.5rem;
          animation: los-drawer-in 0.25s cubic-bezier(0.25,0.46,0.45,0.94);
        }
        @keyframes los-drawer-in {
          from { transform: translateX(60px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @media (max-width: 480px) {
          .los-pipeline-drawer { width: 100%; }
        }
        .los-drawer-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.5rem; }
        .los-drawer-title { font-family: 'DM Sans', sans-serif; font-size: 1.2rem; font-weight: 700; margin: 0 0 3px; color: #f0f4ff; }
        .los-drawer-sub { font-size: 0.82rem; color: #8fa3b8; margin: 0; }

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
        .los-ms-card-block {
          background: rgba(0,232,122,0.05); border: 1px solid rgba(0,232,122,0.2);
          border-radius: 10px; padding: 1rem; margin-bottom: 1.25rem;
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
          margin: 0; line-height: 1.5; border-top: 1px solid rgba(0,232,122,0.12); padding-top: 0.6rem;
        }
        .los-ms-header {
          font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em;
          text-transform: uppercase; color: #3a4560; margin-bottom: 0.75rem;
        }
        .los-ms-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 0.75rem; }
        .los-ms-label { display: block; font-size: 0.68rem; color: #3a4560; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
        .los-ms-val { font-size: 0.88rem; font-weight: 600; color: #f0f4ff; }
        .los-ms-note { font-size: 0.82rem; color: #8fa3b8; font-style: italic; margin: 0.75rem 0 0; line-height: 1.5; }
        .los-ms-slots {
          font-size: 0.78rem; color: #ff8c42;
          margin: 0.5rem 0 0; background: rgba(255,140,66,0.08);
          border: 1px solid rgba(255,140,66,0.2); border-radius: 7px; padding: 6px 10px;
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
          .los-ms-card-row { grid-template-columns: repeat(2, 1fr); }
          .los-ms-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </>
  );
}
