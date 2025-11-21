// ==== RESTORED WEB-FIRST + GROK v3 + SUPABASE: app/api/answers/route.ts ====
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ---------- noStore helper ----------
function noStore(json: unknown, status = 200) {
  const res = NextResponse.json(json, { status });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

// ---------- Env ----------
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";
const FRED_API_KEY = process.env.FRED_API_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

// Supabase (service-side client; used for user_answers memory)
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
    : null;

/* ===== Types ===== */
type TavilyResult = {
  title: string;
  url: string;
  content?: string;
  snippet?: string; // allow snippet if present
};
type TavilyMini = { ok: boolean; answer: string | null; results: TavilyResult[] };

function isTavilyResultArray(v: unknown): v is TavilyResult[] {
  return (
    Array.isArray(v) &&
    v.every((r) => {
      if (!r || typeof r !== "object") return false;
      const obj = r as Record<string, unknown>;
      return typeof obj.title === "string" && typeof obj.url === "string";
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
    .map((t) => t.replace(/^[-•]\s*/, "").trim())
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
  if (/\brates?\b|treasury|mbs|10[-\s]?year|10y\b/.test(s)) return "rates";
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

/* ===== Web lookup (Tavily proxy route) ===== */
async function askTavily(
  req: NextRequest,
  query: string,
  opts?: { depth?: "basic" | "advanced"; max?: number }
): Promise<TavilyMini> {
  if (!TAVILY_API_KEY) return { ok: false, answer: null, results: [] };

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
  const answer = typeof obj.answer === "string" ? (obj.answer as string) : null;
  const results = isTavilyResultArray(obj.results) ? obj.results : [];
  return { ok, answer, results };
}

/* ===== FRED snapshot (for rate questions) ===== */
type FredSnap = {
  tenYearYield: number | null;
  mort30Avg: number | null;
  spread: number | null;
  asOf: string | null;
};

async function getFredSnapshot(): Promise<FredSnap> {
  if (!FRED_API_KEY) {
    return { tenYearYield: null, mort30Avg: null, spread: null, asOf: null };
  }

  const [dgs10, m30] = await Promise.all([
    fetch(
      `https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`,
      { cache: "no-store" }
    )
      .then((r) => r.json())
      .catch(() => null),
    fetch(
      `https://api.stlouisfed.org/fred/series/observations?series_id=MORTGAGE30US&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`,
      { cache: "no-store" }
    )
      .then((r) => r.json())
      .catch(() => null),
  ]);

  const d = (dgs10?.observations?.[0]?.value ?? null) as string | null;
  const m = (m30?.observations?.[0]?.value ?? null) as string | null;
  const asOf = (m30?.observations?.[0]?.date ??
    dgs10?.observations?.[0]?.date ??
    null) as string | null;

  const tenYearYield = d && d !== "." ? Number(d) : null;
  const mort30Avg = m && m !== "." ? Number(m) : null;
  const spread =
    tenYearYield != null && mort30Avg != null
      ? Number((mort30Avg - tenYearYield).toFixed(2))
      : null;

  return { tenYearYield, mort30Avg, spread, asOf };
}

/* ===== OpenAI summarizer for Tavily text (fallback) ===== */
async function summarizeWithOpenAI(text: string): Promise<string | null> {
  if (!OPENAI_API_KEY || !text) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Summarize clearly for a US mortgage audience. Keep it concise. Include 2–4 bullet points.",
          },
          { role: "user", content: text },
        ],
        temperature: 0.2,
        max_tokens: 300,
      }),
    });

    const json = await res.json();
    const out = json?.choices?.[0]?.message?.content;
    return typeof out === "string" ? out : null;
  } catch {
    return null;
  }
}

