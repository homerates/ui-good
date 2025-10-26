// app/api/tavily/route.ts
export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

type TavilyWire = {
  answer?: string;
  results?: Array<{ title?: string; url?: string; content?: string }>;
};

export async function POST(req: Request) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return json({ ok: false, error: "Missing TAVILY_API_KEY" }, 200);

  let query = "";
  let maxResults = 5;
  let searchDepth: "basic" | "advanced" = "basic";

  try {
    const bodyTxt = await req.text();
    if (bodyTxt) {
      const body = JSON.parse(bodyTxt) as Record<string, unknown>;
      const q = body?.query;
      if (typeof q === "string") query = q.trim();
      if (typeof body?.maxResults === "number" && body.maxResults > 0) {
        maxResults = Math.min(10, Math.max(1, Math.floor(body.maxResults)));
      }
      if (body?.searchDepth === "advanced" || body?.searchDepth === "basic") {
        searchDepth = body.searchDepth;
      }
    }
  } catch { /* ignore bad JSON */ }

  if (!query) return json({ ok: false, error: "Missing query" }, 400);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        include_answer: true,
        include_images: false,
        max_results: maxResults,
        search_depth: searchDepth,
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(t);

    const wire = (await res.json().catch(() => ({}))) as TavilyWire;

    const results = (wire.results ?? [])
      .filter((r) => r?.title && r?.url)
      .map((r) => ({ title: r.title as string, url: r.url as string, content: r.content }));

    return json({ ok: res.ok, answer: wire.answer ?? null, results }, 200);
  } catch (e: unknown) {
    clearTimeout(t);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, 200);
  }
}

export async function GET() {
  return json({ ok: true, expects: "POST { query }" }, 200);
}
