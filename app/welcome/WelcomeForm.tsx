"use client";
// app/welcome/WelcomeForm.tsx
// Interactive type-selection form — client component, no SSR user dependency

import { useState } from "react";

const TYPES = [
  {
    value: "borrower",
    label: "I'm buying or refinancing",
    icon: "🏠",
    sub: "Get AI-powered rate analysis and connect with mortgage professionals",
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

export default function WelcomeForm({ firstName }: { firstName: string }) {
  const [type, setType] = useState<UserType | "">("");
  const [nmls, setNmls] = useState("");
  const [lender, setLender] = useState("");
  const [license, setLicense] = useState("");
  const [brokerage, setBrokerage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = type && (
    type === "borrower" ||
    (type === "lo" && nmls.trim()) ||
    (type === "agent" && license.trim())
  );

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: type, nmls, lender, license, brokerage }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong"); setSubmitting(false); return; }
      window.location.href = "/dashboard";
    } catch {
      setError("Network error — please try again");
      setSubmitting(false);
    }
  }

  return (
    <div className="wl-card">
      <div className="wl-header">
        <div className="wl-eyebrow">One quick step</div>
        <h1 className="wl-title">
          {firstName ? `Welcome, ${firstName}.` : "Welcome."}<br />
          What brings you here?
        </h1>
        <p className="wl-sub">
          This sets up your dashboard. You can always access everything else — pick what fits best.
        </p>
      </div>

      {/* Type chips */}
      <div className="wl-types">
        {TYPES.map(t => (
          <button
            key={t.value}
            className={`wl-type-card${type === t.value ? " selected" : ""}`}
            onClick={() => setType(t.value)}
            type="button"
          >
            <span className="wl-type-icon">{t.icon}</span>
            <div>
              <div className="wl-type-label">{t.label}</div>
              <div className="wl-type-sub">{t.sub}</div>
            </div>
            <div className="wl-type-check">{type === t.value ? "✓" : ""}</div>
          </button>
        ))}
      </div>

      {/* Professional detail fields — appear when LO or agent selected */}
      {type === "lo" && (
        <div className="wl-fields">
          <div className="wl-field-group">
            <div className="wl-field">
              <label>NMLS # <span className="wl-req">*</span></label>
              <input
                className="wl-input"
                placeholder="e.g. 123456"
                value={nmls}
                onChange={e => setNmls(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="wl-field">
              <label>Lender / Company <span className="wl-optional">(optional)</span></label>
              <input
                className="wl-input"
                placeholder="e.g. United Wholesale Mortgage"
                value={lender}
                onChange={e => setLender(e.target.value)}
              />
            </div>
          </div>
          <p className="wl-field-note">
            Your NMLS is displayed to borrowers when you respond to scenarios — it builds trust and is required by law.
          </p>
        </div>
      )}

      {type === "agent" && (
        <div className="wl-fields">
          <div className="wl-field-group">
            <div className="wl-field">
              <label>License # <span className="wl-req">*</span></label>
              <input
                className="wl-input"
                placeholder="State license number"
                value={license}
                onChange={e => setLicense(e.target.value)}
              />
            </div>
            <div className="wl-field">
              <label>Brokerage <span className="wl-optional">(optional)</span></label>
              <input
                className="wl-input"
                placeholder="e.g. Keller Williams"
                value={brokerage}
                onChange={e => setBrokerage(e.target.value)}
              />
            </div>
          </div>
          <p className="wl-field-note">
            Your license number is shown to borrowers when you respond to scenarios.
          </p>
        </div>
      )}

      {error && <div className="wl-error">{error}</div>}

      <button
        className="wl-submit"
        disabled={!canSubmit || submitting}
        onClick={submit}
        type="button"
      >
        {submitting ? "Setting up..." : "Go to my dashboard →"}
      </button>
    </div>
  );
}
