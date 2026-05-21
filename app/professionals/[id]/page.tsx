"use client";
// app/professionals/[id]/page.tsx
// Public profile page for a single pro — shareable URL, works for any pro_type

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import AppNav from "../../components/AppNav";

type Pro = {
  id: string;
  source: "nmls" | "ca_dre" | "self";
  source_id: string;
  pro_type: "lo" | "lo_company" | "agent" | "agent_broker";
  name: string;
  company_name: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  license_type: string | null;
  license_status: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  bio: string | null;
  phone: string | null;
  website: string | null;
  photo_url: string | null;
};

const PRO_TYPE_LABEL: Record<string, string> = {
  lo:            "Loan Officer",
  lo_company:    "Mortgage Company",
  agent:         "Real Estate Agent",
  agent_broker:  "Real Estate Broker",
};

const PRO_TYPE_COLOR: Record<string, { bg: string; text: string }> = {
  lo:            { bg: "rgba(61,139,255,0.15)",  text: "#3d8bff" },
  lo_company:    { bg: "rgba(61,139,255,0.10)",  text: "#3d8bff" },
  agent:         { bg: "rgba(0,232,122,0.12)",   text: "#00e87a" },
  agent_broker:  { bg: "rgba(0,232,122,0.10)",   text: "#00e87a" },
};

const SOURCE_LABEL: Record<string, string> = {
  nmls:   "NMLS",
  ca_dre: "CA DRE",
  self:   "Self-registered",
};

function statusColor(s: string | null) {
  if (!s) return "#94a3b8";
  const lc = s.toLowerCase();
  if (lc === "licensed" || lc === "active")  return "#00e87a";
  if (lc === "flagged")                       return "#ff5f5f";
  if (lc === "expired" || lc === "inactive") return "#ff8c42";
  return "#94a3b8";
}

