"use client";
// app/connect/post/page.tsx
// One-click anonymous scenario post.
// Path A (fromScenario=true): all data from URL params — show summary card → one button → done.
// Path B (cold): minimal single-screen form (loan type + price range + state) → post.

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import ConsumerNav from "../../components/ConsumerNav";

const LOAN_TYPES  = ["Conventional", "FHA", "VA", "Jumbo", "DSCR", "Other"];
const PRICE_RANGES = ["Under $300k", "$300k–$400k", "$400k–$500k", "$500k–$750k", "$750k–$1M", "$1M–$1.5M", "$1.5M+"];
const US_STATES   = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

function priceToRange(price: number): string {
  if (price < 300_000)   return "Under $300k";
  if (price < 400_000)   return "$300k–$400k";
  if (price < 500_000)   return "$400k–$500k";
  if (price < 750_000)   return "$500k–$750k";
  if (price < 1_000_000) return "$750k–$1M";
  if (price < 1_500_000) return "$1M–$1.5M";
  return "$1.5M+";
}

function fmt$(n: number) { return `$${Math.round(n).toLocaleString()}`; }

// ── Inner component (needs useSearchParams → Suspense boundary) ────────────

function PostScenarioContent() {
  const router      = useRouter();
  const params      = useSearchParams();
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/sign-in?redirect_url=" + encodeURIComponent(
        "/connect/post" + (typeof window !== "undefined" ? window.location.search : "")
      ));
    }
  }, [isLoaded, isSignedIn, router]);

  // ── URL params (Path A) ────────────────────────────────────────────────────
  const fromScenario = params?.get("from") === "scenario";
  const scLoanType   = params?.get("lt")      ?? "";
  const scPrice      = Number(params?.get("price")   ?? 0);
  const scDp         = Number(params?.get("dp")      ?? 0);
  const scRate       = Number(params?.get("rate")    ?? 0);
  const scMonthly    = Number(params?.get("monthly") ?? 0);
  const scTerm       = Number(params?.get("term")    ?? 30);
  const scPurpose    = params?.get("purpose") ?? "Purchase";
  const scInvest     = params?.get("invest")  === "1";
  const scIncome     = Number(params?.get("income")  ?? 0);
  const scState      = params?.get("state")   ?? "";

  // ── Local state ────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState("");
  const [hitLimit,   setHitLimit]   = useState(false);

  // Cold-arrival form fields
  const normLoanType = LOAN_TYPES.find(t => t.toUpperCase() === scLoanType.toUpperCase()) ?? "";
  const [coldLt,    setColdLt]    = useState(normLoanType);
  const [coldRange, setColdRange] = useState(scPrice > 0 ? priceToRange(scPrice) : "");
  const [coldState, setColdState] = useState(scState);

  // Quota
  const [quota,        setQuota]        = useState<{ used: number; limit: number | null; allowed: boolean } | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(true);

  // Referred-pro visibility
  const [referredProName, setReferredProName] = useState<string | null>(null);
  const [visibility,      setVisibility]      = useState<"private" | "public">("public");

  useEffect(() => {
    fetch("/api/scenarios/quota")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setQuota(d); })
      .catch(() => {})
      .finally(() => setQuotaLoading(false));

    fetch("/api/profile")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.referred_by_name) {
          setReferredProName(d.referred_by_name);
          setVisibility("private");
        }
      })
      .catch(() => {});
  }, []);

  // ── Derived values ─────────────────────────────────────────────────────────
  const isVA        = (fromScenario ? normLoanType : coldLt) === "VA";
  const priceRange  = fromScenario
    ? (scPrice > 0 ? priceToRange(scPrice) : "Not specified")
    : coldRange;
  const loanType    = fromScenario ? normLoanType : coldLt;
  const state       = fromScenario ? (scState || coldState) : coldState;

  // Auto-note for Path A
  const dpStr  = isVA ? "0% down (VA benefit)" : scDp > 0 ? `${scDp}% down` : "";
  const notes  = fromScenario ? [
    loanType + (scInvest ? " · Investment/DSCR" : "") + " loan",
    scPurpose !== "Purchase" ? scPurpose : null,
    scPrice > 0 ? `$${(scPrice / 1000).toFixed(0)}k purchase` : null,
    dpStr || null,
    scRate > 0 ? `${scRate}% rate` : null,
    scTerm ? `${scTerm}yr` : null,
    scMonthly > 0 ? `${fmt$(scMonthly)}/mo est. PITI` : null,
    scIncome > 0 ? `$${Math.round(scIncome / 1000)}k/yr income` : null,
  ].filter(Boolean).join(" · ") : "";

  const canPost = !!loanType && !!state && (fromScenario || !!priceRange);

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function submit() {
    if (!canPost) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loan_type:             loanType.toLowerCase().replace(/ /g, "_"),
          loan_purpose:          scPurpose.toLowerCase(),
          price_range:           priceRange || "Not specified",
          down_payment_pct:      isVA ? 0 : (scDp || 0),
          income_range:          "Not disclosed",
          credit_tier:           "Not disclosed",
          timeline:              "ASAP (under 30 days)",
          state,
          notes,
          needs_professional:    "lender",
          max_responses:         3,
          response_window_hours: 48,
          anonymity_level:       "full",
          visibility,
          posted_by_role:        "borrower",
          ...(fromScenario && scPrice > 0 ? {
            card_price:   scPrice,
            card_dp_pct:  scDp,
            card_rate:    scRate   || undefined,
            card_monthly: scMonthly || undefined,
            card_term:    scTerm   || undefined,
          } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.active_count >= 3) { setError("cap_reached"); setSubmitting(false); return; }
        if (data.upgrade)           { setHitLimit(true);       setSubmitting(false); return; }
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="post-root">

        <nav className="post-nav">
          <Link href="/connect" className="post-nav-logo">
            <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" />
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!quotaLoading && quota && quota.limit !== null && (
              <span className={`post-quota-badge ${!quota.allowed ? "full" : quota.used >= quota.limit - 1 ? "warn" : ""}`}>
                {quota.allowed
                  ? `${quota.used} of ${quota.limit} posts used`
                  : `Limit reached — ${quota.limit}/${quota.limit}`}
              </span>
            )}
            <ConsumerNav />
          </div>
        </nav>

        <div className="post-container">

          {/* ── Quota hard gate ── */}
          {!quotaLoading && quota && !quota.allowed && (
            <div className="post-hard-gate">
              <div className="post-hard-gate-icon">⚡</div>
              <h2 className="post-hard-gate-title">You&apos;ve used your {quota.limit} free posts this month</h2>
              <p className="post-hard-gate-body">
                Upgrade to <strong>Plus ($7/mo)</strong> for unlimited posts, unlimited chat, PDF exports, and rate alerts.
              </p>
              <div className="post-hard-gate-actions">
                <a href="/pricing" className="post-hard-gate-btn">Upgrade to Plus — $7/mo →</a>
                <Link href="/connect" className="post-hard-gate-ghost">Back to Lender Match</Link>
              </div>
            </div>
          )}

          {(quotaLoading || !quota || quota.allowed) && (
            <div className="post-card">

              {/* ── Path A: scenario attached ── */}
              {fromScenario && (
                <>
                  <div className="post-attached-badge">✓ Scenario attached</div>
                  <div className="post-scenario-row">
                    {loanType && <span className="post-scenario-chip">{loanType}</span>}
                    {scPrice > 0 && <span>{fmt$(scPrice)}</span>}
                    {scDp > 0 && !isVA && <span>{scDp}% down</span>}
                    {isVA && <span>0% down (VA)</span>}
                    {scRate > 0 && <span>{scRate.toFixed(2)}% rate</span>}
                    {scMonthly > 0 && <span>{fmt$(scMonthly)}/mo P&amp;I</span>}
                    {scTerm > 0 && <span>{scTerm}-year</span>}
                  </div>

                  {/* State picker — only if not in URL */}
                  {!scState && (
                    <div className="post-field" style={{ marginTop: 20 }}>
                      <label>Property state</label>
                      <select className="post-select" value={coldState} onChange={e => setColdState(e.target.value)}>
                        <option value="">Select state</option>
                        {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}
                </>
              )}

              {/* ── Path B: cold arrival — minimal form ── */}
              {!fromScenario && (
                <>
                  <h1 className="post-title">Post a scenario</h1>
                  <p className="post-sub">
                    Anonymous — no name, email, or personal info is shared.{" "}
                    <Link href="/chat" className="post-link">Run a scenario in chat first</Link> for richer matching.
                  </p>

                  <div className="post-field">
                    <label>Loan type</label>
                    <div className="post-chips">
                      {LOAN_TYPES.map(t => (
                        <button key={t} className={`post-chip ${coldLt === t ? "selected" : ""}`} onClick={() => setColdLt(t)}>{t}</button>
                      ))}
                    </div>
                  </div>

                  <div className="post-field">
                    <label>Price range</label>
                    <div className="post-chips">
                      {PRICE_RANGES.map(r => (
                        <button key={r} className={`post-chip ${coldRange === r ? "selected" : ""}`} onClick={() => setColdRange(r)}>{r}</button>
                      ))}
                    </div>
                  </div>

                  <div className="post-field">
                    <label>State</label>
                    <select className="post-select" value={coldState} onChange={e => setColdState(e.target.value)}>
                      <option value="">Select state</option>
                      {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </>
              )}

              {/* ── Referred-pro visibility toggle (shown to referred borrowers only) ── */}
              {referredProName && (
                <div className="post-vis-options" style={{ marginTop: 20 }}>
                  {[
                    { v: "private", label: `🔒 Private — ${referredProName} only`, sub: "Only your professional can see and respond." },
                    { v: "public",  label: "🌐 Match Board — open to all professionals", sub: "More options, broader reach." },
                  ].map(({ v, label, sub }) => (
                    <button
                      key={v}
                      className={`post-vis-option ${visibility === v ? "selected" : ""}`}
                      onClick={() => setVisibility(v as "private" | "public")}
                    >
                      <div>
                        <div className="post-vis-title">{label}</div>
                        <div className="post-vis-sub">{sub}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* ── Privacy note ── */}
              <div className="post-privacy-note" style={{ marginTop: 24 }}>
                🔒 Your name, email, and contact info are never shared until you choose to invite a specific professional.
                Lenders see your loan scenario only — no personal data.
              </div>

              {/* ── Errors ── */}
              {hitLimit && (
                <div className="post-limit-gate">
                  <div className="post-limit-icon">⚡</div>
                  <div className="post-limit-title">Monthly limit reached</div>
                  <div className="post-limit-body">
                    Upgrade to <strong>Plus ($7/mo)</strong> for unlimited posts, unlimited chat, PDF exports, and rate alerts.
                  </div>
                  <a href="/pricing" className="post-limit-btn">Upgrade to Plus — $7/mo →</a>
                </div>
              )}
              {!hitLimit && error === "cap_reached" && (
                <div className="post-error-block">
                  <div className="post-error-title">3 active scenarios already open</div>
                  <div className="post-error-body">Close one of your active scenarios to post a new one.</div>
                  <a href="/connect/my-scenario" className="post-error-link">Manage My Scenarios →</a>
                </div>
              )}
              {!hitLimit && error && error !== "cap_reached" && (
                <div className="post-error">{error}</div>
              )}

              {/* ── Post button ── */}
              {!hitLimit && error !== "cap_reached" && (
                <button
                  className="post-btn-primary"
                  disabled={submitting || !canPost}
                  onClick={submit}
                >
                  {submitting ? "Posting…" : "Post Scenario →"}
                </button>
              )}

            </div>
          )}

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

        .post-quota-badge {
          font-size: .75rem; font-weight: 600; padding: 4px 12px; border-radius: 99px;
          background: rgba(0,232,122,.08); color: rgba(0,232,122,.7); border: 1px solid rgba(0,232,122,.18);
        }
        .post-quota-badge.warn { background: rgba(255,140,66,.08); color: #ff8c42; border-color: rgba(255,140,66,.25); }
        .post-quota-badge.full { background: rgba(255,95,95,.08);  color: #ff5f5f;  border-color: rgba(255,95,95,.25); }

        .post-nav {
          position: sticky; top: 0; z-index: 100;
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 24px;
          background: rgba(8,12,18,.95); backdrop-filter: blur(8px);
          border-bottom: 1px solid rgba(255,255,255,.07);
        }
        .post-nav-logo img { height: 28px; }

        .post-container { max-width: 640px; margin: 0 auto; padding: 2.5rem 1.5rem 5rem; }

        .post-hard-gate {
          max-width: 480px; margin: 3rem auto;
          background: #0e1420; border: 1px solid rgba(255,95,95,.2);
          border-radius: 18px; padding: 3rem 2rem; text-align: center;
        }
        .post-hard-gate-icon { font-size: 2.5rem; margin-bottom: 1rem; }
        .post-hard-gate-title { font-size: 1.35rem; font-weight: 700; margin: 0 0 .75rem; color: #f0f4ff; }
        .post-hard-gate-body { font-size: .9rem; color: #8fa3b8; line-height: 1.65; margin: 0 0 1.75rem; }
        .post-hard-gate-body strong { color: #00e87a; }
        .post-hard-gate-actions { display: flex; flex-direction: column; gap: 10px; align-items: center; }
        .post-hard-gate-btn {
          display: inline-block; padding: 13px 32px; background: #00e87a; color: #080c12;
          border-radius: 999px; font-size: .95rem; font-weight: 700; text-decoration: none;
          width: 100%; max-width: 320px; text-align: center;
        }
        .post-hard-gate-ghost { font-size: .85rem; color: #8fa3b8; text-decoration: none; }

        .post-card {
          background: #0e1420; border: 1px solid rgba(255,255,255,.08);
          border-radius: 18px; padding: 2rem 2rem 2.5rem;
        }

        /* Path A — attached scenario */
        .post-attached-badge {
          display: inline-block; font-size: .78rem; font-weight: 700;
          background: rgba(0,232,122,.12); color: #00e87a;
          border: 1px solid rgba(0,232,122,.3); border-radius: 99px;
          padding: 3px 12px; margin-bottom: 14px;
        }
        .post-scenario-row {
          display: flex; flex-wrap: wrap; gap: 6px 14px;
          font-size: .95rem; color: #f0f4ff; font-weight: 500;
          margin-bottom: 4px;
        }
        .post-scenario-chip { color: #00e87a; font-weight: 700; }

        /* Path B — cold form */
        .post-title { font-size: 1.45rem; font-weight: 700; margin: 0 0 .35rem; color: #f0f4ff; }
        .post-sub   { font-size: .9rem; color: #8fa3b8; margin: 0 0 1.5rem; line-height: 1.5; }
        .post-link  { color: #00e87a; text-decoration: underline; }

        .post-field { margin-bottom: 1.5rem; }
        .post-field label {
          display: block; font-size: .8rem; font-weight: 600; color: #8fa3b8;
          text-transform: uppercase; letter-spacing: .06em; margin-bottom: .65rem;
        }
        .post-chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .post-chip {
          padding: 7px 16px; border-radius: 99px;
          border: 1px solid rgba(255,255,255,.10);
          background: transparent; color: #8fa3b8; font-size: .875rem; cursor: pointer;
          transition: all .15s; font-family: inherit;
        }
        .post-chip:hover { border-color: rgba(255,255,255,.25); color: #f0f4ff; }
        .post-chip.selected { background: rgba(0,232,122,.12); border-color: rgba(0,232,122,.4); color: #00e87a; font-weight: 600; }
        .post-select {
          width: 100%; padding: 10px 14px;
          background: #141b28; border: 1px solid rgba(255,255,255,.10);
          border-radius: 10px; color: #f0f4ff; font-size: .9rem; outline: none; font-family: inherit;
        }
        .post-select:focus { border-color: rgba(0,232,122,.4); }

        /* Visibility */
        .post-vis-options { display: flex; flex-direction: column; gap: 10px; }
        .post-vis-option {
          display: flex; align-items: flex-start; gap: 14px;
          background: #0e1420; border: 1px solid rgba(255,255,255,.09);
          border-radius: 12px; padding: 14px 16px;
          text-align: left; cursor: pointer; width: 100%;
          transition: border-color .15s, background .15s; font-family: inherit;
        }
        .post-vis-option:hover  { border-color: rgba(255,255,255,.18); }
        .post-vis-option.selected { border-color: rgba(0,232,122,.45); background: rgba(0,232,122,.05); }
        .post-vis-title { font-size: .9rem; font-weight: 600; color: #f0f4ff; margin-bottom: 3px; }
        .post-vis-sub   { font-size: .78rem; color: #8fa3b8; line-height: 1.45; }

        /* Privacy note */
        .post-privacy-note {
          font-size: .83rem; color: #8fa3b8;
          background: rgba(0,232,122,.05); border: 1px solid rgba(0,232,122,.15);
          border-radius: 10px; padding: 12px 16px; line-height: 1.5;
          margin-bottom: 1.5rem;
        }

        /* Error states */
        .post-error-block {
          background: rgba(255,60,60,.08); border: 1px solid rgba(255,60,60,.25);
          border-radius: 12px; padding: 18px 20px; text-align: center; margin-bottom: 1.25rem;
        }
        .post-error-title { font-size: .95rem; font-weight: 600; color: #ff6b6b; margin-bottom: 6px; }
        .post-error-body  { font-size: .85rem; color: #8fa3b8; margin-bottom: 14px; line-height: 1.5; }
        .post-error-link  { display: inline-block; background: #e03e3e; color: #fff; font-weight: 700; font-size: .875rem; padding: 10px 22px; border-radius: 10px; text-decoration: none; }
        .post-error { font-size: .875rem; color: #ff5f5f; background: rgba(255,95,95,.08); border: 1px solid rgba(255,95,95,.2); border-radius: 8px; padding: 10px 14px; margin-bottom: 1rem; }

        /* Limit gate */
        .post-limit-gate {
          display: flex; flex-direction: column; align-items: center; gap: 10px;
          padding: 28px 20px; border-radius: 14px; text-align: center;
          background: rgba(0,232,122,.04); border: 1px solid rgba(0,232,122,.2);
          margin-bottom: 1.25rem;
        }
        .post-limit-icon  { font-size: 1.8rem; }
        .post-limit-title { font-weight: 700; font-size: 1rem; color: #f0f4ff; }
        .post-limit-body  { font-size: .85rem; color: #8fa3b8; line-height: 1.6; max-width: 320px; }
        .post-limit-body strong { color: #00e87a; }
        .post-limit-btn   { margin-top: 4px; padding: 10px 22px; border-radius: 999px; background: #00e87a; color: #080c12; font-weight: 700; font-size: .9rem; text-decoration: none; }

        /* Post button */
        .post-btn-primary {
          width: 100%; padding: 15px 20px;
          background: #00e87a; color: #080c12;
          border: none; border-radius: 999px;
          font-size: 1rem; font-weight: 700; cursor: pointer;
          transition: opacity .15s; font-family: inherit;
        }
        .post-btn-primary:disabled { opacity: .4; cursor: not-allowed; }
        .post-btn-primary:not(:disabled):hover { opacity: .88; }

        @media (max-width: 500px) {
          .post-card { padding: 1.5rem; }
        }
      `}</style>
    </>
  );
}

// ── Default export with Suspense ──────────────────────────────────────────────

export default function PostScenarioPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#080c12", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#8fa3b8", fontSize: ".9rem" }}>Loading…</div>
      </div>
    }>
      <PostScenarioContent />
    </Suspense>
  );
}
