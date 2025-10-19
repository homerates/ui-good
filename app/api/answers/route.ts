
// app/api/answers/route.ts
import { NextResponse } from "next/server";
// change this line:
import { getFredSnapshot } from "../../../src/lib/fred";

export async function POST(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  const intent = typeof body.intent === "string" ? body.intent : "market";

  if (intent === "market") {
    // Try to get the live FRED snapshot
    const snap = await getFredSnapshot({ timeoutMs: 2000, maxAgeDays: 14 }).catch(() => null);

    // If nothing comes back, fill in safe fallback values
    const hasData = !!(snap && snap.tenYearYield != null && snap.mort30Avg != null && snap.spread != null && snap.asOf);
    const fred = hasData
      ? snap!
      : {
          tenYearYield: 4.10,
          mort30Avg: 6.30,
          spread: 2.20,
          asOf: new Date().toISOString().slice(0, 10),
          stale: true,
          source: "stub" as const,
        };

    return NextResponse.json({
      ok: true,
      path: "market",
      usedFRED: hasData && fred.source === "fred",
      fred: {
        tenYearYield: fred.tenYearYield,
        mort30Avg: fred.mort30Avg,
        spread: fred.spread,
        asOf: fred.asOf,
      },
      lockStance: "Neutral",
      watchNext: {},
      confidence: "med",
      status: 200,
    });
  }

  // Other routes can stay basic for now
  return NextResponse.json({ ok: true, path: intent });
}

// Optional: makes GET clearer in browser
export async function GET() {
  return NextResponse.json(
    { ok: false, message: "Use POST with JSON to /api/answers" },
    { status: 405 }
  );
}
