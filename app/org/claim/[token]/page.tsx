"use client";
// app/org/claim/[token]/page.tsx
// Corporate invite claim page — pre-filled from admin invitation
// Standalone ps-root pattern, no app chrome conflict

import { use, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";

const ORG_LABELS: Record<string, string> = {
  brokerage:    "Mortgage Brokerage",
  lender:       "Lender / Bank",
  credit_union: "Credit Union",
  re_brokerage: "Real Estate Brokerage",
};

interface InviteData {
  id: string;
  org_name: string;
  org_type: string;
  contact_name: string | null;
  contact_email: string;
  notes: string | null;
}

export default function OrgClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  const [invite, setInvite]           = useState<InviteData | null>(null);
  const [loadErr, setLoadErr]         = useState("");
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
  const [loading, setLoading]         = useState(true);

  const [website, setWebsite]         = useState("");
  const [compliance, setCompliance]   = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [submitErr, setSubmitErr]     = useState("");
  const [done, setDone]               = useState(false);
  const [userRole, setUserRole]       = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/org/claim?token=${token}`)
      .then(async r => {
        const d = await r.json();
        if (r.status === 409) { setAlreadyClaimed(true); setLoading(false); return; }
        if (!r.ok) { setLoadErr(d.error ?? "Invalid invitation"); setLoading(false); return; }
        setInvite(d.invite);
        setLoading(false);
      })
      .catch(() => { setLoadErr("Could not load invitation"); setLoading(false); });
  }, [token]);

  // Once signed in, check if user has a professional profile
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    setRoleLoading(true);
    fetch("/api/identity")
      .then(r => r.ok ? r.json() : null)
      .then((d: { role?: string } | null) => { setUserRole(d?.role ?? "borrower"); })
      .catch(() => setUserRole("borrower"))
      .finally(() => setRoleLoading(false));
  }, [isLoaded, isSignedIn]);

  async function handleClaim(e: React.FormEvent) {
    e.preventDefault();
    if (!compliance) { setSubmitErr("Please acknowledge the compliance statement to continue."); return; }
    if (!isSignedIn) {
      window.location.href = `/sign-in?redirect_url=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    setSubmitting(true);
    setSubmitErr("");
    const res = await fetch("/api/org/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, compliance_accepted: true, website: website.trim() || undefined }),
    });
    const d = await res.json();
    if (!res.ok) { setSubmitErr(d.error ?? "Failed to claim organization"); setSubmitting(false); return; }
    setDone(true);
    setTimeout(() => router.push("/brokerage/manage"), 2500);
  }

  return (
    <>
      <div className="oc-root">
        <header className="oc-header">
          <Link href="/" className="oc-logo-link">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" className="oc-logo" />
          </Link>
        </header>

        <main className="oc-main">
          <div className="oc-card">

            {loading && (
              <div className="oc-loading">Validating invitation…</div>
            )}

            {!loading && alreadyClaimed && (
              <div className="oc-state">
                <div className="oc-state-icon" style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>✓</div>
                <h1 className="oc-state-title">Already claimed</h1>
                <p className="oc-state-body">This invitation has already been used to set up an organization account.</p>
                <Link href="/brokerage/manage" className="oc-btn">Go to your dashboard →</Link>
              </div>
            )}

            {!loading && loadErr && (
              <div className="oc-state">
                <div className="oc-state-icon" style={{ background: "rgba(255,95,95,0.1)", color: "#ff5f5f" }}>✕</div>
                <h1 className="oc-state-title">Invalid invitation</h1>
                <p className="oc-state-body">{loadErr}</p>
                <Link href="/" className="oc-btn-ghost">← Back to HomeRates.ai</Link>
              </div>
            )}

            {!loading && done && (
              <div className="oc-state">
                <div className="oc-state-icon" style={{ background: "rgba(0,232,122,0.1)", color: "#00e87a" }}>✓</div>
                <h1 className="oc-state-title">Organization set up!</h1>
                <p className="oc-state-body">Redirecting you to your organization dashboard…</p>
              </div>
            )}

            {!loading && !loadErr && !alreadyClaimed && !done && invite && (
              <>
                {/* Invite header */}
                <div className="oc-invite-header">
                  <span className="oc-org-type">{ORG_LABELS[invite.org_type] ?? "Organization"}</span>
                  <h1 className="oc-title">{invite.org_name}</h1>
                  <p className="oc-sub">You&apos;ve been personally invited to set up your organization on HomeRates.ai.</p>
                  {invite.notes && (
                    <div className="oc-notes">{invite.notes}</div>
                  )}
                </div>

                {/* What they get */}
                <div className="oc-benefits">
                  {[
                    "One dashboard to track your team's activity and plan status",
                    "Compliance approval — authorize your professionals to use the platform",
                    "Priority enterprise support and onboarding assistance",
                    "Individual subscription pricing — each professional manages their own plan",
                  ].map((b, i) => (
                    <div key={i} className="oc-benefit">
                      <span className="oc-benefit-check">✓</span>
                      <span>{b}</span>
                    </div>
                  ))}
                </div>

                {/* Claim form */}
                {!isLoaded ? null : !isSignedIn ? (
                  <div className="oc-signin-prompt">
                    <p>Sign in or create an account to claim this invitation.</p>
                    <a
                      href={`/sign-in?redirect_url=${encodeURIComponent(window.location.pathname)}`}
                      className="oc-btn"
                    >
                      Sign in to continue →
                    </a>
                    <a
                      href={`/sign-up?redirect_url=${encodeURIComponent(window.location.pathname)}`}
                      className="oc-btn-ghost"
                    >
                      Create account
                    </a>
                  </div>
                ) : roleLoading ? (
                  <div style={{ fontSize: "0.875rem", color: "#8fa3b8" }}>Checking your account…</div>
                ) : userRole !== "lo" && userRole !== "agent" ? (
                  <div className="oc-role-gate">
                    <div className="oc-role-gate-icon">⚠</div>
                    <div className="oc-role-gate-title">Professional profile required</div>
                    <p className="oc-role-gate-body">
                      This invitation is for a licensed professional — Loan Officer, Mortgage Broker, or Real Estate Agent.
                      You&apos;re currently signed in as a borrower account.
                    </p>
                    <p className="oc-role-gate-body">
                      To claim <strong>{invite.org_name}</strong>, please sign in with your professional account or
                      complete your professional profile first.
                    </p>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <a href="/profile" className="oc-btn">Set up professional profile →</a>
                      <a href={`/sign-in?redirect_url=${encodeURIComponent(window.location.pathname)}`} className="oc-btn-ghost">Sign in with different account</a>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleClaim} className="oc-form">
                    <div className="oc-field">
                      <label className="oc-label">Organization website <span className="oc-optional">(optional)</span></label>
                      <input
                        type="url"
                        className="oc-input"
                        placeholder="https://yourcompany.com"
                        value={website}
                        onChange={e => setWebsite(e.target.value)}
                      />
                    </div>

                    <div className="oc-compliance-box">
                      <label className="oc-compliance-label">
                        <input
                          type="checkbox"
                          className="oc-checkbox"
                          checked={compliance}
                          onChange={e => setCompliance(e.target.checked)}
                        />
                        <span>
                          I authorize HomeRates.ai for use by <strong>{invite.org_name}</strong>&apos;s licensed professionals
                          and confirm that all professionals using this platform comply with applicable mortgage and real estate licensing requirements.
                          I accept the <a href="/disclosures" target="_blank" rel="noopener noreferrer">Terms &amp; Disclosures</a> on behalf of this organization.
                        </span>
                      </label>
                    </div>

                    {submitErr && <div className="oc-error">{submitErr}</div>}

                    <button type="submit" className="oc-btn" disabled={submitting || !compliance}>
                      {submitting ? "Setting up…" : `Claim ${invite.org_name} →`}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      <style>{`
        body:has(.oc-root) {
          display: block !important; height: auto !important;
          overflow-y: auto !important; background: #080c12 !important;
        }
        html:has(.oc-root) { background: #080c12 !important; height: auto !important; overflow-y: auto !important; }
        body:has(.oc-root) .app-footer { display: none; }

        .oc-root { min-height: 100vh; background: #080c12; font-family: 'DM Sans', system-ui, sans-serif; color: #f0f4ff; }

        .oc-header {
          padding: 20px 24px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .oc-logo-link { display: inline-flex; }
        .oc-logo { height: 28px; display: block; }

        .oc-main {
          display: flex; justify-content: center; align-items: flex-start;
          padding: 48px 16px 80px;
        }
        .oc-card {
          width: 100%; max-width: 560px;
          background: #0e1420;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 36px 40px;
          box-shadow: 0 24px 64px rgba(0,0,0,0.4);
        }
        .oc-loading { text-align: center; color: #8fa3b8; padding: 2rem; }

        /* State screens */
        .oc-state { text-align: center; padding: 1rem 0; }
        .oc-state-icon {
          width: 56px; height: 56px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 1.3rem; font-weight: 800;
          margin: 0 auto 16px;
        }
        .oc-state-title { font-size: 1.4rem; font-weight: 700; margin: 0 0 8px; }
        .oc-state-body { font-size: 0.9rem; color: #8fa3b8; margin: 0 0 24px; line-height: 1.6; }

        /* Invite header */
        .oc-invite-header { margin-bottom: 24px; }
        .oc-org-type {
          display: inline-block; font-size: 0.68rem; font-weight: 700;
          letter-spacing: 0.1em; text-transform: uppercase;
          padding: 3px 10px; border-radius: 999px;
          background: rgba(0,232,122,0.1); color: #00e87a;
          border: 1px solid rgba(0,232,122,0.25); margin-bottom: 10px;
        }
        .oc-title { font-size: 1.6rem; font-weight: 800; margin: 0 0 8px; line-height: 1.2; }
        .oc-sub { font-size: 0.9rem; color: #8fa3b8; margin: 0; line-height: 1.6; }
        .oc-notes {
          margin-top: 12px; padding: 12px 14px;
          background: rgba(0,232,122,0.05); border-left: 3px solid rgba(0,232,122,0.3);
          border-radius: 4px; font-size: 0.875rem; color: #8fa3b8;
          font-style: italic; line-height: 1.6;
        }

        /* Benefits */
        .oc-benefits {
          display: flex; flex-direction: column; gap: 10px;
          margin-bottom: 28px; padding: 20px;
          background: rgba(255,255,255,0.03); border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.06);
        }
        .oc-benefit {
          display: flex; align-items: flex-start; gap: 10px;
          font-size: 0.875rem; color: #c8d8e0; line-height: 1.5;
        }
        .oc-benefit-check {
          color: #00e87a; font-weight: 800; flex-shrink: 0; margin-top: 1px;
        }

        /* Form */
        .oc-form { display: flex; flex-direction: column; gap: 20px; }
        .oc-field { display: flex; flex-direction: column; gap: 5px; }
        .oc-label { font-size: 0.78rem; font-weight: 600; color: #8fa3b8; text-transform: uppercase; letter-spacing: 0.05em; }
        .oc-optional { font-weight: 400; text-transform: none; letter-spacing: 0; color: #3a4560; }
        .oc-input {
          padding: 11px 14px; background: #141b28;
          border: 1px solid rgba(255,255,255,0.08); border-radius: 10px;
          color: #f0f4ff; font-size: 0.9rem; outline: none; font-family: inherit;
          transition: border-color 0.15s;
        }
        .oc-input:focus { border-color: rgba(0,232,122,0.4); }

        /* Compliance */
        .oc-compliance-box {
          background: rgba(0,232,122,0.04); border: 1px solid rgba(0,232,122,0.15);
          border-radius: 12px; padding: 16px;
        }
        .oc-compliance-label {
          display: flex; align-items: flex-start; gap: 12px;
          font-size: 0.85rem; color: #8fa3b8; line-height: 1.6; cursor: pointer;
        }
        .oc-compliance-label strong { color: #f0f4ff; }
        .oc-compliance-label a { color: #00e87a; text-decoration: none; }
        .oc-compliance-label a:hover { text-decoration: underline; }
        .oc-checkbox {
          flex-shrink: 0; width: 18px; height: 18px;
          accent-color: #00e87a; margin-top: 2px; cursor: pointer;
        }

        /* Sign-in prompt */
        .oc-signin-prompt {
          display: flex; flex-direction: column; gap: 12px; align-items: flex-start;
        }
        .oc-signin-prompt p { font-size: 0.9rem; color: #8fa3b8; margin: 0 0 4px; }

        /* Buttons */
        .oc-btn {
          display: inline-block; padding: 13px 28px;
          background: #00e87a; color: #080c12;
          border: none; border-radius: 999px;
          font-size: 0.9rem; font-weight: 700; cursor: pointer;
          text-decoration: none; font-family: inherit;
          transition: opacity 0.15s; align-self: flex-start;
        }
        .oc-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .oc-btn:not(:disabled):hover { opacity: 0.88; }
        .oc-btn-ghost {
          display: inline-block; padding: 11px 24px;
          background: none; color: #8fa3b8;
          border: 1px solid rgba(255,255,255,0.1); border-radius: 999px;
          font-size: 0.875rem; font-weight: 600; text-decoration: none;
          transition: border-color 0.15s, color 0.15s;
        }
        .oc-btn-ghost:hover { color: #f0f4ff; border-color: rgba(255,255,255,0.2); }

        .oc-error {
          padding: 12px 16px; background: rgba(255,95,95,0.08);
          border: 1px solid rgba(255,95,95,0.2); border-radius: 10px;
          font-size: 0.875rem; color: #ff5f5f;
        }

        /* Role gate */
        .oc-role-gate {
          display: flex; flex-direction: column; gap: 12px;
          padding: 24px; border-radius: 14px;
          background: rgba(245,158,11,0.05);
          border: 1px solid rgba(245,158,11,0.2);
        }
        .oc-role-gate-icon {
          font-size: 1.5rem; line-height: 1;
        }
        .oc-role-gate-title {
          font-size: 1rem; font-weight: 700; color: #f5d87a;
        }
        .oc-role-gate-body {
          font-size: 0.875rem; color: #8fa3b8; line-height: 1.6; margin: 0;
        }
        .oc-role-gate-body strong { color: #f0f4ff; }

        @media (max-width: 520px) {
          .oc-card { padding: 28px 20px; }
        }
      `}</style>
    </>
  );
}
