const TAVILY_API_URL = "https://api.tavily.com/search";
export async function tavilyNews(query: string, { days = 7, limit = 5 } = {}) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("Missing TAVILY_API_KEY");
  const res = await fetch(TAVILY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: Bearer \ },
    body: JSON.stringify({ query, days, limit }),
    next: { revalidate: 900 }
  });
  if (!res.ok) throw new Error(Tavily error: \);
  const json = await res.json();
  return json?.results ?? [];
}
