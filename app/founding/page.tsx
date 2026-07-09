"use client";
// app/founding/page.tsx
// Founding 500 waitlist — application form, no public counter
// Shows position inline after submission.

import { useState } from "react";
import Link from "next/link";

const BENEFITS = [
  {
    icon: "🏅",
    title: "Founding Member badge",
    body: "Permanently on your profile and contact card — every borrower you work with sees it.",
  },
  {
    icon: "🔒",
    title: "Price locked forever",
    body: "Your rate never increases as long as your subscription stays active, no matter what new members pay.",
  },
  {
    icon: "⚡",
    title: "First on the board",
    body: "Scenarios are first-come-first-served. Founding members get priority notifications before general release.",
  },
  {
    icon: "🗳️",
    title: "Shape the product",
    body: "Direct line to the founders. Vote on features, join beta tests, and influence the roadmap.",
  },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

type ConfirmedState = { position: number; firstName: string };

export default function FoundingPage() {
  const [proType, setProType]     = useState<"lo" | "agent">("lo");
  const [fullName, setFullName]   = useState("");
  const [email, setEmail]         = useState("");
  const [state, setState]         = useState("");
  const [nmls, setNmls]           = useState("");
  const [license, setLicense]     = useState("");
  const [brokerage, setBrokerage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState("");
  const [confirmed, setConfirmed] = useState<ConfirmedState | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!fullName.trim() || !email.trim() || !state) {
      setError("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/waitlist/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName:      fullName.trim(),
        email:         email.trim().toLowerCase(),
        proType,
        state,
        nmls:          nmls.trim() || null,
        licenseNumber: license.trim() || null,
        brokerage:     brokerage.trim() || null,
      }),
    });
    const d = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(d.error ?? "Something went wrong — please try again.");
      return;
    }
    setConfirmed({ position: d.position, firstName: fullName.trim().split(" ")[0] });
  }

  return (
    <>
      <style>{`
        body:has(.founding-root){display:block!important;height:auto!important;overflow-y:auto!important;background:#080c12!important}
        html:has(.founding-root){height:auto!important;overflow:visible!important;}
        .founding-root{min-height:100vh;background:#080c12;color:#f0f4ff;font-family:'DM Sans',system-ui,sans-serif;}
        .founding-root *{box-sizing:border-box;}

        .f-nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 24px;height:56px;background:rgba(8,12,18,0.97);border-bottom:1px solid rgba(255,255,255,0.07);backdrop-filter:blur(8px);}
        .f-logo img{height:26px;display:block;}
        .f-nav-link{font-size:0.82rem;color:rgba(255,255,255,0.45);text-decoration:none;}
        .f-nav-link:hover{color:#f0f4ff;}

        .f-shell{max-width:640px;margin:0 auto;padding:56px 20px 80px;}

        .f-badge{display:inline-block;background:#1a2e20;color:#00e87a;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:5px 12px;border-radius:20px;border:1px solid rgba(0,232,122,0.3);margin-bottom:20px;}

        .f-hero-title{font-size:clamp(1.9rem,5.5vw,3rem);font-weight:800;color:#f0f4ff;line-height:1.1;margin:0 0 14px;}
        .f-hero-title span{color:#00e87a;}
        .f-hero-sub{font-size:1rem;color:#6b8f7a;line-height:1.7;margin:0 0 10px;max-width:520px;}
        .f-hero-note{font-size:0.82rem;color:#3a5040;margin:0 0 36px;}

        .f-benefits{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:36px;}
        .f-benefit{background:#0d1a12;border:1px solid #1a2e20;border-radius:12px;padding:16px;}
        .f-benefit-icon{font-size:1.3rem;margin-bottom:8px;}
        .f-benefit-title{font-size:0.88rem;font-weight:700;color:#e8f5ee;margin-bottom:4px;}
        .f-benefit-body{font-size:0.8rem;color:#4a6e58;line-height:1.6;}

        .f-divider{border:none;border-top:1px solid rgba(255,255,255,0.07);margin:0 0 32px;}

        /* Form */
        .f-form{display:flex;flex-direction:column;gap:16px;}
        .f-field{display:flex;flex-direction:column;gap:6px;}
        .f-label{font-size:0.78rem;font-weight:600;color:rgba(255,255,255,0.45);letter-spacing:0.06em;text-transform:uppercase;}
        .f-label span{color:#ff5f5f;margin-left:2px;}
        .f-input{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:9px;padding:11px 14px;color:#f0f4ff;font-size:0.92rem;outline:none;transition:border-color .2s;}
        .f-input:focus{border-color:rgba(0,232,122,0.45);}
        .f-input::placeholder{color:rgba(255,255,255,0.2);}
        .f-select{appearance:none;background:rgba(255,255,255,0.05) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%234a6e58' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat right 14px center;}

        .f-type-toggle{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
        .f-type-btn{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:9px;padding:10px;font-size:0.88rem;font-weight:600;color:rgba(255,255,255,0.45);cursor:pointer;text-align:center;transition:all .2s;}
        .f-type-btn.active{background:#0d2e1a;border-color:rgba(0,232,122,0.4);color:#00e87a;}

        .f-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;}

        .f-submit{background:#00e87a;color:#07100f;font-size:1rem;font-weight:700;padding:15px 20px;border-radius:12px;border:none;cursor:pointer;width:100%;transition:opacity .2s;margin-top:4px;}
        .f-submit:hover{opacity:.9;}
        .f-submit:disabled{opacity:.45;cursor:not-allowed;}

        .f-error{font-size:0.82rem;color:#ff5f5f;background:rgba(255,95,95,0.08);border:1px solid rgba(255,95,95,0.2);border-radius:8px;padding:10px 14px;}

        /* Confirmation */
        .f-confirmed{text-align:center;padding:48px 0;}
        .f-confirmed-title{font-size:1.5rem;font-weight:700;color:#f0f4ff;margin-bottom:12px;}
        .f-confirmed-body{font-size:0.95rem;color:#6b8f7a;line-height:1.7;max-width:420px;margin:0 auto 32px;}
        .f-confirmed-cta{display:inline-block;background:#00e87a;color:#07100f;font-size:0.92rem;font-weight:700;padding:13px 28px;border-radius:10px;text-decoration:none;}
        .f-confirmed-note{font-size:0.8rem;color:#3a5040;margin-top:16px;}

        @media(max-width:560px){
          .f-benefits{grid-template-columns:1fr;}
          .f-shell{padding:36px 16px 60px;}
          .f-hero-title{font-size:1.75rem;}
          .f-row{grid-template-columns:1fr;}
        }
      `}</style>

      <div className="founding-root">
        <nav className="f-nav">
          <Link href="/" className="f-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" />
          </Link>
          <Link href="/chat" className="f-nav-link">Try the platform →</Link>
        </nav>

        <div className="f-shell">
          <div className="f-badge">Founding 500</div>

          <h1 className="f-hero-title">
            Be one of the first<br />
            <span>500 professionals</span><br />
            on HomeRates.ai
          </h1>
          <p className="f-hero-sub">
            Founding membership is invitation-only and limited to 500 professionals.
            Apply below to join the waitlist — we&apos;re opening spots in waves as borrower demand grows in your market.
          </p>
          <p className="f-hero-note">
            No subscription required to join the waitlist. You only pay if and when you&apos;re invited in.
          </p>

          {/* Benefits */}
          <div className="f-benefits">
            {BENEFITS.map(b => (
              <div key={b.title} className="f-benefit">
                <div className="f-benefit-icon">{b.icon}</div>
                <div className="f-benefit-title">{b.title}</div>
                <div className="f-benefit-body">{b.body}</div>
              </div>
            ))}
          </div>

          <hr className="f-divider" />

          {confirmed ? (
            /* ── Confirmation ── */
            <div className="f-confirmed">
              <div style={{ fontSize: "3rem", marginBottom: 16 }}>🏅</div>
              <div className="f-confirmed-title">You&apos;re on the list, {confirmed.firstName}.</div>
              <p className="f-confirmed-body">
                We&apos;ll email you the moment a founding spot opens in your market.
                In the meantime — explore the platform and post a scenario to see how it works.
              </p>
              <Link href="/chat" className="f-confirmed-cta">
                Explore HomeRates.ai →
              </Link>
              <p className="f-confirmed-note">Check your inbox — we&apos;ve sent a confirmation with your position.</p>
            </div>
          ) : (
            /* ── Application form ── */
            <form className="f-form" onSubmit={handleSubmit}>
              <div className="f-field">
                <label className="f-label">I am a <span>*</span></label>
                <div className="f-type-toggle">
                  <button type="button" className={`f-type-btn ${proType === "lo" ? "active" : ""}`} onClick={() => setProType("lo")}>
                    Loan Officer
                  </button>
                  <button type="button" className={`f-type-btn ${proType === "agent" ? "active" : ""}`} onClick={() => setProType("agent")}>
                    Real Estate Agent
                  </button>
                </div>
              </div>

              <div className="f-row">
                <div className="f-field">
                  <label className="f-label" htmlFor="fullName">Full name <span>*</span></label>
                  <input
                    id="fullName"
                    className="f-input"
                    type="text"
                    placeholder="Jane Smith"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    required
                  />
                </div>
                <div className="f-field">
                  <label className="f-label" htmlFor="email">Work email <span>*</span></label>
                  <input
                    id="email"
                    className="f-input"
                    type="email"
                    placeholder="jane@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="f-row">
                <div className="f-field">
                  <label className="f-label" htmlFor="state">State <span>*</span></label>
                  <select
                    id="state"
                    className="f-input f-select"
                    value={state}
                    onChange={e => setState(e.target.value)}
                    required
                  >
                    <option value="">Select state…</option>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="f-field">
                  <label className="f-label" htmlFor="nmls">
                    {proType === "lo" ? "NMLS #" : "License #"}
                  </label>
                  {proType === "lo" ? (
                    <input
                      id="nmls"
                      className="f-input"
                      type="text"
                      placeholder="e.g. 1234567"
                      value={nmls}
                      onChange={e => setNmls(e.target.value)}
                    />
                  ) : (
                    <input
                      id="license"
                      className="f-input"
                      type="text"
                      placeholder="e.g. DRE 01234567"
                      value={license}
                      onChange={e => setLicense(e.target.value)}
                    />
                  )}
                </div>
              </div>

              <div className="f-field">
                <label className="f-label" htmlFor="brokerage">
                  {proType === "lo" ? "Lender / company" : "Brokerage"}
                  <span style={{ color: "rgba(255,255,255,0.2)", fontWeight: 400, marginLeft: 6, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
                </label>
                <input
                  id="brokerage"
                  className="f-input"
                  type="text"
                  placeholder={proType === "lo" ? "e.g. United Wholesale Mortgage" : "e.g. Compass"}
                  value={brokerage}
                  onChange={e => setBrokerage(e.target.value)}
                />
              </div>

              {error && <div className="f-error">{error}</div>}

              <button type="submit" className="f-submit" disabled={submitting}>
                {submitting ? "Joining waitlist…" : "Apply for founding spot →"}
              </button>

              <p style={{ fontSize: "0.78rem", color: "#3a5040", textAlign: "center", margin: 0 }}>
                Founding membership closes permanently at 500 professionals.
              </p>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
