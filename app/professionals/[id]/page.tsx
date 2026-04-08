"use client";
// app/professionals/[id]/page.tsx
// Public profile page for a single pro — shareable URL, works for any pro_type

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  if (!s) return "#888";
  const lc = s.toLowerCase();
  if (lc === "licensed" || lc === "active")  return "#00e87a";
  if (lc === "flagged")                       return "#ff4444";
  if (lc === "expired" || lc === "inactive") return "#f5a623";
  return "#888";
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
  const router = useRouter();
  const id = params?.id;

  const [pro, setPro]       = useState<Pro | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/pro-directory/by-id/${id}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then(d => {
        if (d?.pro) setPro(d.pro);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const typeColor = PRO_TYPE_COLOR[pro?.pro_type ?? "lo"] ?? PRO_TYPE_COLOR.lo;
  const isClaimed = !!pro?.claimed_by;

  return (
    <>
      <style>{`
        body { margin: 0; background: #0a0a0a; color: #f0f0f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        * { box-sizing: border-box; }
        a { color: inherit; text-decoration: none; }
      `}</style>

      <AppNav />

      <div style={{ minHeight: "100vh", background: "#0a0a0a", paddingTop: 64 }}>
        {/* Back link */}
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 20px 0" }}>
          <Link href="/professionals" style={{ color: "#888", fontSize: 14, display: "inline-flex", alignItems: "center", gap: 4 }}>
            ← Back to directory
          </Link>
        </div>

        <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 20px 80px" }}>

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: "center", padding: "80px 0", color: "#555" }}>Loading…</div>
          )}

          {/* Not found */}
          {!loading && notFound && (
            <div style={{ textAlign: "center", padding: "80px 0" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>404</div>
              <div style={{ color: "#888", marginBottom: 24 }}>Profile not found.</div>
              <Link href="/professionals" style={{ color: "#3d8bff", fontSize: 15 }}>Browse the directory</Link>
            </div>
          )}

          {/* Profile */}
          {!loading && pro && (
            <>
              {/* Header card */}
              <div style={{
                background: "#141414",
                border: "1px solid #222",
                borderRadius: 16,
                padding: "32px 28px",
                marginBottom: 20,
              }}>
                <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
                  {/* Avatar */}
                  <div style={{
                    width: 80, height: 80, borderRadius: "50%",
                    background: pro.photo_url ? "transparent" : typeColor.bg,
                    border: `2px solid ${typeColor.text}33`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    overflow: "hidden", flexShrink: 0,
                    fontSize: 28, fontWeight: 700, color: typeColor.text,
                  }}>
                    {pro.photo_url
                      ? <img src={pro.photo_url} alt={pro.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : initials(pro.name)
                    }
                  </div>

                  {/* Name + meta */}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>{pro.name}</h1>
                      {isClaimed && (
                        <span title="Claimed profile" style={{
                          background: "rgba(0,232,122,0.12)", color: "#00e87a",
                          fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
                          letterSpacing: "0.04em",
                        }}>✓ Verified</span>
                      )}
                    </div>

                    {pro.company_name && (
                      <div style={{ color: "#aaa", fontSize: 15, marginBottom: 6 }}>{pro.company_name}</div>
                    )}

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      {/* Type badge */}
                      <span style={{
                        background: typeColor.bg, color: typeColor.text,
                        fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 99,
                      }}>
                        {PRO_TYPE_LABEL[pro.pro_type] ?? pro.pro_type}
                      </span>

                      {/* Location */}
                      {(pro.city || pro.state) && (
                        <span style={{ color: "#666", fontSize: 13 }}>
                          {[pro.city, pro.state].filter(Boolean).join(", ")}
                          {pro.zip ? ` ${pro.zip}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bio */}
                {pro.bio && (
                  <p style={{ margin: "24px 0 0", color: "#ccc", lineHeight: 1.65, fontSize: 15 }}>{pro.bio}</p>
                )}

                {!pro.bio && !isClaimed && (
                  <p style={{ margin: "24px 0 0", color: "#555", fontSize: 14, fontStyle: "italic" }}>
                    This listing hasn't been claimed yet. Is this you?{" "}
                    <Link href={`/professionals/claim/${pro.id}`} style={{ color: "#3d8bff" }}>Claim your profile</Link>
                  </p>
                )}
              </div>

              {/* Contact card */}
              {(pro.phone || pro.website) && (
                <div style={{
                  background: "#141414", border: "1px solid #222", borderRadius: 16,
                  padding: "24px 28px", marginBottom: 20,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#555", letterSpacing: "0.08em", marginBottom: 16, textTransform: "uppercase" }}>
                    Contact
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {pro.phone && (
                      <a href={`tel:${pro.phone.replace(/\D/g, "")}`} style={{
                        display: "flex", alignItems: "center", gap: 12,
                        color: "#f0f0f0", fontSize: 15,
                      }}>
                        <span style={{ width: 36, height: 36, borderRadius: 10, background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📞</span>
                        {formatPhone(pro.phone)}
                      </a>
                    )}
                    {pro.website && (
                      <a href={pro.website.startsWith("http") ? pro.website : `https://${pro.website}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ display: "flex", alignItems: "center", gap: 12, color: "#3d8bff", fontSize: 15 }}>
                        <span style={{ width: 36, height: 36, borderRadius: 10, background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🌐</span>
                        {pro.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* License card */}
              <div style={{
                background: "#141414", border: "1px solid #222", borderRadius: 16,
                padding: "24px 28px", marginBottom: 20,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#555", letterSpacing: "0.08em", marginBottom: 16, textTransform: "uppercase" }}>
                  License Information
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" }}>
                  {pro.license_type && (
                    <div>
                      <div style={{ color: "#666", fontSize: 12, marginBottom: 2 }}>License Type</div>
                      <div style={{ fontSize: 14 }}>{pro.license_type}</div>
                    </div>
                  )}
                  {pro.license_status && (
                    <div>
                      <div style={{ color: "#666", fontSize: 12, marginBottom: 2 }}>Status</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: statusColor(pro.license_status) }}>
                        {pro.license_status}
                      </div>
                    </div>
                  )}
                  {pro.source !== "self" && pro.source_id && (
                    <div>
                      <div style={{ color: "#666", fontSize: 12, marginBottom: 2 }}>{SOURCE_LABEL[pro.source] ?? pro.source} #</div>
                      <div style={{ fontSize: 14, fontFamily: "monospace" }}>{pro.source_id}</div>
                    </div>
                  )}
                  <div>
                    <div style={{ color: "#666", fontSize: 12, marginBottom: 2 }}>Data Source</div>
                    <div style={{ fontSize: 14 }}>{SOURCE_LABEL[pro.source] ?? pro.source}</div>
                  </div>
                </div>
              </div>

              {/* CTA — unclaimed listing */}
              {!isClaimed && (
                <div style={{
                  background: "linear-gradient(135deg, rgba(61,139,255,0.08), rgba(61,139,255,0.04))",
                  border: "1px solid rgba(61,139,255,0.2)", borderRadius: 16,
                  padding: "24px 28px", marginBottom: 20,
                  display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16,
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>Is this your listing?</div>
                    <div style={{ color: "#888", fontSize: 14 }}>Claim it to add your photo, bio, and contact details — free.</div>
                  </div>
                  <Link href={`/professionals/claim/${pro.id}`} style={{
                    background: "#3d8bff", color: "#fff", fontWeight: 600,
                    padding: "10px 20px", borderRadius: 10, fontSize: 14,
                    whiteSpace: "nowrap",
                  }}>
                    Claim this profile
                  </Link>
                </div>
              )}

              {/* CTA — claimed, get a quote */}
              {isClaimed && (
                <div style={{
                  background: "linear-gradient(135deg, rgba(0,232,122,0.06), rgba(0,232,122,0.02))",
                  border: "1px solid rgba(0,232,122,0.15)", borderRadius: 16,
                  padding: "24px 28px", marginBottom: 20,
                  display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16,
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
                      {pro.pro_type === "lo" || pro.pro_type === "lo_company"
                        ? "Get a mortgage quote"
                        : "Find homes with this agent"}
                    </div>
                    <div style={{ color: "#888", fontSize: 14 }}>
                      {pro.pro_type === "lo" || pro.pro_type === "lo_company"
                        ? "Run your numbers on our AI-powered mortgage calculator."
                        : "Search listings and connect with a licensed professional."}
                    </div>
                  </div>
                  <Link href="/" style={{
                    background: "#00e87a", color: "#000", fontWeight: 700,
                    padding: "10px 20px", borderRadius: 10, fontSize: 14,
                    whiteSpace: "nowrap",
                  }}>
                    Start →
                  </Link>
                </div>
              )}

              {/* Footer note */}
              <p style={{ color: "#444", fontSize: 12, textAlign: "center", lineHeight: 1.6, marginTop: 32 }}>
                License data sourced from {SOURCE_LABEL[pro.source] ?? pro.source}.
                {" "}Always verify credentials independently before entering a business relationship.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
