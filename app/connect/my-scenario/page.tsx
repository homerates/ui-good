"use client";
// app/connect/my-scenario/page.tsx
// Borrower's view: their active scenario + LO responses + invite flow

import { useEffect, useState } from "react";
import Link from "next/link";

interface Response {
  id: string;
  lo_id: string;
  lo_name: string;
  lo_nmls: string;
  rate_estimate: string;
  approach: string;
  status: string;
  created_at: string;
}

interface Scenario {
  id: string;
  loan_type: string;
  loan_purpose: string;
  price_range: string;
  down_payment_pct: number;
  income_range: string;
  credit_tier: string;
  timeline: string;
  state: string;
  notes?: string;
  status: string;
  response_count: number;
  created_at: string;
}

const LABEL_MAP: Record<string, string> = {
  conventional: "Conventional",
  fha: "FHA",
  va: "VA",
  jumbo: "Jumbo",
  dscr: "DSCR",
  other: "Other",
};

const BADGE_COLOR: Record<string, string> = {
  conventional: "rgba(61,139,255,0.12)",
  fha: "rgba(167,139,250,0.12)",
  va: "rgba(0,232,122,0.10)",
  jumbo: "rgba(255,140,66,0.12)",
  dscr: "rgba(255,95,95,0.10)",
};

