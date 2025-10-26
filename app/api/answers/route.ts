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

type TavilyMini = {
  ok: boolean;
  answer: string | null;
  results: Array<{ title: string; url: string; content?: string }>;
};

function bulletsFrom(text: string): string[] {
  const sents = text.split(/(?<=\.)\s+/).map((s) => s.trim()).filter(Boolean);
  return sents.slice(0, 3).map((s) => s.replace(/^[-•]\s*/, "").trim());
}

async function askTavily(req: NextRequest, query: string): Promise<TavilyMini> {
  // Call our internal /api/tavily so the API key stays server-side
  const url = new URL("/api/tavily", req.url);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Partial<TavilyMini>;
  return {
    ok: Boolean(data?.ok),
    answer: typeof data?.answer === "string" ? data!.answer : null,
    results: Array.isArray(data?.results) ? (data!.results as TavilyMini["results"]) : [],
  };
}

async function handle(req: NextRequest, intentParam?: string) {
  type Body = { question?: string; intent?: string; mode?: "borrower" | "public"; loanAmount?: number };

  const generatedAt = new Date().toISOString();
  const path = "web";
  const tag = "tavily-v1";

  // Parse inputs
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
      message: "Ask a specific question (e.g., “Are mortgage rates trending up this week?” or “Explain PMI for 5% down”).",
      tldr: [
        "We’ll pull fresh, sourced info from the web.",
        "Add details like loan type, down payment, or timeline.",
      ],
      answer: "",
      sources: [],
    });
  }

  // Query Tavily
  const tav = await askTavily(req, question);
  const usedTavily = tav.ok && (tav.answer || tav.results.length > 0);

  const fallbackText =
    tav.results.find((r) => r.content)?.content?.trim() ||
    `Here’s what we found for “${question}”.`;

  const message = (tav.answer ?? fallbackText).split(/\n+/)[0].slice(0, 600);
  const tldr = bulletsFrom(tav.answer ?? fallbackText);

  // Render sources as "- " lines so your UI treats them as bullets
  const sources = tav.results.slice(0, 5).map((s) => `- ${s.title} — ${s.url}`);
  const answerLines = [message, sources.length ? "Sources:" : "", ...sources].filter(Boolean);

  return noStore({
    ok: true,
    route: "answers",
    intent,
    path,
    tag,
    generatedAt,
    usedFRED: false,
    usedTavily,
    message,
    tldr,
    answer: answerLines.join("\n"),
  });
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  const intent = (req.nextUrl.searchParams.get("intent") ?? "").trim();
  return handle(req, intent);
}
