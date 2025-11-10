// ==== CLEAN ESLINT VERSION: app/api/answers/route.ts ====
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

const ALLOW_WEB = process.env.ALLOW_WEB === "1";
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";

/* ===== Types ===== */
type TavilyResult = { title: string; url: string; content?: string };
type TavilyMini = { ok: boolean; answer: string | null; results: TavilyResult[] };

/* ===== Type Guards ===== */
function isTavilyResultArray(v: unknown): v is TavilyResult[] {
  return (
    Array.isArray(v) &&
    v.every((r) => {
      if (!r || typeof r !== "object") return false;
      const obj = r as Record<string, unknown>;
      return (
        typeof obj.title === "string" &&
        typeof obj.url === "string"
      );
    })
  );
}

function isTavilyMini(v: unknown): v is TavilyMini {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.ok === "boolean" &&
    (obj.answer === null || typeof obj.answer === "string") &&
    isTavilyResultArray(obj.results)
  );
}

/* ===== Helpers ===== */
function firstParagraph(s: string, max = 800) {
  return (s.split(/\n+/)[0]?.trim() ?? "").slice(0, max);
}
function bulletsFrom(text: string, max = 4): string[] {
  const raw = text
    .split(/(?:\n+|(?<=\.)\s+)/)
    .map((s) => s.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw) {
    const key = line.toLowerCase();
    if (!seen.has(key)) {
      out.push(line);
      seen.add(key);
    }
    if (out.length >= max) break;
  }
  return out;
}

/* ===== Topic handling ===== */
type Topic =
  | "pmi"
  | "rates"
  | "fha"
  | "va"
  | "dp"
  | "dpa"
  | "jumbo"
  | "dscr"
  | "general";

function topicFromQuestion(q: string): Topic {
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

function followUpFor(topic: Topic): string {
  switch (topic) {
    case "pmi":
      return "Want me to estimate PMI based on your down payment and credit tier, or compare lender-paid vs borrower-paid?";
    case "rates":
      return "Should I watch today’s rate moves and notify you if pricing meaningfully improves?";
    case "fha":
      return "Do you want a 5-year cost comparison of FHA vs. Conventional at your down payment and credit score?";
    case "va":
      return "Should I calculate your VA funding fee for first vs subsequent use across down-payment tiers?";
    case "dp":
      return "Want me to show how +5% down changes payment and the breakeven versus buying points?";
    case "dpa":
      return "Do you want a shortlist of active DPA options in your county with income/credit thresholds?";
    case "jumbo":
      return "Should I check current jumbo LTV, DTI, and reserve requirements for your target price and credit tier?";
    case "dscr":
      return "Want me to model DSCR and max loan using typical market rents for your target ZIP?";
    default:
      return "Should I tailor this to your county, credit range, and target timeline?";
  }
}

/* ===== Guarded Tavily lookup ===== */
async function askTavily(
  req: NextRequest,
  query: string,
  opts?: { depth?: "basic" | "advanced"; max?: number }
): Promise<TavilyMini> {
  if (!ALLOW_WEB || !TAVILY_API_KEY) {
    return { ok: false, answer: null, results: [] };
  }

  const url = new URL("/api/tavily", req.url);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query,
      searchDepth: opts?.depth ?? "basic",
      maxResults: typeof opts?.max === "number" ? opts.max : 5,
    }),
    cache: "no-store",
  });

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* ignore */
  }

  if (isTavilyMini(parsed)) return parsed;

  const obj = (parsed ?? {}) as Record<string, unknown>;
  const ok = !!obj.ok;
  const answer =
    typeof obj.answer === "string" ? (obj.answer as string) : null;
  const results = isTavilyResultArray(obj.results) ? obj.results : [];

  return { ok, answer, results };
}

