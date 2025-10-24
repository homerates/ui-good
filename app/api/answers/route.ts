// app/api/answers/route.ts

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type Ok = {
  ok: true;
  route: "answers";
  intent: string;
  tag: "v1-stable";
  // market?: unknown; // uncomment if you wire composeMarket below
};

type Err = { ok: false; error: string };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const intent = typeof body?.intent === "string" ? body.intent : "market";

    // If you want to call composeMarket, do it safely:
    // if (intent === "market") {
    //   const { composeMarket } = await import("../../../lib/composeMarket"); // or "src/lib/composeMarket"
    //   const market = await composeMarket();
    //   const out: Ok = { ok: true, route: "answers", intent, tag: "v1-stable", market };
    //   return NextResponse.json(out, { status: 200 });
    // }

    const out: Ok = { ok: true, route: "answers", intent, tag: "v1-stable" };
    return NextResponse.json(out, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    const out: Err = { ok: false, error: msg };
    return NextResponse.json(out, { status: 500 });
  }
}