function formatPhone(p: string) {
  const d = p.replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === "1") return `+1 (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return p;
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

export default function ProProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { user, isLoaded: userLoaded } = useUser();

  const [pro, setPro]           = useState<Pro | null>(null);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Invite
  const [inviteEmail, setInviteEmail]   = useState("");
  const [inviting, setInviting]         = useState(false);
  const [inviteResult, setInviteResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function sendInvite() {
    if (!pro || !inviteEmail.trim()) return;
    setInviting(true);
    setInviteResult(null);
    try {
      const res  = await fetch("/api/pro-directory/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pro_dir_id: pro.id, email: inviteEmail.trim() }),
      });
      const data = await res.json();
      setInviteResult(
        data.ok
          ? { ok: true,  message: "Invite sent. They'll get an email with a link to claim their profile." }
          : { ok: false, message: data.message ?? data.error ?? "Couldn't send invite." }
      );
    } catch {
      setInviteResult({ ok: false, message: "Network error. Please try again." });
    } finally {
      setInviting(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    fetch(`/api/pro-directory/by-id/${id}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then(d => { if (d?.pro) setPro(d.pro); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  const typeColor = PRO_TYPE_COLOR[pro?.pro_type ?? "lo"] ?? PRO_TYPE_COLOR.lo;
  const isClaimed = !!pro?.claimed_by;
  const isLO      = pro?.pro_type === "lo" || pro?.pro_type === "lo_company";

  return (
    <>
      <style>{`
        body:has(.pro-page-root){display:block!important;height:auto!important;overflow-y:auto!important;background:#080c12!important}
        html:has(.pro-page-root){height:auto!important;overflow:visible!important;}

        .pro-page-root{min-height:100vh;background:#080c12;color:#f0f4ff;font-family:'DM Sans',system-ui,sans-serif;}
        .pro-page-root *{box-sizing:border-box;}

        .pp-nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 24px;height:56px;background:rgba(8,12,18,0.97);border-bottom:1px solid rgba(255,255,255,0.07);backdrop-filter:blur(8px);}
        .pp-logo img{height:26px;display:block;}
        .pp-nav-right{display:flex;align-items:center;gap:10px;}
        .pp-try-link{font-size:0.82rem;font-weight:600;color:#00e87a;text-decoration:none;padding:6px 14px;border:1px solid rgba(0,232,122,0.3);border-radius:8px;transition:background 0.15s;}
        .pp-try-link:hover{background:rgba(0,232,122,0.08);}

        .pp-shell{max-width:720px;margin:0 auto;padding:28px 20px 80px;}

        .pp-back{display:inline-flex;align-items:center;gap:5px;font-size:0.85rem;font-weight:500;color: #94a3b8;text-decoration:none;margin-bottom:20px;transition:color 0.15s;}
        .pp-back:hover{color:#f0f4ff;}

        .pp-card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:24px 28px;margin-bottom:16px;}
        .pp-label{font-size:11px;font-weight:700;color: #eaf8f7;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:14px;}
        .pp-divider{border:none;border-top:1px solid rgba(255,255,255,0.07);margin:20px 0;}

        @media(max-width:560px){
          .pp-card{padding:18px 16px;}
          .pp-shell{padding:20px 16px 60px;}
        }
      `}</style>

      <div className="pro-page-root">
        <nav className="pp-nav">
          <Link href="/" className="pp-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" />
          </Link>
          <div className="pp-nav-right">
            <Link href="/chat" className="pp-try-link">Try free →</Link>
            <AppNav drawerOnly />
          </div>
        </nav>

        <div className="pp-shell">
          <Link href="/professionals" className="pp-back">← Directory</Link>

          {loading && (
            <div style={{ textAlign: "center", padding: "80px 0", color: "#eaf8f7" }}>Loading…</div>
          )}

          {!loading && notFound && (
            <div style={{ textAlign: "center", padding: "80px 0" }}>
              <div style={{ fontSize: 32, marginBottom: 12, color: "#eaf8f7" }}>Not found</div>
              <Link href="/professionals" style={{ color: "#3d8bff", fontSize: 14 }}>Browse the directory</Link>
            </div>
          )}

          {!loading && pro && (
            <>
              {/* ── Header card ── */}
              <div className="pp-card" style={{ padding: "28px" }}>
                <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
                  {/* Avatar */}
                  <div style={{
                    width: 76, height: 76, borderRadius: "50%",
                    background: pro.photo_url ? "transparent" : typeColor.bg,
                    border: `2px solid ${typeColor.text}33`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    overflow: "hidden", flexShrink: 0,
                    fontSize: 26, fontWeight: 700, color: typeColor.text,
                  }}>
                    {pro.photo_url
                      ? <img src={pro.photo_url} alt={pro.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : initials(pro.name)
                    }
                  </div>

                  {/* Identity */}
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                      <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, lineHeight: 1.2, color: "#f0f4ff", letterSpacing: "-0.02em" }}>
                        {pro.name}
                      </h1>
                      {isClaimed && (
                        <span style={{
                          background: "rgba(0,232,122,0.1)", color: "#00e87a",
                          fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                          letterSpacing: "0.04em", border: "1px solid rgba(0,232,122,0.25)",
                        }}>✓ Verified</span>
                      )}
                    </div>
                    {pro.company_name && (
                      <div style={{ color: "#94a3b8", fontSize: 14, marginBottom: 8 }}>{pro.company_name}</div>
                    )}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{
                        background: typeColor.bg, color: typeColor.text,
                        fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
                        border: `1px solid ${typeColor.text}33`,
                      }}>
                        {PRO_TYPE_LABEL[pro.pro_type] ?? pro.pro_type}
                      </span>
                      {(pro.city || pro.state) && (
                        <span style={{ color: "#94a3b8", fontSize: 13 }}>
                          📍 {[pro.city, pro.state].filter(Boolean).join(", ")}{pro.zip ? ` ${pro.zip}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {pro.bio && (
                  <p style={{ margin: "20px 0 0", color: "#8fa3b8", lineHeight: 1.65, fontSize: 14 }}>{pro.bio}</p>
                )}
              </div>

              {/* ── Contact card (claimed only) ── */}
              {isClaimed && (pro.phone || pro.website) && (
                <div className="pp-card">
                  <div className="pp-label">Contact</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {pro.phone && (
                      <a href={`tel:${pro.phone.replace(/\D/g, "")}`} style={{
                        display: "flex", alignItems: "center", gap: 12, color: "#f0f4ff",
                        fontSize: 14, textDecoration: "none",
                      }}>
                        <span style={{
                          width: 34, height: 34, borderRadius: 9,
                          background: "rgba(61,139,255,0.1)", border: "1px solid rgba(61,139,255,0.2)",
                          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
                        }}>📞</span>
                        <span style={{ color: "#3d8bff", fontWeight: 500 }}>{formatPhone(pro.phone)}</span>
                      </a>
                    )}
                    {pro.website && (
                      <a href={pro.website.startsWith("http") ? pro.website : `https://${pro.website}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
                        <span style={{
                          width: 34, height: 34, borderRadius: 9,
                          background: "rgba(0,232,122,0.1)", border: "1px solid rgba(0,232,122,0.2)",
                          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
                        }}>🌐</span>
                        <span style={{ color: "#00e87a", fontWeight: 500, fontSize: 13 }}>
                          {pro.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                        </span>
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* ── License card ── */}
              <div className="pp-card">
                <div className="pp-label">License</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" }}>
                  {pro.license_type && (
                    <div>
                      <div style={{ color: "#eaf8f7", fontSize: 11, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>Type</div>
                      <div style={{ fontSize: 13, color: "#8fa3b8" }}>{pro.license_type}</div>
                    </div>
                  )}
                  {pro.license_status && (
                    <div>
                      <div style={{ color: "#eaf8f7", fontSize: 11, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>Status</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: statusColor(pro.license_status) }}>{pro.license_status}</div>
                    </div>
                  )}
                  {pro.source !== "self" && pro.source_id && (
                    <div>
                      <div style={{ color: "#eaf8f7", fontSize: 11, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>{SOURCE_LABEL[pro.source] ?? pro.source} #</div>
                      <div style={{ fontSize: 12, fontFamily: "monospace", color: "#94a3b8" }}>{pro.source_id.replace(/^co_/, "")}</div>
                    </div>
                  )}
                  <div>
                    <div style={{ color: "#eaf8f7", fontSize: 11, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>Source</div>
                    <div style={{ fontSize: 13, color: "#94a3b8" }}>{SOURCE_LABEL[pro.source] ?? pro.source}</div>
                  </div>
                </div>
              </div>

              {/* ── CLAIMED: primary CTA ── */}
              {isClaimed && (
                <div className="pp-card" style={{
                  background: "linear-gradient(135deg, rgba(0,232,122,0.06), rgba(0,232,122,0.02))",
                  border: "1px solid rgba(0,232,122,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16,
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: "#f0f4ff" }}>
                      {isLO ? "Get a mortgage quote" : "Connect with this agent"}
                    </div>
                    <div style={{ color: "#94a3b8", fontSize: 13 }}>
                      {isLO
                        ? "Run your numbers on our AI mortgage calculator."
                        : "Search listings and connect with a licensed professional."}
                    </div>
                  </div>
                  <Link href="/chat" style={{
                    background: "#00e87a", color: "#080c12", fontWeight: 700,
                    padding: "10px 22px", borderRadius: 10, fontSize: 14, whiteSpace: "nowrap",
                    textDecoration: "none", transition: "opacity 0.15s",
                  }}>
                    Get started →
                  </Link>
                </div>
              )}

              {/* ── UNCLAIMED: single unified panel ── */}
              {!isClaimed && (
                <div className="pp-card" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>

                  {/* Section 1 — Is this you? */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: "#f0f4ff" }}>
                        Is this your profile?
                      </div>
                      <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.6 }}>
                        Add your photo, bio, and contact details. Takes 2 minutes — free.
                      </div>
                    </div>
                    <Link href={`/professionals/claim/${pro.id}`} style={{
                      padding: "9px 18px",
                      background: "rgba(0,232,122,0.08)",
                      border: "1px solid rgba(0,232,122,0.25)",
                      borderRadius: 10, color: "#00e87a", fontWeight: 700, fontSize: 13,
                      whiteSpace: "nowrap", flexShrink: 0, textDecoration: "none",
                    }}>
                      Claim this profile →
                    </Link>
                  </div>

                  <hr className="pp-divider" />

                  {/* Section 2 — Know this pro? */}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#94a3b8", marginBottom: 10 }}>
                      Know this professional? Send them a link to claim it.
                    </div>

                    {/* Signed out */}
                    {userLoaded && !user && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ color: "#eaf8f7", fontSize: 13 }}>Sign in to send an invite.</span>
                        <Link href={`/sign-in?redirect_url=/professionals/${pro.id}`} style={{
                          color: "#3d8bff", fontSize: 13, fontWeight: 600,
                        }}>
                          Sign in →
                        </Link>
                      </div>
                    )}

                    {/* Signed in */}
                    {userLoaded && user && (
                      inviteResult ? (
                        <div style={{
                          padding: "11px 14px", borderRadius: 10, fontSize: 13,
                          background: inviteResult.ok ? "rgba(0,232,122,0.07)" : "rgba(255,95,95,0.07)",
                          color: inviteResult.ok ? "#00e87a" : "#ff5f5f",
                          border: `1px solid ${inviteResult.ok ? "rgba(0,232,122,0.2)" : "rgba(255,95,95,0.2)"}`,
                        }}>
                          {inviteResult.message}
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <input
                            type="email"
                            placeholder="their@email.com"
                            value={inviteEmail}
                            onChange={e => setInviteEmail(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") sendInvite(); }}
                            style={{
                              flex: "1 1 180px", padding: "9px 12px",
                              background: "rgba(255,255,255,0.05)",
                              border: "1px solid rgba(255,255,255,0.1)",
                              borderRadius: 9, color: "#f0f4ff", fontSize: 13,
                              outline: "none", fontFamily: "inherit",
                            }}
                          />
                          <button
                            onClick={sendInvite}
                            disabled={inviting || !inviteEmail.trim()}
                            style={{
                              padding: "9px 18px", background: "#3d8bff", color: "#fff",
                              border: "none", borderRadius: 9, fontWeight: 700, fontSize: 13,
                              cursor: inviting || !inviteEmail.trim() ? "not-allowed" : "pointer",
                              opacity: inviting || !inviteEmail.trim() ? 0.45 : 1,
                              whiteSpace: "nowrap", fontFamily: "inherit",
                            }}
                          >
                            {inviting ? "Sending…" : "Send invite"}
                          </button>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Footer note */}
              <p style={{ color: "#eaf8f7", fontSize: 11, textAlign: "center", lineHeight: 1.7, marginTop: 24 }}>
                License data sourced from {SOURCE_LABEL[pro.source] ?? pro.source}.
                Verify credentials independently before entering a business relationship.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
