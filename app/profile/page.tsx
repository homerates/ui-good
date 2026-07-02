"use client";
// app/profile/page.tsx
// Role-aware profile editor — LOs/agents see license + company fields

import { useEffect, useState } from "react";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import AppNav from "../components/AppNav";
import { useConsumerMode } from "@/useConsumerMode";

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
    is_founding_member?: boolean;
  } | null;
  agent: {
    brokerage?: string | null;
    license?: string | null;
    title?: string | null;
    bio?: string | null;
    phone?: string | null;
    website?: string | null;
    office_address?: string | null;
    is_founding_member?: boolean;
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
  const isConsumer = useConsumerMode();
  const { openUserProfile } = useClerk();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [referralLink, setReferralLink] = useState<string | null>(null);
  const [referralCount, setReferralCount] = useState<number>(0);
  const [copySuccess, setCopySuccess] = useState(false);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [currentPlan, setCurrentPlan] = useState<string>("free");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Org nomination
  const [nomOrgName, setNomOrgName]     = useState("");
  const [nomOrgType, setNomOrgType]     = useState("brokerage");
  const [nomEmail, setNomEmail]         = useState("");
  const [nomWebsite, setNomWebsite]     = useState("");
  const [nomNotes, setNomNotes]         = useState("");
  const [nomSubmitting, setNomSubmitting] = useState(false);
  const [nomDone, setNomDone]           = useState(false);
  const [nomErr, setNomErr]             = useState("");

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

  const isAdmin = data?.role === "admin";
  const serverRole = isAdmin
    ? (data?.lo ? "lo" : data?.agent ? "agent" : "borrower")
    : (data?.role ?? "borrower");
  const showPro = role === "lo" || role === "agent";

  useEffect(() => {
    fetch("/api/credits")
      .then(r => r.ok ? r.json() : null)
      .then((d: { balance?: number } | null) => { if (d) setCreditBalance(d.balance ?? 0); })
      .catch(() => {});

    fetch("/api/user/plan")
      .then(r => r.ok ? r.json() : null)
      .then((d: { plan?: string } | null) => { if (d?.plan) setCurrentPlan(d.plan); })
      .catch(() => {});

    fetch("/api/profile")
      .then(r => r.ok ? r.json() : null)
      .then((d: (ProfileData & { referral_code?: string | null; referral_count?: number }) | null) => {
        if (!d) return;
        setData(d);
        setReferralCount(d.referral_count ?? 0);
        if (d.referral_code) {
          setReferralLink(`${window.location.origin}/r/${d.referral_code}`);
        }
        setFullName(d.full_name || d.clerkName || "");
        setRole(d.role === "admin"
          ? (d.lo ? "lo" : d.agent ? "agent" : "borrower")
          : (d.role || "borrower"));
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
          role: isAdmin ? undefined : role,
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

        <AppNav activePage="profile" consumer={isConsumer} />

        <div className="pr-container">

          <div className="pr-header">
            <div className="pr-avatar-row">
              {data?.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.photoUrl} alt="Profile photo" className="pr-avatar-img" />
              ) : (
                <div className="pr-avatar-initials">
                  {(data?.clerkName || data?.full_name || "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="pr-avatar-meta">
                <div className="pr-avatar-name">{data?.clerkName || data?.full_name || "—"}</div>
                <button
                  type="button"
                  className="pr-avatar-change"
                  onClick={() => openUserProfile()}
                >
                  Change photo →
                </button>
              </div>
            </div>
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

              {/* Founding Member badge */}
              {(data?.lo?.is_founding_member || data?.agent?.is_founding_member) && (
                <div style={{ display:"flex", alignItems:"center", gap:"12px", background:"rgba(217,119,6,0.08)", border:"1px solid rgba(217,119,6,0.25)", borderRadius:12, padding:"14px 18px", marginBottom:"1.5rem" }}>
                  <span style={{ fontSize:"1.5rem" }}>🏅</span>
                  <div>
                    <div style={{ fontSize:"0.78rem", fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:"#d97706", marginBottom:2 }}>Founding 500 Member</div>
                    <div style={{ fontSize:"0.82rem", color:"rgba(255,255,255,0.5)", lineHeight:1.4 }}>Your Founding Member badge is live on your public profile. You&apos;re locked in at founding pricing.</div>
                  </div>
                </div>
              )}

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
                      // Admin users can freely switch role; others are fixed at registration.
                      const isLocked = !isAdmin && v !== serverRole;
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

              {/* Credit Bank */}
              <div className="pr-section">
                <div className="pr-section-title">Credit bank</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: "2rem", fontWeight: 800, color: "#00e87a", lineHeight: 1 }}>
                      {creditBalance ?? "—"}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "#8fa3b8", marginTop: 4 }}>credits available</div>
                  </div>
                  <div style={{ fontSize: "0.82rem", color: "#94a3b8", lineHeight: 1.5, maxWidth: 280 }}>
                    50 credits = 1 extra scenario post beyond your plan limit (max 3/mo)
                  </div>
                </div>
                {currentPlan === "free" ? (
                  <div style={{ marginTop: 12, padding: "12px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10 }}>
                    <div style={{ fontSize: "0.82rem", color: "#8fa3b8", lineHeight: 1.5, marginBottom: 10 }}>
                      Credits are earned as a participation bonus — referrals, founding membership, and platform activity. An active subscription unlocks redemption.
                    </div>
                    <Link href="/pricing" style={{ display: "inline-block", padding: "8px 20px", background: "#00e87a", color: "#080c12", borderRadius: 999, fontSize: "0.82rem", fontWeight: 700, textDecoration: "none" }}>
                      Upgrade to redeem →
                    </Link>
                  </div>
                ) : (creditBalance ?? 0) >= 50 && (
                  <div>
                    <button
                      type="button"
                      disabled={redeeming}
                      onClick={async () => {
                        setRedeeming(true);
                        setRedeemMsg(null);
                        const res = await fetch("/api/credits/redeem", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ type: "scenario_slot" }),
                        });
                        const d = await res.json();
                        if (res.ok) {
                          setCreditBalance(d.balance);
                          setRedeemMsg({ ok: true, text: `Done! You have 1 extra scenario post this month. Balance: ${d.balance} credits.` });
                        } else {
                          setRedeemMsg({ ok: false, text: d.error ?? "Something went wrong" });
                        }
                        setRedeeming(false);
                      }}
                      style={{
                        padding: "10px 22px", background: "rgba(0,232,122,0.12)",
                        border: "1px solid rgba(0,232,122,0.3)", borderRadius: 999,
                        color: "#00e87a", fontSize: "0.85rem", fontWeight: 700,
                        cursor: redeeming ? "not-allowed" : "pointer", fontFamily: "inherit",
                        opacity: redeeming ? 0.5 : 1, transition: "opacity 0.15s",
                      }}
                    >
                      {redeeming ? "Redeeming…" : "Use 50 credits → 1 extra scenario post"}
                    </button>
                    {redeemMsg && (
                      <div style={{ marginTop: 8, fontSize: "0.82rem", color: redeemMsg.ok ? "#00e87a" : "#ff5f5f" }}>
                        {redeemMsg.text}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Referral link section */}
              <div className="pr-section">
                <div className="pr-section-title">Referral link</div>
                {referralLink ? (
                  <>
                    <div style={{ display: "flex", gap: 8 }}>
                      <div className="pr-readonly" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.82rem", color: "#8fa3b8" }}>
                        {referralLink}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(referralLink).then(() => {
                            setCopySuccess(true);
                            setTimeout(() => setCopySuccess(false), 2000);
                          });
                        }}
                        style={{
                          flexShrink: 0, padding: "11px 18px",
                          background: copySuccess ? "rgba(0,232,122,0.15)" : "#141b28",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 10, color: copySuccess ? "#00e87a" : "#8fa3b8",
                          fontSize: "0.82rem", fontWeight: 600, cursor: "pointer",
                          fontFamily: "inherit", transition: "all 0.15s",
                        }}
                      >
                        {copySuccess ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    {referralCount > 0 && (
                      <div style={{ fontSize: "0.82rem", color: "#00e87a" }}>
                        {referralCount} {referralCount === 1 ? "person" : "people"} joined via your link · {referralCount * 500} credits earned
                      </div>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    className="pr-save-btn"
                    style={{ alignSelf: "flex-start", padding: "10px 22px" }}
                    onClick={() => {
                      fetch("/api/referral/code")
                        .then(r => r.ok ? r.json() : null)
                        .then((d: { code?: string } | null) => {
                          if (d?.code) setReferralLink(`${window.location.origin}/r/${d.code}`);
                        })
                        .catch(() => {});
                    }}
                  >
                    Generate my referral link
                  </button>
                )}
              </div>

              {/* Nominate your organization */}
              <div className="pr-section">
                <div className="pr-section-title">Nominate your organization</div>
                {nomDone ? (
                  <div style={{ fontSize: "0.875rem", color: "#00e87a" }}>
                    ✓ Nomination submitted — our team will reach out to your organization.
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize: "0.82rem", color: "#8fa3b8", margin: "0 0 14px", lineHeight: 1.6 }}>
                      Is your company not yet on HomeRates.ai? Let us know and we&apos;ll reach out to set up a corporate account with priority onboarding.
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <select
                          value={nomOrgType}
                          onChange={e => setNomOrgType(e.target.value)}
                          className="pr-input"
                          style={{ flex: "1 1 140px", appearance: "none" }}
                        >
                          <option value="brokerage">Mortgage Brokerage</option>
                          <option value="lender">Lender / Bank</option>
                          <option value="credit_union">Credit Union</option>
                          <option value="re_brokerage">RE Brokerage</option>
                        </select>
                        <input
                          className="pr-input"
                          style={{ flex: "2 1 180px" }}
                          placeholder="Organization name *"
                          value={nomOrgName}
                          onChange={e => setNomOrgName(e.target.value)}
                        />
                      </div>
                      <input
                        className="pr-input"
                        type="email"
                        placeholder="Corporate contact email (optional)"
                        value={nomEmail}
                        onChange={e => setNomEmail(e.target.value)}
                      />
                      <input
                        className="pr-input"
                        type="url"
                        placeholder="Website (optional)"
                        value={nomWebsite}
                        onChange={e => setNomWebsite(e.target.value)}
                      />
                      <textarea
                        className="pr-input"
                        style={{ resize: "vertical", minHeight: 60, fontFamily: "inherit" }}
                        placeholder="Any notes for our team (optional)"
                        value={nomNotes}
                        onChange={e => setNomNotes(e.target.value)}
                        rows={2}
                      />
                      {nomErr && <div className="pr-error">{nomErr}</div>}
                      <button
                        type="button"
                        disabled={nomSubmitting || !nomOrgName.trim()}
                        onClick={async () => {
                          setNomSubmitting(true); setNomErr("");
                          const res = await fetch("/api/org/nominate", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ org_name: nomOrgName, org_type: nomOrgType, contact_email: nomEmail || undefined, website: nomWebsite || undefined, notes: nomNotes || undefined }),
                          });
                          const d = await res.json();
                          if (!res.ok) { setNomErr(d.error ?? "Failed to submit"); } else { setNomDone(true); }
                          setNomSubmitting(false);
                        }}
                        style={{
                          alignSelf: "flex-start", padding: "9px 20px",
                          background: "rgba(0,232,122,0.1)", color: "#00e87a",
                          border: "1px solid rgba(0,232,122,0.3)", borderRadius: 999,
                          fontSize: "0.82rem", fontWeight: 700, cursor: nomSubmitting ? "not-allowed" : "pointer",
                          opacity: (nomSubmitting || !nomOrgName.trim()) ? 0.5 : 1,
                          fontFamily: "inherit",
                        }}
                      >
                        {nomSubmitting ? "Submitting…" : "Nominate organization →"}
                      </button>
                    </div>
                  </>
                )}
              </div>

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
        .pr-avatar-row {
          display: flex; align-items: center; gap: 14px; margin-bottom: 1.25rem;
        }
        .pr-avatar-img {
          width: 64px; height: 64px; border-radius: 50%;
          object-fit: cover; border: 2px solid rgba(0,232,122,0.3);
          flex-shrink: 0;
        }
        .pr-avatar-initials {
          width: 64px; height: 64px; border-radius: 50%;
          background: linear-gradient(135deg, #0e2a1a, #0a1f14);
          border: 2px solid rgba(0,232,122,0.2);
          display: flex; align-items: center; justify-content: center;
          font-size: 1.5rem; font-weight: 800; color: #00e87a; flex-shrink: 0;
        }
        .pr-avatar-meta { display: flex; flex-direction: column; gap: 3px; }
        .pr-avatar-name { font-size: 1rem; font-weight: 700; color: #f0f4ff; }
        .pr-avatar-change {
          font-size: 0.75rem; color: #3d8bff;
          background: none; border: none; padding: 0; cursor: pointer;
          font-family: inherit;
        }
        .pr-avatar-change:hover { text-decoration: underline; }
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

        .pr-input {
          padding: 10px 13px; background: #141b28;
          border: 1px solid rgba(255,255,255,0.08); border-radius: 9px;
          color: #f0f4ff; font-size: 0.875rem; outline: none; font-family: inherit;
          width: 100%; box-sizing: border-box; transition: border-color 0.15s;
        }
        .pr-input:focus { border-color: rgba(0,232,122,0.4); }
        .pr-readonly {
          padding: 11px 14px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 10px;
          color: #eaf8f7; font-size: 0.9rem;
        }

        .pr-hint { font-size: 0.75rem; color: #eaf8f7; line-height: 1.4; }
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
        .pr-section-optional { font-weight: 400; text-transform: none; letter-spacing: 0; color: #eaf8f7; font-size: 0.7rem; }

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
