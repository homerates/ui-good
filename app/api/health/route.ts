// app/api/health/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const hasTavilyKey = !!process.env.TAVILY_API_KEY;

  // quick local calc probe (no imports, no network)
  const calcOK = (() => {
    try {
      const price = 500000, downPct = 20, rate = 6.5, years = 30;
      const loan = price * (1 - downPct / 100);
      const r = (rate / 100) / 12;
      const n = years * 12;
      const pi = r === 0 ? loan / n : loan * (r / (1 - Math.pow(1 + r, -n)));
      return Number.isFinite(pi) && pi > 0;
    } catch { return false; }
  })();

  const data = {
    meta: { path: "health", tag: "health-v2-no-fred" },
    services: {
      answers: { uses: "Tavily", envOK: hasTavilyKey },
      calc: { mode: "local", probeOK: calcOK },
    },
    commit: process.env.VERCEL_GIT_COMMIT_SHA || "local",
    time: new Date().toISOString(),
  };

  const ok = hasTavilyKey && calcOK;
  return NextResponse.json(data, { status: ok ? 200 : 503 });
}
