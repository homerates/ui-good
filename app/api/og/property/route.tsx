// app/api/og/property/route.tsx
// Dynamic OG image for portfolio property share cards
// Usage: /api/og/property?address=...&score=62&verdict=Ready+to+Offer&price=36995000&beds=7&baths=9&photo=https://ssl.cdn-redfin.com/...

import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { verdictLabel } from "../../../../lib/scoring/decisionScore";

export const runtime = "edge";

function fmt$( n: number ) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function scoreColor( score: number | null ) {
  if (score == null)  return "#4a6080";
  if (score >= 75)    return "#00e87a";
  if (score >= 55)    return "#f0c040";
  return "#ff5a5a";
}

export async function GET(req: NextRequest) {
  const p          = new URL(req.url).searchParams;
  const address    = p.get("address")  ?? "Property Analysis";
  const scoreStr   = p.get("score");
  const score      = scoreStr ? parseInt(scoreStr, 10) : null;
  const verdict    = p.get("verdict")  ?? (score != null ? verdictLabel(score) : "Decision Score");
  const priceStr   = p.get("price");
  const price      = priceStr ? parseInt(priceStr, 10) : null;
  const beds       = p.get("beds");
  const baths      = p.get("baths");
  const photoUrl   = p.get("photo");   // must be ssl.cdn-redfin.com

  // Safe photo — only cdn-redfin domain allowed
  const safePhoto = photoUrl && /^https:\/\/ssl\.cdn-redfin\.com\//.test(photoUrl) ? photoUrl : null;

  const color = scoreColor(score);

  // Address: split at comma for two-line display
  const parts    = address.split(",");
  const addrLine1 = parts[0]?.trim() ?? address;
  const addrLine2 = parts.slice(1).join(",").trim();

  const detailParts: string[] = [];
  if (price)  detailParts.push(fmt$(price));
  if (beds)   detailParts.push(`${beds} bd`);
  if (baths)  detailParts.push(`${baths} ba`);
  const detail = detailParts.join("  ·  ");

  return new ImageResponse(
    (
      <div style={{
        width: 1200, height: 630,
        background: "#080f1c",
        display: "flex", flexDirection: "row",
        fontFamily: "system-ui, -apple-system, sans-serif",
        overflow: "hidden",
      }}>

        {/* ── Left panel — text ── */}
        <div style={{
          flex: 1,
          display: "flex", flexDirection: "column", justifyContent: "center",
          padding: "60px 56px",
          gap: 0,
        }}>

          {/* Brand tag */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            marginBottom: 28,
          }}>
            <div style={{
              background: "rgba(0,232,122,0.10)", border: "1px solid rgba(0,232,122,0.35)",
              color: "#00e87a", fontSize: 11, fontWeight: 700, letterSpacing: "0.10em",
              padding: "5px 14px", borderRadius: 999, display: "flex",
            }}>
              MY DECISION PORTFOLIO  ·  HOMERATES.AI
            </div>
          </div>

          {/* Address */}
          <div style={{
            color: "#ffffff", fontSize: 38, fontWeight: 800,
            lineHeight: 1.15, letterSpacing: "-0.02em",
            display: "flex", flexDirection: "column", gap: 0,
            marginBottom: 10,
          }}>
            <span>{addrLine1}</span>
            {addrLine2 && <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 28, fontWeight: 500 }}>{addrLine2}</span>}
          </div>

          {/* Price + beds/baths */}
          {detail && (
            <div style={{
              color: "rgba(200,214,230,0.60)", fontSize: 18, fontWeight: 500,
              marginBottom: 36, display: "flex",
            }}>
              {detail}
            </div>
          )}

          {/* Score block */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 12 }}>
            <div style={{
              fontSize: 88, fontWeight: 900, lineHeight: 1,
              color: color, letterSpacing: "-0.04em", display: "flex",
            }}>
              {score ?? "—"}
            </div>
            <div style={{
              display: "flex", flexDirection: "column", paddingBottom: 10,
            }}>
              <span style={{ color: "rgba(200,214,230,0.45)", fontSize: 14, fontWeight: 600, letterSpacing: "0.08em" }}>/ 100</span>
              <span style={{ color: color, fontSize: 14, fontWeight: 700, marginTop: 4, letterSpacing: "0.02em" }}>{verdict}</span>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            color: "rgba(200,214,230,0.35)", fontSize: 13, fontWeight: 500,
            marginTop: 20, display: "flex",
          }}>
            My Decision Portfolio  ·  powered by HomeRates.Ai
          </div>

        </div>

        {/* ── Right panel — photo or dark fill ── */}
        <div style={{
          width: 380,
          background: "#0b1221",
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden", position: "relative",
          flexShrink: 0,
        }}>
          {safePhoto
            ? <img src={safePhoto} width={380} height={630} style={{ objectFit: "cover", width: "100%", height: "100%" }} />
            : (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
                opacity: 0.25,
              }}>
                <div style={{ fontSize: 64, display: "flex" }}>🏠</div>
                <div style={{ color: "#4a6080", fontSize: 13, fontWeight: 600, display: "flex" }}>No photo</div>
              </div>
            )
          }
          {/* Score badge overlay on photo */}
          {safePhoto && score != null && (
            <div style={{
              position: "absolute", bottom: 24, left: 24,
              background: "rgba(8,15,28,0.88)",
              border: `1px solid ${color}44`,
              borderRadius: 12, padding: "10px 16px",
              display: "flex", flexDirection: "column", gap: 2,
            }}>
              <span style={{ color: "rgba(200,214,230,0.5)", fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", display: "flex" }}>DECISION SCORE</span>
              <span style={{ color, fontSize: 28, fontWeight: 900, lineHeight: 1, display: "flex" }}>{score}<span style={{ fontSize: 12, color: "rgba(200,214,230,0.4)", marginLeft: 3, alignSelf: "flex-end", paddingBottom: 3 }}>/100</span></span>
            </div>
          )}
        </div>

      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600" },
    },
  );
}
