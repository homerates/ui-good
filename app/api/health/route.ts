// app/api/health/route.ts
export const runtime = 'nodejs';

import { getFredCacheInfo, warmFredCache } from "@/lib/fred";
import { VERSION, COMMIT } from "@/lib/version";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
    },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const deep = url.searchParams.get("deep") === "1";

  const env = {
    dynamicEnabled: process.env.DYNAMIC_ENABLED === "true",
    hasOpenAIKey: !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 20,
    hasFredKey: !!process.env.FRED_API_KEY,
  };

  const fred = getFredCacheInfo();

  let status: "green" | "yellow" | "red" = "green";
  if (!env.hasOpenAIKey || !env.hasFredKey) status = "yellow";
  if (!env.dynamicEnabled && !env.hasFredKey) status = "yellow";
  if (!env.dynamicEnabled && !env.hasOpenAIKey && !env.hasFredKey) status = "red";

  const base = {
    ok: status === "green",
    status,
    version: VERSION,
    commit: COMMIT,
    node: process.version,
    uptimeSec: Math.round(process.uptime()),
    env,
    fredCache: {
      cached: fred.cached,
      ageMs: fred.ageMs,
      asOf: fred.asOf,
      source: fred.source,
    },
    hints: ["Add ?deep=1 to run connectivity checks (costs a tiny LLM request)."]
  };

  if (!deep) return json(base);

  // Deep checks (best-effort)
  const results: Record<string, unknown> = {};

  const fredStart = Date.now();
  try {
    await warmFredCache(1500);
    results.fred = { ok: true, durMs: Date.now() - fredStart };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    results.fred = { ok: false, error: msg, durMs: Date.now() - fredStart };
    status = "yellow";
  }

  const llmStart = Date.now();
  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Missing OPENAI_API_KEY");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 4,
        messages: [
          { role: "system", content: "Reply with the single word: pong" },
          { role: "user", content: "ping" }
        ]
      })
    });
    const txt = await res.text();
    results.llm = { ok: res.ok, status: res.status, body: txt.slice(0, 120), durMs: Date.now() - llmStart };
    if (!res.ok) status = "yellow";
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    results.llm = { ok: false, error: msg.slice(0, 200), durMs: Date.now() - llmStart };
    status = "yellow";
  }

  return json({ ...base, status, deep: results });
}
