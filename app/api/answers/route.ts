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

async function askTavily(req: NextRequest, query: string, opts?: { depth?: "basic"|"advanced"; max?: number }): Promise<TavilyMini> {
  const url = new URL("/api/tavily", req.url);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query,
      searchDepth: opts?.depth ?? "basic",
      maxResults: opts?.max ?? 5,
    }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Partial<TavilyMini>;
  return {
    ok: Boolean((data as any)?.ok),
    answer: typeof data?.answer === "string" ? data!.answer : null,
    results: Array.isArray((data as any)?.results) ? ((data as any).results as TavilyMini["results"]) : [],
  };
}

async function handle(req: NextRequest, intentParam?: string) {
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
      ok: true, route: "answers", intent, path, tag, generatedAt,
      usedFRED: false, usedTavily: Boolean(process.env.TAVILY_API_KEY),
      message: "Ask something specific (e.g., “Explain PMI for 5% down” or “Are rates trending up this week?”).",
      tldr: ["We’ll pull fresh, sourced info from the web.", "Add loan type, down payment, or timeline for sharper answers."],
      answer: "", sources: [],
    });
  }

  // First pass (basic)
  let tav = await askTavily(req, question, { depth: "basic", max: 5 });

  // Retry with deeper search if no direct answer
  if (!tav.answer && tav.results.length < 2) {
    tav = await askTavily(req, question, { depth: "advanced", max: 8 });
  }

  const usedTavily = tav.ok && (tav.answer || tav.results.length > 0);

  // If still nothing useful, give a helpful nudge
  if (!tav.answer && tav.results.length === 0) {
    const msg = `I couldn’t find a clear answer for “${question}.” Try specifying program (Conventional/FHA/VA), down %, or timeframe.`;
    return noStore({
      ok: true, route: "answers", intent, path, tag, generatedAt,
      usedFRED: false, usedTavily: false,
      message: msg,
      tldr: [
        "Name the product (Conventional/FHA/VA/USDA)",
        "Add down % and credit tier if you know them",
        "Add state or county if it matters (limits, MI rules)",
      ],
      answer: "",
    });
  }

  // Build message from Tavily answer or best snippet
  const baseText =
    tav.answer?.trim() ||
    tav.results.find((r) => r.content)?.content?.trim() ||
    `Here’s what we found for “${question}”.`;

  const message = baseText.split(/\n+/)[0].slice(0, 600);
  const tldr = bulletsFrom(baseText);

  const sources = tav.results.slice(0, 5).map((s) => `- ${s.title} — ${s.url}`);
  const answerLines = [message, sources.length ? "Sources:" : "", ...sources].filter(Boolean);

  return noStore({
    ok: true, route: "answers", intent, path, tag, generatedAt,
    usedFRED: false, usedTavily,
    message,
    tldr,
    answer: answerLines.join("\n"),
  });
}

export async function POST(req: NextRequest) { return handle(req); }
export async function GET(req: NextRequest)  { return handle(req, (req.nextUrl.searchParams.get("intent") ?? "").trim()); }
