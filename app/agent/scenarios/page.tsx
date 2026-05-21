"use client";
// app/agent/scenarios/page.tsx
// Agent board — home-buying context only. Financial/loan fields are stripped
// server-side before this page receives them.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import AppNav from "../../components/AppNav";

interface Scenario {
  id: string;
  loan_purpose: string;
  price_range: string;
  timeline: string;
  state: string;
  notes?: string;
  needs_professional: string;
  response_count: number;
  max_responses?: number;
  closes_at?: string;
  created_at: string;
  already_responded: boolean;
  // NOTE: credit_tier, income_range, down_payment_pct, loan_type,
  // and all card_* fields are intentionally absent — stripped server-side.
}

const PRICE_FILTERS = ["All", "Under $300k", "$300k–$500k", "$500k–$750k", "$750k–$1M", "$1M+"];
const PURPOSE_FILTERS = ["All", "Purchase", "Refinance"];

export default function AgentScenariosPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPrice, setFilterPrice] = useState("All");
  const [filterPurpose, setFilterPurpose] = useState("All");
  const [filterState, setFilterState] = useState("");
  const [modal, setModal] = useState<Scenario | null>(null);

  const [agentName, setAgentName] = useState("");
  const [agentLicense, setAgentLicense] = useState("");
  const [fee, setFee] = useState("");
  const [approach, setApproach] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);

  type AgentGate = "loading" | "ok" | "not-agent" | "no-license";
  const [gateStatus, setGateStatus] = useState<AgentGate>("loading");

  // Redirect signed-out users
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/sign-in?redirect_url=" + encodeURIComponent("/agent/scenarios"));
    }
  }, [isLoaded, isSignedIn, router]);

  // Gate check — must be agent with DRE license
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    fetch("/api/profile")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) { setGateStatus("not-agent"); return; }
        if (!d.agent && d.role !== "agent") { setGateStatus("not-agent"); return; }
        if (!d.agent?.license) { setGateStatus("no-license"); return; }
        setAgentName(d.full_name ?? d.clerkName ?? "");
        setAgentLicense(d.agent.license ?? "");
        setGateStatus("ok");
      })
      .catch(() => setGateStatus("not-agent"));
  }, [isLoaded, isSignedIn]);

  useEffect(() => { if (gateStatus === "ok") load(); }, [gateStatus, filterState]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterState) params.set("state", filterState);
    const res = await fetch(`/api/scenarios?${params}`);
    if (res.ok) {
      const data = await res.json();
      setScenarios(data.scenarios ?? []);
    }
    setLoading(false);
  }

  function openModal(s: Scenario) {
    setModal(s);
    setAgentName(""); setAgentLicense(""); setFee(""); setApproach("");
    setSubmitError(""); setSubmitSuccess(false);
  }

  async function submitResponse() {
    if (!modal) return;
    setSubmitting(true);
    setSubmitError("");
    const res = await fetch(`/api/scenarios/${modal.id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rate_estimate: fee,
        approach,
        lo_name: agentName,
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
      s.id === modal.id ? { ...s, already_responded: true, response_count: s.response_count + 1 } : s
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
    return h < 24 ? `${h}h left` : `${Math.ceil(h / 24)}d left`;
  };

  // Client-side filter by price and purpose
  const filtered = scenarios.filter(s => {
    if (filterPrice !== "All") {
      const p = s.price_range;
      if (filterPrice === "Under $300k" && !p.includes("$300k") && !p.toLowerCase().includes("under")) return false;
      if (filterPrice === "$300k–$500k" && !p.includes("$300k") && !p.includes("$400k")) return false;
      if (filterPrice === "$500k–$750k" && !p.includes("$500k") && !p.includes("$750k")) return false;
      if (filterPrice === "$750k–$1M" && !p.includes("$750k") && !p.includes("$1M")) return false;
      if (filterPrice === "$1M+" && !p.includes("$1M") && !p.includes("$1.5M")) return false;
    }
    if (filterPurpose !== "All" && s.loan_purpose?.toLowerCase() !== filterPurpose.toLowerCase()) return false;
    return true;
  });

  // Gate screens
  if (!isLoaded || (isLoaded && isSignedIn && gateStatus === "loading")) {
    return (
      <div className="ag-root">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", color: "#8fa3b8" }}>
          Verifying access...
        </div>
        <style>{`body:has(.ag-root){display:block!important;background:#080c12!important}`}</style>
      </div>
    );
  }

  const AG_GATE: Record<string, { icon: string; title: string; body: string; cta: string; href: string }> = {
    "not-agent": {
      icon: "🔒",
      title: "Real Estate Agents Only",
      body: "The Buyer Scenario Board is reserved for licensed real estate agents. Complete your professional profile to access live buyer scenarios.",
      cta: "Complete My Profile →",
      href: "/profile",
    },
    "no-license": {
      icon: "📋",
      title: "DRE License Required",
      body: "You need a verified DRE license number on your profile before you can respond to buyer scenarios. Add it in your agent profile.",
      cta: "Add License to Profile →",
      href: "/profile",
    },
  };

  if (isLoaded && isSignedIn && gateStatus !== "ok" && gateStatus !== "loading") {
    const g = AG_GATE[gateStatus] ?? AG_GATE["not-agent"];
    return (
      <div className="ag-root">
        <nav className="ag-nav">
          <Link href="/dashboard" className="ag-nav-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" />
          </Link>
          <AppNav drawerOnly />
        </nav>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", padding: "2rem" }}>
          <div style={{ background: "rgba(8,12,18,0.92)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 20, padding: "40px 48px", textAlign: "center", maxWidth: 440 }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 16 }}>{g.icon}</div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#f0f4ff", marginBottom: 10 }}>{g.title}</div>
            <div style={{ fontSize: "0.88rem", color: "#8fa3b8", lineHeight: 1.6, marginBottom: 28 }}>{g.body}</div>
            <Link href={g.href} style={{ display: "inline-block", background: "#00e87a", color: "#080c12", fontWeight: 700, fontSize: "0.9rem", borderRadius: 999, padding: "11px 28px", textDecoration: "none" }}>{g.cta}</Link>
          </div>
        </div>
        <style>{`body:has(.ag-root){display:block!important;background:#080c12!important}`}</style>
      </div>
    );
  }

  return (
    <>
      <div className="ag-root">

        <nav className="ag-nav">
          <Link href="/dashboard" className="ag-nav-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" />
          </Link>
          <div className="ag-nav-links">
            <Link href="/dashboard" className="ag-nav-link">Dashboard</Link>
            <Link href="/chat" className="ag-nav-link">AI Chat</Link>
            <Link href="/profile" className="ag-nav-link">My Profile</Link>
            <span className="ag-nav-active">Buyer Scenarios</span>
          </div>
          <AppNav drawerOnly />
        </nav>

        <div className="ag-container">

          <div className="ag-header">
            <div>
              <h1 className="ag-title">Buyer Scenario Board</h1>
              <p className="ag-sub">Anonymous buyers looking for an agent. Respond with your approach — the buyer picks who earns the introduction. No Zillow, no bought leads.</p>
            </div>
            <span className="ag-stat">{filtered.filter(s => !s.already_responded).length} new</span>
          </div>

          {/* Filters — home-buying context only */}
          <div className="ag-filters">
            <div className="ag-filter-group">
              <span className="ag-filter-label">Purpose</span>
              {PURPOSE_FILTERS.map(p => (
                <button key={p} className={`ag-chip ${filterPurpose === p ? "active" : ""}`} onClick={() => setFilterPurpose(p)}>
                  {p}
                </button>
              ))}
            </div>
            <div className="ag-filter-group">
              <span className="ag-filter-label">Price</span>
              {PRICE_FILTERS.map(p => (
                <button key={p} className={`ag-chip ${filterPrice === p ? "active" : ""}`} onClick={() => setFilterPrice(p)}>
                  {p}
                </button>
              ))}
            </div>
            <input
              className="ag-state-input"
              placeholder="State (CA)"
              value={filterState}
              onChange={e => { setFilterState(e.target.value.toUpperCase().slice(0, 2)); }}
              onBlur={() => load()}
              maxLength={2}
            />
          </div>

          {loading ? (
            <div className="ag-loading">Loading buyer scenarios...</div>
          ) : filtered.length === 0 ? (
            <div className="ag-empty">
              <div className="ag-empty-icon">🏡</div>
              <p>No buyer scenarios match your filters. Check back soon.</p>
            </div>
          ) : (
            <div className="ag-grid">
              {filtered.map(s => (
                <div key={s.id} className={`ag-card ${s.already_responded ? "ag-card-done" : ""}`}>

                  <div className="ag-card-header">
                    <div className="ag-card-tags">
                      <span className={`ag-purpose-badge ${s.loan_purpose?.toLowerCase() === "refinance" ? "refi" : ""}`}>
                        {s.loan_purpose || "Purchase"}
                      </span>
                      {s.needs_professional === "agent" && (
                        <span className="ag-exclusive-badge">Agent only</span>
                      )}
                      {s.needs_professional === "both" && (
                        <span className="ag-both-badge">Also needs lender</span>
                      )}
                    </div>
                    <span className="ag-card-time">{timeAgo(s.created_at)}</span>
                  </div>

                  {/* Home-buying fields only */}
                  <div className="ag-card-grid">
                    <div className="ag-field">
                      <div className="ag-field-label">Price range</div>
                      <div className="ag-field-value">{s.price_range}</div>
                    </div>
                    <div className="ag-field">
                      <div className="ag-field-label">State</div>
                      <div className="ag-field-value">{s.state}</div>
                    </div>
                    <div className="ag-field">
                      <div className="ag-field-label">Timeline</div>
                      <div className="ag-field-value">{s.timeline}</div>
                    </div>
                    <div className="ag-field">
                      <div className="ag-field-label">Looking for</div>
                      <div className="ag-field-value">{s.needs_professional === "agent" ? "Agent only" : "Agent + Lender"}</div>
                    </div>
                  </div>

                  {s.notes && <p className="ag-card-note">"{s.notes}"</p>}

                  <div className="ag-card-footer">
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span className="ag-responses">
                        {s.response_count}{s.max_responses ? `/${s.max_responses}` : ""} response{s.response_count !== 1 ? "s" : ""}
                      </span>
                      {s.closes_at && (
                        <span className="ag-timeleft">{timeLeft(s.closes_at)}</span>
                      )}
                    </div>
                    {s.already_responded ? (
                      <span className="ag-responded-badge">✓ Responded</span>
                    ) : s.max_responses && s.response_count >= s.max_responses ? (
                      <span className="ag-full-badge">Limit reached</span>
                    ) : (
                      <button className="ag-respond-btn" onClick={() => openModal(s)}>Respond →</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal */}
        {modal && (
          <div className="ag-overlay" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
            <div className="ag-modal">
              {submitSuccess ? (
                <div className="ag-modal-success">
                  <div className="ag-success-icon">✓</div>
                  <h3>Response submitted</h3>
                  <p>The buyer will review your approach alongside other agents. If they choose you, you'll receive their contact info — no middleman, no bidding war.</p>
                  <button className="ag-close-btn" onClick={() => setModal(null)}>Done</button>
                </div>
              ) : (
                <>
                  <div className="ag-modal-header">
                    <div>
                      <h3 className="ag-modal-title">Respond to buyer</h3>
                      <p className="ag-modal-sub">
                        {modal.loan_purpose || "Purchase"} · {modal.price_range} · {modal.state}
                        {modal.closes_at && <span className="ag-modal-timeleft"> · {timeLeft(modal.closes_at)}</span>}
                      </p>
                    </div>
                    <button className="ag-modal-x" onClick={() => setModal(null)}>✕</button>
                  </div>

                  {/* Buyer context — home-buying fields only */}
                  <div className="ag-modal-context">
                    <div className="ag-mc-header">Buyer scenario</div>
                    <div className="ag-mc-grid">
                      <div>
                        <span className="ag-mc-label">Price range</span>
                        <span className="ag-mc-val">{modal.price_range}</span>
                      </div>
                      <div>
                        <span className="ag-mc-label">State</span>
                        <span className="ag-mc-val">{modal.state}</span>
                      </div>
                      <div>
                        <span className="ag-mc-label">Timeline</span>
                        <span className="ag-mc-val">{modal.timeline}</span>
                      </div>
                      <div>
                        <span className="ag-mc-label">Purpose</span>
                        <span className="ag-mc-val">{modal.loan_purpose || "Purchase"}</span>
                      </div>
                    </div>
                    {modal.notes && <p className="ag-mc-note">"{modal.notes}"</p>}
                    {modal.max_responses && (
                      <p className="ag-mc-slots">
                        {modal.max_responses - modal.response_count} agent slot{(modal.max_responses - modal.response_count) !== 1 ? "s" : ""} remaining — buyer set a max of {modal.max_responses}
                      </p>
                    )}
                  </div>

                  <div className="ag-modal-fields">
                    <div className="ag-mf">
                      <label>Your name <span className="ag-mf-req">*</span></label>
                      <input className="ag-input" placeholder="First name only is fine" value={agentName} onChange={e => setAgentName(e.target.value)} />
                    </div>
                    <div className="ag-mf">
                      <label>License # <span className="ag-mf-req">*</span></label>
                      <input className="ag-input" placeholder="State license number" value={agentLicense} onChange={e => setAgentLicense(e.target.value)} />
                    </div>
                    <div className="ag-mf">
                      <label>Buyer rep fee <span className="ag-mf-req">*</span></label>
                      <input className="ag-input" placeholder="e.g. 2.5% or seller-paid / negotiable" value={fee} onChange={e => setFee(e.target.value)} />
                      <span className="ag-mf-hint">Be upfront — buyers compare this directly. Honest answers earn introductions.</span>
                    </div>
                    <div className="ag-mf">
                      <label>Your approach <span className="ag-mf-req">*</span></label>
                      <textarea
                        className="ag-textarea"
                        placeholder={`Tell the buyer:\n• Your market knowledge in this price range and area\n• How you'd handle their search and offer strategy\n• Your availability and communication style\n• Any relevant recent transactions\n\nMax 800 characters — specific beats generic every time.`}
                        maxLength={800}
                        rows={8}
                        value={approach}
                        onChange={e => setApproach(e.target.value)}
                      />
                      <div className="ag-mf-footer">
                        <span className="ag-mf-hint">The buyer reviews all responses side-by-side. Make yours stand out.</span>
                        <span className="ag-mf-count">{approach.length}/800</span>
                      </div>
                    </div>
                  </div>

                  {submitError && <div className="ag-modal-error">{submitError}</div>}

                  <div className="ag-modal-footer">
                    <button className="ag-cancel-btn" onClick={() => setModal(null)}>Cancel</button>
                    <button
                      className="ag-submit-btn"
                      disabled={submitting || !fee || !approach || !agentName || !agentLicense}
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
        body:has(.ag-root) {
          display: block !important; height: auto !important;
          overflow-y: auto !important; background: #080c12 !important;
        }
        html:has(.ag-root) { background: #080c12 !important; height: auto !important; overflow-y: auto !important; }
        body:has(.ag-root) .app-footer { display: none; }

        .ag-root { font-family: 'DM Sans', system-ui, sans-serif; color: #f0f4ff; min-height: 100vh; background: #080c12; }

        .ag-nav {
          position: sticky; top: 0; z-index: 100;
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 24px;
          background: rgba(8,12,18,0.95); backdrop-filter: blur(8px);
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .ag-nav-logo img { height: 28px; }
        .ag-nav-links { display: flex; align-items: center; gap: 20px; }
        .ag-nav-link { color: #8fa3b8; text-decoration: none; font-size: 0.875rem; transition: color 0.15s; }
        .ag-nav-link:hover { color: #f0f4ff; }
        .ag-nav-active { font-size: 0.875rem; color: #f0f4ff; font-weight: 600; }
        @media (max-width: 640px) { .ag-nav-links { display: none; } }

        .ag-container { max-width: 960px; margin: 0 auto; padding: 3rem 1.5rem 5rem; }

        .ag-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 2rem; gap: 16px; }
        .ag-title { font-family: 'DM Sans', sans-serif; font-size: 1.75rem; font-weight: 700; margin: 0 0 0.3rem; }
        .ag-sub { font-size: 0.875rem; color: #8fa3b8; margin: 0; line-height: 1.55; max-width: 560px; }
        .ag-stat {
          font-size: 0.82rem; font-weight: 700; color: #00e87a; white-space: nowrap;
          background: rgba(0,232,122,0.1); border: 1px solid rgba(0,232,122,0.25);
          border-radius: 99px; padding: 4px 14px; flex-shrink: 0;
        }

        .ag-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 2rem; }
        .ag-filter-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .ag-filter-label { font-size: 0.72rem; font-weight: 700; color: #eaf8f7; text-transform: uppercase; letter-spacing: 0.07em; margin-right: 2px; }
        .ag-chip {
          padding: 5px 13px; border-radius: 99px;
          border: 1px solid rgba(255,255,255,0.08); background: transparent;
          color: #8fa3b8; font-size: 0.8rem; cursor: pointer; transition: all 0.15s; font-family: inherit;
        }
        .ag-chip:hover { border-color: rgba(255,255,255,0.2); color: #f0f4ff; }
        .ag-chip.active { background: rgba(0,232,122,0.1); border-color: rgba(0,232,122,0.35); color: #00e87a; font-weight: 600; }
        .ag-state-input {
          padding: 6px 12px; border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.08); background: #0e1420;
          color: #f0f4ff; font-size: 0.85rem; width: 80px; outline: none;
          text-transform: uppercase; font-family: inherit;
        }
        .ag-state-input:focus { border-color: rgba(0,232,122,0.35); }

        .ag-loading, .ag-empty { text-align: center; padding: 4rem 0; color: #8fa3b8; }
        .ag-empty-icon { font-size: 2rem; margin-bottom: 0.75rem; }

        .ag-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }

        .ag-card {
          background: #0e1420; border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px; padding: 1.25rem; transition: border-color 0.15s;
        }
        .ag-card:hover { border-color: rgba(255,255,255,0.15); }
        .ag-card-done { opacity: 0.6; }

        .ag-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; gap: 8px; }
        .ag-card-tags { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

        .ag-purpose-badge {
          font-size: 0.72rem; font-weight: 700; padding: 3px 10px; border-radius: 99px;
          background: rgba(0,232,122,0.1); border: 1px solid rgba(0,232,122,0.25); color: #00e87a;
        }
        .ag-purpose-badge.refi {
          background: rgba(167,139,250,0.1); border-color: rgba(167,139,250,0.3); color: #a78bfa;
        }
        .ag-exclusive-badge {
          font-size: 0.68rem; font-weight: 600; padding: 2px 8px; border-radius: 99px;
          color: #ff8c42; background: rgba(255,140,66,0.1); border: 1px solid rgba(255,140,66,0.25);
        }
        .ag-both-badge {
          font-size: 0.68rem; font-weight: 600; padding: 2px 8px; border-radius: 99px;
          color: #8fa3b8; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
        }
        .ag-card-time { font-size: 0.72rem; color: #eaf8f7; white-space: nowrap; }

        .ag-card-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 0.75rem; }
        .ag-field-label { font-size: 0.68rem; color: #eaf8f7; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 2px; }
        .ag-field-value { font-size: 0.88rem; font-weight: 600; color: #f0f4ff; }
        .ag-card-note { font-size: 0.8rem; color: #8fa3b8; font-style: italic; margin: 0 0 0.75rem; line-height: 1.45; }

        .ag-card-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.06); }
        .ag-responses { font-size: 0.75rem; color: #eaf8f7; }
        .ag-timeleft { font-size: 0.72rem; color: #ff8c42; margin-top: 2px; }
        .ag-full-badge { font-size: 0.75rem; color: #eaf8f7; }
        .ag-responded-badge { font-size: 0.78rem; color: #00e87a; font-weight: 600; }
        .ag-respond-btn {
          padding: 7px 18px; background: #00e87a; color: #080c12;
          border: none; border-radius: 999px;
          font-size: 0.82rem; font-weight: 700; cursor: pointer; transition: opacity 0.15s; font-family: inherit;
        }
        .ag-respond-btn:hover { opacity: 0.88; }

        /* Modal */
        .ag-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(8,12,18,0.85); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center; padding: 1rem;
        }
        .ag-modal {
          background: #0e1420; border: 1px solid rgba(255,255,255,0.10);
          border-radius: 20px; padding: 2rem;
          width: 100%; max-width: 640px; max-height: 92vh; overflow-y: auto;
        }
        .ag-modal-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; }
        .ag-modal-title { font-family: 'DM Sans', sans-serif; font-size: 1.2rem; font-weight: 700; margin: 0 0 3px; }
        .ag-modal-sub { font-size: 0.82rem; color: #8fa3b8; margin: 0; }
        .ag-modal-timeleft { color: #ff8c42; }
        .ag-modal-x { background: none; border: none; color: #eaf8f7; font-size: 1.1rem; cursor: pointer; padding: 4px; }
        .ag-modal-x:hover { color: #f0f4ff; }

        .ag-modal-context {
          background: #141b28; border-radius: 12px; padding: 1.25rem;
          margin-bottom: 1.5rem; border: 1px solid rgba(255,255,255,0.06);
        }
        .ag-mc-header {
          font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em;
          text-transform: uppercase; color: #eaf8f7; margin-bottom: 0.75rem;
        }
        .ag-mc-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 0.5rem; }
        .ag-mc-label { display: block; font-size: 0.68rem; color: #eaf8f7; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
        .ag-mc-val { font-size: 0.9rem; font-weight: 600; color: #f0f4ff; }
        .ag-mc-note { font-size: 0.82rem; color: #8fa3b8; font-style: italic; margin: 0.75rem 0 0; line-height: 1.5; }
        .ag-mc-slots {
          font-size: 0.78rem; color: #ff8c42; margin: 0.5rem 0 0;
          background: rgba(255,140,66,0.08); border: 1px solid rgba(255,140,66,0.2);
          border-radius: 7px; padding: 6px 10px;
        }

        .ag-modal-fields { display: flex; flex-direction: column; gap: 1rem; }
        .ag-mf { display: flex; flex-direction: column; }
        .ag-mf label { font-size: 0.78rem; font-weight: 600; color: #8fa3b8; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
        .ag-mf-req { color: #ff5f5f; }
        .ag-input, .ag-textarea {
          padding: 10px 14px; background: #141b28;
          border: 1px solid rgba(255,255,255,0.08); border-radius: 10px;
          color: #f0f4ff; font-size: 0.9rem; outline: none; font-family: inherit;
          transition: border-color 0.15s;
        }
        .ag-input:focus, .ag-textarea:focus { border-color: rgba(0,232,122,0.4); }
        .ag-textarea { resize: vertical; line-height: 1.5; }
        .ag-mf-footer { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-top: 5px; }
        .ag-mf-hint { font-size: 0.75rem; color: #eaf8f7; line-height: 1.4; }
        .ag-mf-count { font-size: 0.72rem; color: #eaf8f7; white-space: nowrap; flex-shrink: 0; }

        .ag-modal-error {
          font-size: 0.85rem; color: #ff5f5f;
          background: rgba(255,95,95,0.08); border: 1px solid rgba(255,95,95,0.2);
          border-radius: 8px; padding: 10px 14px; margin-top: 1rem;
        }
        .ag-modal-footer {
          display: flex; justify-content: flex-end; gap: 10px;
          margin-top: 1.5rem; padding-top: 1.25rem;
          border-top: 1px solid rgba(255,255,255,0.07);
        }
        .ag-cancel-btn {
          padding: 10px 20px; background: transparent;
          border: 1px solid rgba(255,255,255,0.10); color: #8fa3b8;
          border-radius: 999px; font-size: 0.875rem; cursor: pointer; font-family: inherit;
        }
        .ag-cancel-btn:hover { border-color: rgba(255,255,255,0.2); color: #f0f4ff; }
        .ag-submit-btn {
          padding: 10px 24px; background: #00e87a; color: #080c12;
          border: none; border-radius: 999px;
          font-size: 0.9rem; font-weight: 700; cursor: pointer; font-family: inherit;
          transition: opacity 0.15s;
        }
        .ag-submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .ag-submit-btn:not(:disabled):hover { opacity: 0.88; }

        .ag-modal-success { text-align: center; padding: 1rem 0; }
        .ag-success-icon {
          width: 56px; height: 56px; border-radius: 50%;
          background: rgba(0,232,122,0.12); color: #00e87a;
          display: flex; align-items: center; justify-content: center;
          font-size: 1.5rem; font-weight: 700; margin: 0 auto 1rem;
        }
        .ag-modal-success h3 { font-family: 'DM Sans', sans-serif; font-size: 1.2rem; margin: 0 0 0.75rem; }
        .ag-modal-success p { font-size: 0.9rem; color: #8fa3b8; line-height: 1.6; margin: 0 0 1.5rem; }
        .ag-close-btn {
          padding: 10px 28px; background: #00e87a; color: #080c12;
          border: none; border-radius: 999px; font-weight: 700;
          font-size: 0.9rem; cursor: pointer; font-family: inherit;
        }

        @media (max-width: 600px) {
          .ag-grid { grid-template-columns: 1fr; }
          .ag-header { flex-direction: column; }
          .ag-mc-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  );
}
