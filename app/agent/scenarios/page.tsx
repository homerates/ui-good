"use client";
// app/agent/scenarios/page.tsx
// Agent board: see anonymous borrower scenarios and respond

import { useEffect, useState } from "react";
import Link from "next/link";

interface Scenario {
  id: string;
  loan_type: string;
  loan_purpose: string;
  price_range: string;
  down_payment_pct: number;
  credit_tier: string;
  timeline: string;
  state: string;
  notes?: string;
  needs_professional: string;
  response_count: number;
  created_at: string;
  already_responded: boolean;
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

export default function AgentScenariosPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("All");
  const [filterState, setFilterState] = useState("");
  const [modal, setModal] = useState<RespondModal | null>(null);

  const [fee, setFee] = useState("");
  const [approach, setApproach] = useState("");
  const [agentName, setAgentName] = useState("");
  const [agentLicense, setAgentLicense] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    load();
  }, [filterType, filterState]);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ responder_type: "agent" });
    if (filterType !== "All") params.set("loan_type", filterType);
    if (filterState) params.set("state", filterState);
    const res = await fetch(`/api/scenarios?${params}`);
    if (res.ok) {
      const data = await res.json();
      setScenarios(data.scenarios ?? []);
    }
    setLoading(false);
  }

  function openModal(scenario: Scenario) {
    setModal({ scenario });
    setFee(""); setApproach(""); setAgentName(""); setAgentLicense("");
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
        rate_estimate: fee,
        approach,
        lo_name: agentName,
        lo_nmls: agentLicense,
        responder_type: "agent",
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
  }

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return "just now";
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const filtered = scenarios.filter(s => !filterState || s.state === filterState);

  return (
    <>
      <div className="los-root">

        <nav className="los-nav">
          <Link href="/dashboard" className="los-nav-logo">
            <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" />
          </Link>
          <div className="los-nav-links">
            <Link href="/dashboard" className="los-nav-link">Dashboard</Link>
            <Link href="/chat" className="los-nav-link">AI Chat</Link>
            <span className="los-nav-active">Scenario Board</span>
          </div>
        </nav>

        <div className="los-container">

          <div className="los-header">
            <div>
              <h1 className="los-title">Scenario Board — Agents</h1>
              <p className="los-sub">Anonymous borrower scenarios. Respond to earn an introduction — no Zillow, no Redfin, no bought leads.</p>
            </div>
            <div className="los-stats">
              <span className="los-stat">{scenarios.filter(s => !s.already_responded).length} new</span>
            </div>
          </div>

          {/* Filters */}
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
              placeholder="State (e.g. CA)"
              value={filterState}
              onChange={e => setFilterState(e.target.value.toUpperCase().slice(0, 2))}
              maxLength={2}
            />
          </div>

          {loading ? (
            <div className="los-loading">Loading scenarios...</div>
          ) : filtered.length === 0 ? (
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
                    {scenario.needs_professional === "agent" && (
                      <span className="los-agent-only-badge">Agent only</span>
                    )}
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
                      <div className="los-cf-value">{scenario.credit_tier.split(" ")[0]}</div>
                    </div>
                    <div className="los-card-field">
                      <div className="los-cf-label">Timeline</div>
                      <div className="los-cf-value">{scenario.timeline.split(" ")[0]}</div>
                    </div>
                  </div>

                  {scenario.notes && (
                    <p className="los-card-note">"{scenario.notes}"</p>
                  )}

                  <div className="los-card-footer">
                    <span className="los-card-responses">
                      {scenario.response_count} response{scenario.response_count !== 1 ? "s" : ""}
                    </span>
                    {scenario.already_responded ? (
                      <span className="los-responded-badge">✓ Responded</span>
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
                    The borrower will review your response and compare agents.
                    If they choose you, you'll receive their contact info by email — no middleman.
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
                      </p>
                    </div>
                    <button className="los-modal-x" onClick={() => setModal(null)}>✕</button>
                  </div>

                  <div className="los-modal-scenario">
                    <div className="los-ms-grid">
                      <div><span className="los-ms-label">Credit</span><span className="los-ms-val">{modal.scenario.credit_tier}</span></div>
                      <div><span className="los-ms-label">Down</span><span className="los-ms-val">{modal.scenario.down_payment_pct}%</span></div>
                      <div><span className="los-ms-label">Timeline</span><span className="los-ms-val">{modal.scenario.timeline}</span></div>
                    </div>
                    {modal.scenario.notes && (
                      <p className="los-ms-note">"{modal.scenario.notes}"</p>
                    )}
                  </div>

                  <div className="los-modal-fields">
                    <div className="los-mf">
                      <label>Your name <span className="los-mf-req">*</span></label>
                      <input
                        className="los-input"
                        placeholder="First name only is fine"
                        value={agentName}
                        onChange={e => setAgentName(e.target.value)}
                      />
                    </div>
                    <div className="los-mf">
                      <label>License # <span className="los-mf-req">*</span></label>
                      <input
                        className="los-input"
                        placeholder="State license number"
                        value={agentLicense}
                        onChange={e => setAgentLicense(e.target.value)}
                      />
                    </div>
                    <div className="los-mf">
                      <label>Buyer rep fee <span className="los-mf-req">*</span></label>
                      <input
                        className="los-input"
                        placeholder="e.g. 2.5% or seller-paid / negotiable"
                        value={fee}
                        onChange={e => setFee(e.target.value)}
                      />
                      <span className="los-mf-hint">The borrower deserves to know upfront. Be straightforward.</span>
                    </div>
                    <div className="los-mf">
                      <label>Your approach <span className="los-mf-req">*</span></label>
                      <textarea
                        className="los-textarea"
                        placeholder="Why are you the right agent for this buyer? What's your market expertise? What would you do for them? Max 500 characters."
                        maxLength={500}
                        rows={4}
                        value={approach}
                        onChange={e => setApproach(e.target.value)}
                      />
                      <span className="los-mf-count">{approach.length}/500</span>
                    </div>
                  </div>

                  {submitError && <div className="los-modal-error">{submitError}</div>}

                  <div className="los-modal-footer">
                    <button className="los-modal-cancel" onClick={() => setModal(null)}>Cancel</button>
                    <button
                      className="los-modal-submit"
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
        .los-nav-link { color: #6b7a99; text-decoration: none; font-size: 0.875rem; transition: color 0.15s; }
        .los-nav-link:hover { color: #f0f4ff; }
        .los-nav-active { font-size: 0.875rem; color: #f0f4ff; font-weight: 600; }

        .los-container { max-width: 960px; margin: 0 auto; padding: 3rem 1.5rem 5rem; }

        .los-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 2rem; }
        .los-title { font-family: 'Syne', sans-serif; font-size: 1.75rem; font-weight: 700; margin: 0 0 0.3rem; }
        .los-sub { font-size: 0.9rem; color: #6b7a99; margin: 0; }
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
          color: #6b7a99; font-size: 0.82rem; cursor: pointer; transition: all 0.15s;
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

        .los-loading, .los-empty { text-align: center; padding: 4rem 0; color: #6b7a99; }
        .los-empty-icon { font-size: 2rem; margin-bottom: 0.75rem; }

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
        .los-card-purpose { font-size: 0.75rem; color: #6b7a99; }
        .los-agent-only-badge {
          font-size: 0.68rem; font-weight: 600; padding: 2px 8px;
          border-radius: 99px; color: #ff8c42;
          background: rgba(255,140,66,0.1); border: 1px solid rgba(255,140,66,0.25);
        }
        .los-card-time { font-size: 0.72rem; color: #3a4560; margin-left: auto; }

        .los-card-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 0.75rem; }
        .los-cf-label { font-size: 0.68rem; color: #3a4560; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 2px; }
        .los-cf-value { font-size: 0.88rem; font-weight: 600; color: #f0f4ff; }

        .los-card-note { font-size: 0.8rem; color: #6b7a99; font-style: italic; margin: 0 0 0.75rem; line-height: 1.45; }

        .los-card-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.06); }
        .los-card-responses { font-size: 0.75rem; color: #3a4560; }
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
          width: 100%; max-width: 520px;
          max-height: 90vh; overflow-y: auto;
        }
        .los-modal-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; }
        .los-modal-title { font-family: 'Syne', sans-serif; font-size: 1.2rem; font-weight: 700; margin: 0 0 3px; }
        .los-modal-sub { font-size: 0.82rem; color: #6b7a99; margin: 0; }
        .los-modal-x { background: none; border: none; color: #3a4560; font-size: 1.1rem; cursor: pointer; padding: 4px; }
        .los-modal-x:hover { color: #f0f4ff; }

        .los-modal-scenario {
          background: #141b28; border-radius: 10px; padding: 1rem;
          margin-bottom: 1.5rem; border: 1px solid rgba(255,255,255,0.06);
        }
        .los-ms-grid { display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 0.5rem; }
        .los-ms-label { font-size: 0.7rem; color: #3a4560; text-transform: uppercase; letter-spacing: 0.06em; margin-right: 6px; }
        .los-ms-val { font-size: 0.85rem; font-weight: 600; color: #f0f4ff; }
        .los-ms-note { font-size: 0.82rem; color: #6b7a99; font-style: italic; margin: 0.5rem 0 0; }

        .los-modal-fields { display: flex; flex-direction: column; gap: 1rem; }
        .los-mf { display: flex; flex-direction: column; }
        .los-mf label { font-size: 0.78rem; font-weight: 600; color: #6b7a99; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
        .los-mf-req { color: #ff5f5f; }
        .los-input, .los-textarea {
          padding: 10px 14px; background: #141b28;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px; color: #f0f4ff; font-size: 0.9rem;
          outline: none; font-family: inherit;
        }
        .los-input:focus, .los-textarea:focus { border-color: rgba(0,232,122,0.4); }
        .los-textarea { resize: vertical; line-height: 1.5; }
        .los-mf-hint { font-size: 0.75rem; color: #3a4560; margin-top: 5px; line-height: 1.4; }
        .los-mf-count { font-size: 0.72rem; color: #3a4560; text-align: right; margin-top: 4px; }

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
          border: 1px solid rgba(255,255,255,0.10); color: #6b7a99;
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
        .los-modal-success h3 { font-family: 'Syne', sans-serif; font-size: 1.2rem; margin: 0 0 0.75rem; }
        .los-modal-success p { font-size: 0.9rem; color: #6b7a99; line-height: 1.6; margin: 0 0 1.5rem; }
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
