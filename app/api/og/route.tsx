// app/api/og/route.tsx
// Dynamic OG image — pre-composited base (logo + dashboard) + pill + dynamic title
// Usage: /api/og?title=Article+Title&cat=market-news

import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

const BASE = "https://chat.homerates.ai/assets/share/og/homerates-og-base.png";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title") ?? "HomeRates.ai";
  const cat   = searchParams.get("cat")   ?? "";

  const catLabel =
    cat === "market-news"   ? "MARKET NEWS"    :
    cat === "knowledge-hub" ? "MORTGAGE GUIDE" :
    "HOMERATES.AI";

  const fontSize = title.length > 55 ? 40 : title.length > 38 ? 46 : 52;

  // Fetch base as buffer so it renders reliably at the edge
  const baseData = await fetch(BASE).then(r => r.arrayBuffer());
  const baseB64  = `data:image/png;base64,${Buffer.from(baseData).toString("base64")}`;

  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: "flex", position: "relative" }}>

        {/* Pre-composited base: branded card + dark left overlay + logo */}
        <img src={baseB64} width={1200} height={630} style={{ position: "absolute", top: 0, left: 0 }} />

        {/* "FIRST AI MORTGAGE INTELLIGENCE PLATFORM" pill */}
        <div style={{
          position: "absolute",
          top: 220,
          left: 54,
          display: "flex",
        }}>
          <div style={{
            background: "rgba(0,232,122,0.12)",
            border: "1px solid rgba(0,232,122,0.4)",
            color: "#00e87a",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.09em",
            padding: "7px 16px",
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            gap: 7,
          }}>
            • FIRST AI MORTGAGE INTELLIGENCE PLATFORM
          </div>
        </div>

        {/* Dynamic article headline */}
        <div style={{
          position: "absolute",
          top: 278,
          left: 54,
          right: 590,
          color: "#ffffff",
          fontSize,
          fontWeight: 800,
          lineHeight: 1.18,
          letterSpacing: "-0.025em",
          display: "flex",
          flexWrap: "wrap",
        }}>
          {title}
        </div>

        {/* Category tag — bottom left */}
        <div style={{
          position: "absolute",
          bottom: 44,
          left: 54,
          display: "flex",
        }}>
          <div style={{
            background: "rgba(255,255,255,0.07)",
            color: "rgba(200,214,230,0.7)",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.08em",
            padding: "5px 14px",
            borderRadius: 999,
            display: "flex",
          }}>
            {catLabel}
          </div>
        </div>

      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
