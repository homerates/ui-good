import { NextResponse } from "next/server";
// Your fred helper is at src/lib/fred.ts from here:
import { getFredSnapshot } from "../../../src/lib/fred";

type Body = { intent?: string };

function parseBody(input: unknown): Body {
  if (typeof input !== "object" || input === null) return {};
  const rec = input as Record<string, unknown>;
  const out: Body = {};
  if (typeof rec.intent === "string") out.intent = rec.intent;
  return out;
}

export async function POST(req: Request) {
  let body: Body = {};
  try {
    const raw: unknown = await req.json();
    body = parseBody(raw);
  } catch {
    body = {};
  }

  const intent = body.intent ?? "market";

  if (intent === "market") {
    const snap =
      (await getFredSnapshot({ timeoutMs: 2000, maxAgeDays: 14 }).catch(() => null)) ??
      null;

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
      lockStance: "Neutral",
      watchNext: {},
      confidence: "med",
      status: 200,
    });
  }

  // simple passthrough for other intents for now
  return NextResponse.json({ ok: true, path: intent });
}

export async function GET() {
  return NextResponse.json(
    { ok: false, message: "Use POST with JSON to /api/answers" },
    { status: 405 }
  );
}
