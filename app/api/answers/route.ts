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

type TavilyResult = { title: string; url: string; content?: string };
type TavilyMini = { ok: boolean; answer: string | null; results: TavilyResult[] };

function isTavilyResultArray(v: unknown): v is TavilyResult[] {
  return Array.isArray(v) && v.every(
    (r) => r && typeof r === "object" && "title" in r && typeof (r as any).title === "string" &&
      "url" in r && typeof (r as any).url === "string"
  );
}
function isTavilyMini(v: unknown): v is TavilyMini {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.ok === "boolean" &&
    (o.answer === null || typeof o.answer === "string") &&
    isTavilyResultArray(o.results);
}

function firstParagraph(s: string, max = 800) {
  return (s.split(/\n+/)[0]?.trim() ?? "").slice(0, max);
}
function bulletsFrom(text: string, max = 4): string[] {
  const raw = text.split(/(?:\n+|(?<=\.)\s+)/)
    .map((s) => s.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean);
  const seen = new Set<string>(); const out: string[] = [];
  for (const line of raw) { const k = line.toLowerCase(); if (!seen.has(k)) { out.push(line); seen.add(k); } if (out.length >= max) break; }
  return out;
}
function topicFromQuestion(q: string): "pmi" | "rates" | "fha" | "va" | "dp" | "dpa" | "jumbo" | "dscr" | "general" {
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
    case "pmi": return "Want me to estimate PMI based on your down payment and credit tier, or compare lender-paid vs borrower-paid?";
    case "rates": return "Should I watch today’s rate moves and notify you if pricing meaningfully improves?";
    case "fha": return "Do you want a 5-year cost comparison of FHA vs. Conventional at your down payment and credit score?";
    case "va": return "Should I calculate your VA funding fee for first vs subsequent use across down-payment tiers?";
    case "dp": return "Want me to show how +5% down changes payment and the breakeven versus buying points?";
    case "dpa": return "Do you want a shortlist of active DPA options in your county with income/credit thresholds?";
    case "jumbo": return "Should I check current jumbo LTV, DTI, and reserve requirements for your target price and credit tier?";
    case "dscr": return "Want me to model DSCR and max loan using typical market rents for your target ZIP?";
    default: return "Should I tailor this to your county, credit range, and target timeline?";
  }
}

async function askTavily(req: NextRequest, query: string, opts?: { depth?: "basic" | "advanced"; max?: number }): Promise<TavilyMini> {
  const url = new URL("/api/tavily", req.url);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, searchDepth: opts?.depth ?? "basic", maxResults: typeof opts?.max === "number" ? opts!.max : 5 }),
    cache: "no-store",
  });
  let parsed: unknown = null; try { parsed = await res.json(); } catch { }
  if (isTavilyMini(parsed)) return parsed;
  const ok = !!(parsed && typeof parsed === "object" && (parsed as any).ok);
  const answerRaw = parsed && typeof parsed === "object" ? (parsed as any).answer : null;
  const answer = typeof answerRaw === "string" ? answerRaw : null;
  const resultsRaw = parsed && typeof parsed === "object" ? (parsed as any).results : null;
  const results = isTavilyResultArray(resultsRaw) ? resultsRaw : [];
  return { ok, answer, results };
}

async function handle(req: NextRequest, intentParam?: string) {
  type Body = { question?: string; intent?: string; mode?: "borrower" | "public" };
  const generatedAt = new Date().toISOString();
  const path = "web"; const tag = "tavily-v2";

  let body: Body = {};
  if (req.method === "POST") { try { body = (await req.json()) as Body; } catch { body = {}; } }
  const question = (req.nextUrl.searchParams.get("q") || body.question || "").trim();
  const intent = (intentParam || body.intent || "web").trim() || "web";

  if (!question) {
    const followUp = "Do you want examples like PMI, FHA vs Conventional, or current rate trends?";
    return noStore({
      ok: true, route: "answers", intent, path, tag, generatedAt,
      usedFRED: false, usedTavily: Boolean(process.env.TAVILY_API_KEY),
      message: "Ask something specific and I’ll answer with sourced details.",
      answerMarkdown: "", sources: [],
      followUp, follow_up: followUp, cta: followUp,
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

  if (!tav.answer && tav.results.length === 0) {
    const topic = topicFromQuestion(question); const followUp = followUpFor(topic);
    return noStore({
      ok: true, route: "answers", intent, path, tag, generatedAt,
      usedFRED: false, usedTavily: false,
      message: "I can help—add one or two specifics and you’ll get a sharper answer.",
      answerMarkdown: "", sources: [],
      followUp, follow_up: followUp, cta: followUp,
      suggest: [
        "Compare FHA vs Conventional at 3–5% down and ~700 credit—5-year total cost.",
        "What affects PMI the most: down %, credit, or occupancy?",
        "Summarize this week’s mortgage-rate drivers with 2–3 citations.",
      ],
      needs: ["product", "downPercent", "creditTier", "location"],
    });
  }

  const base = (tav.answer ?? "") || (tav.results.find((r) => typeof r.content === "string")?.content?.trim() ?? "");
  const intro = firstParagraph(base, 800);
  const bullets = bulletsFrom(base, 4);
  const topSources = (tav.results || []).slice(0, 3).map((s) => ({ title: s.title, url: s.url }));
  const sourcesMd = topSources.map((s) => `- [${s.title}](${s.url})`).join("\n");

  const answerMarkdown = [intro, bullets.length ? bullets.map((b) => `- ${b}`).join("\n") : "", topSources.length ? `\n**Sources**\n${sourcesMd}` : ""]
    .filter(Boolean).join("\n\n");

  const legacyAnswer = [
    intro,
    bullets.length ? bullets.map((b) => `- ${b}`).join("\n") : "",
    topSources.length ? `Sources:\n${topSources.map((s) => `- ${s.title} — ${s.url}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");

  const topic = topicFromQuestion(question); const followUp = followUpFor(topic);

  return noStore({
    ok: true, route: "answers", intent, path, tag, generatedAt,
    usedFRED: false, usedTavily,
    answerMarkdown, sources: topSources,
    followUp, follow_up: followUp, cta: followUp,   // ← aliases for safety
    message: legacyAnswer, answer: legacyAnswer,
    suggest: [
      "Explain PMI for a Conventional loan with 5% down and ~720 credit in California.",
      "Are 30-year fixed rates trending up this week? Cite two sources.",
      "What down-payment help is active in Los Angeles County for ~680 credit?",
    ],
  });
}

export async function POST(req: NextRequest) { return handle(req); }
export async function GET(req: NextRequest) {
  const intent = (req.nextUrl.searchParams.get("intent") ?? "").trim();
  return handle(req, intent);
}
