"use client";
// app/profile/page.tsx
// Role-aware profile editor — LOs/agents see license + company fields

import { useEffect, useState } from "react";
import Link from "next/link";
import AppNav from "../components/AppNav";

interface ProfileData {
  email: string;
  clerkName: string;
  photoUrl?: string | null;
  full_name: string;
  role: string;
  isLO: boolean;
  lo: {
    lender: string | null;
    nmls: string | null;
    license_state: string | null;
    company_nmls?: string | null;
    title?: string | null;
    bio?: string | null;
    phone?: string | null;
    website?: string | null;
    office_address?: string | null;
  } | null;
  agent: {
    brokerage?: string | null;
    license?: string | null;
    title?: string | null;
    bio?: string | null;
    phone?: string | null;
    website?: string | null;
    office_address?: string | null;
  } | null;
}

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

const ROLE_OPTIONS = [
  { v: "borrower", label: "Borrower / Home Buyer" },
  { v: "lo",       label: "Loan Officer" },
  { v: "agent",    label: "Real Estate Agent" },
];

export default function ProfilePage() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Form fields
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("borrower");
  const [lender, setLender] = useState("");
  const [nmls, setNmls] = useState("");
  const [companyNmls, setCompanyNmls] = useState("");
  const [licenseState, setLicenseState] = useState("");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [officeAddress, setOfficeAddress] = useState("");
  // Borrower-specific
  const [borrowerPhone, setBorrowerPhone] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [currentLoanBal, setCurrentLoanBal] = useState("");

  const serverRole = data?.role ?? "borrower";
  const showPro = role === "lo" || role === "agent";

  useEffect(() => {
    fetch("/api/profile")
      .then(r => r.ok ? r.json() : null)
      .then((d: ProfileData | null) => {
        if (!d) return;
        setData(d);
        setFullName(d.full_name || d.clerkName || "");
        setRole(d.role || "borrower");
        const pro = d.lo ?? d.agent;
        setLender(d.lo?.lender ?? d.agent?.brokerage ?? "");
        setNmls(d.lo?.nmls ?? d.agent?.license ?? "");
        setCompanyNmls(d.lo?.company_nmls ?? "");
        setLicenseState(d.lo?.license_state ?? "");
        setTitle(pro?.title ?? "");
        setBio(pro?.bio ?? "");
        setPhone(pro?.phone ?? "");
        setWebsite(pro?.website ?? "");
        setOfficeAddress(pro?.office_address ?? "");
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
          role,
          lender,
          nmls,
          company_nmls: companyNmls,
          license_state: licenseState,
          title,
          bio,
          phone,
          website,
          office_address: officeAddress,
          borrower_phone: borrowerPhone,
          property_address: propertyAddress,
          current_loan_balance: currentLoanBal,
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

        <AppNav activePage="profile" />

        <div className="pr-container">

          <div className="pr-header">
            <h1 className="pr-title">My Profile</h1>
            <p className="pr-sub">
              {showPro
                ? "Your name, license, and company info appear when you respond to borrower scenarios."
                : "Your profile details for your HomeRates.ai account."}
            </p>
          </div>

          {loading ? (
            <div className="pr-loading">Loading profile...</div>
          ) : (
            <form className="pr-form" onSubmit={save}>

              {/* Account info */}
              <div className="pr-section">
                <div className="pr-section-title">Account</div>

                <div className="pr-field">
                  <label className="pr-label">Email</label>
                  <div className="pr-readonly">{data?.email ?? "—"}</div>
                  <span className="pr-hint">Managed by your sign-in provider.</span>
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

                <div className="pr-field">
                  <label className="pr-label">I am a</label>
                  <div className="pr-role-chips">
                    {ROLE_OPTIONS.map(({ v, label }) => {
                      const isActive = role === v;
                      // Role is fixed at registration — all other chips are locked.
                      // Borrowers can't self-upgrade; LOs/agents can't switch or downgrade.
                      const isLocked = v !== serverRole;
                      return (
                        <button
                          key={v}
                          type="button"
                          className={`pr-role-chip ${isActive ? "active" : ""} ${isLocked ? "locked" : ""}`}
                          onClick={() => !isLocked && setRole(v)}
                          title={isLocked ? "Your account type is set at registration. Contact support to change." : undefined}
                        >
                          {label}
                          {isLocked && <span className="pr-chip-lock"> 🔒</span>}
                        </button>
                      );
                    })}
                  </div>
                  <span className="pr-hint">
                    {serverRole === "borrower"
                      ? "Loan Officer and Agent access requires professional registration. Contact us to get set up."
                      : "Your account type is set at registration. Contact support@homerates.ai to change."}
                  </span>
                </div>
              </div>

              {/* Borrower-specific section */}
              {role === "borrower" && (
                <div className="pr-section">
                  <div className="pr-section-title">Your details <span className="pr-section-optional">— optional, helps lenders respond more accurately</span></div>

                  <div className="pr-field">
                    <label className="pr-label" htmlFor="b_phone">Phone number</label>
                    <input
                      id="b_phone"
                      className="pr-input"
                      type="tel"
                      value={borrowerPhone}
                      onChange={e => setBorrowerPhone(e.target.value)}
                      placeholder="e.g. (818) 555-0100"
                      maxLength={20}
                    />
                    <span className="pr-hint">Only shared with a professional if you choose to invite them.</span>
                  </div>

                  <div className="pr-field">
                    <label className="pr-label" htmlFor="b_property">Current property address</label>
                    <input
                      id="b_property"
                      className="pr-input"
                      value={propertyAddress}
                      onChange={e => setPropertyAddress(e.target.value)}
                      placeholder="e.g. 123 Main St, Los Angeles CA 90001"
                      maxLength={200}
                    />
                    <span className="pr-hint">Useful if you're refinancing or want a home value estimate.</span>
                  </div>

                  <div className="pr-field">
                    <label className="pr-label" htmlFor="b_loan_bal">Current loan balance</label>
                    <input
                      id="b_loan_bal"
                      className="pr-input"
                      value={currentLoanBal}
                      onChange={e => setCurrentLoanBal(e.target.value)}
                      placeholder="e.g. $420,000"
                      maxLength={30}
                    />
                    <span className="pr-hint">Helps lenders provide accurate refi quotes.</span>
                  </div>
                </div>
              )}

              {/* Pro fields — LO or Agent */}
              {showPro && (
                <div className="pr-section pr-section-pro">
                  <div className="pr-section-title">
                    {role === "agent" ? "License & Brokerage" : "License & Company"}
                  </div>

                  <div className="pr-field">
                    <label className="pr-label" htmlFor="lender">
                      {role === "agent" ? "Brokerage / Company" : "Lender / Company Name"}
                    </label>
                    <input
                      id="lender"
                      className="pr-input"
                      value={lender}
                      onChange={e => setLender(e.target.value)}
                      placeholder={role === "agent" ? "e.g. Compass, Keller Williams..." : "e.g. Rocket Mortgage, CrossCountry..."}
                      maxLength={100}
                    />
                    <span className="pr-hint">Visible to borrowers when you respond to their scenario.</span>
                  </div>

                  <div className="pr-row">
                    <div className="pr-field">
                      <label className="pr-label" htmlFor="nmls">
                        {role === "agent" ? "License #" : "NMLS # (Individual)"}
                      </label>
                      <input
                        id="nmls"
                        className="pr-input"
                        value={nmls}
                        onChange={e => setNmls(e.target.value.replace(/\D/g, ""))}
                        placeholder={role === "agent" ? "e.g. 01234567" : "e.g. 123456"}
                        maxLength={12}
                      />
                      <span className="pr-hint">
                        Your individual license number.{" "}
                        {role === "lo" && nmls.length >= 5 && (
                          <a
                            className="pr-verify-link"
                            href={`https://www.nmlsconsumeraccess.org/EntityDetails.aspx/INDIVIDUAL/${nmls}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Verify on NMLS Consumer Access →
                          </a>
                        )}
                      </span>
                    </div>

                    {role === "lo" && (
                      <div className="pr-field">
                        <label className="pr-label" htmlFor="company_nmls">Company NMLS #</label>
                        <input
                          id="company_nmls"
                          className="pr-input"
                          value={companyNmls}
                          onChange={e => setCompanyNmls(e.target.value.replace(/\D/g, ""))}
                          placeholder="e.g. 3030"
                          maxLength={12}
                        />
                        <span className="pr-hint">Your lender's company NMLS ID.</span>
                      </div>
                    )}
                  </div>

                  <div className="pr-row">
                    <div className="pr-field">
                      <label className="pr-label" htmlFor="license_state">Primary Licensed State</label>
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
                      <span className="pr-hint">Your primary state of licensure.</span>
                    </div>

                    <div className="pr-field">
                      <label className="pr-label" htmlFor="phone">Phone (optional)</label>
                      <input
                        id="phone"
                        className="pr-input"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="e.g. (818) 555-0100"
                        maxLength={20}
                        type="tel"
                      />
                      <span className="pr-hint">Only shared when a borrower invites you.</span>
                    </div>
                  </div>

                  <div className="pr-field">
                    <label className="pr-label" htmlFor="website">Website / LinkedIn (optional)</label>
                    <input
                      id="website"
                      className="pr-input"
                      value={website}
                      onChange={e => setWebsite(e.target.value)}
                      placeholder="https://..."
                      maxLength={200}
                      type="url"
                    />
                    <span className="pr-hint">Borrowers can review your background before deciding to connect.</span>
                  </div>

                  <div className="pr-field">
                    <label className="pr-label" htmlFor="title">Job Title (optional)</label>
                    <input
                      id="title"
                      className="pr-input"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder={role === "agent" ? "e.g. Realtor®, Buyer's Agent" : "e.g. Senior Loan Officer, Mortgage Advisor"}
                      maxLength={80}
                    />
                    <span className="pr-hint">Shown on your contact card when a borrower connects with you.</span>
                  </div>

                  <div className="pr-field">
                    <label className="pr-label" htmlFor="office_address">Office Address (optional)</label>
                    <input
                      id="office_address"
                      className="pr-input"
                      value={officeAddress}
                      onChange={e => setOfficeAddress(e.target.value)}
                      placeholder="e.g. 123 Main St, Suite 200, Los Angeles CA 90001"
                      maxLength={200}
                    />
                    <span className="pr-hint">Included in your contact card email to build trust with new borrowers.</span>
                  </div>

                  <div className="pr-field">
                    <label className="pr-label" htmlFor="bio">Personal Statement (optional)</label>
                    <textarea
                      id="bio"
                      className="pr-input"
                      style={{ resize: "vertical", minHeight: 90, lineHeight: 1.55 }}
                      value={bio}
                      onChange={e => setBio(e.target.value)}
                      placeholder={role === "agent"
                        ? "e.g. I specialize in first-time buyers in the LA market. 12 years experience, 200+ closings."
                        : "e.g. 15 years helping first-time buyers. Specializing in FHA, VA, and jumbo. NMLS licensed in CA, TX, and FL."}
                      maxLength={280}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="pr-hint">Your 30-second pitch. Shown on the contact card borrowers receive.</span>
                      <span className="pr-hint">{bio.length}/280</span>
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

.pr-container { max-width: 580px; margin: 0 auto; padding: 3rem 1.5rem 5rem; }

        .pr-header { margin-bottom: 2rem; }
        .pr-title { font-family: 'DM Sans', sans-serif; font-size: 1.75rem; font-weight: 700; margin: 0 0 0.4rem; }
        .pr-sub { font-size: 0.9rem; color: #8fa3b8; margin: 0; line-height: 1.55; }

        .pr-loading { text-align: center; padding: 4rem 0; color: #8fa3b8; }

        .pr-form { display: flex; flex-direction: column; gap: 1.5rem; }

        .pr-section {
          background: #0e1420;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px; padding: 1.5rem;
          display: flex; flex-direction: column; gap: 1.25rem;
        }
        .pr-section-pro {
          border-color: rgba(0,232,122,0.15);
          background: rgba(0,232,122,0.02);
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
        .pr-select {
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%238fa3b8' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 14px center; padding-right: 36px;
        }

        .pr-readonly {
          padding: 11px 14px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 10px;
          color: #3a4560; font-size: 0.9rem;
        }

        .pr-hint { font-size: 0.75rem; color: #3a4560; line-height: 1.4; }
        .pr-verify-link { color: #00e87a; text-decoration: none; font-weight: 500; }
        .pr-verify-link:hover { text-decoration: underline; }

        .pr-role-chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .pr-role-chip {
          padding: 8px 18px; border-radius: 99px;
          border: 1px solid rgba(255,255,255,0.10);
          background: transparent; color: #8fa3b8;
          font-size: 0.875rem; cursor: pointer; font-family: inherit;
          transition: all 0.15s;
        }
        .pr-role-chip:hover { border-color: rgba(255,255,255,0.25); color: #f0f4ff; }
        .pr-role-chip.active {
          background: rgba(0,232,122,0.12); border-color: rgba(0,232,122,0.4);
          color: #00e87a; font-weight: 600;
        }
        .pr-role-chip.locked {
          opacity: 0.35; cursor: not-allowed;
          border-color: rgba(255,255,255,0.06);
        }
        .pr-role-chip.locked:hover { border-color: rgba(255,255,255,0.06); color: #8fa3b8; }
        .pr-chip-lock { font-size: 0.7rem; }
        .pr-section-optional { font-weight: 400; text-transform: none; letter-spacing: 0; color: #3a4560; font-size: 0.7rem; }

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
          .pr-role-chips { flex-direction: column; }
        }
      `}</style>
    </>
  );
}
