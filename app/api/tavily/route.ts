import { NextResponse } from "next/server";

const USE_TAVILY = process.env.USE_TAVILY === "true";
const TAVILY_API_KEY = process.env.TAVILY_API_KEY ?? "";

// simple in-memory cache (60s) keyed by query/depth/max
const cache = new Map<string, { at: number; data: any }>();
const TTL_MS = 60_000;

export async function GET(req: Request) {
  const t0 = Date.now();
  try {
    const { searchParams } = new URL(req.url);
    if (searchParams.get("ping")) {
      return NextResponse.json({ ok: true, source: "tavily", ping: true, enabled: USE_TAVILY });
    }
    if (!USE_TAVILY) return NextResponse.json({ ok: false, error: "Tavily disabled" }, { status: 200 });
    if (!TAVILY_API_KEY) return NextResponse.json({ ok: false, error: "Missing TAVILY_API_KEY" }, { status: 200 });

    const q = searchParams.get("q") || "mortgage rates today";
    const search_depth = searchParams.get("depth") || "basic";
    const max_results = Number(searchParams.get("max") || 5);

    const key = `tavily:${search_depth}:${max_results}:${q}`;
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && now - hit.at < TTL_MS) {
      console.log(`[Tavily] cache hit (${search_depth}, max=${max_results})`);
      return NextResponse.json({ ok: true, data: hit.data, cached: true });
    }

    const body = {
      api_key: TAVILY_API_KEY,
      query: q,
      include_answer: true,
      search_depth,
      max_results,
    };

    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();

    cache.set(key, { at: now, data });
    console.log(`[Tavily] fetched in ${Date.now() - t0} ms`);
    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    console.log(`[Tavily] error in ${Date.now() - t0} ms: ${String(err)}`);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 200 });
  }
}
