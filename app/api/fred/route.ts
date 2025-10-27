// app/api/answers/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

function noStore(json: unknown, status = 200) {
  const res = NextResponse.json(json, { status });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function bulletsFrom(text: string): string[] {
  const sents = text.split(/(?<=\.)\s+/).map(s => s.trim()).filter(Boolean);
  return sents.slice(0, 3).map(s => s.replace(/^[-•]\s*/, "").trim());
}

async function askTavily(req: NextRequest, query: string) {
  // Call your internal /api/tavily so the key stays server-side
  const url = new URL("/api/tavily", req.url);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
    cache: "no-store",
  });

  const json = await res.json().catch(() => ({}));
  const results = Array.isArray(json?.data?.results) ? json.data.results : [];
  return {
    ok: Boolean(json?.ok),
    results: results as Array<{ title: string; url: string; content?: string }>,
  };
}

async function handle(req: NextRequest, intentParam?: string) {
  // Parse input
  type Body = { question?: string; intent?: string; mode?: "borrower"|"public"; loanAmount?: number };
  const generatedAt = new Date().toISOString();
  const path = "web";
  const tag = "tavily-v1";

  let body: Body = {};
  if (req.method === "POST") {
    body = (await req.json().catch(() => ({} as Body))) as Body;
  }
  const question = (req.nextUrl.searchParams.get("q") || body.question || "").trim();
  const intent = (intentParam || body.intent || "web").trim() || "web";

  if (!question) {
    return noStore({
      ok: true,
      route: "answers",
      intent,
      path,
      tag,
      generatedAt,
      usedFRED: false,
      usedTavily: Boolean(process.env.TAVILY_API_KEY),
      message: "Ask something specific (e.g., “Explain PMI at 5% down” or “Are rates trending up this week?”).",
      tldr: [
        "We’ll pull fresh, sourced info from the web.",
        "Add details like loan type, down payment, or timeline for sharper answers.",
      ],
      answer: "",
      sources: [],
    });
  }

  // Query Tavily via your internal route
  const tav = await askTavily(req, question);
  const hasSources = tav.results.length > 0;

  // Build a concise message + bullets
  const firstContent =
    tav.results.find(r => r.content)?.content?.trim() ||
    `Here’s what we found on “${question}”.`;

  const message = firstContent.split(/\n+/)[0].slice(0, 500); // keep tight
  const tldr = bulletsFrom(firstContent);

  // Add sources as "- " lines so your UI bullets render them
  const sources = tav.results.slice(0, 5).map(s => `- ${s.title} — ${s.url}`);

  const answerLines = [message, sources.length ? "Sources:" : "", ...sources].filter(Boolean);

  return noStore({
    ok: true,
    route: "answers",
    intent,
    path,
    tag,
    generatedAt,
    usedFRED: false,
    usedTavily: hasSources,
    message,
    tldr,
    answer: answerLines.join("\n"),
    // keep "market" omitted while FRED is paused
  });
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  const intent = (req.nextUrl.searchParams.get("intent") ?? "").trim();
  return handle(req, intent);
}