/* ===== Core handler ===== */
async function handle(req: NextRequest, intentParam?: string) {
  type Body = { question?: string; intent?: string; mode?: "borrower" | "public" };
  const generatedAt = new Date().toISOString();
  const path = "web";
  const tag = "tavily-v2";

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

  if (!question) {
    const followUp =
      "Ask a specific mortgage question (e.g., PMI at 5% down or today’s rate drivers) and I’ll tailor it. Sources included when web lookups are on.";
    return noStore({
      ok: true,
      route: "answers",
      intent,
      path,
      tag,
      generatedAt,
      usedFRED: false,
      usedTavily: Boolean(process.env.TAVILY_API_KEY),
      message: followUp,
      answerMarkdown: "",
      sources: [],
      followUp,
      follow_up: followUp,
      cta: followUp,
      suggest: [
        "Explain PMI for a Conventional loan with 5% down and ~720 credit in California.",
        "Are 30-year fixed rates trending up this week? Cite two sources.",
        "What down-payment help is active in Los Angeles County for ~680 credit?",
      ],
    });
  }

  let tav = await askTavily(req, question, { depth: "basic", max: 6 });
  if ((!tav.answer || tav.answer.trim().length < 80) && tav.results.length < 2) {
    tav = await askTavily(req, question, { depth: "advanced", max: 8 });
  }

  const usedTavily = tav.ok && (tav.answer !== null || tav.results.length > 0);

  if (!tav.answer && tav.results.length === 0 && ALLOW_WEB) {
    const topic = topicFromQuestion(question);
    const followUp = followUpFor(topic);
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
      followUp,
      follow_up: followUp,
      cta: followUp,
      suggest: [
        "Compare FHA vs Conventional at 3–5% down and ~700 credit—5-year total cost.",
        "What affects PMI the most: down %, credit, or occupancy?",
        "Summarize this week’s mortgage-rate drivers with 2–3 citations.",
      ],
      needs: ["product", "downPercent", "creditTier", "location"],
    });
  }

  let base =
    (tav.answer ?? "") ||
    (tav.results.find((r) => typeof r.content === "string")?.content?.trim() ?? "");

  if (!base) {
    base =
      "Mortgage pricing generally follows the 10-year Treasury plus risk spreads (credit, liquidity, convexity). " +
      "Spreads widen with volatility/risk aversion and compress when markets stabilize. " +
      "Watch CPI/PCE, jobs, and Fed guidance that shifts rate expectations.";
  }

  const intro = firstParagraph(base, 800);
  const bullets = bulletsFrom(base, 4);
  const topSources = (tav.results || []).slice(0, 3).map((s) => ({
    title: s.title,
    url: s.url,
  }));
  const sourcesMd = topSources.map((s) => `- [${s.title}](${s.url})`).join("\n");

  const answerMarkdown = [
    intro,
    bullets.length ? bullets.map((b) => `- ${b}`).join("\n") : "",
    topSources.length ? `\n**Sources**\n${sourcesMd}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const legacyAnswer = [
    intro,
    bullets.length ? bullets.map((b) => `- ${b}`).join("\n") : "",
    topSources.length
      ? `Sources:\n${topSources
        .map((s) => `- ${s.title} — ${s.url}`)
        .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const topic = topicFromQuestion(question);
  const followUp = followUpFor(topic);

  return noStore({
    ok: true,
    route: "answers",
    intent,
    path,
    tag,
    generatedAt,
    usedFRED: false,
    usedTavily,
    answerMarkdown,
    sources: topSources,
    followUp,
    follow_up: followUp,
    cta: followUp,
    message: legacyAnswer,
    answer: legacyAnswer,
    suggest: [
      "Explain PMI for a Conventional loan with 5% down and ~720 credit in California.",
      "Are 30-year fixed rates trending up this week? Cite two sources.",
      "What down-payment help is active in Los Angeles County for ~680 credit?",
    ],
  });
}

/* ===== Entry points ===== */
export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  const intent = (req.nextUrl.searchParams.get("intent") ?? "").trim();
  return handle(req, intent);
}
