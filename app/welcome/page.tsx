"use client";
// app/welcome/page.tsx
// Post sign-up role selection — protected route, runs once per new user

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";

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

export default function WelcomePage() {
  const searchParams = useSearchParams();
  const roleFromUrl = searchParams?.get("role") as UserType | null;
  const pilotSlug = searchParams?.get("pilot") ?? null;
  const { isLoaded, userId, getToken } = useAuth();
  // Pilot LOs default straight to "lo" — skip role picker ambiguity
  const [type, setType] = useState<UserType | "">(pilotSlug ? "lo" : (roleFromUrl ?? ""));
  const [nmls, setNmls] = useState("");
  const [lender, setLender] = useState("");
  const [license, setLicense] = useState("");
  const [brokerage, setBrokerage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // foundingNumber > 0 means this user just claimed a founding spot — show confirmation screen
  const [foundingNumber, setFoundingNumber] = useState<number | null>(null);
  // checking = true while we verify existing session — prevents flash of role selection form
  const [checking, setChecking] = useState(true);

  // If Clerk is loaded but the user isn't authenticated, send them to sign-in preserving
  // the current URL (including ?pilot=...&role=lo params) as the redirect target.
  useEffect(() => {
    if (!isLoaded) return;
    if (!userId) {
      const redirect = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`/sign-in?redirect_url=${redirect}`);
    }
  }, [isLoaded, userId]);

  // Auto-submit if role is pre-determined from URL and needs no extra fields (borrower)
  useEffect(() => {
    if (roleFromUrl === "borrower" && !checking) {
      handleSubmit();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking]);

  // authHeaders — attaches the Clerk JWT as a Bearer token so auth() in route
  // handlers works regardless of cookie state (mobile in-app browsers, redirect flows).
  const authHeaders = useCallback(async (extra?: Record<string, string>) => {
    const token = await getToken();
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    };
  }, [getToken]);

  // For existing (already-registered) users: claim any pending waitlist invite then redirect.
  // Only runs once Clerk has confirmed the user is authenticated (isLoaded && userId).
  useEffect(() => {
    if (!isLoaded || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const headers = await authHeaders();
        const [setupData, claimData] = await Promise.all([
          fetch("/api/onboarding/setup", { headers }).then(r => r.json()).catch(() => ({ role: null })),
          fetch("/api/waitlist/claim", { method: "POST", headers }).then(r => r.json()).catch(() => ({ ok: false })),
        ]);
        if (cancelled) return;
        if (claimData.ok && claimData.foundingNumber) {
          setFoundingNumber(claimData.foundingNumber);
          setChecking(false);
        } else if (setupData.role) {
          window.location.replace(setupData.role === 'borrower' ? '/my-home' : '/dashboard');
        } else {
          setChecking(false);
        }
      } catch {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, userId]);

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
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ role: type, nmls, lender, license, brokerage, pilotSlug }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setSubmitting(false);
        return;
      }
      if (data.foundingNumber || data.isPilot) {
        setFoundingNumber(data.foundingNumber ?? -1); // -1 = pilot path (no sequential number)
      } else {
        window.location.href = type === 'borrower' ? '/my-home' : '/dashboard';
      }
    } catch {
      setError("Network error — please try again");
      setSubmitting(false);
    }
  }

  // Founding member confirmation screen
  if (foundingNumber) {
    return (
      <>
        <div className="wl-root">
          <nav className="wl-nav">
            <Link href="/" className="wl-nav-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" />
            </Link>
          </nav>
          <div className="wl-container">
            <div className="wl-card" style={{ textAlign: "center", gap: "1.5rem" }}>
              <div style={{ fontSize: "3rem" }}>🏅</div>
              <div>
                {foundingNumber === -1 ? (
                  <>
                    <div className="wl-eyebrow" style={{ marginBottom: 8 }}>Pilot Access Activated</div>
                    <h1 className="wl-title" style={{ fontSize: "1.5rem" }}>
                      You&apos;re in. Full access unlocked.
                    </h1>
                    <p className="wl-sub" style={{ marginTop: 8 }}>
                      Your Founding Member badge is live on your HomeRates profile. Credits are ready — start running scenarios for your clients now.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="wl-eyebrow" style={{ marginBottom: 8 }}>Founding 500</div>
                    <h1 className="wl-title" style={{ fontSize: "1.5rem" }}>
                      You&apos;re a Founding Member.
                    </h1>
                    <p className="wl-sub" style={{ marginTop: 8 }}>
                      Your badge is live on your HomeRates profile. You&apos;re locked in at founding pricing — forever.
                    </p>
                  </>
                )}
              </div>
              <button
                type="button"
                className="wl-submit"
                onClick={() => { window.location.href = "/chat"; }}
              >
                Start using HomeRates →
              </button>
            </div>
          </div>
        </div>
        <style>{`
          body:has(.wl-root) .app-footer { display: none !important; }
          .wl-root { position: fixed; inset: 0; overflow-y: auto; overflow-x: hidden; font-family: 'DM Sans', system-ui, sans-serif; color: #f0f4ff; background: #080c12; z-index: 9000; }
          .wl-nav { padding: 18px 32px; border-bottom: 1px solid rgba(255,255,255,0.06); }
          .wl-nav-logo img { height: 28px; }
          .wl-container { max-width: 560px; margin: 0 auto; padding: 3rem 1.5rem 5rem; }
          .wl-card { background: #0e1420; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 2.5rem; display: flex; flex-direction: column; }
          .wl-eyebrow { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #d97706; }
          .wl-title { font-family: 'DM Sans', sans-serif; font-size: 1.75rem; font-weight: 800; margin: 0; line-height: 1.2; letter-spacing: -0.02em; color: #f0f4ff; }
          .wl-sub { font-size: 0.9rem; color: #8fa3b8; margin: 0; line-height: 1.6; }
          .wl-submit { padding: 14px; background: #d97706; color: #fff; border: none; border-radius: 999px; font-size: 1rem; font-weight: 700; cursor: pointer; transition: opacity 0.15s; width: 100%; font-family: inherit; margin-top: 0.5rem; }
          .wl-submit:hover { opacity: 0.88; }
        `}</style>
      </>
    );
  }

  // Loading state — prevents flash of role form while checking session/invite
  if (checking) {
    return (
      <>
        <div className="wl-root" style={{ display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ color:"rgba(255,255,255,0.25)", fontSize:"0.9rem" }}>Loading…</div>
        </div>
        <style>{`
          body:has(.wl-root) .app-footer { display: none !important; }
          .wl-root { position: fixed; inset: 0; font-family: 'DM Sans', system-ui, sans-serif; background: #080c12; z-index: 9000; }
        `}</style>
      </>
    );
  }

  return (
    <>
      <div className="wl-root">
        <nav className="wl-nav">
          <Link href="/" className="wl-nav-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" />
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

            {type === "lo" && (
              <div className="wl-fields">
                <div className="wl-field-group">
                  <div className="wl-field">
                    <label htmlFor="wl-nmls">NMLS # <span className="wl-req">*</span></label>
                    <input id="wl-nmls" className="wl-input" placeholder="e.g. 123456"
                      value={nmls} onChange={e => setNmls(e.target.value.replace(/\D/g, ""))} />
                  </div>
                  <div className="wl-field">
                    <label htmlFor="wl-lender">Lender / Company <span className="wl-optional">(optional)</span></label>
                    <input id="wl-lender" className="wl-input" placeholder="e.g. United Wholesale Mortgage"
                      value={lender} onChange={e => setLender(e.target.value)} />
                  </div>
                </div>
                <p className="wl-field-note">Your NMLS is displayed to borrowers — required by law.</p>
              </div>
            )}

            {type === "agent" && (
              <div className="wl-fields">
                <div className="wl-field-group">
                  <div className="wl-field">
                    <label htmlFor="wl-license">License # <span className="wl-req">*</span></label>
                    <input id="wl-license" className="wl-input" placeholder="State license number"
                      value={license} onChange={e => setLicense(e.target.value)} />
                  </div>
                  <div className="wl-field">
                    <label htmlFor="wl-brokerage">Brokerage <span className="wl-optional">(optional)</span></label>
                    <input id="wl-brokerage" className="wl-input" placeholder="e.g. Keller Williams"
                      value={brokerage} onChange={e => setBrokerage(e.target.value)} />
                  </div>
                </div>
                <p className="wl-field-note">Your license number is shown to borrowers when you respond.</p>
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
        body:has(.wl-root) .app-footer { display: none !important; }
        .wl-root {
          position: fixed; inset: 0; overflow-y: auto; overflow-x: hidden;
          font-family: 'DM Sans', system-ui, sans-serif;
          color: #f0f4ff; background: #080c12; z-index: 9000;
        }
        .wl-nav { padding: 18px 32px; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .wl-nav-logo img { height: 28px; }
        .wl-container { max-width: 560px; margin: 0 auto; padding: 3rem 1.5rem 5rem; }
        .wl-card {
          background: #0e1420; border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px; padding: 2.5rem;
          display: flex; flex-direction: column; gap: 2rem;
        }
        .wl-header { display: flex; flex-direction: column; gap: 8px; }
        .wl-eyebrow { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #00e87a; }
        .wl-title { font-family: 'DM Sans', sans-serif; font-size: 1.75rem; font-weight: 800; margin: 0; line-height: 1.2; letter-spacing: -0.02em; color: #f0f4ff; }
        .wl-sub { font-size: 0.9rem; color: #8fa3b8; margin: 0; line-height: 1.6; }
        .wl-types { display: flex; flex-direction: column; gap: 10px; }
        .wl-type-card {
          display: flex; align-items: center; gap: 14px; padding: 16px 18px;
          background: transparent; border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px; cursor: pointer; text-align: left; width: 100%;
          transition: border-color 0.15s, background 0.15s; color: #f0f4ff; font-family: inherit;
        }
        .wl-type-card:hover { border-color: rgba(255,255,255,0.2); background: rgba(255,255,255,0.02); }
        .wl-type-card.selected { border-color: rgba(0,232,122,0.5); background: rgba(0,232,122,0.06); }
        .wl-type-icon { font-size: 1.6rem; flex-shrink: 0; }
        .wl-type-text { flex: 1; min-width: 0; }
        .wl-type-label { font-weight: 600; font-size: 0.975rem; color: #f0f4ff; margin-bottom: 3px; }
        .wl-type-sub { font-size: 0.8rem; color: #8fa3b8; line-height: 1.4; }
        .wl-type-check {
          margin-left: auto; flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%;
          background: rgba(0,232,122,0.15); color: #00e87a;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.75rem; font-weight: 700; opacity: 0; transition: opacity 0.15s;
        }
        .wl-type-card.selected .wl-type-check { opacity: 1; }
        .wl-fields { display: flex; flex-direction: column; gap: 12px; }
        .wl-field-group { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .wl-field { display: flex; flex-direction: column; gap: 6px; }
        .wl-field label { font-size: 0.78rem; font-weight: 600; color: #8fa3b8; text-transform: uppercase; letter-spacing: 0.06em; }
        .wl-req { color: #ff5f5f; }
        .wl-optional { font-weight: 400; text-transform: none; letter-spacing: 0; color: #eaf8f7; }
        .wl-input {
          padding: 10px 14px; background: #141b28; border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px; color: #f0f4ff; font-size: 0.9rem;
          outline: none; font-family: inherit; width: 100%; box-sizing: border-box;
        }
        .wl-input:focus { border-color: rgba(0,232,122,0.4); }
        .wl-field-note { font-size: 0.78rem; color: #eaf8f7; margin: 0; line-height: 1.5; }
        .wl-error {
          font-size: 0.875rem; color: #ff5f5f;
          background: rgba(255,95,95,0.08); border: 1px solid rgba(255,95,95,0.2);
          border-radius: 8px; padding: 10px 14px;
        }
        .wl-submit {
          padding: 14px; background: #00e87a; color: #080c12; border: none;
          border-radius: 999px; font-size: 1rem; font-weight: 700; cursor: pointer;
          transition: opacity 0.15s; width: 100%; font-family: inherit;
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
