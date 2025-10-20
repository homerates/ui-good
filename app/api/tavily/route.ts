// app/api/tavily/route.ts
export const runtime = 'nodejs';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

type TavilySearchResult = {
  query: string;
  results?: Array<{ title: string; url: string; content?: string }>;
};

export async function POST(req: Request) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return json({ ok: false, error: 'Missing TAVILY_API_KEY' }, 200);

  let query = '';
  try {
    const bodyTxt = await req.text();
    const body = bodyTxt ? (JSON.parse(bodyTxt) as unknown) : {};
    if (typeof body === 'object' && body && 'query' in body) {
      const q = (body as Record<string, unknown>).query;
      if (typeof q === 'string') query = q.trim();
    }
  } catch {
    /* ignore */
  }

  if (!query) return json({ ok: false, error: 'Missing query' }, 400);

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
      body: JSON.stringify({ query, include_answer: false, max_results: 3 }),
    });
    const data = (await res.json()) as TavilySearchResult;
    return json({ ok: res.ok, data }, 200);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, 200);
  }
}

export async function GET() {
  return json({ ok: true, expects: 'POST { query }' });
}

