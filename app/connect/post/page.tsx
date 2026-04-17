"use client";
// app/connect/post/page.tsx
// Borrower posts an anonymous scenario brief — 2-step form
// Path A: arrived from a LenderChecklistCard with scenario context (params pre-fill form)
// Path B: cold arrival — show nudge to run a scenario first

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import AppNav from "../../components/AppNav";

const LOAN_TYPES = ["Conventional", "FHA", "VA", "Jumbo", "DSCR", "Other"];
const PURPOSES = ["Purchase", "Refinance"];
const PRICE_RANGES = ["Under $300k", "$300k–$400k", "$400k–$500k", "$500k–$750k", "$750k–$1M", "$1M–$1.5M", "$1.5M+"];
const DOWN_PAYMENTS = [3, 3.5, 5, 10, 15, 20, 25, 30];
const INCOME_RANGES = ["Under $60k", "$60k–$80k", "$80k–$100k", "$100k–$150k", "$150k–$200k", "$200k+"];
const CREDIT_TIERS = ["Excellent (740+)", "Good (700–739)", "Fair (660–699)", "Below 660"];
const TIMELINES = ["ASAP (under 30 days)", "1–2 months", "3–6 months", "Just researching"];
const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

function priceToRange(price: number): string {
  if (price < 300000) return "Under $300k";
  if (price < 400000) return "$300k–$400k";
  if (price < 500000) return "$400k–$500k";
  if (price < 750000) return "$500k–$750k";
  if (price < 1000000) return "$750k–$1M";
  if (price < 1500000) return "$1M–$1.5M";
  return "$1.5M+";
}

function fmt$(n: number) { return `$${Math.round(n).toLocaleString()}`; }

// ── Inner component uses useSearchParams (needs Suspense boundary) ─────────

function PostScenarioContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn } = useAuth();

  // Redirect signed-out users to sign-in, preserving return URL
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/sign-in?redirect_url=" + encodeURIComponent("/connect/post" + (typeof window !== "undefined" ? window.location.search : "")));
    }
  }, [isLoaded, isSignedIn, router]);

  // Detect Path A: arrived from a scenario card
  const fromScenario = searchParams?.get("from") === "scenario";
  const scLoanType  = searchParams?.get("lt") ?? "";
  const scPrice     = Number(searchParams?.get("price") ?? 0);
  const scDp        = Number(searchParams?.get("dp") ?? 0);
  const scRate      = Number(searchParams?.get("rate") ?? 0);
  const scMonthly   = Number(searchParams?.get("monthly") ?? 0);
  const scTerm      = Number(searchParams?.get("term") ?? 30);
  const scPurpose   = searchParams?.get("purpose") ?? "Purchase";

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [hitLimit, setHitLimit] = useState(false);
  const [existingScenarioId, setExistingScenarioId] = useState<string | null>(null);
  const [closingOld, setClosingOld] = useState(false);

  // Quota state — checked on mount so user sees gate before filling the form
  const [quota, setQuota] = useState<{ used: number; limit: number | null; allowed: boolean; plan: string } | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(true);

  // Referral state — if this borrower was referred by a professional, scenarios default to private
  const [referredProName, setReferredProName] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<"private" | "public">("public");

  useEffect(() => {
    fetch("/api/scenarios/quota")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setQuota(data); })
      .catch(() => {})
      .finally(() => setQuotaLoading(false));

    // Check if this user was referred — used to set default visibility
    fetch("/api/profile")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.referred_by_name) {
          setReferredProName(data.referred_by_name);
          setVisibility("private"); // default: protect the referral
        }
      })
      .catch(() => {});
  }, []);

  const [form, setForm] = useState({
    needs_professional: "lender",
    loan_type: "",
    loan_purpose: "Purchase",
    price_range: "",
    down_payment_pct: "",
    income_range: "",
    credit_tier: "",
    timeline: "",
    state: "",
    notes: "",
    max_responses: "3",
    response_window_hours: "48",
    anonymity_level: "full",
  });

  // Pre-fill form from scenario params on first render
  useEffect(() => {
    if (!fromScenario) return;
    const isVA = scLoanType === "VA";
    setForm(prev => ({
      ...prev,
      loan_type:        LOAN_TYPES.includes(scLoanType) ? scLoanType : "Conventional",
      loan_purpose:     PURPOSES.includes(scPurpose) ? scPurpose : prev.loan_purpose,
      price_range:      scPrice > 0 ? priceToRange(scPrice) : prev.price_range,
      // VA loans: always 0% down; otherwise use card dp if present
      down_payment_pct: isVA ? "0" : (scDp > 0 ? String(scDp) : prev.down_payment_pct),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When loan type is manually switched to VA, auto-set 0% down
  useEffect(() => {
    if (form.loan_type === "VA") set("down_payment_pct", "0");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.loan_type]);

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const isVA = form.loan_type === "VA" || (fromScenario && scLoanType === "VA");
  const dpOptions = isVA ? [0, ...DOWN_PAYMENTS] : DOWN_PAYMENTS;

  // Loan type required; when arriving from scenario it's set automatically (defaults to Conventional)
  const step1Valid = form.loan_purpose && form.price_range && form.down_payment_pct && form.loan_type;
  const step2Valid = form.income_range && form.credit_tier && form.timeline && form.state;

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          loan_type: form.loan_type.toLowerCase().replace(/ /g, "_"),
          down_payment_pct: parseFloat(form.down_payment_pct),
          max_responses: parseInt(form.max_responses),
          response_window_hours: parseInt(form.response_window_hours),
          visibility, // 'private' (referred) or 'public' (Match Board)
          // Card snapshot: only attach if the user hasn't changed down payment from
          // the original card. If they changed dp, the price/monthly no longer match
          // the card and the snapshot would be misleading to LOs.
          ...(fromScenario && scPrice > 0 && (Number(form.down_payment_pct) === scDp || !scDp) ? {
            card_price:    scPrice,
            card_dp_pct:   scDp,
            card_rate:     scRate,
            card_monthly:  scMonthly,
            card_term:     scTerm,
          } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.existing_id) {
          setExistingScenarioId(data.existing_id);
          setError("active_scenario_blocked");
          setSubmitting(false);
          return;
        }
        if (data.upgrade) {
          setHitLimit(true);
          setSubmitting(false);
          return;
        }
        setError(data.error ?? "Something went wrong");
        setSubmitting(false);
        return;
      }
      router.push("/connect/my-scenario");
    } catch {
      setError("Network error — please try again");
      setSubmitting(false);
    }
  }

  async function closeOldAndReturn() {
    if (!existingScenarioId) return;
    setClosingOld(true);
    await fetch(`/api/scenarios/${existingScenarioId}`, { method: "DELETE" });
    router.push("/chat");
  }

  return (
    <>
      <div className="post-root">

        <nav className="post-nav">
          <Link href="/connect" className="post-nav-logo">
            <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" />
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Usage badge — shown once quota loads and limit is finite */}
            {!quotaLoading && quota && quota.limit !== null && (
              <span className={`post-quota-badge ${quota.allowed ? (quota.used >= quota.limit - 1 ? 'warn' : '') : 'full'}`}>
                {quota.allowed
                  ? `${quota.used} of ${quota.limit} posts used this month`
                  : `${quota.limit} of ${quota.limit} posts used — limit reached`}
              </span>
            )}
            <AppNav drawerOnly />
          </div>
        </nav>

        <div className="post-container">

          {/* ── Quota gate — shown immediately if at limit, before the form ── */}
          {!quotaLoading && quota && !quota.allowed && (
            <div className="post-hard-gate">
              <div className="post-hard-gate-icon">⚡</div>
              <h2 className="post-hard-gate-title">You've used your {quota.limit} free posts this month</h2>
              <p className="post-hard-gate-body">
                Free accounts can post {quota.limit} scenarios per calendar month. Your limit resets on the 1st.
                Upgrade to <strong>Plus ($7/mo)</strong> for unlimited posts, unlimited chat, PDF exports, and rate alerts.
              </p>
              <div className="post-hard-gate-actions">
                <a href="/pricing" className="post-hard-gate-btn">Upgrade to Plus — $7/mo →</a>
                <Link href="/connect" className="post-hard-gate-ghost">Back to Lender Match</Link>
              </div>
              <p className="post-hard-gate-note">Already upgraded? It may take a moment to reflect — try refreshing.</p>
            </div>
          )}

          {/* ── Form — only shown if quota allows or still loading ── */}
          {(quotaLoading || !quota || quota.allowed) && <>

          {/* ── Path A: Scenario attached banner ── */}
          {fromScenario && (
            <div className="post-scenario-banner">
              <div className="post-scenario-banner-header">
                <span className="post-scenario-badge">✓ Scenario attached</span>
                <span className="post-scenario-badge-sub">Your matched professional will see these numbers — no re-entering required.</span>
              </div>
              <div className="post-scenario-grid">
                {scLoanType && (
                  <div className="post-scenario-field">
                    <div className="post-scenario-label">Loan type</div>
                    <div className="post-scenario-value">{scLoanType}</div>
                  </div>
                )}
                {scPrice > 0 && (
                  <div className="post-scenario-field">
                    <div className="post-scenario-label">Home price</div>
                    <div className="post-scenario-value">{fmt$(scPrice)}</div>
                  </div>
                )}
                {scDp > 0 && (
                  <div className="post-scenario-field">
                    <div className="post-scenario-label">Down payment</div>
                    <div className="post-scenario-value">{scDp}%</div>
                  </div>
                )}
                {scRate > 0 && (
                  <div className="post-scenario-field">
                    <div className="post-scenario-label">Rate used</div>
                    <div className="post-scenario-value">{scRate.toFixed(2)}%</div>
                  </div>
                )}
                {scMonthly > 0 && (
                  <div className="post-scenario-field">
                    <div className="post-scenario-label">Est. monthly P&I</div>
                    <div className="post-scenario-value">{fmt$(scMonthly)}/mo</div>
                  </div>
                )}
                {scTerm > 0 && (
                  <div className="post-scenario-field">
                    <div className="post-scenario-label">Term</div>
                    <div className="post-scenario-value">{scTerm}-year</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Progress */}
          <div className="post-progress">
            <div className={`post-prog-step ${step >= 1 ? "active" : ""}`}>
              <span>1</span> Loan Details
            </div>
            <div className="post-prog-line" />
            <div className={`post-prog-step ${step >= 2 ? "active" : ""}`}>
              <span>2</span> About You
            </div>
            <div className="post-prog-line" />
            <div className={`post-prog-step ${step >= 3 ? "active" : ""}`}>
              <span>3</span> Review & Post
            </div>
          </div>

          <div className="post-card">

            {step === 1 && (
              <>
                <h1 className="post-title">Tell us about the loan</h1>
                {fromScenario ? (
                  <p className="post-sub">Fields pre-filled from your scenario — adjust anything that doesn't fit.</p>
                ) : (
                  <>
                    <p className="post-sub">This is what professionals will see — no personal details.</p>
                    <div className="post-cold-nudge">
                      💡 <strong>Better responses start with real numbers.</strong>{" "}
                      <Link href="/chat">Run a quick scenario first</Link> and your loan details will carry over automatically.
                    </div>
                  </>
                )}

                <div className="post-field">
                  <label>Who do you need?</label>
                  <div className="post-chips">
                    {[
                      { v: "both", label: "Lender + Agent" },
                      { v: "lender", label: "Lender only" },
                      { v: "agent", label: "Agent only" },
                    ].map(({ v, label }) => (
                      <button key={v} className={`post-chip ${form.needs_professional === v ? "selected" : ""}`} onClick={() => set("needs_professional", v)}>{label}</button>
                    ))}
                  </div>
                </div>

                {/* Loan type — hidden when from scenario (already shown in banner) */}
                {!fromScenario && (
                  <div className="post-field">
                    <label>Loan type <span className="post-optional">(optional)</span></label>
                    <div className="post-chips">
                      {LOAN_TYPES.map(t => (
                        <button key={t} className={`post-chip ${form.loan_type === t ? "selected" : ""}`} onClick={() => set("loan_type", t)}>{t}</button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="post-field">
                  <label>Purpose</label>
                  <div className="post-chips">
                    {PURPOSES.map(p => (
                      <button key={p} className={`post-chip ${form.loan_purpose === p ? "selected" : ""}`} onClick={() => set("loan_purpose", p)}>{p}</button>
                    ))}
                  </div>
                </div>

                <div className="post-field">
                  <label>Price range</label>
                  <div className="post-chips">
                    {PRICE_RANGES.map(r => (
                      <button key={r} className={`post-chip ${form.price_range === r ? "selected" : ""}`} onClick={() => set("price_range", r)}>{r}</button>
                    ))}
                  </div>
                </div>

                <div className="post-field">
                  <label>Down payment {isVA && <span className="post-optional">(VA — 0% eligible)</span>}</label>
                  <div className="post-chips">
                    {dpOptions.map(d => (
                      <button key={d} className={`post-chip ${form.down_payment_pct === String(d) ? "selected" : ""}`} onClick={() => set("down_payment_pct", String(d))}>{d}%</button>
                    ))}
                  </div>
                </div>

                <button className="post-btn" disabled={!step1Valid} onClick={() => setStep(2)}>
                  Continue →
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <h1 className="post-title">A bit about your situation</h1>
                <p className="post-sub">Helps lenders give you a real answer. Still anonymous.</p>

                <div className="post-field">
                  <label>Household income range</label>
                  <div className="post-chips">
                    {INCOME_RANGES.map(r => (
                      <button key={r} className={`post-chip ${form.income_range === r ? "selected" : ""}`} onClick={() => set("income_range", r)}>{r}</button>
                    ))}
                  </div>
                </div>

                <div className="post-field">
                  <label>Credit score tier (self-reported)</label>
                  <div className="post-chips">
                    {CREDIT_TIERS.map(t => (
                      <button key={t} className={`post-chip ${form.credit_tier === t ? "selected" : ""}`} onClick={() => set("credit_tier", t)}>{t}</button>
                    ))}
                  </div>
                </div>

                <div className="post-field">
                  <label>Timeline</label>
                  <div className="post-chips">
                    {TIMELINES.map(t => (
                      <button key={t} className={`post-chip ${form.timeline === t ? "selected" : ""}`} onClick={() => set("timeline", t)}>{t}</button>
                    ))}
                  </div>
                </div>

                <div className="post-field">
                  <label>State</label>
                  <select className="post-select" value={form.state} onChange={e => set("state", e.target.value)}>
                    <option value="">Select state</option>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* ── Matching controls ── */}
                <div className="post-matching-section">
                  <div className="post-matching-title">Your matching preferences</div>
                  <div className="post-matching-body">
                    You control exactly how many professionals respond and how long the request stays open.
                    Once the limit is reached, the request closes automatically.
                  </div>

                  <div className="post-field">
                    <label>Max responses <span className="post-optional">(default 3, max 5)</span></label>
                    <div className="post-chips">
                      {["1", "2", "3", "4", "5"].map(n => (
                        <button key={n} className={`post-chip ${form.max_responses === n ? "selected" : ""}`} onClick={() => set("max_responses", n)}>{n}</button>
                      ))}
                    </div>
                    <span className="post-field-hint">When this limit is reached, the post closes. No more responses come in.</span>
                  </div>

                  <div className="post-field">
                    <label>Response window</label>
                    <div className="post-chips">
                      {[
                        { v: "24", label: "24 hours" },
                        { v: "48", label: "48 hours" },
                        { v: "72", label: "72 hours" },
                      ].map(({ v, label }) => (
                        <button key={v} className={`post-chip ${form.response_window_hours === v ? "selected" : ""}`} onClick={() => set("response_window_hours", v)}>{label}</button>
                      ))}
                    </div>
                    <span className="post-field-hint">After this window closes, no new responses are accepted regardless of count.</span>
                  </div>
                </div>

                {/* Visibility — only shown for referred borrowers */}
                {referredProName && (
                  <div className="post-field">
                    <label>Who can see your scenario?</label>
                    <div className="post-vis-options">
                      <button
                        className={`post-vis-option ${visibility === "private" ? "selected" : ""}`}
                        onClick={() => setVisibility("private")}
                      >
                        <span className="post-vis-icon">🔒</span>
                        <div>
                          <div className="post-vis-title">Private — {referredProName} only</div>
                          <div className="post-vis-sub">Only your professional can see and respond. No one else on the platform.</div>
                        </div>
                      </button>
                      <button
                        className={`post-vis-option ${visibility === "public" ? "selected" : ""}`}
                        onClick={() => setVisibility("public")}
                      >
                        <span className="post-vis-icon">🌐</span>
                        <div>
                          <div className="post-vis-title">Match Board — open to all professionals on HomeRates.ai</div>
                          <div className="post-vis-sub">More options, but your professional will compete with others.</div>
                        </div>
                      </button>
                    </div>
                    <span className="post-field-hint">
                      {referredProName} referred you to HomeRates.ai. Private keeps your scenario exclusive to them.
                    </span>
                  </div>
                )}

                <div className="post-row">
                  <button className="post-btn-ghost" onClick={() => setStep(1)}>← Back</button>
                  <button className="post-btn" disabled={!step2Valid} onClick={() => setStep(3)}>Continue →</button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h1 className="post-title">Review your scenario</h1>
                <p className="post-sub">This is exactly what professionals will see. No personal info is shared.</p>

                {/* Path A: show attached scenario card — only when dp still matches (snapshot will be attached) */}
                {fromScenario && scPrice > 0 && (Number(form.down_payment_pct) === scDp || !scDp) && (
                  <div className="post-scenario-review">
                    <div className="post-scenario-review-label">Scenario card attached</div>
                    <div className="post-scenario-review-row">
                      {scLoanType && <span><strong>{scLoanType}</strong></span>}
                      {scPrice > 0 && <span>{fmt$(scPrice)}</span>}
                      {form.down_payment_pct && <span>{form.down_payment_pct}% down</span>}
                      {scRate > 0 && <span>{scRate.toFixed(2)}% rate</span>}
                      {scMonthly > 0 && <span>{fmt$(scMonthly)}/mo P&I</span>}
                      {scTerm > 0 && <span>{scTerm}-year</span>}
                    </div>
                  </div>
                )}

                <div className="post-review-grid">
                  {[
                    ["Need", form.needs_professional === "both" ? "Lender + Agent" : form.needs_professional === "agent" ? "Agent only" : "Lender only"],
                    ["Loan type", form.loan_type],
                    ["Purpose", form.loan_purpose],
                    ["Price range", form.price_range],
                    ["Down payment", `${form.down_payment_pct}%`],
                    ["Income range", form.income_range],
                    ["Credit tier", form.credit_tier],
                    ["Timeline", form.timeline],
                    ["State", form.state],
                    ["Max responses", `${form.max_responses} professionals`],
                    ["Window", `${form.response_window_hours}h — closes automatically`],
                    ...(referredProName ? [["Visibility", visibility === "private" ? `🔒 Private — ${referredProName} only` : "🌐 Match Board — open to professionals on HomeRates.ai"]] : []),
                  ].map(([label, value]) => (
                    <div key={label} className="post-review-field">
                      <div className="post-review-label">{label}</div>
                      <div className="post-review-value">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="post-field">
                  <label>Optional note <span className="post-optional">(visible to professionals)</span></label>
                  <textarea
                    className="post-textarea"
                    placeholder="e.g. First-time buyer, open to ARM, have a co-borrower..."
                    maxLength={280}
                    value={form.notes}
                    onChange={e => set("notes", e.target.value)}
                    rows={3}
                  />
                  <div className="post-char-count">{form.notes.length}/280</div>
                </div>

                <div className="post-privacy-note">
                  🔒 Your name, email, and contact info are never shared until you choose to invite a specific professional.
                  {fromScenario && scPrice > 0 && (
                    <> Your matched professional will also see your scenario card (loan details above) — no personal data is included in the card.</>
                  )}
                </div>

                {hitLimit && (
                  <div className="post-limit-gate">
                    <div className="post-limit-icon">⚡</div>
                    <div className="post-limit-title">Monthly limit reached</div>
                    <div className="post-limit-body">
                      Free accounts can post 2 scenarios per calendar month. Upgrade to{' '}
                      <strong>Plus ($7/mo)</strong> for unlimited posts, unlimited chat, PDF exports, and rate alerts.
                    </div>
                    <a href="/pricing" className="post-limit-btn">Upgrade to Plus — $7/mo →</a>
                  </div>
                )}

                {!hitLimit && error === "active_scenario_blocked" && (
                  <div style={{ background: "rgba(255,60,60,0.08)", border: "1px solid rgba(255,60,60,0.3)", borderRadius: 12, padding: "20px 24px", textAlign: "center" }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#ff6b6b", marginBottom: 6 }}>You already have an open scenario</div>
                    <div style={{ fontSize: 13, color: "#8fa3b8", marginBottom: 18, lineHeight: 1.5 }}>Close your previous scenario first, then you can post a new one.</div>
                    <button
                      onClick={closeOldAndReturn}
                      disabled={closingOld}
                      style={{ width: "100%", background: "#e03e3e", color: "#fff", fontWeight: 700, fontSize: 15, padding: "14px 20px", borderRadius: 10, border: "none", cursor: closingOld ? "not-allowed" : "pointer", opacity: closingOld ? 0.7 : 1 }}
                    >
                      {closingOld ? "Closing..." : "Close Previous Scenario"}
                    </button>
                  </div>
                )}
                {!hitLimit && error && error !== "active_scenario_blocked" && (
                  <div className="post-error">{error}</div>
                )}

                <div className="post-row">
                  <button className="post-btn-ghost" onClick={() => setStep(2)}>← Back</button>
                  <button className="post-btn" disabled={submitting} onClick={submit}>
                    {submitting ? "Posting..." : "Post My Scenario →"}
                  </button>
                </div>
              </>
            )}
          </div>

          </> /* end quota-allowed form */}

        </div>
      </div>

      <style>{`
        body:has(.post-root) {
          display: block !important; height: auto !important;
          overflow-y: auto !important; background: #080c12 !important;
        }
        html:has(.post-root) { background: #080c12 !important; height: auto !important; overflow-y: auto !important; }
        body:has(.post-root) .app-footer { display: none; }

        .post-root { font-family: 'DM Sans', system-ui, sans-serif; color: #f0f4ff; min-height: 100vh; background: #080c12; }

        /* ── Quota badge in nav ── */
        .post-quota-badge {
          font-size: 0.75rem; font-weight: 600;
          padding: 4px 12px; border-radius: 99px;
          background: rgba(0,232,122,0.08); color: rgba(0,232,122,0.7);
          border: 1px solid rgba(0,232,122,0.18);
        }
        .post-quota-badge.warn {
          background: rgba(255,140,66,0.08); color: #ff8c42;
          border-color: rgba(255,140,66,0.25);
        }
        .post-quota-badge.full {
          background: rgba(255,95,95,0.08); color: #ff5f5f;
          border-color: rgba(255,95,95,0.25);
        }

        /* ── Hard gate (shown before form when limit reached) ── */
        .post-hard-gate {
          max-width: 480px; margin: 3rem auto;
          background: #0e1420;
          border: 1px solid rgba(255,95,95,0.2);
          border-radius: 18px; padding: 3rem 2rem;
          text-align: center;
        }
        .post-hard-gate-icon { font-size: 2.5rem; margin-bottom: 1rem; }
        .post-hard-gate-title {
          font-family: 'DM Sans', sans-serif;
          font-size: 1.35rem; font-weight: 700;
          margin: 0 0 0.75rem; color: #f0f4ff;
        }
        .post-hard-gate-body {
          font-size: 0.9rem; color: #8fa3b8;
          line-height: 1.65; margin: 0 0 1.75rem;
        }
        .post-hard-gate-body strong { color: #00e87a; }
        .post-hard-gate-actions { display: flex; flex-direction: column; gap: 10px; align-items: center; }
        .post-hard-gate-btn {
          display: inline-block; padding: 13px 32px;
          background: #00e87a; color: #080c12;
          border-radius: 999px; font-size: 0.95rem;
          font-weight: 700; text-decoration: none;
          transition: opacity 0.15s; width: 100%; max-width: 320px; text-align: center;
        }
        .post-hard-gate-btn:hover { opacity: 0.88; }
        .post-hard-gate-ghost {
          font-size: 0.85rem; color: #8fa3b8; text-decoration: none;
        }
        .post-hard-gate-ghost:hover { color: #f0f4ff; }
        .post-hard-gate-note {
          font-size: 0.75rem; color: #3a4560;
          margin: 1.5rem 0 0; line-height: 1.5;
        }

        .post-nav {
          position: sticky; top: 0; z-index: 100;
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 24px;
          background: rgba(8,12,18,0.95); backdrop-filter: blur(8px);
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .post-nav-logo img { height: 28px; }
        .post-nav-label { font-size: 0.85rem; color: #8fa3b8; }

        .post-container { max-width: 860px; margin: 0 auto; padding: 2rem 1.5rem 5rem; }

        /* ── Scenario attached banner (Path A) ── */
        .post-scenario-banner {
          background: rgba(0,232,122,0.05);
          border: 1px solid rgba(0,232,122,0.22);
          border-radius: 14px;
          padding: 14px 18px;
          margin-bottom: 1.5rem;
        }
        .post-scenario-banner-header {
          display: flex; align-items: center; gap: 10px;
          flex-wrap: wrap; margin-bottom: 10px;
        }
        .post-scenario-badge {
          font-size: 0.78rem; font-weight: 700;
          background: rgba(0,232,122,0.12); color: #00e87a;
          border: 1px solid rgba(0,232,122,0.3);
          border-radius: 99px; padding: 3px 10px;
        }
        .post-scenario-badge-sub {
          font-size: 0.78rem; color: #8fa3b8;
        }
        .post-scenario-grid {
          display: flex; flex-wrap: wrap; gap: 8px 20px;
        }
        .post-scenario-field {}
        .post-scenario-label {
          font-size: 0.68rem; color: #3a4560;
          text-transform: uppercase; letter-spacing: 0.06em;
          margin-bottom: 1px;
        }
        .post-scenario-value {
          font-size: 0.9rem; font-weight: 700; color: #f0f4ff;
        }

        /* ── Cold arrival nudge (Path B) ── */
        .post-cold-nudge {
          font-size: 0.84rem; color: #8fa3b8;
          background: rgba(61,139,255,0.06);
          border: 1px solid rgba(61,139,255,0.15);
          border-radius: 10px; padding: 10px 14px;
          margin-bottom: 1.5rem; line-height: 1.55;
        }
        .post-cold-nudge a { color: #3d8bff; text-decoration: underline; }
        .post-cold-nudge a:hover { color: #6aaeff; }

        /* ── Scenario review card (step 3, Path A) ── */
        .post-scenario-review {
          background: rgba(0,232,122,0.05);
          border: 1px solid rgba(0,232,122,0.18);
          border-radius: 10px; padding: 10px 14px;
          margin-bottom: 1.25rem;
        }
        .post-scenario-review-label {
          font-size: 0.7rem; font-weight: 700; color: #00e87a;
          text-transform: uppercase; letter-spacing: 0.08em;
          margin-bottom: 6px;
        }
        .post-scenario-review-row {
          display: flex; flex-wrap: wrap; gap: 6px 14px;
        }
        .post-scenario-review-row span {
          font-size: 0.85rem; color: #f0f4ff;
        }
        .post-scenario-review-row span strong {
          color: #00e87a;
        }

        .post-progress {
          display: flex; align-items: center; margin-bottom: 2rem; gap: 0;
        }
        .post-prog-step {
          display: flex; align-items: center; gap: 8px;
          font-size: 0.82rem; color: #3a4560; font-weight: 500;
          white-space: nowrap;
        }
        .post-prog-step.active { color: #f0f4ff; }
        .post-prog-step span {
          width: 22px; height: 22px; border-radius: 50%;
          background: rgba(255,255,255,0.07); color: #3a4560;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.75rem; font-weight: 600; flex-shrink: 0;
        }
        .post-prog-step.active span { background: #00e87a; color: #080c12; }
        .post-prog-line { flex: 1; height: 1px; background: rgba(255,255,255,0.08); margin: 0 10px; }

        .post-card {
          background: #0e1420;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px; padding: 2.5rem;
        }
        .post-title {
          font-family: 'DM Sans', sans-serif;
          font-size: 1.5rem; font-weight: 700;
          margin: 0 0 0.4rem; color: #f0f4ff;
        }
        .post-sub { font-size: 0.9rem; color: #8fa3b8; margin: 0 0 1.5rem; }

        .post-field { margin-bottom: 1.75rem; }
        .post-field label {
          display: block; font-size: 0.82rem; font-weight: 600;
          color: #8fa3b8; text-transform: uppercase; letter-spacing: 0.06em;
          margin-bottom: 0.75rem;
        }
        .post-optional { font-weight: 400; text-transform: none; letter-spacing: 0; color: #3a4560; }
        .post-field-hint { display: block; font-size: 0.75rem; color: #3a4560; margin-top: 7px; line-height: 1.45; }

        /* ── Matching preferences section ── */
        .post-matching-section {
          background: rgba(61,139,255,0.04);
          border: 1px solid rgba(61,139,255,0.15);
          border-radius: 14px; padding: 1.5rem;
          margin-bottom: 1.75rem;
        }
        .post-matching-title {
          font-size: 0.78rem; font-weight: 700; letter-spacing: 0.07em;
          text-transform: uppercase; color: #3d8bff; margin-bottom: 0.5rem;
        }
        .post-matching-body {
          font-size: 0.85rem; color: #8fa3b8; line-height: 1.55; margin-bottom: 1.25rem;
        }

        .post-chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .post-chip {
          padding: 7px 16px; border-radius: 99px;
          border: 1px solid rgba(255,255,255,0.10);
          background: transparent; color: #8fa3b8;
          font-size: 0.875rem; cursor: pointer;
          transition: all 0.15s;
        }
        .post-chip:hover { border-color: rgba(255,255,255,0.25); color: #f0f4ff; }
        .post-chip.selected { background: rgba(0,232,122,0.12); border-color: rgba(0,232,122,0.4); color: #00e87a; font-weight: 600; }

        .post-select {
          width: 100%; padding: 10px 14px;
          background: #141b28; border: 1px solid rgba(255,255,255,0.10);
          border-radius: 10px; color: #f0f4ff; font-size: 0.9rem;
          outline: none;
        }
        .post-select:focus { border-color: rgba(0,232,122,0.4); }

        .post-textarea {
          width: 100%; padding: 12px 14px;
          background: #141b28; border: 1px solid rgba(255,255,255,0.10);
          border-radius: 10px; color: #f0f4ff; font-size: 0.9rem;
          resize: vertical; outline: none; font-family: inherit;
          line-height: 1.5; box-sizing: border-box;
        }
        .post-textarea:focus { border-color: rgba(0,232,122,0.4); }
        .post-char-count { font-size: 0.75rem; color: #3a4560; text-align: right; margin-top: 4px; }

        .post-review-grid {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 12px; margin-bottom: 1.75rem;
          background: #141b28; border-radius: 12px; padding: 1.25rem;
          border: 1px solid rgba(255,255,255,0.07);
        }
        .post-review-label { font-size: 0.72rem; color: #3a4560; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
        .post-review-value { font-size: 0.9rem; font-weight: 600; color: #f0f4ff; }

        /* Visibility toggle */
        .post-vis-options { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
        .post-vis-option {
          display: flex; align-items: flex-start; gap: 14px;
          background: #0e1420; border: 1px solid rgba(255,255,255,0.09);
          border-radius: 12px; padding: 14px 16px;
          text-align: left; cursor: pointer; width: 100%;
          transition: border-color 0.15s, background 0.15s;
        }
        .post-vis-option:hover { border-color: rgba(255,255,255,0.18); }
        .post-vis-option.selected { border-color: rgba(0,232,122,0.45); background: rgba(0,232,122,0.05); }
        .post-vis-icon { font-size: 1.2rem; flex-shrink: 0; margin-top: 1px; }
        .post-vis-title { font-size: 0.9rem; font-weight: 600; color: #f0f4ff; margin-bottom: 3px; }
        .post-vis-sub { font-size: 0.78rem; color: #8fa3b8; line-height: 1.45; }

        .post-privacy-note {
          font-size: 0.83rem; color: #8fa3b8;
          background: rgba(0,232,122,0.05);
          border: 1px solid rgba(0,232,122,0.15);
          border-radius: 10px; padding: 12px 16px;
          margin-bottom: 1.5rem; line-height: 1.5;
        }

        .post-limit-gate {
          display: flex; flex-direction: column; align-items: center; gap: 10px;
          padding: 28px 20px; border-radius: 14px; text-align: center;
          background: rgba(0,232,122,0.04); border: 1px solid rgba(0,232,122,0.2);
        }
        .post-limit-icon { font-size: 1.8rem; }
        .post-limit-title { font-weight: 700; font-size: 1rem; color: #f0f4ff; }
        .post-limit-body { font-size: 0.85rem; color: #8fa3b8; line-height: 1.6; max-width: 320px; }
        .post-limit-btn {
          margin-top: 4px; padding: 10px 22px; border-radius: 999px;
          background: #00e87a; color: #080c12; font-weight: 700; font-size: 0.9rem;
          text-decoration: none; transition: opacity 0.15s;
        }
        .post-limit-btn:hover { opacity: 0.88; }

        .post-error {
          font-size: 0.875rem; color: #ff5f5f;
          background: rgba(255,95,95,0.08); border: 1px solid rgba(255,95,95,0.2);
          border-radius: 8px; padding: 10px 14px; margin-bottom: 1rem;
        }

        .post-row { display: flex; gap: 12px; justify-content: flex-end; }

        .post-btn {
          padding: 12px 28px; background: #00e87a; color: #080c12;
          border: none; border-radius: 999px;
          font-size: 0.95rem; font-weight: 700; cursor: pointer;
          transition: opacity 0.15s;
        }
        .post-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .post-btn:not(:disabled):hover { opacity: 0.88; }

        .post-btn-ghost {
          padding: 12px 20px; background: transparent;
          border: 1px solid rgba(255,255,255,0.12); color: #8fa3b8;
          border-radius: 999px; font-size: 0.9rem; cursor: pointer;
          transition: all 0.15s;
        }
        .post-btn-ghost:hover { border-color: rgba(255,255,255,0.25); color: #f0f4ff; }

        @media (max-width: 500px) {
          .post-card { padding: 1.5rem; }
          .post-review-grid { grid-template-columns: 1fr; }
          .post-prog-step { font-size: 0; }
          .post-prog-step span { font-size: 0.75rem; }
        }
      `}</style>
    </>
  );
}

// ── Default export wraps with Suspense for useSearchParams ─────────────────

export default function PostScenarioPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#080c12", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#8fa3b8", fontSize: "0.9rem" }}>Loading…</div>
      </div>
    }>
      <PostScenarioContent />
    </Suspense>
  );
}
