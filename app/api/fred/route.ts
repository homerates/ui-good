// app/api/fred/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  getFredSnapshot,
  getFredCacheInfo,
  warmFredCache,
} from "../../../src/lib/fred"; // ← correct path (../ ../ ../)

export async function GET() {
  // quick peek without throwing
  const hasKey = Boolean(process.env.FRED_API_KEY);

  // best-effort warm (ignore errors)
  await warmFredCache(1200).catch(() => {});

  const t0 = Date.now();
  let error: string | null = null;
  let fred = null as Awaited<ReturnType<typeof getFredSnapshot>> | null;

  try {
    fred = await getFredSnapshot({ timeoutMs: 2500 });
  } catch (e) {
    error = e instanceof Error ? e.message : "unknown error";
  }

  const ms = Date.now() - t0;
  const cache = getFredCacheInfo();

  return NextResponse.json({
    ok: fred != null,
    hasKey,
    ms,
    error,
    fred,
    cache,
  });
}

export async function POST() {
  // explicit warm + read
  await warmFredCache(1500).catch(() => {});
  const fred = await getFredSnapshot({ timeoutMs: 2500 });
  const cache = getFredCacheInfo();
  return NextResponse.json({ ok: fred != null, fred, cache });
}
