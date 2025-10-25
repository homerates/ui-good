export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { getFredSnapshot } from "../../../src/lib/fred";
import { composeMarket } from "../../../src/lib/composeMarket";

function noStore(json: unknown, status = 200) {
  const res = NextResponse.json(json, { status });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

async function handle(intent: string) {
  if (intent !== "market") {
    return noStore({ ok: true, route: "answers", intent, tag: "v1-stable" });
  }

  const generatedAt = new Date().toISOString();
  const fred = await getFredSnapshot({ timeoutMs: 2500 });
  const usedFRED = !!fred && fred.source !== "stub";
  const market = fred ? composeMarket(fred) : { type: "market", error: "no-data" };

  return noStore({
    ok: true,
    route: "answers",
    intent,
    tag: "v1-stable",
    generatedAt,
    usedFRED,
    market,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const intent = typeof body?.intent === "string" ? body.intent : "market";
  return handle(intent);
}

// Browser-friendly: GET behaves like POST {intent:"market"}
export async function GET() {
  return handle("market");
}
