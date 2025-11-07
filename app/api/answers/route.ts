// app/api/answers/route.ts
// ==== FULL FILE REPLACEMENT (BEGIN) ====

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

/* --------------------------------
   Cache control helper
--------------------------------- */
function noStore(json: unknown, status = 200) {
  const res = NextResponse.json(json, { status });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

/* --------------------------------
   Types for Tavily passthrough
--------------------------------- */
type TavilyResult = { title: string; url: string; content?: string };
type TavilyMini = { ok: boolean; answer: string | null; results: TavilyResult[] };

function isTavilyResultArray(v: unknown): v is TavilyResult[] {
  return (
    Array.isArray(v) &&
    v.every(
      (r) =>
        r &&
        typeof r === "object" &&
        "title" in r &&
        typeof (r as { title: unknown }).title === "string" &&
        "url" in r &&
        typeof (r as { url: unknown }).url === "string"
    )
  );
}

function isTavilyMini(v: unknown): v is TavilyMini {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const ok = typeof o.ok === "boolean";
  const answer = o.answer === null || typeof o.answer === "string";
  const results = isTavilyResultArray(o.results);
  return ok && answer && results;
}

/* --------------------------------
   Text helpers
--------------------------------- */
function firstParagraph(s: string, max = 800) {
  const para = s.split(/\n+/)[0]?.trim() ?? "";
  return para.slice(0, max);
}

function bulletsFrom(text: string, max = 4): string[] {
  const raw = text
    .split(/(?:\n+|(?<=\.)\s+)/)
    .map((s) => s.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const picks: string[] = [];
  for (const line of raw) {
    const key = line.toLowerCase();
    if (!seen.has(key)) {
      picks.push(line);
      seen.add(key);
    }
    if (picks.length >= max) break;
  }
  return picks;
}

function topicFromQuestion(q: string):
  | "pmi" | "rates" | "fha" | "va" | "dp" | "dpa" | "jumbo" | "dscr" | "general" {
  const s = q.toLowerCase();
  if (/\bpmi\b|mortgage insurance/.test(s)) return "pmi";
  if (/\brates?\b|treasury|mbs|10[-\s]?year/.test(s)) return "rates";
  if (/\bfha\b/.test(s)) return "fha";
  if (/\bva\b/.test(s)) return "va";
  if (/\bdown[-\s]?payment|\b% down\b/.test(s)) return "dp";
  if (/\bdpa\b|down payment assistance/.test(s)) return "dpa";
  if (/\bjumbo\b/.test(s)) return "jumbo";
  if (/\bdscr\b/.test(s)) return "dscr";
  return "general";
}

function followUpFor(topic: ReturnType<typeof topicFromQuestion>): string {
  switch (topic) {
    case "pmi":
      return "Want me to estimate PMI based on your down payment and credit tier, or compare lender-paid vs borrower-paid options?";
    case "rates":
      return "Should I track today’s rate moves and message you if pricing improves by a meaningful amount?";
    case "fha":
      return "Do you want a 5-year cost comparison of FHA vs. Conventional at your down payment and credit score?";
    case "va":
      return "Should I calculate your VA funding fee for first use vs subsequent use and different down-payment tiers?";
    case "dp":
      return "Want me to show how an extra 5% down changes monthly payment and break-even versus buying points?";
    case "dpa":
      return "Do you want a shortlist of active DPA options in your county with income and credit thresholds?";
    case "jumbo":
      return "Should I check current jumbo LTV and reserve requirements for your target price and credit tier?";
    case "dscr":
      return "Want me to model DSCR ratio and max loan using typical market rents for your target ZIP?";
    default:
      return "Should I tailor this to your county, credit score range, and timeline to close?";
  }
}

/* --------------------------------
   Tavily proxy
--------------------------------- */
async function askTavily(
  req: NextRequest,
  query: string,
  opts?: { depth?: "basic" | "advanced"; max?: number }
): Promise<TavilyMini> {
  const url = new URL("/api/tavily", req.url);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query,
      searchDepth: opts?.depth ?? "basic",
      maxResults: typeof opts?.max === "number" ? opts!.max : 5,
    }),
    cache: "no-store",
  });

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    // ignore parse errors
  }

  if (isTavilyMini(parsed)) return parsed;

  // Best-effort coercion from older shapes
  const ok = !!(parsed && typeof parsed === "object" && (parsed as Record<string, unknown>).ok);
  const answerRaw = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).answer : null;
  const answer = typeof answerRaw === "string" ? answerRaw : null;
  const resultsRaw = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).results : null;
  const results = isTavilyResultArray(resultsRaw) ? resultsRaw : [];
  return { ok, answer, results };
}

