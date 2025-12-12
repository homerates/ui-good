// ==== WEB-FIRST + GROK v4 + SUPABASE: app/api/answers/route.ts ====
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getGuidelineContextForQuestion } from "@/lib/guidelinesServer";

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
  snippet?: string;
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

function clampText(s: string, maxChars: number) {
  const x = (s ?? "").trim();
  if (!x) return "";
  if (x.length <= maxChars) return x;
  return x.slice(0, Math.max(0, maxChars - 1)).trimEnd() + "…";
}

function compactWhitespace(s: string) {
  return (s ?? "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// --- fetch with timeout (hard cap) ---
async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number
) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
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

  // --- Timing: start ---
  const t0 = Date.now();
  const mark = (label: string) => {
    console.log(`[TIMER] ${label}:`, Date.now() - t0, "ms");
  };
  mark("start");

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

  // Topic for follow-ups and FRED
  const topic = topicFromQuestion(question);

  // MODULE ROUTING
  type ModuleKey =
    | "general"
    | "rate"
    | "refi"
    | "arm"
    | "buydown"
    | "jumbo"
    | "underwriting"
    | "qualify"
    | "about";

  let module: ModuleKey = "general";
  const q = question.toLowerCase();

  if (/(current.*rate|today.*rate|30.*year|30 year fixed|arm.*rate)/i.test(q)) {
    module = "rate";
  } else if (
    /(refinance|refi|closing costs?|break[- ]?even|loan balance|remaining.*(year|term|month)|years? left)/i.test(
      q
    )
  ) {
    module = "refi";
  } else if (
    /(how much.*qualify|qualify for|how much.*afford|afford.*home|income.*qualify|debt.*ratio|credit score.*qualify|pre.?approve)/i.test(
      q
    )
  ) {
    module = "qualify";
  } else if (/(arm\b|5\/1|7\/1|10\/1|adjustable|fixed vs arm)/i.test(q)) {
    module = "arm";
  } else if (/(points?|buy ?down|discount points?|buydown)/i.test(q)) {
    module = "buydown";
  } else if (/(jumbo|non.?conforming|high.?balance|loan limit)/i.test(q)) {
    module = "jumbo";
  } else if (
    /(underwrit|guideline|du\b|lp\b|manual underwrite|reserve|overlay|lender requirement|lender overlay|compensating factor|residual income)/i.test(
      q
    )
  ) {
    module = "underwriting";
  } else if (
    /(what is homerates|heard about homerates|tell me about this site|what makes you different|who is the founder|who built homerates|who created homerates|who made homerates|founder of homerates)/i.test(
      q
    )
  ) {
    module = "about";
  }

  // Module prompts (declared before any use)
  const modulePrompts: Record<ModuleKey, string> = {
    general: "",
    rate:
      "You are Rate Oracle. Use current retail rate trackers. Never treat FRED weekly average as a live quote. Use markdown only. JSON only.",
    refi:
      "You are Refi Lab — purely informational mortgage analyst.\n" +
      "ABSOLUTE RULE: Do not invent market rates or borrower numbers. If missing, ask once. Any made-up example must be labeled “Example Scenario”.\n" +
      "Compute P&I using standard amortization when numbers are provided. Use markdown tables only. JSON only.",
    arm: "You compare fixed versus ARM over 10 years. Use markdown only. JSON only.",
    buydown:
      "You are Buydown Lab. Ask once if missing. Any made-up example must be labeled “Example Scenario”. Use markdown tables only. JSON only.",
    jumbo:
      "You are Jumbo Loan Expert. Focus on structure and eligibility. Use markdown only. JSON only.",
    underwriting:
      "You are Underwriting Oracle. Cite governing rules when possible. Use markdown only. JSON only.",
    qualify:
      "You are Qualification Lab. Use only user numbers. Ask once if missing. Use markdown tables only. JSON only.",
    about:
      "You explain HomeRates.ai (product/mission/founder story when asked). Calm and precise. Use markdown only. JSON only.",
  };

  // Lender guideline context
  let guidelineContext = "";
  if (module === "underwriting" || module === "jumbo" || module === "qualify") {
    try {
      guidelineContext = await getGuidelineContextForQuestion(question);
    } catch (err) {
      console.warn("Guideline context error", (err as any)?.message || err);
    }
  }

  // TAVILY QUERY
  let tavQuery: string;
  if (module === "underwriting" || module === "qualify") {
    tavQuery = `${question} 2025 mortgage guidelines site:singlefamily.fanniemae.com OR site:fanniemae.com OR site:freddiemac.com OR site:hud.gov OR site:benefits.va.gov OR site:va.gov OR site:cfpb.gov OR site:consumerfinance.gov -yahoo -aol -forum -blog -reddit -studylib -quizlet`;
  } else if (module === "rate") {
    tavQuery = `${question} 2025 mortgage rates site:bankrate.com OR site:mortgagenewsdaily.com OR site:forbes.com OR site:nerdwallet.com OR site:freddiemac.com -yahoo -aol -forum -blog -reddit`;
  } else {
    tavQuery = `${question} 2025 mortgage -yahoo -aol -forum -blog -reddit`;
  }

  let tav = await askTavily(req, tavQuery, {
    depth: module === "underwriting" || module === "qualify" ? "advanced" : "basic",
    max: 6,
  });

  if ((!tav.answer || tav.answer.trim().length < 80) && tav.results.length < 2) {
    const fallbackQuery = `${question} mortgage 2025`;
    tav = await askTavily(req, fallbackQuery, { depth: "advanced", max: 8 });
  }

  mark("after Tavily");

  const usedTavily = tav.ok && (tav.answer !== null || tav.results.length > 0);

  // FRED snapshot for rate questions
  const wantFred = topic === "rates";
  const fred = wantFred
    ? await getFredSnapshot()
    : { tenYearYield: null, mort30Avg: null, spread: null, asOf: null };

  const usedFRED = wantFred && (fred.tenYearYield !== null || fred.mort30Avg !== null);
  mark("after FRED");

  // Baseline answer (legacy)
  let base =
    tav.answer ??
    (tav.results.find((r) => typeof r.content === "string")?.content?.trim() ?? "");

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
      "Here’s a concise baseline while I gather details: mortgage pricing reflects the 10-year Treasury benchmark plus risk spreads (credit, liquidity, volatility). " +
      "Spreads widen when volatility or risk aversion picks up, and compress when markets stabilize.";
  }

  const intro = firstParagraph(base, 800);
  const bullets = bulletsFrom(base, 4);

  const topSources = (tav.results || [])
    .slice(0, 3)
    .map((s) => ({ title: s.title, url: s.url }));

  const sourcesMd = topSources.map((s) => `- [${s.title}](${s.url})`).join("\n");

  const fredLine = usedFRED
    ? `\n\n**FRED snapshot**: 10y=${fred.tenYearYield ?? "—"}%, 30y mtg avg=${fred.mort30Avg ?? "—"}%, spread=${fred.spread ?? "—"} (${fred.asOf ?? "latest"})`
    : "";

  const answerMarkdown = [
    intro,
    bullets.length ? bullets.map((b) => `- ${b}`).join("\n") : "",
    topSources.length ? `\n**Sources**\n${sourcesMd}` : "",
    fredLine,
  ]
    .filter(Boolean)
    .join("\n\n");

  const legacyAnswerMarkdown = answerMarkdown;
  const legacyAnswer = intro || answerMarkdown;

  mark("after baseline answer");

  // ===== GROK v4 =====
  console.log("GROK v4: Starting for user:", userId);

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
      console.warn("GROK v4: history fetch failed", err.message);
    }
  }

  mark("after history fetch");

  const today = new Date().toISOString().slice(0, 10);
  const fredContext = usedFRED
    ? `FRED (${fred.asOf || today}): 30Y fixed = ${fred.mort30Avg}%, 10Y yield = ${fred.tenYearYield}%, spread = ${fred.spread}%`
    : "FRED data unavailable";

  const tavilyContextRaw =
    Array.isArray(tav.results) && tav.results.length
      ? tav.results
        .slice(0, 4)
        .map(
          (s) =>
            `• ${s.title}: ${(s.snippet || s.content || "").slice(0, 140)}...`
        )
        .join("\n")
      : "No recent sources";

  // Keep prompt compact and predictable
  const specialistPrefix = clampText(compactWhitespace(modulePrompts[module] ?? ""), 450);
  const guidelineCtxTrim = clampText(compactWhitespace(guidelineContext || ""), 260);
  const tavilyCtxTrim = clampText(compactWhitespace(tavilyContextRaw), 220);
  const conversationTrim = clampText(compactWhitespace(conversationHistory || ""), 320);

  const grokPrompt = compactWhitespace(
    `
${specialistPrefix}

You are HomeRates.AI — a calm, data-first mortgage advisor focused on 2025–2026.
Never sell. Never hype. Speak clearly.

Date: ${today}
${fredContext}

LENDER GUIDELINE CONTEXT (trimmed):
${guidelineCtxTrim || "None"}

Latest signals (trimmed):
${tavilyCtxTrim || "None"}

Conversation (trimmed):
${conversationTrim || "First message"}

Current question:
"${question}"

Respond in valid JSON only, using this exact schema:
{
  "answer": "Use markdown only. Use this structure: Summary, Key Numbers, Comparison Table (markdown), What This Means For You.",
  "next_step": "1–2 concrete actions.",
  "follow_up": "One sharp follow-up question.",
  "confidence": "0.00–1.00 numeric score plus a short reason."
}
`.trim()
  );

  let grokFinal: any = null;

  mark("before Grok call");

  if (process.env.XAI_API_KEY && question.trim()) {
    try {
      const res = await fetchWithTimeout(
        "https://api.x.ai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.XAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "grok-4",
            messages: [{ role: "user", content: grokPrompt }],
            response_format: { type: "json_object" },
            temperature: 0.25,
            max_tokens: 850,
          }),
        },
        12000 // HARD CAP: 12s
      );

      if (!res.ok) throw new Error(`Grok ${res.status}`);
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content?.trim();

      if (content) {
        try {
          let cleaned = content
            .replace(/^```json\s*\n?/, "")
            .replace(/\n?```$/, "")
            .trim();

          // Strict JSON gate: extract first {...} only
          const first = cleaned.indexOf("{");
          const last = cleaned.lastIndexOf("}");
          if (first !== -1 && last > first) cleaned = cleaned.slice(first, last + 1);

          // Hard reject HTML tables if they leak
          if (cleaned.includes("<table")) {
            throw new Error("HTML detected");
          }

          grokFinal = JSON.parse(cleaned);

          if (!grokFinal.answer || !grokFinal.next_step || !grokFinal.follow_up || !grokFinal.confidence) {
            throw new Error("Missing fields");
          }

          console.log("GROK v4 SUCCESS → confidence:", grokFinal.confidence);
        } catch (parseErr) {
          console.warn("GROK v4: recovery mode", parseErr);
          grokFinal = {
            answer: content.slice(0, 1200),
            next_step: "Share your loan amount and current rate for exact numbers.",
            follow_up: "What are your estimated closing costs and your timeline?",
            confidence: "0.71 — recovered",
          };
        }
      }
    } catch (e: any) {
      console.error("GROK v4 failed/timeout → legacy", e?.name || "", e?.message || e);
      grokFinal = null; // fall back to legacy baseline
    }
  }

  mark("after Grok call");

  // Save memory (should not block response in normal use)
  if (grokFinal && userId && supabase) {
    try {
      await supabase.from("user_answers").insert({
        clerk_user_id: userId,
        question,
        answer: grokFinal,
        answer_summary:
          typeof grokFinal.answer === "string"
            ? grokFinal.answer.slice(0, 320) + "..."
            : "",
        model: "grok-4",
        created_at: new Date().toISOString(),
      });
    } catch (err: any) {
      console.warn("GROK v4: save failed", err.message);
    }
  }

  mark("after Supabase save");

  const finalMarkdown = grokFinal
    ? `**Answer**\n${grokFinal.answer}\n\n**Confidence**: ${grokFinal.confidence}\n\n${sourcesMd}${fredLine || ""}`
    : legacyAnswerMarkdown;

  mark("end (before return)");

  return noStore({
    ok: true,
    route: "answers",
    grok: grokFinal || null,
    data_freshness: grokFinal ? "Live 2025–2026 (Grok-4)" : "Legacy stack",
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
