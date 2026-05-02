// app/lo/[slug]/page.tsx
// Public LO profile page — shareable URL by NMLS number (/lo/12345678)
// Server component for SEO + OG tags; no auth required

import { notFound } from "next/navigation";
import Link from "next/link";
import { clerkClient } from "@clerk/nextjs/server";
import { getSupabase } from "../../../lib/supabaseServer";
import type { Metadata } from "next";

interface LO {
  user_id: string;
  nmls: string;
  email: string | null;
  lender: string | null;
  license_state: string | null;
  title: string | null;
  bio: string | null;
  phone: string | null;
  website: string | null;
  office_address: string | null;
  is_founding_member: boolean;
}

async function getLO(slug: string): Promise<LO | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from("loan_officers")
    .select("user_id, nmls, email, lender, license_state, title, bio, phone, website, office_address, is_founding_member")
    .eq("nmls", slug)
    .maybeSingle();
  return data ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const lo = await getLO(slug);
  if (!lo) return { title: "Loan Officer — HomeRates.ai" };

  let displayName = "Loan Officer";
  try {
    const clerk = await clerkClient();
    const u = await clerk.users.getUser(lo.user_id);
    displayName = [u.firstName, u.lastName].filter(Boolean).join(" ") || displayName;
  } catch { /* non-fatal */ }

  const title = `${displayName}${lo.lender ? ` — ${lo.lender}` : ""} | HomeRates.ai`;
  const description = lo.bio
    ? lo.bio.slice(0, 160)
    : `Connect with ${displayName}${lo.lender ? ` at ${lo.lender}` : ""} on HomeRates.ai. NMLS #${lo.nmls}.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://chat.homerates.ai/lo/${slug}`,
      siteName: "HomeRates.ai",
      images: [{ url: "https://chat.homerates.ai/assets/og-default.png", width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function LoProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lo = await getLO(slug);
  if (!lo) notFound();

  let clerkName = "";
  let photoUrl: string | null = null;
  try {
    const clerk = await clerkClient();
    const u = await clerk.users.getUser(lo.user_id);
    clerkName = [u.firstName, u.lastName].filter(Boolean).join(" ");
    photoUrl = u.imageUrl ?? null;
  } catch { /* non-fatal */ }

  const displayName = clerkName || lo.email?.split("@")[0] || "Loan Officer";
  const initials = displayName.split(" ").filter(Boolean).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();

  function formatPhone(p: string) {
    const d = p.replace(/\D/g, "");
    if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    if (d.length === 11 && d[0] === "1") return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
    return p;
  }

  return (
    <>
      <style>{`
        body:has(.lo-root){display:block!important;height:auto!important;overflow-y:auto!important;background:#080c12!important}
        html:has(.lo-root){height:auto!important;overflow:visible!important;}
        .lo-root{min-height:100vh;background:#080c12;color:#f0f4ff;font-family:'DM Sans',system-ui,sans-serif;}
        .lo-root *{box-sizing:border-box;}

        .lo-nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 24px;height:56px;background:rgba(8,12,18,0.97);border-bottom:1px solid rgba(255,255,255,0.07);backdrop-filter:blur(8px);}
        .lo-logo img{height:26px;display:block;}
        .lo-try{font-size:0.82rem;font-weight:600;color:#00e87a;text-decoration:none;padding:6px 14px;border:1px solid rgba(0,232,122,0.3);border-radius:8px;transition:background 0.15s;}
        .lo-try:hover{background:rgba(0,232,122,0.08);}

        .lo-shell{max-width:680px;margin:0 auto;padding:36px 20px 80px;}

        .lo-card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:28px;margin-bottom:16px;}
        .lo-label{font-size:11px;font-weight:700;color:#3a4560;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:14px;}

        .lo-hero{display:flex;align-items:center;gap:20px;}
        .lo-avatar{width:72px;height:72px;border-radius:50%;object-fit:cover;flex-shrink:0;}
        .lo-avatar-fallback{width:72px;height:72px;border-radius:50%;background:rgba(61,139,255,0.12);border:1px solid rgba(61,139,255,0.2);display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:700;color:#3d8bff;flex-shrink:0;}
        .lo-name{font-size:1.4rem;font-weight:700;color:#f0f4ff;line-height:1.2;}
        .lo-title-company{font-size:0.9rem;color:#6b7a99;margin-top:4px;}
        .lo-nmls{font-size:0.8rem;color:#3a4560;margin-top:6px;font-family:monospace;}

        .lo-badge{display:inline-block;background:rgba(61,139,255,0.12);color:#3d8bff;font-size:11px;font-weight:700;padding:3px 8px;border-radius:4px;letter-spacing:.06em;margin-top:8px;}

        .lo-bio{font-size:0.95rem;color:#8fa3b8;line-height:1.7;}

        .lo-detail-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);}
        .lo-detail-row:last-child{border-bottom:none;}
        .lo-detail-icon{width:20px;text-align:center;font-size:1rem;flex-shrink:0;}
        .lo-detail-val{font-size:0.9rem;color:#c0cfe4;}
        .lo-detail-val a{color:#3d8bff;text-decoration:none;}
        .lo-detail-val a:hover{text-decoration:underline;}

        .lo-cta{display:block;text-align:center;background:#00e87a;color:#07100f;font-size:0.95rem;font-weight:700;padding:14px 20px;border-radius:12px;text-decoration:none;transition:opacity 0.15s;}
        .lo-cta:hover{opacity:0.88;}
        .lo-cta-sec{display:block;text-align:center;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#f0f4ff;font-size:0.9rem;font-weight:600;padding:12px 20px;border-radius:12px;text-decoration:none;margin-top:10px;transition:background 0.15s;}
        .lo-cta-sec:hover{background:rgba(255,255,255,0.08);}

        @media(max-width:560px){
          .lo-shell{padding:24px 16px 60px;}
          .lo-card{padding:20px 16px;}
          .lo-hero{flex-direction:column;align-items:flex-start;gap:14px;}
        }
      `}</style>

      <div className="lo-root">
        <nav className="lo-nav">
          <Link href="/" className="lo-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" />
          </Link>
          <Link href="/chat" className="lo-try">Try HomeRates.ai →</Link>
        </nav>

        <div className="lo-shell">
          {/* Hero card */}
          <div className="lo-card">
            <div className="lo-hero">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt={displayName} className="lo-avatar" />
              ) : (
                <div className="lo-avatar-fallback">{initials}</div>
              )}
              <div>
                <div className="lo-name">{displayName}</div>
                <div className="lo-title-company">
                  {[lo.title, lo.lender].filter(Boolean).join(" · ") || "Loan Officer"}
                </div>
                <div className="lo-nmls">NMLS #{lo.nmls}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {lo.license_state && (
                    <span className="lo-badge">Licensed in {lo.license_state}</span>
                  )}
                  {lo.is_founding_member && (
                    <span style={{ display: "inline-block", background: "rgba(0,232,122,0.12)", color: "#00e87a", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 4, letterSpacing: ".06em", border: "1px solid rgba(0,232,122,0.25)" }}>
                      🏅 Founding Member
                    </span>
                  )}
                </div>
              </div>
            </div>

            {lo.bio && (
              <>
                <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.07)", margin: "20px 0" }} />
                <p className="lo-bio">{lo.bio}</p>
              </>
            )}
          </div>

          {/* Contact details */}
          {(lo.phone || lo.email || lo.website || lo.office_address) && (
            <div className="lo-card">
              <div className="lo-label">Contact</div>
              {lo.phone && (
                <div className="lo-detail-row">
                  <span className="lo-detail-icon">📞</span>
                  <span className="lo-detail-val"><a href={`tel:${lo.phone}`}>{formatPhone(lo.phone)}</a></span>
                </div>
              )}
              {lo.email && (
                <div className="lo-detail-row">
                  <span className="lo-detail-icon">✉️</span>
                  <span className="lo-detail-val"><a href={`mailto:${lo.email}`}>{lo.email}</a></span>
                </div>
              )}
              {lo.website && (
                <div className="lo-detail-row">
                  <span className="lo-detail-icon">🌐</span>
                  <span className="lo-detail-val">
                    <a href={lo.website.startsWith("http") ? lo.website : `https://${lo.website}`} target="_blank" rel="noopener noreferrer">
                      {lo.website.replace(/^https?:\/\//, "")}
                    </a>
                  </span>
                </div>
              )}
              {lo.office_address && (
                <div className="lo-detail-row">
                  <span className="lo-detail-icon">📍</span>
                  <span className="lo-detail-val">{lo.office_address}</span>
                </div>
              )}
            </div>
          )}

          {/* CTAs */}
          <div className="lo-card">
            <div className="lo-label">Work with {displayName.split(" ")[0]}</div>
            <a
              href={`/chat?sq=${encodeURIComponent(`I want to get pre-qualified. My LO is ${displayName}${lo.nmls ? ` NMLS #${lo.nmls}` : ""}.`)}`}
              className="lo-cta"
            >
              Get pre-qualified with AI analysis →
            </a>
            <a href="/connect/post" className="lo-cta-sec">
              Post your scenario anonymously
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
