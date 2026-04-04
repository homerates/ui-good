"use client";
// app/welcome/page.tsx
// Post sign-up type selection — runs once per new user
// Captures role (borrower / lo / agent), saves to DB, redirects to /dashboard

import { useState } from "react";
import Link from "next/link";

const TYPES = [
  {
    value: "borrower",
    label: "I'm buying or refinancing",
    icon: "🏠",
    sub: "Get AI-powered rate analysis and connect with vetted professionals",
  },
  {
    value: "lo",
    label: "I'm a loan officer",
    icon: "🏦",
    sub: "Respond to borrower scenarios and earn introductions — no lead fees",
  },
  {
    value: "agent",
    label: "I'm a real estate agent",
    icon: "🏡",
    sub: "Connect with buyer scenarios in your market — no Zillow auction",
  },
] as const;

type UserType = "borrower" | "lo" | "agent";

export default function WelcomePage() {
  const [type, setType] = useState<UserType | "">("");
  const [nmls, setNmls] = useState("");
  const [lender, setLender] = useState("");
  const [license, setLicense] = useState("");
  const [brokerage, setBrokerage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = Boolean(
    type && (
      type === "borrower" ||
      (type === "lo" && nmls.trim()) ||
      (type === "agent" && license.trim())
    )
  );

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: type, nmls, lender, license, brokerage }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setSubmitting(false);
        return;
      }
      window.location.href = "/dashboard";
    } catch {
      setError("Network error — please try again");
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="wl-root">
        <nav className="wl-nav">
          <Link href="/" className="wl-nav-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" />
          </Link>
        </nav>

        <div className="wl-container">
          <div className="wl-card">

            <div className="wl-header">
              <div className="wl-eyebrow">One quick step</div>
              <h1 className="wl-title">
                Welcome.<br />What brings you here?
              </h1>
              <p className="wl-sub">
                This sets up your dashboard. Pick what fits best — you can always change it later.
              </p>
            </div>

            {/* Type chips */}
            <div className="wl-types">
              {TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  className={`wl-type-card${type === t.value ? " selected" : ""}`}
                  onClick={() => setType(t.value)}
                >
                  <span className="wl-type-icon">{t.icon}</span>
                  <div className="wl-type-text">
                    <div className="wl-type-label">{t.label}</div>
                    <div className="wl-type-sub">{t.sub}</div>
                  </div>
                  <div className="wl-type-check">{type === t.value ? "✓" : ""}</div>
                </button>
              ))}
            </div>

            {/* Professional detail fields */}
            {type === "lo" && (
              <div className="wl-fields">
                <div className="wl-field-group">
                  <div className="wl-field">
                    <label htmlFor="wl-nmls">NMLS # <span className="wl-req">*</span></label>
                    <input
                      id="wl-nmls"
                      className="wl-input"
                      placeholder="e.g. 123456"
                      value={nmls}
                      onChange={e => setNmls(e.target.value.replace(/\D/g, ""))}
                    />
                  </div>
                  <div className="wl-field">
                    <label htmlFor="wl-lender">Lender / Company <span className="wl-optional">(optional)</span></label>
                    <input
                      id="wl-lender"
                      className="wl-input"
                      placeholder="e.g. United Wholesale Mortgage"
                      value={lender}
                      onChange={e => setLender(e.target.value)}
                    />
                  </div>
                </div>
                <p className="wl-field-note">
                  Your NMLS is displayed to borrowers when you respond — required by law.
                </p>
              </div>
            )}

            {type === "agent" && (
              <div className="wl-fields">
                <div className="wl-field-group">
                  <div className="wl-field">
                    <label htmlFor="wl-license">License # <span className="wl-req">*</span></label>
                    <input
                      id="wl-license"
                      className="wl-input"
                      placeholder="State license number"
                      value={license}
                      onChange={e => setLicense(e.target.value)}
                    />
                  </div>
                  <div className="wl-field">
                    <label htmlFor="wl-brokerage">Brokerage <span className="wl-optional">(optional)</span></label>
                    <input
                      id="wl-brokerage"
                      className="wl-input"
                      placeholder="e.g. Keller Williams"
                      value={brokerage}
                      onChange={e => setBrokerage(e.target.value)}
                    />
                  </div>
                </div>
                <p className="wl-field-note">
                  Your license number is shown to borrowers when you respond.
                </p>
              </div>
            )}

            {error && <div className="wl-error">{error}</div>}

            <button
              type="button"
              className="wl-submit"
              disabled={!canSubmit || submitting}
              onClick={handleSubmit}
            >
              {submitting ? "Setting up…" : "Go to my dashboard →"}
            </button>

          </div>
        </div>
      </div>

      <style>{`
        body:has(.wl-root) {
          display: block !important;
          height: auto !important;
          overflow-y: auto !important;
          overflow-x: hidden !important;
          background: #080c12 !important;
        }
        html:has(.wl-root) {
          background: #080c12 !important;
          height: auto !important;
          overflow-y: auto !important;
        }
        body:has(.wl-root) .app-footer { display: none !important; }

        .wl-root {
          font-family: 'DM Sans', system-ui, sans-serif;
          color: #f0f4ff;
          min-height: 100vh;
          background: #080c12;
          position: relative;
          z-index: 1;
        }
        .wl-nav {
          padding: 18px 32px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .wl-nav-logo img { height: 28px; }
        .wl-container {
          max-width: 560px;
          margin: 0 auto;
          padding: 3rem 1.5rem 5rem;
        }
        .wl-card {
          background: #0e1420;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 2.5rem;
          display: flex;
          flex-direction: column;
          gap: 2rem;
          position: relative;
          z-index: 2;
        }
        .wl-header { display: flex; flex-direction: column; gap: 8px; }
        .wl-eyebrow {
          font-size: 0.72rem; font-weight: 700; letter-spacing: 0.1em;
          text-transform: uppercase; color: #00e87a;
        }
        .wl-title {
          font-family: 'Syne', sans-serif;
          font-size: 1.75rem; font-weight: 800;
          margin: 0; line-height: 1.2; letter-spacing: -0.02em;
          color: #f0f4ff;
        }
        .wl-sub { font-size: 0.9rem; color: #6b7a99; margin: 0; line-height: 1.6; }
        .wl-types { display: flex; flex-direction: column; gap: 10px; }
        .wl-type-card {
          display: flex; align-items: center; gap: 14px;
          padding: 16px 18px;
          background: transparent;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px; cursor: pointer;
          text-align: left; width: 100%;
          transition: border-color 0.15s, background 0.15s;
          color: #f0f4ff;
          font-family: inherit;
          position: relative;
          z-index: 3;
        }
        .wl-type-card:hover { border-color: rgba(255,255,255,0.2); background: rgba(255,255,255,0.02); }
        .wl-type-card.selected {
          border-color: rgba(0,232,122,0.5);
          background: rgba(0,232,122,0.06);
        }
        .wl-type-icon { font-size: 1.6rem; flex-shrink: 0; }
        .wl-type-text { flex: 1; min-width: 0; }
        .wl-type-label { font-weight: 600; font-size: 0.975rem; color: #f0f4ff; margin-bottom: 3px; }
        .wl-type-sub { font-size: 0.8rem; color: #6b7a99; line-height: 1.4; }
        .wl-type-check {
          margin-left: auto; flex-shrink: 0;
          width: 22px; height: 22px; border-radius: 50%;
          background: rgba(0,232,122,0.15); color: #00e87a;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.75rem; font-weight: 700;
          opacity: 0; transition: opacity 0.15s;
        }
        .wl-type-card.selected .wl-type-check { opacity: 1; }
        .wl-fields { display: flex; flex-direction: column; gap: 12px; }
        .wl-field-group { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .wl-field { display: flex; flex-direction: column; gap: 6px; }
        .wl-field label {
          font-size: 0.78rem; font-weight: 600; color: #6b7a99;
          text-transform: uppercase; letter-spacing: 0.06em;
        }
        .wl-req { color: #ff5f5f; }
        .wl-optional { font-weight: 400; text-transform: none; letter-spacing: 0; color: #3a4560; }
        .wl-input {
          padding: 10px 14px; background: #141b28;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px; color: #f0f4ff; font-size: 0.9rem;
          outline: none; font-family: inherit; width: 100%; box-sizing: border-box;
        }
        .wl-input:focus { border-color: rgba(0,232,122,0.4); }
        .wl-field-note { font-size: 0.78rem; color: #3a4560; margin: 0; line-height: 1.5; }
        .wl-error {
          font-size: 0.875rem; color: #ff5f5f;
          background: rgba(255,95,95,0.08); border: 1px solid rgba(255,95,95,0.2);
          border-radius: 8px; padding: 10px 14px;
        }
        .wl-submit {
          padding: 14px; background: #00e87a; color: #080c12;
          border: none; border-radius: 999px;
          font-size: 1rem; font-weight: 700; cursor: pointer;
          transition: opacity 0.15s; width: 100%;
          font-family: inherit;
          position: relative; z-index: 3;
        }
        .wl-submit:disabled { opacity: 0.35; cursor: not-allowed; }
        .wl-submit:not(:disabled):hover { opacity: 0.88; }
        @media (max-width: 480px) {
          .wl-card { padding: 1.75rem; }
          .wl-field-group { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  );
}
