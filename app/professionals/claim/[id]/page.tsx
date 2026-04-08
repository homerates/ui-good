"use client";
// app/professionals/claim/[id]/page.tsx
// Landing page after sign-up redirect — confirms identity and claims the listing

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import AppNav from "../../../components/AppNav";

type Pro = {
  id: string;
  source: string;
  source_id: string;
  pro_type: string;
  name: string;
  company_name: string | null;
  city: string | null;
  license_type: string | null;
  license_status: string | null;
  claimed_by: string | null;
};

const PRO_TYPE_LABEL: Record<string, string> = {
  lo:           "Loan Officer",
  lo_company:   "Mortgage Company",
  agent:        "Real Estate Agent",
  agent_broker: "Real Estate Broker",
};

export default function ClaimPage() {
  const { user, isLoaded } = useUser();
  const router             = useRouter();
  const params             = useParams<{ id: string }>();
  const id                 = params?.id;

  const [pro, setPro]       = useState<Pro | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Redirect if not signed in
  useEffect(() => {
    if (isLoaded && !user) {
      router.replace(`/sign-in?redirect_url=/professionals/claim/${id}`);
    }
  }, [isLoaded, user, id, router]);

  // Fetch the listing
  useEffect(() => {
    if (!id) return;
    fetch(`/api/pro-directory/by-id/${id}`)
      .then(r => r.json())
      .then(data => { setPro(data.pro ?? null); })
      .catch(() => setError("Could not load this listing."))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleClaim() {
    if (!id) return;
    setClaiming(true);
    setError(null);
    try {
      const res  = await fetch("/api/pro-directory/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to claim listing.");
      } else {
        setClaimed(true);
        // Redirect to profile/dashboard after 2s
        setTimeout(() => {
          router.push("/profile");
        }, 2000);
      }
    } catch {
      setError("Unexpected error. Please try again.");
    } finally {
      setClaiming(false);
    }
  }

  return (
    <>
      <style>{`
        body:has(.cl-root){display:block!important;height:auto!important;overflow-y:auto!important;background:#080c12!important}
        html:has(.cl-root){height:auto!important;overflow:visible!important}
        .cl-root{min-height:100vh;background:#080c12;color:#f0f4ff;font-family:'DM Sans',system-ui,sans-serif}
        .cl-nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 2rem;height:56px;background:rgba(8,12,18,0.96);border-bottom:1px solid rgba(255,255,255,0.07)}
        .cl-logo{font-size:1.1rem;font-weight:700;color:#fff;text-decoration:none;letter-spacing:-0.02em}
        .cl-logo span{color:#00e87a}
        .cl-shell{max-width:520px;margin:0 auto;padding:4rem 1.5rem 5rem;text-align:center}
        .cl-card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.09);border-radius:20px;padding:2.5rem 2rem;margin-bottom:1.5rem}
        .cl-badge{display:inline-block;font-size:0.7rem;font-weight:700;padding:3px 10px;border-radius:99px;background:rgba(61,139,255,0.12);color:#3d8bff;border:1px solid rgba(61,139,255,0.25);margin-bottom:1rem}
        .cl-name{font-size:1.4rem;font-weight:800;margin-bottom:0.25rem}
        .cl-sub{font-size:0.85rem;color:rgba(255,255,255,0.4);margin-bottom:0}
        .cl-meta{display:flex;justify-content:center;gap:1rem;flex-wrap:wrap;margin-top:1rem;font-size:0.78rem;color:rgba(255,255,255,0.3)}
        .cl-confirm-box{background:rgba(0,232,122,0.04);border:1px solid rgba(0,232,122,0.15);border-radius:14px;padding:1.5rem;margin-bottom:1.5rem;font-size:0.88rem;color:rgba(255,255,255,0.55);line-height:1.6;text-align:left}
        .cl-confirm-box strong{color:#f0f4ff}
        .cl-claim-btn{width:100%;padding:1rem;background:#00e87a;color:#080c12;font-weight:800;font-size:1rem;border:none;border-radius:12px;cursor:pointer;transition:opacity 0.2s}
        .cl-claim-btn:hover:not(:disabled){opacity:0.85}
        .cl-claim-btn:disabled{opacity:0.5;cursor:not-allowed}
        .cl-error{font-size:0.82rem;color:#ff5f5f;margin-top:0.75rem}
        .cl-success{background:rgba(0,232,122,0.08);border:1px solid rgba(0,232,122,0.2);border-radius:12px;padding:1.5rem;text-align:center}
        .cl-success h2{font-size:1.2rem;font-weight:700;margin-bottom:0.4rem;color:#00e87a}
        .cl-success p{font-size:0.88rem;color:rgba(255,255,255,0.5)}
        .cl-back{display:inline-block;margin-top:1.5rem;font-size:0.82rem;color:rgba(255,255,255,0.3);text-decoration:none}
        .cl-back:hover{color:#fff}
        .cl-loading{text-align:center;padding:6rem 0;color:rgba(255,255,255,0.3)}
      `}</style>

      <div className="cl-root">
        <nav className="cl-nav">
          <Link href="/" className="cl-logo">HomeRates<span>.ai</span></Link>
          <AppNav drawerOnly />
        </nav>

        <div className="cl-shell">
          {loading ? (
            <div className="cl-loading">Loading listing…</div>
          ) : claimed ? (
            <div className="cl-success">
              <h2>✓ Listing claimed</h2>
              <p>Your profile is live. Redirecting to your profile page…</p>
            </div>
          ) : !pro ? (
            <div>
              <p style={{ color: "rgba(255,255,255,0.4)" }}>Listing not found.</p>
              <Link href="/professionals" className="cl-back">← Back to directory</Link>
            </div>
          ) : pro.claimed_by ? (
            <div>
              <p style={{ color: "rgba(255,255,255,0.4)" }}>This listing has already been claimed.</p>
              <Link href="/professionals" className="cl-back">← Back to directory</Link>
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: "1.6rem", fontWeight: 800, marginBottom: "0.4rem" }}>Claim Your Listing</h1>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.9rem", marginBottom: "2rem" }}>
                This listing was seeded from public {pro.source === "nmls" ? "NMLS" : "CA DRE"} records.
                Claiming it gives you a profile on HomeRates.ai — at no cost.
              </p>

              {/* Listing card */}
              <div className="cl-card">
                <div className="cl-badge">{PRO_TYPE_LABEL[pro.pro_type] ?? pro.pro_type}</div>
                <div className="cl-name">{pro.name}</div>
                {pro.company_name && (
                  <div className="cl-sub">{pro.company_name}</div>
                )}
                <div className="cl-meta">
                  {pro.city && <span>📍 {pro.city}, CA</span>}
                  {pro.source === "nmls"   && <span>NMLS #{pro.source_id.replace(/^co_/, "")}</span>}
                  {pro.source === "ca_dre" && <span>DRE #{pro.source_id}</span>}
                  {pro.license_type && <span>{pro.license_type}</span>}
                </div>
              </div>

              {/* What claiming means */}
              <div className="cl-confirm-box">
                <strong>By claiming this listing you confirm:</strong>
                <ul style={{ marginTop: "0.75rem", paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  <li>You are the licensed professional listed above</li>
                  <li>You will keep your profile information accurate</li>
                  <li>You will respond to borrower scenarios honestly and in good faith</li>
                </ul>
              </div>

              <button className="cl-claim-btn" onClick={handleClaim} disabled={claiming}>
                {claiming ? "Claiming…" : "Confirm — Claim This Listing"}
              </button>

              {error && <div className="cl-error">{error}</div>}

              <Link href="/professionals" className="cl-back">← Not you? Back to directory</Link>
            </>
          )}
        </div>
      </div>
    </>
  );
}
