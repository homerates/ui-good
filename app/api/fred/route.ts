// app/api/fred/route.ts
export const runtime = 'nodejs';

import { getFredSnapshot, getFredCacheInfo } from "@/lib/fred";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const warm = url.searchParams.get("warm") === "1";

  if (warm) {
    // Best-effort warm; ignore failures
    await getFredSnapshot({ timeoutMs: 1500 }).catch(() => null);
  }

  const cache = getFredCacheInfo();
  const fred = await getFredSnapshot({ maxAgeDays: 7, timeoutMs: 6000 }).catch(() => null);

  return json({ cache, fred });
}
