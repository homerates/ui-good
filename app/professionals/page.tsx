"use client";
// app/professionals/page.tsx
// California Professional Directory — LOs, brokerages, agents, brokers
// Publicly browsable. Unclaimed listings invite pros to join.

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import AppNav from "../components/AppNav";

type Pro = {
  id: string;
  source: "nmls" | "ca_dre";
  source_id: string;
  pro_type: "lo" | "lo_company" | "agent" | "agent_broker";
  name: string;
  company_name: string | null;
  city: string | null;
  state: string;
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

const PRO_TYPE_BADGE_COLOR: Record<string, string> = {
  lo:            "rgba(61,139,255,0.15)",
  lo_company:    "rgba(61,139,255,0.08)",
  agent:         "rgba(0,232,122,0.12)",
  agent_broker:  "rgba(0,232,122,0.08)",
};

const PRO_TYPE_TEXT_COLOR: Record<string, string> = {
  lo:            "#3d8bff",
  lo_company:    "#3d8bff",
  agent:         "#00e87a",
  agent_broker:  "#00e87a",
};

const TYPE_FILTERS = [
  { value: "", label: "All professionals" },
  { value: "lo", label: "Loan Officers" },
  { value: "lo_company", label: "Mortgage Companies" },
  { value: "agent", label: "Real Estate Agents" },
  { value: "agent_broker", label: "Brokers" },
];

export default function ProfessionalsPage() {
  const [pros, setPros]       = useState<Pro[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(0);
  const [pages, setPages]     = useState(0);
  const [loading, setLoading] = useState(false);

  const [q, setQ]           = useState("");
  const [type, setType]     = useState("");
  const [city, setCity]     = useState("");
  const [claimed, setClaimed] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function buildParams(overrides: Record<string, string | number> = {}) {
    const p = new URLSearchParams();
    if (q)       p.set("q", q);
    if (type)    p.set("type", type);
    if (city)    p.set("city", city);
    if (claimed) p.set("claimed", claimed);
    p.set("page", String(page));
    p.set("per_page", "24");
    Object.entries(overrides).forEach(([k, v]) => p.set(k, String(v)));
    return p.toString();
  }

  async function load(params: string) {
    setLoading(true);
    try {
      const res  = await fetch(`/api/pro-directory?${params}`);
      const data = await res.json();
      setPros(data.professionals ?? []);
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 0);
    } finally {
      setLoading(false);
    }
  }

  // Debounced search on filter changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(0);
      load(buildParams({ page: 0 }));
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, type, city, claimed]);

  useEffect(() => {
    load(buildParams());
  }, [page]);

  const claimedCount = pros.filter(p => p.claimed_by).length;

  return (
    <>
      <style>{`
        body:has(.pd-root){display:block!important;height:auto!important;overflow-y:auto!important;background:#080c12!important}
        html:has(.pd-root){height:auto!important;overflow:visible!important;background:#080c12!important}

        .pd-root{min-height:100vh;background:#080c12;color:#f0f4ff;font-family:'DM Sans',system-ui,sans-serif}

        .pd-nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 2rem;height:56px;background:rgba(8,12,18,0.96);border-bottom:1px solid rgba(255,255,255,0.07);backdrop-filter:blur(8px)}
        .pd-logo img{height:26px;display:block}

        .pd-shell{max-width:1100px;margin:0 auto;padding:3rem 1.5rem 5rem}

        .pd-header{margin-bottom:2rem}
        .pd-eyebrow{font-size:0.72rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#3d8bff;margin-bottom:0.5rem}
        .pd-h1{font-size:clamp(1.6rem,4vw,2.4rem);font-weight:800;letter-spacing:-0.03em;margin:0 0 0.5rem}
        .pd-sub{color:rgba(255,255,255,0.45);font-size:0.92rem;margin:0}

        .pd-filters{display:flex;flex-wrap:wrap;gap:0.75rem;margin-bottom:2rem;align-items:center}
        .pd-input{padding:0.6rem 1rem;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#f0f4ff;font-size:0.88rem;outline:none;transition:border-color 0.2s;min-width:180px;font-family:inherit}
        .pd-input:focus{border-color:rgba(61,139,255,0.5)}
        .pd-input::placeholder{color:rgba(255,255,255,0.25)}
        .pd-select{padding:0.6rem 1rem;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#f0f4ff;font-size:0.88rem;outline:none;cursor:pointer;font-family:inherit;appearance:none}
        .pd-select option{background:#0e1420;color:#f0f4ff}

        .pd-results-bar{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;font-size:0.82rem;color:rgba(255,255,255,0.35)}
        .pd-results-bar strong{color:rgba(255,255,255,0.6)}

        .pd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem}

        .pd-card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:1.25rem 1.5rem;display:flex;flex-direction:column;gap:0.75rem;transition:border-color 0.2s}
        .pd-card:hover{border-color:rgba(255,255,255,0.15)}
        .pd-card.pd-claimed{border-color:rgba(0,232,122,0.18);background:rgba(0,232,122,0.02)}

        .pd-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:0.5rem}
        .pd-badge{font-size:0.68rem;font-weight:700;padding:3px 8px;border-radius:99px;border:1px solid transparent;white-space:nowrap;flex-shrink:0}
        .pd-claimed-tag{font-size:0.68rem;font-weight:600;color:#00e87a;display:flex;align-items:center;gap:3px}

        .pd-name{font-size:0.98rem;font-weight:700;color:#f0f4ff;line-height:1.3}
        .pd-company{font-size:0.78rem;color:rgba(255,255,255,0.4);margin-top:1px}
        .pd-meta{font-size:0.75rem;color:rgba(255,255,255,0.3);display:flex;gap:0.6rem;flex-wrap:wrap}

        .pd-bio{font-size:0.82rem;color:rgba(255,255,255,0.5);line-height:1.55;border-top:1px solid rgba(255,255,255,0.05);padding-top:0.75rem}

        .pd-card-footer{display:flex;gap:0.6rem;margin-top:auto}
        .pd-claim-btn{flex:1;padding:0.55rem 0;background:#00e87a;color:#080c12;font-weight:700;font-size:0.78rem;border:none;border-radius:8px;cursor:pointer;text-align:center;text-decoration:none;display:block;transition:opacity 0.2s}
        .pd-claim-btn:hover{opacity:0.85}
        .pd-contact-btn{padding:0.55rem 0.9rem;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.6);font-size:0.78rem;border:none;border-radius:8px;cursor:pointer;text-decoration:none;display:block;transition:all 0.2s}
        .pd-contact-btn:hover{background:rgba(255,255,255,0.1);color:#fff}
        .pd-nmls-tag{font-size:0.7rem;color:rgba(255,255,255,0.25);font-family:monospace}

        .pd-empty{text-align:center;padding:5rem 2rem;color:rgba(255,255,255,0.3)}
        .pd-loading{text-align:center;padding:5rem 2rem;color:rgba(255,255,255,0.25);font-size:0.9rem}

        .pd-pagination{display:flex;gap:0.5rem;justify-content:center;margin-top:2rem;align-items:center}
        .pd-page-btn{padding:0.5rem 1rem;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);border-radius:8px;color:rgba(255,255,255,0.5);font-size:0.82rem;cursor:pointer;transition:all 0.2s}
        .pd-page-btn:hover:not(:disabled){background:rgba(255,255,255,0.09);color:#fff}
        .pd-page-btn:disabled{opacity:0.3;cursor:default}
        .pd-page-info{font-size:0.82rem;color:rgba(255,255,255,0.3);padding:0 0.5rem}

        .pd-list-btn{display:inline-block;margin-top:1rem;padding:0.6rem 1.25rem;background:#00e87a;color:#080c12;font-weight:700;font-size:0.84rem;border-radius:9px;text-decoration:none;transition:opacity 0.2s}
        .pd-list-btn:hover{opacity:0.85}

        .pd-disclosure{max-width:760px;margin:3rem auto 0;padding:1.5rem;border-top:1px solid rgba(255,255,255,0.05)}
        .pd-disclosure p{font-size:0.75rem;color:rgba(255,255,255,0.22);line-height:1.6;margin:0}
        .pd-disclosure a{color:rgba(61,139,255,0.5);text-decoration:none}
        .pd-disclosure a:hover{color:#3d8bff}

        @media(max-width:640px){
          .pd-shell{padding:2rem 1rem 4rem}
          .pd-filters{flex-direction:column;align-items:stretch}
          .pd-input,.pd-select{min-width:0;width:100%}
          .pd-grid{grid-template-columns:1fr}
        }
      `}</style>

      <div className="pd-root">
        <nav className="pd-nav">
          <Link href="/" className="pd-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" />
          </Link>
          <AppNav drawerOnly />
        </nav>

        <div className="pd-shell">
          <div className="pd-header">
            <div className="pd-eyebrow">California Professionals</div>
            <h1 className="pd-h1">Find a Loan Officer or Real Estate Agent</h1>
            <p className="pd-sub">
              California-licensed mortgage and real estate professionals.
              All listings are self-verified — pros create and manage their own profiles.
            </p>
            <a href="/professionals/new" className="pd-list-btn">+ List yourself free →</a>
          </div>

          {/* Filters */}
          <div className="pd-filters">
            <input
              className="pd-input"
              placeholder="Search by name…"
              value={q}
              onChange={e => setQ(e.target.value)}
              style={{ flex: "2 1 220px" }}
            />
            <input
              className="pd-input"
              placeholder="City"
              value={city}
              onChange={e => setCity(e.target.value)}
              style={{ flex: "1 1 140px" }}
            />
            <select
              className="pd-select"
              value={type}
              onChange={e => setType(e.target.value)}
            >
              {TYPE_FILTERS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <select
              className="pd-select"
              value={claimed}
              onChange={e => setClaimed(e.target.value)}
            >
              <option value="">All listings</option>
              <option value="true">Claimed profiles only</option>
              <option value="false">Unclaimed only</option>
            </select>
          </div>

          {/* Results bar */}
          <div className="pd-results-bar">
            <span>
              {loading ? "Searching…" : (
                <><strong>{total.toLocaleString()}</strong> professionals found</>
              )}
            </span>
            {claimedCount > 0 && (
              <span><strong style={{ color: "#00e87a" }}>{claimedCount}</strong> claimed on this page</span>
            )}
          </div>

          {/* Grid */}
          {loading ? (
            <div className="pd-loading">Loading professionals…</div>
          ) : pros.length === 0 ? (
            <div className="pd-empty">
              {(q || city || type) ? (
                <>
                  <p>No professionals found for these filters.</p>
                  <p style={{ fontSize: "0.82rem", marginTop: "0.5rem" }}>Try broadening your search.</p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: "1rem", fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>No listings yet.</p>
                  <p style={{ fontSize: "0.85rem", marginTop: "0.5rem", color: "rgba(255,255,255,0.3)" }}>
                    Be the first to add yourself to the directory.
                  </p>
                  <a
                    href="/professionals/new"
                    style={{ display: "inline-block", marginTop: "1.25rem", padding: "0.7rem 1.5rem", background: "#00e87a", color: "#080c12", fontWeight: 700, borderRadius: 10, textDecoration: "none", fontSize: "0.88rem" }}
                  >
                    Create your free listing →
                  </a>
                </>
              )}
            </div>
          ) : (
            <div className="pd-grid">
              {pros.map(pro => {
                const isClaimed  = !!pro.claimed_by;
                const typeColor  = PRO_TYPE_TEXT_COLOR[pro.pro_type] ?? "#8fa3b8";
                const typeBg     = PRO_TYPE_BADGE_COLOR[pro.pro_type] ?? "rgba(255,255,255,0.06)";
                const isNmls     = pro.source === "nmls";
                const nmlsId     = isNmls ? pro.source_id.replace(/^co_/, "") : null;

                return (
                  <div key={pro.id} className={`pd-card ${isClaimed ? "pd-claimed" : ""}`}>
                    {/* Top row */}
                    <div className="pd-card-top">
                      <span
                        className="pd-badge"
                        style={{ background: typeBg, color: typeColor, borderColor: typeColor + "40" }}
                      >
                        {PRO_TYPE_LABEL[pro.pro_type] ?? pro.pro_type}
                      </span>
                      {isClaimed && (
                        <span className="pd-claimed-tag">✓ Claimed</span>
                      )}
                    </div>

                    {/* Identity */}
                    <div>
                      <Link href={`/professionals/${pro.id}`} className="pd-name" style={{ textDecoration: "none", display: "block" }}>
                        {pro.name}
                      </Link>
                      {pro.company_name && (
                        <div className="pd-company">{pro.company_name}</div>
                      )}
                    </div>

                    {/* Meta */}
                    <div className="pd-meta">
                      {pro.city && <span>📍 {pro.city}, CA</span>}
                      {nmlsId && <span className="pd-nmls-tag">NMLS #{nmlsId}</span>}
                      {pro.source === "ca_dre" && <span className="pd-nmls-tag">DRE #{pro.source_id}</span>}
                      {pro.license_status && (
                        <span style={{ color: pro.license_status === "Active" ? "rgba(0,232,122,0.6)" : "rgba(255,95,95,0.6)" }}>
                          {pro.license_status}
                        </span>
                      )}
                    </div>

                    {/* Bio (claimed only) */}
                    {isClaimed && pro.bio && (
                      <div className="pd-bio">{pro.bio}</div>
                    )}

                    {/* Actions */}
                    <div className="pd-card-footer">
                      {isClaimed ? (
                        <>
                          {pro.phone && (
                            <a href={`tel:${pro.phone}`} className="pd-contact-btn">📞 Call</a>
                          )}
                          {pro.website && (
                            <a href={pro.website} target="_blank" rel="noopener noreferrer" className="pd-contact-btn">🌐 Website</a>
                          )}
                          <Link href={`/professionals/${pro.id}`} className="pd-claim-btn">View profile →</Link>
                        </>
                      ) : (
                        <Link href={`/professionals/${pro.id}`} className="pd-claim-btn">
                          View profile →
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {pages > 1 && (
            <div className="pd-pagination">
              <button
                className="pd-page-btn"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
              >← Prev</button>
              <span className="pd-page-info">Page {page + 1} of {pages}</span>
              <button
                className="pd-page-btn"
                disabled={page >= pages - 1}
                onClick={() => setPage(p => p + 1)}
              >Next →</button>
            </div>
          )}

          {/* Disclosure */}
          <div className="pd-disclosure">
            <p>
              Professional listings on HomeRates.ai are self-submitted. HomeRates.ai does not independently verify
              credentials, licenses, or affiliations displayed here. Users are responsible for confirming that any
              professional they engage is properly licensed.{" "}
              <a href="https://www.nmlsconsumeraccess.org" target="_blank" rel="noopener noreferrer">
                Verify mortgage professionals via NMLS Consumer Access
              </a>{" · "}
              <a href="https://www.dre.ca.gov/Consumers/VerifyaLicense.html" target="_blank" rel="noopener noreferrer">
                Verify real estate agents via CA DRE
              </a>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