/* --------------------------------
   Main handler
--------------------------------- */
async function handle(req: NextRequest, intentParam?: string) {
  type Body = { question?: string; intent?: string; mode?: "borrower" | "public" };
  const generatedAt = new Date().toISOString();
  const path = "web";
  const tag = "tavily-v2";

  // Parse inputs
  let body: Body = {};
  if (req.method === "POST") {
    try {
      body = (await req.json()) as Body;
    } catch {
      body = {};
    }
  }
  const question = (req.nextUrl.searchParams.get("q") || body.question || "").trim();
  const intent = (intentParam || body.intent || "web").trim() || "web";

  // Empty question → gentle prompt with suggestions
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
      message: "Ask something specific and I’ll answer with sourced details.",
      answerMarkdown: "",
      sources: [],
      followUp: "Do you want examples like PMI, FHA vs Conventional, or current rate trends?",
      suggest: [
        "Explain PMI for a Conventional loan with 5% down and ~720 credit in California.",
        "Are 30-year fixed rates trending up this week? Cite two sources.",
        "What down-payment help is active in Los Angeles County for ~680 credit?",
      ],
    });
  }

  // First pass search
  let tav = await askTavily(req, question, { depth: "basic", max: 6 });

  // Deepen if weak
  if ((!tav.answer || tav.answer.trim().length < 80) && tav.results.length < 2) {
    tav = await askTavily(req, question, { depth: "advanced", max: 8 });
  }

  const usedTavily = tav.ok && (tav.answer !== null || tav.results.length > 0);

  // If still nothing useful, return rephrase helpers with follow-up
  if (!tav.answer && tav.results.length === 0) {
    const topic = topicFromQuestion(question);
    return noStore({
      ok: true,
      route: "answers",
      intent,
      path,
      tag,
      generatedAt,
      usedFRED: false,
      usedTavily: false,
      message: "I can help—add one or two specifics and you’ll get a sharper answer.",
      answerMarkdown: "",
      sources: [],
      followUp: followUpFor(topic),
      suggest: [
        "Compare FHA vs Conventional at 3–5% down and ~700 credit—5-year total cost.",
        "What affects PMI the most: down %, credit, or occupancy?",
        "Summarize this week’s mortgage-rate drivers with 2–3 citations.",
      ],
      needs: ["product", "downPercent", "creditTier", "location"],
    });
  }

  // Build answer (intro + bullets)
  const base =
    (tav.answer ?? "") ||
    (tav.results.find((r) => typeof r.content === "string")?.content?.trim() ?? "");

  const intro = firstParagraph(base, 800);
  const bullets = bulletsFrom(base, 4);

  // Map sources (max 3) to {title,url}
  const topSources = (tav.results || []).slice(0, 3).map((s) => ({
    title: s.title,
    url: s.url,
  }));

  const sourcesMd = topSources.map((s) => `- [${s.title}](${s.url})`).join("\n");

  // Compose markdown answer body with a "Sources" section
  const answerMarkdown = [
    intro,
    bullets.length ? bullets.map((b) => `- ${b}`).join("\n") : "",
    topSources.length ? `\n**Sources**\n${sourcesMd}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // --- Back-compat shims for existing UI ---
  // Build a plain-text version that older UI paths can show immediately,
  // including a simple "Sources:" section with visible links.
  const legacyAnswer = [
    intro,
    bullets.length ? bullets.map((b) => `- ${b}`).join("\n") : "",
    topSources.length
      ? `Sources:\n${topSources.map((s) => `- ${s.title} — ${s.url}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const topic = topicFromQuestion(question);

  // Return with both modern and legacy fields
  return noStore({
    ok: true,
    route: "answers",
    intent,
    path,
    tag,
    generatedAt,
    usedFRED: false,
    usedTavily,

    // New fields for modern UI
    answerMarkdown,
    sources: topSources, // [{ title, url }]
    followUp: followUpFor(topic),

    // Legacy fields so current UI shows full content (no truncation)
    message: legacyAnswer,
    answer: legacyAnswer,

    // Optional: suggestions; UI may ignore
    suggest: [
      "Explain PMI for a Conventional loan with 5% down and ~720 credit in California.",
      "Are 30-year fixed rates trending up this week? Cite two sources.",
      "What down-payment help is active in Los Angeles County for ~680 credit?",
    ],
  });
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  const intent = (req.nextUrl.searchParams.get("intent") ?? "").trim();
  return handle(req, intent);
}

// ==== FULL FILE REPLACEMENT (END) ====
