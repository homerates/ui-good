"use client";
// app/professionals/new/page.tsx
// Self-serve registration form for the professional directory.
// No seed data required — pros fill this out themselves.

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppNav from "../../components/AppNav";

const PRO_TYPES = [
  { value: "lo",           label: "Loan Officer",          desc: "Licensed MLO / individual originator" },
  { value: "lo_company",   label: "Mortgage Company",      desc: "Brokerage, bank, or lending company" },
  { value: "agent",        label: "Real Estate Agent",     desc: "Licensed salesperson under a broker" },
  { value: "agent_broker", label: "Real Estate Broker",    desc: "Licensed broker / broker-owner" },
];

export default function ProfessionalsNewPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  const [proType, setProType]       = useState("");
  const [name, setName]             = useState("");
  const [company, setCompany]       = useState("");
  const [city, setCity]             = useState("");
  const [nmls, setNmls]             = useState("");
  const [dre, setDre]               = useState("");
  const [phone, setPhone]           = useState("");
  const [website, setWebsite]       = useState("");
  const [bio, setBio]               = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const isLoType = proType === "lo" || proType === "lo_company";
  const isAgent  = proType === "agent" || proType === "agent_broker";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!proType || !name.trim()) {
      setError("Please select a professional type and enter your name.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res  = await fetch("/api/pro-directory/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pro_type:     proType,
          name:         name.trim(),
          company_name: company.trim() || undefined,
          city:         city.trim() || undefined,
          nmls:         nmls.trim() || undefined,
          dre_license:  dre.trim() || undefined,
          phone:        phone.trim() || undefined,
          website:      website.trim() || undefined,
          bio:          bio.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // If they already have a listing, send them to their profile
        if (res.status === 409 && data.id) {
          router.push("/profile");
          return;
        }
        setError(data.error ?? "Something went wrong.");
        return;
      }
      router.push("/profile");
    } catch {
      setError("Unexpected error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isLoaded) return null;

  if (!user) {
    return (
      <>
        <style>{`
          body:has(.pn-root){display:block!important;height:auto!important;overflow-y:auto!important;background:#080c12!important}
          html:has(.pn-root){height:auto!important;overflow:visible!important}
          .pn-root{min-height:100vh;background:#080c12;color:#f0f4ff;font-family:'DM Sans',system-ui,sans-serif}
          .pn-nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 2rem;height:56px;background:rgba(8,12,18,0.96);border-bottom:1px solid rgba(255,255,255,0.07)}
          .pn-logo img{height:26px;display:block}
          .pn-shell{max-width:480px;margin:0 auto;padding:5rem 1.5rem;text-align:center}
        `}</style>
        <div className="pn-root">
          <nav className="pn-nav">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <Link href="/" className="pn-logo"><img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" /></Link>
            <AppNav drawerOnly />
          </nav>
          <div className="pn-shell">
            <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: "1.5rem" }}>
              You need to be signed in to list yourself in the directory.
            </p>
            <Link
              href="/sign-up?redirect_url=/professionals/new"
              style={{ display: "inline-block", padding: "0.75rem 1.5rem", background: "#00e87a", color: "#080c12", fontWeight: 700, borderRadius: 10, textDecoration: "none" }}
            >
              Create a free account →
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        body:has(.pn-root){display:block!important;height:auto!important;overflow-y:auto!important;background:#080c12!important}
        html:has(.pn-root){height:auto!important;overflow:visible!important;background:#080c12!important}

        .pn-root{min-height:100vh;background:#080c12;color:#f0f4ff;font-family:'DM Sans',system-ui,sans-serif}

        .pn-nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 2rem;height:56px;background:rgba(8,12,18,0.96);border-bottom:1px solid rgba(255,255,255,0.07);backdrop-filter:blur(8px)}
        .pn-logo img{height:26px;display:block}

        .pn-shell{max-width:580px;margin:0 auto;padding:3.5rem 1.5rem 6rem}

        .pn-eyebrow{font-size:0.72rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#3d8bff;margin-bottom:0.5rem}
        .pn-h1{font-size:clamp(1.6rem,4vw,2.2rem);font-weight:800;letter-spacing:-0.03em;margin:0 0 0.5rem}
        .pn-sub{color:rgba(255,255,255,0.4);font-size:0.9rem;margin:0 0 2.5rem}

        .pn-section{margin-bottom:2rem}
        .pn-label{display:block;font-size:0.78rem;font-weight:600;color:rgba(255,255,255,0.5);margin-bottom:0.5rem;letter-spacing:0.02em}
        .pn-label-req{color:#3d8bff;margin-left:2px}

        .pn-type-grid{display:grid;grid-template-columns:1fr 1fr;gap:0.65rem}
        .pn-type-btn{padding:0.9rem 1rem;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;cursor:pointer;text-align:left;transition:all 0.15s;color:#f0f4ff}
        .pn-type-btn:hover{border-color:rgba(255,255,255,0.18);background:rgba(255,255,255,0.07)}
        .pn-type-btn.active{border-color:rgba(61,139,255,0.5);background:rgba(61,139,255,0.08)}
        .pn-type-name{font-size:0.88rem;font-weight:700;display:block;margin-bottom:2px}
        .pn-type-desc{font-size:0.72rem;color:rgba(255,255,255,0.35)}

        .pn-input{width:100%;padding:0.7rem 1rem;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#f0f4ff;font-size:0.9rem;outline:none;box-sizing:border-box;font-family:inherit;transition:border-color 0.2s}
        .pn-input:focus{border-color:rgba(61,139,255,0.5)}
        .pn-input::placeholder{color:rgba(255,255,255,0.2)}
        .pn-textarea{width:100%;padding:0.7rem 1rem;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#f0f4ff;font-size:0.9rem;outline:none;box-sizing:border-box;font-family:inherit;resize:vertical;min-height:90px;line-height:1.5;transition:border-color 0.2s}
        .pn-textarea:focus{border-color:rgba(61,139,255,0.5)}
        .pn-textarea::placeholder{color:rgba(255,255,255,0.2)}

        .pn-row{display:grid;grid-template-columns:1fr 1fr;gap:0.75rem}

        .pn-hint{font-size:0.73rem;color:rgba(255,255,255,0.25);margin-top:0.4rem}

        .pn-divider{height:1px;background:rgba(255,255,255,0.06);margin:2rem 0}

        .pn-submit{width:100%;padding:1rem;background:#00e87a;color:#080c12;font-weight:800;font-size:1rem;border:none;border-radius:12px;cursor:pointer;transition:opacity 0.2s;margin-top:0.5rem}
        .pn-submit:hover:not(:disabled){opacity:0.85}
        .pn-submit:disabled{opacity:0.5;cursor:not-allowed}

        .pn-error{font-size:0.84rem;color:#ff5f5f;margin-top:0.75rem;padding:0.75rem 1rem;background:rgba(255,95,95,0.06);border:1px solid rgba(255,95,95,0.15);border-radius:8px}

        .pn-optional{color:rgba(255,255,255,0.2);font-weight:400;font-size:0.72rem;margin-left:4px}

        .pn-back{display:inline-block;font-size:0.82rem;color:rgba(255,255,255,0.3);text-decoration:none;margin-bottom:1.5rem}
        .pn-back:hover{color:#fff}

        @media(max-width:560px){
          .pn-type-grid{grid-template-columns:1fr}
          .pn-row{grid-template-columns:1fr}
          .pn-shell{padding:2rem 1rem 5rem}
        }
      `}</style>

      <div className="pn-root">
        <nav className="pn-nav">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <Link href="/" className="pn-logo"><img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" /></Link>
          <AppNav drawerOnly />
        </nav>

        <div className="pn-shell">
          <Link href="/professionals" className="pn-back">← Back to directory</Link>

          <div className="pn-eyebrow">Free Listing</div>
          <h1 className="pn-h1">Add Yourself to the Directory</h1>
          <p className="pn-sub">
            List your profile for borrowers and agents to find you.
            Takes 2 minutes — no data import needed.
          </p>

          <form onSubmit={handleSubmit}>

            {/* Pro type */}
            <div className="pn-section">
              <label className="pn-label">
                I am a<span className="pn-label-req">*</span>
              </label>
              <div className="pn-type-grid">
                {PRO_TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    className={`pn-type-btn ${proType === t.value ? "active" : ""}`}
                    onClick={() => setProType(t.value)}
                  >
                    <span className="pn-type-name">{t.label}</span>
                    <span className="pn-type-desc">{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {proType && (
              <>
                <div className="pn-divider" />

                {/* Name */}
                <div className="pn-section">
                  <label className="pn-label">
                    {isLoType ? "Full name or company name" : "Full name"}
                    <span className="pn-label-req">*</span>
                  </label>
                  <input
                    className="pn-input"
                    placeholder={isLoType ? "e.g. Jane Smith or Apex Lending" : "e.g. Jane Smith"}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                  />
                </div>

                {/* Company */}
                {(proType === "lo" || proType === "agent") && (
                  <div className="pn-section">
                    <label className="pn-label">
                      {proType === "lo" ? "Lender / Brokerage" : "Brokerage"}
                      <span className="pn-optional">optional</span>
                    </label>
                    <input
                      className="pn-input"
                      placeholder={proType === "lo" ? "e.g. Better Mortgage, Apex Lending" : "e.g. Compass, Keller Williams"}
                      value={company}
                      onChange={e => setCompany(e.target.value)}
                    />
                  </div>
                )}

                {/* City */}
                <div className="pn-section">
                  <label className="pn-label">
                    City (California)
                    <span className="pn-optional">optional</span>
                  </label>
                  <input
                    className="pn-input"
                    placeholder="e.g. Los Angeles"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                  />
                </div>

                {/* License numbers */}
                <div className="pn-section">
                  <div className="pn-row">
                    {isLoType && (
                      <div>
                        <label className="pn-label">
                          NMLS #<span className="pn-optional">optional</span>
                        </label>
                        <input
                          className="pn-input"
                          placeholder="e.g. 1234567"
                          value={nmls}
                          onChange={e => setNmls(e.target.value.replace(/\D/g, ""))}
                          maxLength={10}
                        />
                      </div>
                    )}
                    {isAgent && (
                      <div>
                        <label className="pn-label">
                          CA DRE License #<span className="pn-optional">optional</span>
                        </label>
                        <input
                          className="pn-input"
                          placeholder="e.g. 02123456"
                          value={dre}
                          onChange={e => setDre(e.target.value.replace(/\D/g, ""))}
                          maxLength={9}
                        />
                      </div>
                    )}
                    <div>
                      <label className="pn-label">
                        Phone<span className="pn-optional">optional</span>
                      </label>
                      <input
                        className="pn-input"
                        type="tel"
                        placeholder="(555) 555-5555"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Website */}
                <div className="pn-section">
                  <label className="pn-label">
                    Website<span className="pn-optional">optional</span>
                  </label>
                  <input
                    className="pn-input"
                    type="url"
                    placeholder="https://yoursite.com"
                    value={website}
                    onChange={e => setWebsite(e.target.value)}
                  />
                </div>

                {/* Bio */}
                <div className="pn-section">
                  <label className="pn-label">
                    Short bio<span className="pn-optional">optional — shown on your listing</span>
                  </label>
                  <textarea
                    className="pn-textarea"
                    placeholder="A few sentences about your experience, specialties, and how you help clients…"
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    maxLength={500}
                  />
                  <div className="pn-hint">{bio.length}/500 characters</div>
                </div>

                <div className="pn-divider" />

                <button className="pn-submit" type="submit" disabled={submitting || !proType || !name.trim()}>
                  {submitting ? "Creating your listing…" : "Create free listing →"}
                </button>

                {error && <div className="pn-error">{error}</div>}

                <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.2)", marginTop: "1.25rem", lineHeight: 1.5 }}>
                  By listing yourself you confirm you are a licensed California professional
                  and agree to keep your information accurate.
                  Listings may be verified against NMLS Consumer Access or CA DRE records.
                </p>
              </>
            )}
          </form>
        </div>
      </div>
    </>
  );
}
