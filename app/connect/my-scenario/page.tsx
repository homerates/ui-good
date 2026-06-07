"use client";
// app/connect/my-scenario/page.tsx
// Borrower's view: their active scenario + LO responses + invite flow

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import ConsumerNav from "../../components/ConsumerNav";

interface Response {
  id: string;
  lo_id: string;
  lo_name: string;
  lo_nmls: string;
  rate_estimate: string;
  approach: string;
  status: string;
  responder_type: string;
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
  closes_at?: string;
  response_window_hours?: number;
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromBlocked = searchParams?.get("from") === "blocked";
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [responses, setResponses] = useState<Response[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [invited, setInvited] = useState<string | null>(null);
  const [closingScenario, setClosingScenario] = useState(false);
  const [messaging, setMessaging] = useState<string | null>(null); // responseId being opened
  const [msgError, setMsgError] = useState("");
  const [wasExpired, setWasExpired] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/scenarios?mine=1");
    if (!res.ok) { setLoading(false); setNotFound(true); return; }
    const data = await res.json();
    if (!data.scenarios || data.scenarios.length === 0) {
      if (data.expired_count > 0) setWasExpired(true);
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

  async function openChat(r: Response) {
    if (!scenario) return;
    setMessaging(r.id);
    setMsgError("");
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        professional_id: r.lo_id,
        scenario_id: scenario.id,
        message: `Hi ${r.lo_name}, I reviewed your response to my scenario and wanted to connect.`,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      router.push(`/messages/${data.thread_id}`);
    } else {
      const data = await res.json().catch(() => ({}));
      setMsgError(data.error ?? "Failed to open chat. Please try again.");
      setMessaging(null);
    }
  }

  async function closeScenario() {
    if (!scenario) return;
    setClosingScenario(true);
    await fetch(`/api/scenarios/${scenario.id}`, { method: "DELETE" });
    if (fromBlocked) {
      router.push("/connect/post");
      return;
    }
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

  const closesIn = (iso: string) => {
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return null;
    const h = Math.floor(ms / 3600000);
    if (h < 1) return "< 1h left";
    if (h < 24) return `${h}h left`;
    return `${Math.floor(h / 24)}d left`;
  };

  return (
    <>
      <div className="ms-root">

        <nav className="ms-nav">
          <Link href="/connect" className="ms-nav-logo">
            <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" />
          </Link>
          <div className="ms-nav-actions">
            <Link href="/chat" className="ms-nav-btn">AI Chat</Link>
            <Link href="/dashboard" className="ms-nav-btn">Dashboard</Link>
            <Link href="/connect/post" className="ms-nav-btn ms-nav-btn-primary">+ New Scenario</Link>
            <ConsumerNav />
          </div>
        </nav>

        <div className="ms-container">

          {loading && (
            <div className="ms-loading">Loading your scenario...</div>
          )}

          {!loading && notFound && (
            <div className="ms-empty">
              <div className="ms-empty-icon">{wasExpired ? "⏰" : "📋"}</div>
              {wasExpired ? (
                <>
                  <h2>Your response window closed</h2>
                  <p>Your scenario's 48-hour response window ended before any loan officers replied. Post a new one — it goes live immediately.</p>
                </>
              ) : (
                <>
                  <h2>No active scenario</h2>
                  <p>You haven't posted a scenario yet. Post one and let loan officers on HomeRates.ai respond.</p>
                </>
              )}
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
                    {scenario.closes_at && closesIn(scenario.closes_at) && (
                      <span className="ms-closes-in">{closesIn(scenario.closes_at)}</span>
                    )}
                  </div>
                  {fromBlocked && scenario.status === "active" && (
                    <div style={{ background: "rgba(255,180,0,0.08)", border: "1px solid rgba(255,180,0,0.25)", borderRadius: 10, padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <span style={{ fontSize: 13, color: "#ffd166", lineHeight: 1.4 }}>
                        Close this scenario to post a new one.
                      </span>
                      <button className="ms-close-btn" onClick={closeScenario} disabled={closingScenario} style={{ flexShrink: 0 }}>
                        {closingScenario ? "Closing..." : "Close & post new →"}
                      </button>
                    </div>
                  )}
                  <div className="ms-scenario-status-row">
                    {scenario.status === "active" && <span className="ms-status-active">● Active</span>}
                    {scenario.status === "matched" && <span className="ms-status-matched">✓ Matched</span>}
                    {scenario.status === "closed" && <span className="ms-status-closed">Closed</span>}
                    {scenario.status === "active" && !fromBlocked && (
                      <button className="ms-close-btn" onClick={closeScenario} disabled={closingScenario}>
                        {closingScenario ? "Withdrawing..." : "Withdraw scenario"}
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

              {/* Matched — what happens next */}
              {scenario.status === "matched" && !invited && (
                <div className="ms-matched-next">
                  <div className="ms-matched-next-icon">✓</div>
                  <div>
                    <div className="ms-matched-next-title">You've selected a professional</div>
                    <div className="ms-matched-next-body">
                      Both of you have each other's contact info. Reach out directly — no middleman, no callbacks you didn't ask for.
                      If it doesn't work out, close this scenario and post a new one any time.
                    </div>
                  </div>
                </div>
              )}

              {/* Responses — split by type */}
              {(() => {
                const loResponses = responses.filter(r => r.responder_type !== "agent");
                const agentResponses = responses.filter(r => r.responder_type === "agent");

                const renderGroup = (group: Response[], startIdx: number, typeLabel: string, licenseLabel: string, valueLabel: string) => (
                  <div className="ms-responses">
                    {group.length === 0 ? (
                      <p className="ms-section-sub" style={{ marginTop: "0.5rem" }}>
                        No {typeLabel.toLowerCase()} responses yet. Check back in a few hours.
                      </p>
                    ) : group.map((r, idx) => (
                      <div
                        key={r.id}
                        className={`ms-response-card ${r.status === "invited" || invited === r.id ? "ms-invited" : ""}`}
                      >
                        <div className="ms-response-top">
                          <div className="ms-lo-id">
                            <span className="ms-lo-letter">
                              {String.fromCharCode(65 + startIdx + idx)}
                            </span>
                            <div>
                              <div className="ms-lo-name">{r.lo_name}</div>
                              <div className="ms-lo-nmls">{licenseLabel} #{r.lo_nmls}</div>
                            </div>
                          </div>
                          <div className="ms-rate-pill" title={valueLabel}>{r.rate_estimate}</div>
                        </div>
                        <p className="ms-approach">"{r.approach}"</p>
                        <div className="ms-response-footer">
                          <span className="ms-response-time">{timeAgo(r.created_at)}</span>
                          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <button
                              className="ms-msg-btn"
                              onClick={() => openChat(r)}
                              disabled={messaging === r.id}
                            >
                              {messaging === r.id ? "Opening..." : "Message"}
                            </button>
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
                      </div>
                    ))}
                  </div>
                );

                return (
                  <>
                    {(scenario as Scenario & { needs_professional?: string }).needs_professional !== "agent" && (
                      <div className="ms-response-header">
                        <h2 className="ms-section-title">
                          {loResponses.length === 0 ? "Waiting for loan officer responses..." : `${loResponses.length} loan officer${loResponses.length > 1 ? "s" : ""} responded`}
                        </h2>
                        {loResponses.length > 0 && scenario.status === "active" && (
                          <p className="ms-section-sub">Compare their rate estimates against your HomeRates.ai analysis. Invite the one you trust.</p>
                        )}
                        {renderGroup(loResponses, 0, "Loan Officer", "NMLS", "Rate estimate")}
                      </div>
                    )}
                    {(scenario as Scenario & { needs_professional?: string }).needs_professional !== "lender" && (
                      <div className="ms-response-header" style={{ marginTop: "2rem" }}>
                        <h2 className="ms-section-title">
                          {agentResponses.length === 0 ? "Waiting for agent responses..." : `${agentResponses.length} agent${agentResponses.length > 1 ? "s" : ""} responded`}
                        </h2>
                        {agentResponses.length > 0 && scenario.status === "active" && (
                          <p className="ms-section-sub">Review their approach and buyer rep fee. Invite the one whose style matches yours.</p>
                        )}
                        {renderGroup(agentResponses, loResponses.length, "Agent", "License", "Buyer rep fee")}
                      </div>
                    )}
                  </>
                );
              })()}

              {msgError && (
                <div className="ms-error-banner">{msgError}</div>
              )}

              {invited && (
                <div className="ms-success-banner">
                  ✓ Introduction sent. Check your email — both of you have each other's contact info. No surprises.
                </div>
              )}

              {scenario.status === "active" && responses.length === 0 && (scenario as Scenario & { needs_professional?: string }).needs_professional !== "agent" && (
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
          overflow-y: auto !important; background: #080c12 !important;
        }
        html:has(.ms-root) { background: #080c12 !important; height: auto !important; overflow-y: auto !important; }
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
        .ms-nav-label { font-size: 0.85rem; color: #8fa3b8; }
        .ms-nav-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
        @media (max-width: 640px) { .ms-nav-label { display: none; } .ms-nav-btn:not(:last-child) { display: none; } }
        .ms-nav-btn {
          padding: 7px 14px; border-radius: 999px; font-size: 0.8rem; font-weight: 600;
          text-decoration: none; color: #8fa3b8;
          border: 1px solid rgba(255,255,255,0.1); background: transparent;
          transition: color 0.15s, border-color 0.15s;
        }
        .ms-nav-btn:hover { color: #f0f4ff; border-color: rgba(255,255,255,0.2); }
        .ms-nav-btn-primary { background: #00e87a; color: #080c12 !important; border-color: transparent !important; }
        .ms-nav-btn-primary:hover { opacity: 0.88; }

        .ms-container { max-width: 860px; margin: 0 auto; padding: 3rem 1.5rem 5rem; }

        .ms-loading, .ms-empty { text-align: center; padding: 5rem 0; color: #8fa3b8; }
        .ms-empty-icon { font-size: 2.5rem; margin-bottom: 1rem; }
        .ms-empty h2 { font-family: 'DM Sans', sans-serif; font-size: 1.4rem; color: #f0f4ff; margin: 0 0 0.75rem; }
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
        .ms-time { font-size: 0.78rem; color: #eaf8f7; }
        .ms-closes-in { font-size: 0.75rem; font-weight: 600; color: #ffa040; background: rgba(255,160,64,0.10); border: 1px solid rgba(255,160,64,0.25); border-radius: 99px; padding: 2px 10px; }
        .ms-scenario-status-row { display: flex; align-items: center; gap: 12px; }
        .ms-status-active { font-size: 0.78rem; color: #00e87a; font-weight: 600; }
        .ms-status-matched { font-size: 0.78rem; color: #3d8bff; font-weight: 600; }
        .ms-status-closed { font-size: 0.78rem; color: #eaf8f7; }
        .ms-close-btn {
          font-size: 0.75rem; color: #eaf8f7; background: none; border: none;
          cursor: pointer; text-decoration: underline; padding: 0;
        }
        .ms-close-btn:hover { color: #8fa3b8; }

        .ms-scenario-grid {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 14px; margin-bottom: 1rem;
        }
        .ms-field-label { font-size: 0.7rem; color: #eaf8f7; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
        .ms-field-value { font-size: 0.9rem; font-weight: 600; color: #f0f4ff; }
        .ms-notes {
          font-size: 0.85rem; color: #8fa3b8; font-style: italic;
          border-top: 1px solid rgba(255,255,255,0.06); padding-top: 0.75rem;
          margin-top: 0.5rem;
        }

        /* Responses section */
        .ms-response-header { margin-bottom: 1.5rem; }
        .ms-section-title {
          font-family: 'DM Sans', sans-serif;
          font-size: 1.2rem; font-weight: 700; color: #f0f4ff; margin: 0 0 0.4rem;
        }
        .ms-section-sub { font-size: 0.88rem; color: #8fa3b8; margin: 0; line-height: 1.5; }

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
        .ms-lo-nmls { font-size: 0.75rem; color: #eaf8f7; font-family: 'DM Mono', monospace; }

        .ms-rate-pill {
          font-size: 0.9rem; font-weight: 700; color: #00e87a;
          background: rgba(0,232,122,0.1); border: 1px solid rgba(0,232,122,0.25);
          border-radius: 99px; padding: 4px 14px; flex-shrink: 0;
        }

        .ms-approach {
          font-size: 0.88rem; color: #8fa3b8;
          line-height: 1.65; margin: 0 0 1rem;
          font-style: italic;
        }

        .ms-response-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .ms-response-time { font-size: 0.75rem; color: #eaf8f7; }

        .ms-invite-btn {
          padding: 8px 20px; background: #00e87a; color: #080c12;
          border: none; border-radius: 999px;
          font-size: 0.875rem; font-weight: 700; cursor: pointer;
          transition: opacity 0.15s;
        }
        .ms-invite-btn:hover:not(:disabled) { opacity: 0.88; }
        .ms-invite-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .ms-msg-btn {
          padding: 8px 16px; background: transparent; color: #3d8bff;
          border: 1px solid rgba(61,139,255,0.35); border-radius: 999px;
          font-size: 0.8rem; font-weight: 600; cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
        }
        .ms-msg-btn:hover:not(:disabled) { background: rgba(61,139,255,0.1); border-color: rgba(61,139,255,0.55); }
        .ms-msg-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .ms-invited-badge { font-size: 0.82rem; color: #00e87a; font-weight: 600; }

        .ms-matched-next {
          display: flex; gap: 14px; align-items: flex-start;
          margin: 1.25rem 0;
          background: rgba(0,232,122,0.06);
          border: 1px solid rgba(0,232,122,0.2);
          border-radius: 14px; padding: 1.25rem 1.5rem;
        }
        .ms-matched-next-icon {
          flex-shrink: 0; width: 36px; height: 36px; border-radius: 50%;
          background: rgba(0,232,122,0.15); color: #00e87a;
          display: flex; align-items: center; justify-content: center;
          font-size: 1rem; font-weight: 700;
        }
        .ms-matched-next-title { font-weight: 700; color: #f0f4ff; margin-bottom: 5px; font-size: 0.95rem; }
        .ms-matched-next-body { font-size: 0.875rem; color: #8fa3b8; line-height: 1.6; }

        .ms-error-banner {
          margin-top: 1rem;
          background: rgba(255,95,95,0.08);
          border: 1px solid rgba(255,95,95,0.25);
          border-radius: 12px; padding: 0.875rem 1.25rem;
          font-size: 0.88rem; color: #ff5f5f; line-height: 1.5;
        }

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
          font-size: 0.875rem; color: #8fa3b8; line-height: 1.55;
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
