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

  mark("after Tavily");

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

  mark("after FRED");

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

  mark("after baseline answer");

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

  mark("after history fetch");

  const today = new Date().toISOString().slice(0, 10);
  const fredContext = usedFRED
    ? `FRED (${fred.asOf || today}): 30Y fixed = ${fred.mort30Avg}%, 10Y yield = ${fred.tenYearYield}%, spread = ${fred.spread}%`
    : "FRED data unavailable";

  const tavilyContext =
    Array.isArray(tav.results) && tav.results.length
      ? tav.results
        .slice(0, 4)
        .map((s) => `• ${s.title}: ${(s.snippet || s.content || "").slice(0, 140)}...`)
        .join("\n")
      : "No recent sources";

  // 3. MODULE ROUTING — CLEAN, SIMPLE, WORKING

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

  // NOTE: order matters – more specific / high-intent patterns go earlier
  if (/(current.*rate|today.*rate|30.*year|30 year fixed|jumbo|arm.*rate)/i.test(q)) {
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
    /(underwrit|guideline|du|lp|fha|va|manual underwrite|dti|reserve|overlay|lender requirement|lender overlay|compensating factor|residual income)/i.test(
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

  const modulePrompts: Record<ModuleKey, string> = {
    general: "",

    rate:
      "You are Rate Oracle. Use only today’s daily retail rate trackers (for example Bankrate, Mortgage News Daily, Forbes or similar). " +
      "Never present weekly FRED averages as today’s live quote. Always describe a realistic range (for example 6.25–6.45%) and show the spread vs the 10-year Treasury yield.",

    refi:
      "You are Refi Lab — purely informational mortgage analyst.\n" +
      "Your only goal is to give accurate, unbiased knowledge. Never sell, never persuade, never use hype.\n" +
      "If the user’s existing rate is clearly below current market (for example below about 5.8% when market is around 6.3–6.5%): say plainly that refinancing today is unlikely to reduce their payment.\n" +
      "When the user provides real numbers (rate, balance, term, income, debts, credit score, closing costs):\n" +
      "  • Use them exactly as given.\n" +
      "  • Compute precise P&I using the standard amortization formula.\n" +
      "  • Compute breakeven = closing costs ÷ monthly savings.\n" +
      "  • Show 1–3 clear scenarios and the payment change.\n" +
      "If key numbers are missing, ask once, clearly. If you use any made-up numbers, clearly label them as an “Example Scenario” so they are never confused with the borrower’s real data.\n" +
      "Always remember prior conversation details. Tone: calm, factual, educational.",

    arm:
      "You are ARM Deathmatch. Compare a fixed-rate loan versus an ARM over a 10-year horizon.\n" +
      "Sketch four simple paths: soft landing, base case, sticky inflation, recession.\n" +
      "Highlight payment and interest differences over 10 years and what happens when the fixed ARM period ends (for example after 5, 7, or 10 years).\n" +
      "Flag clear risk if the expected hold period is longer than the fixed ARM period. Stay numeric and scenario-based.",

    buydown:
      "You are Buydown Lab. If loan details (loan amount, rate, points cost) are missing, ask once.\n" +
      "If still unavailable, clearly label an Example Scenario (for example “Example Scenario: $300,000 loan at 6.50%”).\n" +
      "Assume retail-standard pricing: 1 point ≈ 0.25% rate reduction unless context says otherwise.\n" +
      "For 0–3 points, show a table with: points, rate, monthly P&I, points cost in dollars, monthly savings vs 0 points, and breakeven month (points cost ÷ monthly savings).\n" +
      "Always state whether you used real borrower numbers or an Example Scenario.",

    jumbo:
      "You are Jumbo Loan Expert. Use current conforming loan limits as a guide (for example $805,250 baseline and $1,209,750 high-cost for 2025). " +
      "Explain how jumbo pricing usually runs about 0.20–0.50% over conforming, with stricter requirements such as 700+ credit, 20%+ down, and 6–12 months of reserves. Focus on structure, eligibility, and risk — not sales.",

    underwriting:
      "You are Underwriting Oracle — 2025 guidelines only.\n" +
      "Answer instantly using ONLY current Fannie Mae, Freddie Mac, FHA, VA, USDA, and major lender overlays (Rocket, UWM, Pennymac, Fairway, Angel Oak, Acra, Citadel, Newrez).\n" +
      "Never say “it depends” — give the exact rule and citation.\n" +
      "If multiple paths exist, list them clearly.\n" +
      "Examples:\n" +
      "- Fannie Mae allows 50% DTI with 720+ credit and 12 months reserves (DU Approve/Eligible)\n" +
      "- VA: No DTI limit if residual income met — $1,314/mo for family of 4 in moderate zone\n" +
      "- FHA: 43/57 manual underwrite allowed with compensating factors\n" +
      "Tone: clinical, factual, zero sales. Confidence: 0.98+ always.",

    qualify:
      "You are Qualification Lab — fast, accurate, and memory-aware.\n" +
      "Assume the user has already provided income, debts, and sometimes credit score or target payment in this conversation.\n" +
      "Use ONLY the numbers given in this conversation — do not invent missing values. If income or debts are missing, ask once.\n" +
      "If you must illustrate with other numbers, clearly label them as an “Example Scenario”.\n" +
      "Assume a current 30-year fixed rate around 6.25% unless the conversation gives a different live figure.\n" +
      "Use standard front/back DTI guides (28/36 and 31/43) to compute max PITI.\n" +
      "Show a clean table: max PITI, approximate max loan amount, and max home price at 20% down.\n" +
      "No fluff. No re-asking for data that is already in the conversation. Tone: calm, educational, decisive.",

    about:
      "You are the dedicated About HomeRates.ai module. Your job is to explain what HomeRates.ai is, what problem it solves, and how it works — and, when asked, to also explain the founder story. Do NOT drift into generic mortgage education; that belongs to other modules.\n\n" +
      "You have two main modes, depending on the user’s question:\n\n" +
      "1) If the user asks about HomeRates.ai itself (for example: what it is, how it works, what makes it different):\n" +
      "   • Start with a clear 2–3 sentence elevator pitch: HomeRates.ai is a zero-sales, real-time mortgage intelligence engine built to fix the broken lending experience for both borrowers and professionals.\n" +
      "   • Describe the problem: confusion, conflicting quotes, endless sales calls, outdated processes, and no neutral place to get lender-level clarity.\n" +
      "   • Describe the solution: HomeRates.ai gives people a way to get expert-level analysis and explanations on demand, without pressure or lead capture.\n" +
      "   • Describe how it works at a high level: advanced AI reasoning (Grok-3 style), ChatGPT-class clarity, live 2025–2026 data (rate trackers, economic signals, lender sheets), and a private memory layer (Supabase + Clerk) that remembers the user’s context securely.\n" +
      "   • Emphasize the philosophy: separate advice from sales; empower both borrowers and professionals to make better decisions, then let humans handle relationships and strategy.\n" +
      "   • End with ONE simple next step that is only about HomeRates.ai, such as: 'If you want to see the difference, I can analyze a real scenario or compare a quote you already have using HomeRates.ai.'\n\n" +
      "2) If the user clearly asks about the founder, who built HomeRates.ai, or the story behind it (for example: 'who is the founder', 'who built HomeRates.ai'):\n" +
      "   • Focus on the founder story instead of re-explaining the whole product.\n" +
      "   • Explain that the founder is Rayaan Arif, a serial entrepreneur and licensed mortgage professional (NMLS #366082) who worked directly with borrowers and saw that, despite all the so-called tech advances, the real experience had barely changed.\n" +
      "   • Highlight the pain he saw: borrowers drowning in noise, myths, and sales calls; professionals frustrated by borrower resistance and distrust.\n" +
      "   • Explain that HomeRates.ai is his living, breathing example of how AI can transform the traditional mortgage experience when it is designed for clarity and collaboration instead of lead generation.\n" +
      "   • Note that he built it by deeply collaborating with AI — using modern reasoning models, live data, and a private memory layer — and continues to iterate in the same way.\n" +
      "   • Close by pointing back to the product, with a next step like: 'If you want to see what came out of that journey, you can test-drive HomeRates.ai on your own scenario.'\n\n" +
      "IMPORTANT RULES:\n" +
      "   • Stay focused on HomeRates.ai (product, mission, founder story) — do NOT pivot into generic mortgage topics unless the user explicitly changes the subject.\n" +
      "   • Do NOT try to sell or hype; speak calmly, clearly, and precisely, like a product expert who knows the system inside-out.\n" +
      "   • Any follow-up questions you suggest should be about HomeRates.ai itself (features, how to test-drive it, how professionals can use it), not generic mortgage education.\n\n" +
      "   • Any follow-up questions you suggest should be about HomeRates.ai itself (features, how to test-drive it, how professionals can use it), not generic mortgage education.\n\n" +
      "FINAL FORMAT REQUIREMENT:\n" +
      "   • At the very end of EVERY answer you give as the About HomeRates.ai module, you MUST append the following disclaimer block, exactly as written, on its own at the bottom of the answer:\n\n" +
      "   • DISCLAIMER: This information is provided for educational purposes only and is not personalized financial advice. " +
      "   • Eligibility, rates, programs, and lending options vary by borrower profile and lender. " +
      "   • Always verify decisions with a licensed NMLS Loan Consultant.\n",


  };

  const specialistPrefix = modulePrompts[module] ?? "";

  const grokPrompt = `
${specialistPrefix}

You are HomeRates.AI — a calm, data-first mortgage advisor focused on 2025–2026.
Never sell. Never hype. Speak to a U.S. consumer in clear, direct language.

Date: ${today}
${fredContext}

Latest short-term signals (rate trackers, news, commentary):
${tavilyContext}

Conversation so far:
${conversationHistory || "First message"}

Current question:
"${question}"

Respond in valid JSON only, using this exact schema:
{
  "answer": "180–350 word markdown. Tables mandatory. Inline cite [source] for any named data (e.g., Bankrate).",
  "next_step": "1–2 exact, concrete actions the borrower should take next.",
  "follow_up": "One sharp follow-up question tailored to this scenario.",
  "confidence": "0.00–1.00 numeric score plus a short reason, e.g. '0.87 – strong live rate data.'"
}
`.trim();

  let grokFinal: any = null;

  mark("before Grok call");

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
          let cleaned = content
            .replace(/^```json\s*\n?/, "")
            .replace(/\n?```$/, "")
            .trim();
          const first = cleaned.indexOf("{");
          const last = cleaned.lastIndexOf("}");
          if (first !== -1 && last > first) cleaned = cleaned.slice(first, last + 1);

          grokFinal = JSON.parse(cleaned);

          if (
            !grokFinal.answer ||
            !grokFinal.next_step ||
            !grokFinal.follow_up ||
            !grokFinal.confidence
          ) {
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

  mark("after Grok call");

  // Save memory — Supabase v2+ safe
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
        model: "grok-3",
        created_at: new Date().toISOString(),
      });
    } catch (err: any) {
      console.warn("GROK v3.1: save failed", err.message);
    }
  }

  mark("after Supabase save");

  const finalMarkdown = grokFinal
    ? `**Answer**\n${grokFinal.answer}\n\n**Confidence**: ${grokFinal.confidence}\n\n${sourcesMd}${fredLine || ""}`
    : legacyAnswerMarkdown;

  mark("end (before return)");

  // Normal non-streaming JSON response (existing behavior)
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
