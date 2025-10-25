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
    // Non-market intents return a simple dynamic placeholder (keeps path stable for UI)
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
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const intent =
    typeof (body as any)?.intent === "string" && (body as any).intent.trim()
      ? (body as any).intent
      : "market";
  return handle(intent);
}

// Browser-friendly GET with optional ?intent=... (defaults to "market")
export async function GET(req: NextRequest) {
  const intent = req.nextUrl.searchParams.get("intent") || "market";
  return handle(intent);
}
