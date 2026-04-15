// app/api/og/route.tsx
// Dynamic OG image for articles — 1200x630 branded card with title overlay
// Usage: /api/og?title=Article+Title&cat=knowledge-hub

import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title") ?? "HomeRates.ai";
  const cat = searchParams.get("cat") ?? "";

  const catLabel =
    cat === "market-news" ? "MARKET NEWS" :
    cat === "knowledge-hub" ? "MORTGAGE GUIDE" :
    "HOMERATES.AI";

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "64px 72px",
          background: "#080c12",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Green accent bar */}
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 6,
          background: "#00e87a",
          display: "flex",
        }} />

        {/* Logo area */}
        <div style={{
          position: "absolute",
          top: 48,
          left: 72,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <div style={{
            width: 32,
            height: 32,
            background: "#00e87a",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            fontWeight: 700,
            color: "#080c12",
          }}>H</div>
          <span style={{ color: "#f0f4ff", fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>
            HomeRates.ai
          </span>
        </div>

        {/* Category tag */}
        <div style={{
          display: "flex",
          marginBottom: 20,
        }}>
          <div style={{
            background: "rgba(0,232,122,0.15)",
            color: "#00e87a",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.1em",
            padding: "6px 16px",
            borderRadius: 999,
            border: "1px solid rgba(0,232,122,0.3)",
          }}>
            {catLabel}
          </div>
        </div>

        {/* Title */}
        <div style={{
          color: "#f0f4ff",
          fontSize: title.length > 60 ? 46 : 56,
          fontWeight: 800,
          lineHeight: 1.15,
          letterSpacing: "-0.03em",
          maxWidth: 960,
        }}>
          {title}
        </div>

        {/* Bottom domain */}
        <div style={{
          position: "absolute",
          bottom: 48,
          right: 72,
          color: "rgba(143,163,184,0.5)",
          fontSize: 16,
          fontWeight: 500,
        }}>
          chat.homerates.ai
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
