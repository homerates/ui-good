// app/share/[id]/page.tsx
// Public share page for a portfolio property decision score
// Crawlers read the OG meta here. Humans see the card + CTA to open in HomeRates.Ai

import { Metadata } from "next";
import { getSupabase } from "../../../lib/supabaseServer";
import Link from "next/link";

const BASE = "https://chat.homerates.ai";

interface Props { params: Promise<{ id: string }> }

interface ItemData {
  address: string;
  score: number | null;
  verdict: string;
  price: number | null;
  beds: string | null;
  baths: string | null;
  photo: string | null;
}

async function fetchItemData(id: string): Promise<ItemData> {
  const sb = getSupabase();
  const fallback: ItemData = { address: "Property Analysis", score: null, verdict: "", price: null, beds: null, baths: null, photo: null };
  if (!sb) return fallback;

  const { data } = await sb
    .from("portfolio_items")
    .select("address, data, photo_url")
    .eq("id", id)
    .single();

  if (!data) return fallback;

  const d = data.data as Record<string, unknown>;
  return {
    address:  data.address ?? fallback.address,
    photo:    (data.photo_url && /^https:\/\/ssl\.cdn-redfin\.com\//.test(data.photo_url)) ? data.photo_url : null,
    score:    (d.compositeScore as number | null) ?? null,
    verdict:  (d.verdict as string | null) ?? "",
    price:    (d.price as number | null) ?? null,
    beds:     d.beds != null ? String(d.beds) : null,
    baths:    d.baths != null ? String(d.baths) : null,
  };
}

function buildOgUrl(item: ItemData): string {
  const p = new URLSearchParams();
  p.set("address", item.address);
  if (item.score != null) p.set("score",   String(item.score));
  if (item.verdict)       p.set("verdict",  item.verdict);
  if (item.price != null) p.set("price",   String(item.price));
  if (item.beds)          p.set("beds",    item.beds);
  if (item.baths)         p.set("baths",   item.baths);
  if (item.photo)         p.set("photo",   item.photo);
  return `${BASE}/api/og/property?${p.toString()}`;
}

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1000).toLocaleString()}K`;
  return `$${n}`;
}

// ── Dynamic metadata (OG image) ────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const item    = await fetchItemData(id);
  const ogUrl   = buildOgUrl(item);

  const street  = item.address.split(",")[0]?.trim() ?? item.address;
  const title   = item.score != null
    ? `${street} — Decision Score ${item.score}/100 | HomeRates.Ai`
    : `${street} — Property Analysis | HomeRates.Ai`;
  const desc    = item.score != null
    ? `${item.address}${item.verdict ? ` · ${item.verdict}` : ""}. Decision Score: ${item.score}/100. Analyzed with HomeRates.Ai Home + Mortgage AI.`
    : `Property analysis for ${item.address} — powered by HomeRates.Ai.`;

  return {
    title,
    description: desc,
    openGraph: {
      title, description: desc,
      url: `${BASE}/share/${id}`,
      siteName: "HomeRates.Ai",
      images: [{ url: ogUrl, width: 1200, height: 630, alt: `Decision Score for ${street}` }],
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description: desc, images: [ogUrl] },
  };
}

// ── Page component — rendered for both humans and crawlers ─────────────────

export default async function SharePage({ params }: Props) {
  const { id }  = await params;
  const item     = await fetchItemData(id);
  const street   = item.address.split(",")[0]?.trim() ?? item.address;
  const cityState = item.address.split(",").slice(1, 3).join(",").trim();

  const scoreColor = item.score == null ? "#4a6080"
    : item.score >= 75 ? "#00e87a"
    : item.score >= 55 ? "#f0c040"
    : "#ff5a5a";

  const chatUrl = `${BASE}/chat`;

  const detailParts: string[] = [];
  if (item.price)  detailParts.push(fmt$(item.price));
  if (item.beds)   detailParts.push(`${item.beds} bd`);
  if (item.baths)  detailParts.push(`${item.baths} ba`);

  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: "#080f1c", fontFamily: "system-ui, -apple-system, sans-serif", minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 600, padding: "24px 16px" }}>

          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 32 }}>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.10em", color: "#4a6080", textTransform: "uppercase" }}>HomeRates.Ai</span>
          </div>

          {/* Card */}
          <div style={{ background: "#0b1221", border: "1px solid #1e2d45", borderRadius: 18, overflow: "hidden" }}>

            {/* Photo */}
            {item.photo && (
              <div style={{ width: "100%", height: 220, overflow: "hidden", position: "relative" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.photo} alt={street} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 50%, #0b1221 100%)" }} />
              </div>
            )}

            {/* Content */}
            <div style={{ padding: "28px 28px 32px" }}>

              {/* Tag */}
              <div style={{ display: "inline-block", background: "rgba(0,232,122,0.10)", border: "1px solid rgba(0,232,122,0.30)", color: "#00e87a", fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", padding: "4px 12px", borderRadius: 999, marginBottom: 20 }}>
                DECISION SCORE
              </div>

              {/* Address */}
              <div style={{ color: "#ffffff", fontSize: 26, fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.02em", marginBottom: 4 }}>
                {street}
              </div>
              {cityState && (
                <div style={{ color: "rgba(200,214,230,0.50)", fontSize: 16, fontWeight: 400, marginBottom: 16 }}>
                  {cityState}
                </div>
              )}

              {detailParts.length > 0 && (
                <div style={{ color: "rgba(200,214,230,0.45)", fontSize: 14, fontWeight: 500, marginBottom: 28 }}>
                  {detailParts.join("  ·  ")}
                </div>
              )}

              {/* Score */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 32 }}>
                <span style={{ fontSize: 72, fontWeight: 900, color: scoreColor, lineHeight: 1, letterSpacing: "-0.04em" }}>
                  {item.score ?? "—"}
                </span>
                <div style={{ paddingBottom: 8, display: "flex", flexDirection: "column" }}>
                  <span style={{ color: "rgba(200,214,230,0.40)", fontSize: 13, fontWeight: 600 }}> / 100</span>
                  {item.verdict && (
                    <span style={{ color: scoreColor, fontSize: 13, fontWeight: 700, marginTop: 2 }}>{item.verdict}</span>
                  )}
                </div>
              </div>

              {/* CTA */}
              <Link
                href={chatUrl}
                style={{
                  display: "block", textAlign: "center",
                  background: "#00e87a", color: "#000",
                  fontSize: 14, fontWeight: 800, letterSpacing: "0.03em",
                  padding: "14px 24px", borderRadius: 10,
                  textDecoration: "none",
                }}
              >
                Open in HomeRates.Ai →
              </Link>

              <div style={{ textAlign: "center", marginTop: 14, color: "rgba(200,214,230,0.30)", fontSize: 11 }}>
                Home + Mortgage AI Chat · HomeRates.Ai
              </div>
            </div>
          </div>

        </div>
      </body>
    </html>
  );
}
