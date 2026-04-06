"use client";
// app/profile/page.tsx
// Role-aware profile editor — LOs see license fields; borrowers see basics

import { useEffect, useState } from "react";
import Link from "next/link";

interface ProfileData {
  email: string;
  clerkName: string;
  full_name: string;
  role: string;
  isLO: boolean;
  lo: {
    lender: string | null;
    nmls: string | null;
    license_state: string | null;
  } | null;
}

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

export default function ProfilePage() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Form fields
  const [fullName, setFullName] = useState("");
  const [lender, setLender] = useState("");
  const [nmls, setNmls] = useState("");
  const [licenseState, setLicenseState] = useState("");

  useEffect(() => {
    fetch("/api/profile")
      .then(r => r.ok ? r.json() : null)
      .then((d: ProfileData | null) => {
        if (!d) return;
        setData(d);
        setFullName(d.full_name || d.clerkName || "");
        setLender(d.lo?.lender ?? "");
        setNmls(d.lo?.nmls ?? "");
        setLicenseState(d.lo?.license_state ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          lender,
          nmls,
          license_state: licenseState,
        }),
      });
      if (!res.ok) {
        setError("Failed to save. Please try again.");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="pr-root">

        <nav className="pr-nav">
          <Link href="/" className="pr-nav-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" />
          </Link>
          <div className="pr-nav-links">
            <Link href="/dashboard" className="pr-nav-link">← Dashboard</Link>
          </div>
        </nav>

        <div className="pr-container">

          <div className="pr-header">
            <h1 className="pr-title">My Profile</h1>
            <p className="pr-sub">
              {data?.isLO
                ? "Your name and license info appear when you respond to borrower scenarios."
                : "Your profile details for your HomeRates.ai account."}
            </p>
          </div>

          {loading ? (
            <div className="pr-loading">Loading profile...</div>
          ) : (
            <form className="pr-form" onSubmit={save}>

              {/* Account info (read-only) */}
              <div className="pr-section">
                <div className="pr-section-title">Account</div>
                <div className="pr-field">
                  <label className="pr-label">Email</label>
                  <div className="pr-readonly">{data?.email ?? "—"}</div>
                  <span className="pr-hint">Managed by your sign-in provider. Change it in account settings.</span>
                </div>
                <div className="pr-field">
                  <label className="pr-label" htmlFor="full_name">Display Name</label>
                  <input
                    id="full_name"
                    className="pr-input"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Your full name"
                    maxLength={80}
                  />
                  <span className="pr-hint">Shown on your responses to borrowers.</span>
                </div>
              </div>

              {/* LO-only: License & Company */}
              {data?.isLO && (
                <div className="pr-section">
                  <div className="pr-section-title">License &amp; Company</div>

                  <div className="pr-field">
                    <label className="pr-label" htmlFor="lender">Lender / Company Name</label>
                    <input
                      id="lender"
                      className="pr-input"
                      value={lender}
                      onChange={e => setLender(e.target.value)}
                      placeholder="e.g. Rocket Mortgage, CrossCountry, etc."
                      maxLength={100}
                    />
                    <span className="pr-hint">Borrowers see this when you respond to their scenario.</span>
                  </div>

                  <div className="pr-row">
                    <div className="pr-field">
                      <label className="pr-label" htmlFor="nmls">NMLS #</label>
                      <input
                        id="nmls"
                        className="pr-input"
                        value={nmls}
                        onChange={e => setNmls(e.target.value.replace(/\D/g, ""))}
                        placeholder="e.g. 123456"
                        maxLength={12}
                      />
                      <span className="pr-hint">Your individual NMLS license number.</span>
                    </div>

                    <div className="pr-field">
                      <label className="pr-label" htmlFor="license_state">Primary State</label>
                      <select
                        id="license_state"
                        className="pr-select"
                        value={licenseState}
                        onChange={e => setLicenseState(e.target.value)}
                      >
                        <option value="">Select state</option>
                        {US_STATES.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <span className="pr-hint">Your primary licensed state.</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Save / status */}
              {error && <div className="pr-error">{error}</div>}
              {saved && <div className="pr-success">✓ Profile saved</div>}

              <div className="pr-actions">
                <button type="submit" className="pr-save-btn" disabled={saving}>
                  {saving ? "Saving..." : "Save profile"}
                </button>
                <Link href="/dashboard" className="pr-cancel">Cancel</Link>
              </div>

            </form>
          )}

        </div>
      </div>

      <style>{`
        body:has(.pr-root) {
          display: block !important; height: auto !important;
          overflow-y: auto !important; background: #080c12 !important;
        }
        html:has(.pr-root) { background: #080c12 !important; height: auto !important; overflow-y: auto !important; }
        body:has(.pr-root) .app-footer { display: none; }

        .pr-root { font-family: 'DM Sans', system-ui, sans-serif; color: #f0f4ff; min-height: 100vh; background: #080c12; }

        .pr-nav {
          position: sticky; top: 0; z-index: 100;
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 24px;
          background: rgba(8,12,18,0.95); backdrop-filter: blur(8px);
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .pr-nav-logo img { height: 28px; }
        .pr-nav-links { display: flex; gap: 16px; align-items: center; }
        .pr-nav-link { font-size: 0.875rem; color: #8fa3b8; text-decoration: none; transition: color 0.15s; }
        .pr-nav-link:hover { color: #f0f4ff; }

        .pr-container { max-width: 560px; margin: 0 auto; padding: 3rem 1.5rem 5rem; }

        .pr-header { margin-bottom: 2rem; }
        .pr-title { font-family: 'DM Sans', sans-serif; font-size: 1.75rem; font-weight: 700; margin: 0 0 0.4rem; }
        .pr-sub { font-size: 0.9rem; color: #8fa3b8; margin: 0; line-height: 1.55; }

        .pr-loading { text-align: center; padding: 4rem 0; color: #8fa3b8; }

        .pr-form { display: flex; flex-direction: column; gap: 2rem; }

        .pr-section {
          background: #0e1420;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px; padding: 1.5rem;
          display: flex; flex-direction: column; gap: 1.25rem;
        }
        .pr-section-title {
          font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em;
          text-transform: uppercase; color: #8fa3b8;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          padding-bottom: 0.75rem; margin-bottom: 0.25rem;
        }

        .pr-field { display: flex; flex-direction: column; gap: 5px; }
        .pr-label { font-size: 0.78rem; font-weight: 600; color: #8fa3b8; text-transform: uppercase; letter-spacing: 0.05em; }

        .pr-input, .pr-select {
          padding: 11px 14px;
          background: #141b28;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          color: #f0f4ff; font-size: 0.9rem;
          outline: none; font-family: inherit;
          transition: border-color 0.15s;
        }
        .pr-input:focus, .pr-select:focus { border-color: rgba(0,232,122,0.4); }
        .pr-select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%238fa3b8' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 14px center; padding-right: 36px; }

        .pr-readonly {
          padding: 11px 14px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 10px;
          color: #3a4560; font-size: 0.9rem;
        }

        .pr-hint { font-size: 0.75rem; color: #3a4560; line-height: 1.4; }

        .pr-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }

        .pr-error {
          background: rgba(255,95,95,0.08); border: 1px solid rgba(255,95,95,0.2);
          border-radius: 10px; padding: 12px 16px;
          font-size: 0.875rem; color: #ff5f5f;
        }
        .pr-success {
          background: rgba(0,232,122,0.08); border: 1px solid rgba(0,232,122,0.2);
          border-radius: 10px; padding: 12px 16px;
          font-size: 0.875rem; color: #00e87a;
        }

        .pr-actions { display: flex; align-items: center; gap: 14px; }
        .pr-save-btn {
          padding: 11px 28px; background: #00e87a; color: #080c12;
          border: none; border-radius: 999px;
          font-size: 0.9rem; font-weight: 700; cursor: pointer;
          transition: opacity 0.15s;
        }
        .pr-save-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .pr-save-btn:not(:disabled):hover { opacity: 0.88; }
        .pr-cancel { font-size: 0.875rem; color: #8fa3b8; text-decoration: none; }
        .pr-cancel:hover { color: #f0f4ff; }

        @media (max-width: 480px) {
          .pr-row { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  );
}
