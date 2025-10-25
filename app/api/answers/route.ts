// app/api/answers/route.ts
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
    return noStore({
      ok: true,
      route: "answers",
      intent,
      path: "dynamic",
      tag: "v1-stable",
      generatedAt: new Date().toISOString(),
    });
  }

  const generatedAt = new Date().toISOString();
  const fred = await getFredSnapshot({ timeoutMs: 2500 });
  const usedFRED = !!fred && fred.source !== "stub";
  const market = fred ? composeMarket(fred) : { type: "market", error: "no-data" };

  return noStore({
    ok: true,
    route: "answers",
    intent,
    path: "market",
    tag: "v1-stable",
    generatedAt,
    usedFRED,
    market,
  });
}

export async function POST(req: NextRequest) {
  type Body = { intent?: string };
  const body = (await req.json().catch(() => ({} as Body))) as Body;
  const raw = (body.intent ?? "").trim();
  const intent = raw.length > 0 ? raw : "market";
  return handle(intent);
}

// Browser-friendly GET with optional ?intent=... (defaults to "market")
export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get("intent") ?? "").trim();
  const intent = raw.length > 0 ? raw : "market";
  return handle(intent);
}