export default function MyScenarioPage() {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [responses, setResponses] = useState<Response[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [invited, setInvited] = useState<string | null>(null);
  const [closingScenario, setClosingScenario] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/scenarios?mine=1");
    if (!res.ok) { setLoading(false); setNotFound(true); return; }
    const data = await res.json();
    if (!data.scenarios || data.scenarios.length === 0) {
      setNotFound(true); setLoading(false); return;
    }
    // Get the borrower's own active scenario
    const mine = data.scenarios.find((s: Scenario) => s.status === "active" || s.status === "matched");
    if (!mine) { setNotFound(true); setLoading(false); return; }

    // Load full scenario with responses
    const detail = await fetch(`/api/scenarios/${mine.id}`);
    if (!detail.ok) { setNotFound(true); setLoading(false); return; }
    const d = await detail.json();
    setScenario(d.scenario);
    setResponses(d.responses ?? []);
    setLoading(false);
  }

  async function invite(responseId: string) {
    if (!scenario) return;
    setInviting(responseId);
    const res = await fetch(`/api/scenarios/${scenario.id}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response_id: responseId }),
    });
    if (res.ok) {
      setInvited(responseId);
      setScenario(prev => prev ? { ...prev, status: "matched" } : prev);
    }
    setInviting(null);
  }

  async function closeScenario() {
    if (!scenario) return;
    setClosingScenario(true);
    await fetch(`/api/scenarios/${scenario.id}`, { method: "DELETE" });
    setScenario(prev => prev ? { ...prev, status: "closed" } : prev);
    setClosingScenario(false);
  }

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return "just now";
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <>
      <div className="ms-root">

        <nav className="ms-nav">
          <Link href="/connect" className="ms-nav-logo">
            <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" />
          </Link>
          <span className="ms-nav-label">My Scenario</span>
        </nav>

        <div className="ms-container">

          {loading && (
            <div className="ms-loading">Loading your scenario...</div>
          )}

          {!loading && notFound && (
            <div className="ms-empty">
              <div className="ms-empty-icon">📋</div>
              <h2>No active scenario</h2>
              <p>You haven't posted a scenario yet. Post one and let verified loan officers respond.</p>
              <Link href="/connect/post" className="ms-btn-primary">Post My Scenario →</Link>
            </div>
          )}

          {!loading && scenario && (
            <>
              {/* Scenario card */}
              <div className="ms-scenario-card">
                <div className="ms-scenario-header">
                  <div className="ms-scenario-meta">
                    <span
                      className="ms-loan-badge"
                      style={{ background: BADGE_COLOR[scenario.loan_type] ?? "rgba(61,139,255,0.12)" }}
                    >
                      {LABEL_MAP[scenario.loan_type] ?? scenario.loan_type}
                    </span>
                    <span className="ms-state">{scenario.state}</span>
                    <span className="ms-time">Posted {timeAgo(scenario.created_at)}</span>
                  </div>
                  <div className="ms-scenario-status-row">
                    {scenario.status === "active" && <span className="ms-status-active">● Active</span>}
                    {scenario.status === "matched" && <span className="ms-status-matched">✓ Matched</span>}
                    {scenario.status === "closed" && <span className="ms-status-closed">Closed</span>}
                    {scenario.status === "active" && (
                      <button className="ms-close-btn" onClick={closeScenario} disabled={closingScenario}>
                        {closingScenario ? "Closing..." : "Close scenario"}
                      </button>
                    )}
                  </div>
                </div>

                <div className="ms-scenario-grid">
                  {[
                    ["Price range", scenario.price_range],
                    ["Down payment", `${scenario.down_payment_pct}%`],
                    ["Income", scenario.income_range],
                    ["Credit", scenario.credit_tier],
                    ["Timeline", scenario.timeline],
                    ["Purpose", scenario.loan_purpose],
                  ].map(([label, value]) => (
                    <div key={label} className="ms-field">
                      <div className="ms-field-label">{label}</div>
                      <div className="ms-field-value">{value}</div>
                    </div>
                  ))}
                </div>

                {scenario.notes && (
                  <div className="ms-notes">"{scenario.notes}"</div>
                )}
              </div>

              {/* Response count */}
              <div className="ms-response-header">
                <h2 className="ms-section-title">
                  {responses.length === 0
                    ? "Waiting for responses..."
                    : `${responses.length} loan officer${responses.length > 1 ? "s" : ""} responded`}
                </h2>
                {responses.length > 0 && scenario.status === "active" && (
                  <p className="ms-section-sub">
                    Compare their rate estimates against what HomeRates.ai showed you.
                    When you're ready, invite the one you trust.
                  </p>
                )}
                {responses.length === 0 && (
                  <p className="ms-section-sub">
                    Verified loan officers on HomeRates.ai can see your anonymous scenario.
                    Check back in a few hours.
                  </p>
                )}
              </div>

              {/* Responses */}
              <div className="ms-responses">
                {responses.map((r, idx) => (
                  <div
                    key={r.id}
                    className={`ms-response-card ${r.status === "invited" || invited === r.id ? "ms-invited" : ""}`}
                  >
                    <div className="ms-response-top">
                      <div className="ms-lo-id">
                        <span className="ms-lo-letter">
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <div>
                          <div className="ms-lo-name">{r.lo_name}</div>
                          <div className="ms-lo-nmls">NMLS #{r.lo_nmls}</div>
                        </div>
                      </div>
                      <div className="ms-rate-pill">{r.rate_estimate}</div>
                    </div>

                    <p className="ms-approach">"{r.approach}"</p>

                    <div className="ms-response-footer">
                      <span className="ms-response-time">{timeAgo(r.created_at)}</span>
                      {(r.status === "invited" || invited === r.id) ? (
                        <span className="ms-invited-badge">✓ Introduction sent</span>
                      ) : scenario.status === "active" ? (
                        <button
                          className="ms-invite-btn"
                          onClick={() => invite(r.id)}
                          disabled={inviting === r.id || !!invited}
                        >
                          {inviting === r.id ? "Sending..." : "Invite to connect →"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              {invited && (
                <div className="ms-success-banner">
                  ✓ Introduction sent. Check your email — both of you have each other's contact info. No surprises.
                </div>
              )}

              {scenario.status === "active" && responses.length === 0 && (
                <div className="ms-ai-tip">
                  <div className="ms-ai-tip-icon">💡</div>
                  <div>
                    <strong>Tip:</strong> While you wait, use HomeRates.ai to run your scenario through the calculator.
                    When LOs respond, you'll know immediately if their rate quote is honest.{" "}
                    <Link href="/chat" className="ms-ai-link">Run my analysis →</Link>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        body:has(.ms-root) {
          display: block !important; height: auto !important;
          overflow: visible !important; background: #080c12 !important;
        }
        html:has(.ms-root) { background: #080c12 !important; }
        body:has(.ms-root) .app-footer { display: none; }

        .ms-root { font-family: 'DM Sans', system-ui, sans-serif; color: #f0f4ff; min-height: 100vh; background: #080c12; }

        .ms-nav {
          position: sticky; top: 0; z-index: 100;
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 24px;
          background: rgba(8,12,18,0.95); backdrop-filter: blur(8px);
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .ms-nav-logo img { height: 28px; }
        .ms-nav-label { font-size: 0.85rem; color: #6b7a99; }

        .ms-container { max-width: 680px; margin: 0 auto; padding: 3rem 1.5rem 5rem; }

        .ms-loading, .ms-empty { text-align: center; padding: 5rem 0; color: #6b7a99; }
        .ms-empty-icon { font-size: 2.5rem; margin-bottom: 1rem; }
        .ms-empty h2 { font-family: 'Syne', sans-serif; font-size: 1.4rem; color: #f0f4ff; margin: 0 0 0.75rem; }
        .ms-empty p { margin: 0 0 2rem; line-height: 1.6; }

        /* Scenario card */
        .ms-scenario-card {
          background: #0e1420;
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 16px; padding: 1.75rem;
          margin-bottom: 2rem;
        }
        .ms-scenario-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          margin-bottom: 1.25rem; flex-wrap: wrap; gap: 10px;
        }
        .ms-scenario-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .ms-loan-badge {
          font-size: 0.75rem; font-weight: 700; padding: 4px 12px;
          border-radius: 99px; color: #3d8bff;
          border: 1px solid rgba(61,139,255,0.25);
        }
        .ms-state { font-size: 0.85rem; color: #f0f4ff; font-weight: 500; }
        .ms-time { font-size: 0.78rem; color: #3a4560; }
        .ms-scenario-status-row { display: flex; align-items: center; gap: 12px; }
        .ms-status-active { font-size: 0.78rem; color: #00e87a; font-weight: 600; }
        .ms-status-matched { font-size: 0.78rem; color: #3d8bff; font-weight: 600; }
        .ms-status-closed { font-size: 0.78rem; color: #3a4560; }
        .ms-close-btn {
          font-size: 0.75rem; color: #3a4560; background: none; border: none;
          cursor: pointer; text-decoration: underline; padding: 0;
        }
        .ms-close-btn:hover { color: #6b7a99; }

        .ms-scenario-grid {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 14px; margin-bottom: 1rem;
        }
        .ms-field-label { font-size: 0.7rem; color: #3a4560; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
        .ms-field-value { font-size: 0.9rem; font-weight: 600; color: #f0f4ff; }
        .ms-notes {
          font-size: 0.85rem; color: #6b7a99; font-style: italic;
          border-top: 1px solid rgba(255,255,255,0.06); padding-top: 0.75rem;
          margin-top: 0.5rem;
        }

        /* Responses section */
        .ms-response-header { margin-bottom: 1.5rem; }
        .ms-section-title {
          font-family: 'Syne', sans-serif;
          font-size: 1.2rem; font-weight: 700; color: #f0f4ff; margin: 0 0 0.4rem;
        }
        .ms-section-sub { font-size: 0.88rem; color: #6b7a99; margin: 0; line-height: 1.5; }

        .ms-responses { display: flex; flex-direction: column; gap: 12px; }

        .ms-response-card {
          background: #0e1420;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px; padding: 1.5rem;
          transition: border-color 0.15s;
        }
        .ms-response-card.ms-invited { border-color: rgba(0,232,122,0.3); }

        .ms-response-top {
          display: flex; align-items: flex-start; justify-content: space-between;
          margin-bottom: 0.75rem; gap: 12px;
        }
        .ms-lo-id { display: flex; align-items: center; gap: 12px; }
        .ms-lo-letter {
          width: 36px; height: 36px; border-radius: 50%;
          background: rgba(61,139,255,0.12); color: #3d8bff;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 0.9rem; flex-shrink: 0;
        }
        .ms-lo-name { font-weight: 600; font-size: 0.95rem; color: #f0f4ff; }
        .ms-lo-nmls { font-size: 0.75rem; color: #3a4560; font-family: 'DM Mono', monospace; }

        .ms-rate-pill {
          font-size: 0.9rem; font-weight: 700; color: #00e87a;
          background: rgba(0,232,122,0.1); border: 1px solid rgba(0,232,122,0.25);
          border-radius: 99px; padding: 4px 14px; flex-shrink: 0;
        }

        .ms-approach {
          font-size: 0.88rem; color: #6b7a99;
          line-height: 1.65; margin: 0 0 1rem;
          font-style: italic;
        }

        .ms-response-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .ms-response-time { font-size: 0.75rem; color: #3a4560; }

        .ms-invite-btn {
          padding: 8px 20px; background: #00e87a; color: #080c12;
          border: none; border-radius: 999px;
          font-size: 0.875rem; font-weight: 700; cursor: pointer;
          transition: opacity 0.15s;
        }
        .ms-invite-btn:hover:not(:disabled) { opacity: 0.88; }
        .ms-invite-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .ms-invited-badge { font-size: 0.82rem; color: #00e87a; font-weight: 600; }

        .ms-success-banner {
          margin-top: 1.5rem;
          background: rgba(0,232,122,0.08);
          border: 1px solid rgba(0,232,122,0.25);
          border-radius: 12px; padding: 1rem 1.25rem;
          font-size: 0.9rem; color: #00e87a; line-height: 1.5;
        }

        .ms-ai-tip {
          display: flex; gap: 12px; align-items: flex-start;
          margin-top: 2rem;
          background: rgba(61,139,255,0.06);
          border: 1px solid rgba(61,139,255,0.15);
          border-radius: 12px; padding: 1rem 1.25rem;
          font-size: 0.875rem; color: #6b7a99; line-height: 1.55;
        }
        .ms-ai-tip-icon { font-size: 1.2rem; flex-shrink: 0; }
        .ms-ai-link { color: #3d8bff; text-decoration: none; }
        .ms-ai-link:hover { text-decoration: underline; }

        .ms-btn-primary {
          display: inline-block; padding: 12px 28px;
          background: #00e87a; color: #080c12;
          border-radius: 999px; font-weight: 700;
          text-decoration: none; font-size: 0.95rem;
        }

        @media (max-width: 500px) {
          .ms-scenario-grid { grid-template-columns: repeat(2, 1fr); }
          .ms-response-top { flex-direction: column; }
        }
      `}</style>
    </>
  );
}
