// app/api/answers/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { getFredSnapshot } from "@/src/lib/composeMarket"; // adjust to "@/lib/composeMarket" if you move it

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const intent = typeof body?.intent === "string" ? body.intent : "market";

  if (intent === "market") {
    const market = await composeMarket();
    return NextResponse.json(
      { ok: true, route: "answers", intent, tag: "v1-stable", market },
      { status: 200 }
    );
  }

  return NextResponse.json(
    { ok: true, route: "answers", intent, tag: "v1-stable" },
    { status: 200 }
  );
}
