import { NextResponse } from "next/server";
import { getFredSnapshot } from "../../../src/lib/fred"; // keep as-is given your structure

type Body = { intent?: string };

function parseBody(input: unknown): Body {
  if (typeof input !== "object" || input === null) return {};
  const rec = input as Record<string, unknown>;
  const out: Body = {};
  if (typeof rec.intent === "string") out.intent = rec.intent;
  return out;
}

function biasFromSpread(spread: number | null): "tight" | "neutral" | "loose" {
  if (spread == null) return "neutral";
  if (spread > 2.25) return "tight";
  if (spread < 1.75) return "loose";
  return "neutral";
}

export async function POST(req: Request) {
  // parse body, no `any`
  let body: Body = {};
  try {
    const raw: unknown = await req.json();
    body = parseBody(raw);
  } catch { body = {}; }

  const intent = body.intent ?? "market";

  if (intent === "market") {
    const snap =
      (await getFredSnapshot({ timeoutMs: 2000, maxAgeDays: 14 }).catch(() => null)) ?? null;

    const has =
      !!snap &&
      snap.tenYearYield != null &&
      snap.mort30Avg != null &&
      snap.spread != null &&
      !!snap.asOf;

    const fred = has
      ? snap
      : {
          tenYearYield: 4.1,
          mort30Avg: 6.3,
          spread: 2.2,
          asOf: new Date().toISOString().slice(0, 10),
          stale: true,
          source: "stub" as const,
        };

    const bias = biasFromSpread(fred.spread);
    const biasText =
      bias === "tight" ? "tight-credit / high spread"
      : bias === "loose" ? "looser-credit / low spread"
      : "neutral";

    // human-friendly line the UI can show immediately
    const summary = `As of ${fred.asOf}: 10Y ${fred.tenYearYield?.toFixed(2)}%, 30Y ${fred.mort30Avg?.toFixed(2)}%, spread ${fred.spread?.toFixed(2)}%. Bias: ${biasText}.`;

    return NextResponse.json({
      ok: true,
      path: "market",
      usedFRED: has && fred.source === "fred",
      fred: {
        tenYearYield: fred.tenYearYield,
        mort30Avg: fred.mort30Avg,
        spread: fred.spread,
        asOf: fred.asOf,
      },
      bias: biasText,
      summary,           // <— add this
      message: summary,  // <— duplicate under a very obvious key for UI
      lockStance: "Neutral",
      watchNext: {},
      confidence: "med",
      status: 200,
    });
  }

  return NextResponse.json({ ok: true, path: intent });
}

export async function GET() {
  return NextResponse.json(
    { ok: false, message: "Use POST with JSON to /api/answers" },
    { status: 405 }
  );
}

