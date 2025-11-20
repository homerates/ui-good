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

  // ===== GROK BRAIN v3 – integrates with FRED + Tavily + user_answers =====

  console.log("GROK v3: Starting for user:", userId);

  // 1. Pull conversation memory from user_answers (last 3 exchanges)
  let conversationHistory = "";
  if (userId && supabase) {
    try {
      const { data: history, error: historyError } = await supabase
        .from("user_answers")
        .select("question, answer_summary, answer")
        .eq("clerk_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(3);

      if (historyError) {
        console.warn("GROK v3: history fetch error", historyError.message);
      }

      if (history && history.length) {
        conversationHistory = history
          .reverse()
          .map((entry: any) => {
            const rawAnswer =
              entry.answer_summary ||
              (entry.answer &&
                typeof entry.answer === "object" &&
                typeof entry.answer.answer === "string"
                ? entry.answer.answer.slice(0, 200) + "..."
                : "Previous answer");

            return `User: ${entry.question}\nAssistant: ${rawAnswer}`;
          })
          .join("\n\n");
      }
    } catch (err: any) {
      console.warn("GROK v3: history fetch exception", err?.message || err);
    }
  }

  // 2. Build rich context from FRED + Tavily
  const today = new Date().toISOString().slice(0, 10);

  const fredContext =
    usedFRED && fred
      ? `FRED (${fred.asOf || today}): 30Y fixed = ${fred.mort30Avg}%, 10Y yield = ${fred.tenYearYield}%, spread = ${fred.spread}%`
      : "FRED data unavailable";

  // Use original Tavily results (with content/snippet) for Grok context
  const tavilyContext =
    Array.isArray(tav.results) && tav.results.length
      ? tav.results
        .slice(0, 4)
        .map((s) =>
          `• ${s.title}: ${(s.snippet || s.content || "").slice(0, 140) || "(no snippet)"
          }...`
        )
        .join("\n")
      : "No recent news sources";

  // 3. Final enriched prompt for Grok
  const grokPrompt = `
You are HomeRates.AI — the calm, data-first mortgage advisor for 2025–2026.
Never sell. Never hype. Just empower with precision.

Date: ${today}
${fredContext}

Latest signals:
${tavilyContext}

Conversation so far:
${conversationHistory || "First message"}

Current question: "${question}"

Respond in valid JSON (exact schema):
{
  "answer": "180–380 word markdown. Use tables, bullets, mini-scenarios. Cite FRED inline when relevant.",
  "next_step": "1–2 specific, actionable steps the user can take right now.",
  "follow_up": "One natural, personalized follow-up question that continues the thread.",
  "confidence": "0.00–1.00 + 5–8 word rationale"
}
`.trim();

  // 4. Call Grok
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
          grokFinal = JSON.parse(content);
          console.log("GROK v3 SUCCESS → confidence:", grokFinal.confidence);
        } catch (parseErr: any) {
          console.error(
            "GROK v3 JSON parse failed",
            parseErr?.message || parseErr
          );
        }
      } else {
        console.warn("GROK v3: empty content from Grok");
      }
    } catch (e: any) {
      console.error("GROK v3 failed → using legacy", e?.message || e);
    }
  }

  // 5. Save to user_answers for memory + analytics
  if (grokFinal && userId && supabase) {
    try {
      const fullAnswer =
        typeof grokFinal.answer === "string"
          ? grokFinal.answer
          : JSON.stringify(grokFinal);

      const summary =
        typeof grokFinal.answer === "string"
          ? grokFinal.answer.slice(0, 320) + "..."
          : fullAnswer.slice(0, 320) + "...";

      await supabase.from("user_answers").insert({
        clerk_user_id: userId,
        question,
        answer: grokFinal, // jsonb column
        answer_summary: summary,
        model: "grok-3",
        created_at: new Date().toISOString(),
      });
    } catch (err: any) {
      console.warn("GROK v3: failed to log user_answers", err?.message || err);
    }
  }

  // 6. Build final markdown for the frontend
  const finalMarkdown = grokFinal
    ? `**Answer**\n${grokFinal.answer}\n\n**Confidence**: ${grokFinal.confidence
    }\n\n**Next step**\n${grokFinal.next_step}\n\n**Ask me next** → ${grokFinal.follow_up
    }\n\n${sourcesMd}${fredLine || ""}`
    : legacyAnswerMarkdown;

  // 7. Unified return shape
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