/* ===== Core handler ===== */
async function handle(req: NextRequest, intentParam?: string) {
  type Body = {
    question?: string;
    intent?: string;
    mode?: "borrower" | "public";
    userId?: string;
  };

  const generatedAt = new Date().toISOString();
  const path = "web";
  const tag = "answers-v2";

  let body: Body = {};
  let userId: string | undefined;

  if (req.method === "POST") {
    try {
      const raw = await req.json();
      body = raw as Body;
      userId = raw.userId;
    } catch {
      body = {};
    }
  }

  const question = (
    req.nextUrl.searchParams.get("q") ||
    body.question ||
    ""
  ).trim();
  const intent = (intentParam || body.intent || "web").trim() || "web";

  if (!question) {
    const followUp =
      "Ask a specific mortgage question (e.g., PMI at 5% down or today’s rate drivers). I’ll include sources when available.";
    return noStore({
      ok: true,
      route: "answers",
      intent,
      path,
      tag,
      generatedAt,
      usedFRED: false,
      usedTavily: Boolean(TAVILY_API_KEY),
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

  // 1) Web-first via Tavily
  let tav = await askTavily(
    req,
    `${question} 2025 mortgage insurance -pmi.org -project -management`,
    { depth: "basic", max: 6 }
  );

  if ((!tav.answer || tav.answer.trim().length < 80) && tav.results.length < 2) {
    tav = await askTavily(
      req,
      `${question} mortgage insurance -pmi.org`,
      { depth: "advanced", max: 8 }
    );
  }

  const usedTavily = tav.ok && (tav.answer !== null || tav.results.length > 0);

  // 2) Optional FRED snapshot for rate questions
  const topic = topicFromQuestion(question);
  const wantFred = topic === "rates";
  const fred = wantFred
    ? await getFredSnapshot()
    : { tenYearYield: null, mort30Avg: null, spread: null, asOf: null };
  const usedFRED =
    wantFred &&
    (fred.tenYearYield !== null || fred.mort30Avg !== null);

  // 3) Build a baseline answer (legacy stack)
  let base =
    tav.answer ??
    (tav.results.find((r) => typeof r.content === "string")?.content?.trim() ??
      "");

  if (!base && tav.results.length > 0) {
    const concat = tav.results
      .map((r) => `${r.title}\n${r.content ?? ""}`)
      .join("\n\n")
      .slice(0, 8000);
    const llm = await summarizeWithOpenAI(concat);
    if (llm) base = llm;
  }

  if (!base) {
    base =
      "Here’s a concise baseline while I gather details: mortgage pricing reflects the 10-year Treasury benchmark plus risk spreads (credit/liquidity/convexity). " +
      "Spreads widen when volatility or risk aversion picks up, and compress when markets stabilize.";
  }

  const intro = firstParagraph(base, 800);
  const bullets = bulletsFrom(base, 4);

  // topSources for markdown (titles+urls only)
  const topSources = (tav.results || [])
    .slice(0, 3)
    .map((s) => ({ title: s.title, url: s.url }));

  const sourcesMd = topSources
    .map((s) => `- [${s.title}](${s.url})`)
    .join("\n");

  const fredLine = usedFRED
    ? `\n\n**FRED snapshot**: 10y=${fred.tenYearYield ?? "—"}%, 30y mtg avg=${fred.mort30Avg ?? "—"
    }%, spread=${fred.spread ?? "—"} (${fred.asOf ?? "latest"})`
    : "";

  const answerMarkdown = [
    intro,
    bullets.length ? bullets.map((b) => `- ${b}`).join("\n") : "",
    topSources.length ? `\n**Sources**\n${sourcesMd}` : "",
    fredLine,
  ]
    .filter(Boolean)
    .join("\n\n");

  // Legacy fields used as fallback if Grok is unavailable
  const legacyAnswerMarkdown = answerMarkdown;
  const legacyAnswer = intro || answerMarkdown;

  // ===== GROK BRAIN v3.1 – FINAL COMPATIBLE VERSION =====
  console.log("GROK v3.1: Starting for user:", userId);

  let conversationHistory = "";
  if (userId && supabase) {
    try {
      const { data: history } = await supabase
        .from("user_answers")
        .select("question, answer_summary, answer")
        .eq("clerk_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(3);

      if (history?.length) {
        conversationHistory = history
          .reverse()
          .map((entry: any) => {
            const prev =
              entry.answer_summary ||
              (typeof entry.answer === "object" && entry.answer?.answer
                ? String(entry.answer.answer).slice(0, 200) + "..."
                : "Previous answer");
            return `User: ${entry.question}\nAssistant: ${prev}`;
          })
          .join("\n\n");
      }
    } catch (err: any) {
      console.warn("GROK v3.1: history fetch failed", err.message);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const fredContext = usedFRED
    ? `FRED (${fred.asOf || today}): 30Y fixed = ${fred.mort30Avg}%, 10Y yield = ${fred.tenYearYield}%, spread = ${fred.spread}%`
    : "FRED data unavailable";

  const tavilyContext =
    Array.isArray(tav.results) && tav.results.length
      ? tav.results
        .slice(0, 4)
        .map(s => `• ${s.title}: ${(s.snippet || s.content || "").slice(0, 140)}...`)
        .join("\n")
      : "No recent sources";

  // 3. Final enriched prompt for Grok

  // 3. MODULE ROUTING — CLEAN, SIMPLE, WORKING
  type ModuleKey = "general" | "rate" | "refi" | "arm" | "buydown" | "jumbo";

  let module: ModuleKey = "general";
  const q = question.toLowerCase();

  if (/(current.*rate|today.*rate|30.*year|30 year fixed|jumbo|arm.*rate)/i.test(q)) {
    module = "rate";
  } else if (/(refinance|refi|closing costs|breakeven|loan balance|current.*rate|remaining.*(year|term|month)|years? left)/i.test(q)) {
    module = "refi";
  } else if (/(arm|5\/1|7\/1|10\/1|adjustable|fixed vs arm)/i.test(q)) {
    module = "arm";
  } else if (/(points?|buy ?down|discount points?|buydown)/i.test(q)) {
    module = "buydown";
  } else if (/(jumbo|non.?conforming|high.?balance|loan limit)/i.test(q)) {
    module = "jumbo";
  }

  const modulePrompts: Record<ModuleKey, string> = {
    general: "",

    rate: "You are Rate Oracle. Use only today’s daily rates (Bankrate, MND, Forbes). Never cite weekly FRED as current rate. Show exact range + spread vs 10Y Treasury.",

    refi: "You are Refi Lab — purely informational mortgage analyst.\n" +
      "Your only goal is to give accurate, unbiased knowledge.\n" +
      "Never sell, never persuade, never use hype words.\n" +
      "Current 30-year fixed average: 6.3–6.5% (Nov 2025).\n" +
      "If user’s rate is below 5.8%: state that refinancing today would increase payment.\n" +
      "If user gives real numbers (rate, balance, term, income, debt, credit, closing costs):\n" +
      "  • Use them exactly\n" +
      "  • Compute precise P&I and breakeven\n" +
      "  • Show factual scenarios and payment change\n" +
      "If key numbers missing: ask once, clearly.\n" +
      "Always remember prior conversation details.\n" +
      "Tone: calm, factual, educational.",

    arm: "You are ARM Deathmatch. Compare total interest over 10 years under 4 paths: soft landing, base, sticky inflation, recession. Flag risk if hold > fixed period.",

    buydown: "You are Buydown Lab. If loan details missing → ask once. Otherwise show table: 1–3 points, monthly savings, breakeven month. 1 point = 0.25%.",

    jumbo: "You are Jumbo Loan Expert. 2025 limit $805,250 ($1,209,750 high-cost). Rates +0.20–0.50% over conforming. Require 700+ credit, 20%+ down, 6–12 months reserves."
  };

  const prefix = modulePrompts[module] ? modulePrompts[module] + "\n\n" : "";

  const grokPrompt = `
${prefix}Date: ${today}
${fredContext}
Latest signals: ${tavilyContext}
Conversation: ${conversationHistory || "First message"}

Question: "${question}"

JSON output only:
{
  "answer": "180–350 word markdown.",
  "next_step": "1–2 exact actions",
  "follow_up": "One sharp follow-up",
  "confidence": "0.00–1.00 + 4-word reason"
}
`.trim();


  let grokFinal: any = null;

  if (process.env.XAI_API_KEY && question.trim()) {
    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.XAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "grok-3",
          messages: [{ role: "user", content: grokPrompt }],
          response_format: { type: "json_object" },
          temperature: 0.35,
          max_tokens: 1400,
        }),
      });

      if (!res.ok) throw new Error(`Grok ${res.status}`);
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content?.trim();

      if (content) {
        try {
          let cleaned = content.replace(/^```json\s*\n?/, "").replace(/\n?```$/, "").trim();
          const first = cleaned.indexOf("{");
          const last = cleaned.lastIndexOf("}");
          if (first !== -1 && last > first) cleaned = cleaned.slice(first, last + 1);

          grokFinal = JSON.parse(cleaned);

          if (!grokFinal.answer || !grokFinal.next_step || !grokFinal.follow_up || !grokFinal.confidence) {
            throw new Error("Missing fields");
          }

          console.log("GROK v3.1 SUCCESS → confidence:", grokFinal.confidence);
        } catch (parseErr) {
          console.warn("GROK v3.1: recovery mode", parseErr);
          grokFinal = {
            answer: content.slice(0, 1200),
            next_step: "Share your loan amount and rate for exact numbers.",
            follow_up: "What’s your timeline or location?",
            confidence: "0.71 — recovered",
          };
        }
      }
    } catch (e: any) {
      console.error("GROK v3.1 failed → legacy", e.message || e);
      grokFinal = null;
    }
  }

  // Save memory — Supabase v2+ safe
  if (grokFinal && userId && supabase) {
    try {
      await supabase.from("user_answers").insert({
        clerk_user_id: userId,
        question,
        answer: grokFinal,
        answer_summary: typeof grokFinal.answer === "string" ? grokFinal.answer.slice(0, 320) + "..." : "",
        model: "grok-3",
        created_at: new Date().toISOString(),
      });
    } catch (err: any) {
      console.warn("GROK v3.1: save failed", err.message);
    }
  }

  const finalMarkdown = grokFinal
    ? `**Answer**\n${grokFinal.answer}\n\n**Confidence**: ${grokFinal.confidence}\n\n${sourcesMd}${fredLine || ""}`
    : legacyAnswerMarkdown;


  return noStore({
    ok: true,
    route: "answers",
    grok: grokFinal || null,
    data_freshness: grokFinal ? "Live 2025–2026 (Grok-3)" : "Legacy stack",
    message: grokFinal?.answer || legacyAnswer,
    answerMarkdown: finalMarkdown,
    followUp: grokFinal?.follow_up || followUpFor(topic),
    path,
    tag,
    generatedAt,
    usedFRED,
    usedTavily,
    fred,
    topSources,
  });
}

/* ===== Next.js route exports ===== */
export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  const intent = req.nextUrl.searchParams.get("intent") || undefined;
  return handle(req, intent);
}