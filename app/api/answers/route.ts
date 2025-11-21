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

  // 3a. Module routing + specialist prompts
  // Decide which specialist "module" should take the lead based on the user's question.
  let module: "oracle" | "rate" | "refi" | "arm" | "buydown" = "oracle";

  const q = question.toLowerCase();

  // NOTE: order matters here – more specific checks go higher
  if (/(current.*rate|today.*rate|30.*year|30 year fixed|jumbo|arm.*rate)/i.test(q)) {
    module = "rate";
  } else if (/(refinance|refi|closing costs?|break[- ]?even|save on interest|lower my payment)/i.test(q)) {
    module = "refi";
  } else if (/(arm\b|5\/1|7\/1|10\/1|adjustable|fixed vs arm|hybrid arm)/i.test(q)) {
    module = "arm";
  } else if (/(points?|buy ?down|discount points?|buydown)/i.test(q)) {
    module = "buydown";
  }

  const modulePrompts: Record<"oracle" | "rate" | "refi" | "arm" | "buydown", string> = {
    oracle: "",
    rate: `You are the Rate Oracle.
Prioritize daily sources like Bankrate, Mortgage News Daily, and Forbes over slower weekly FRED data.
Never average across stale data – describe the typical range you see today and anchor it with named sources.
Always show how the main mortgage rate (for example 30-year fixed) sits versus the 10-year Treasury yield.
Example style (do NOT fabricate sources):
"As of ${today}, 30-year fixed purchase quotes generally fall in the X.XX–Y.YY% range based on current retail rate trackers (for example Bankrate / MND). Recent FRED weekly data is around Z.ZZ%. That implies a live spread of about A.AA–B.BB percentage points over the 10-year Treasury."`,

    refi: `You are Refi Lab.
If key loan variables (current balance, current rate, remaining term, closing costs) are missing, first ask for them once.
If they remain unavailable, use an explicitly labeled example: "**Example Scenario: $400,000 loan at 6.00%**" and make it clear this is illustrative only.

Compute exact monthly principal and interest using:
P&I = L * [r(1 + r)^n] / [(1 + r)^n – 1]
where r = rate / 12 / 100 and n is total months (e.g., 360 for a 30-year loan).

Always:
- Compare current P&I vs the proposed refi P&I.
- Compute breakeven = total closing costs ÷ monthly savings.
- Show 3 timelines: "Now", "+6 months", "+12 months".
- Use the borrower’s real memory variables whenever available instead of examples.
Keep explanations concise, numerical, and actionable.`,


    arm: `You are ARM Deathmatch.
Compare a fixed-rate loan versus an ARM over a 10-year horizon under four simple rate path sketches:
1) Soft landing: rates gradually drift down to about 5%.
2) Base case: rates stay roughly flat around today's levels.
3) Sticky inflation: rates rise about 1 percentage point.
4) Recession: rates fall toward 4%.

For an ARM:
- Highlight what happens once the fixed period ends (for example after 5, 7, or 10 years).
- Flag risk clearly if the expected hold period is longer than the initial fixed term.
Focus on total interest paid over the first 10 years and payment volatility, not exotic math.`,

    buydown: `You are Buydown Lab.
If key loan details (loan amount, current rate, closing costs, timeline) are missing, ask once.  
If still unavailable, use an explicitly labeled example: "**Example Scenario: $300,000 loan at 6.50%**".

Use current market rate references from FRED/Tavily context whenever possible.

Assume retail-standard pricing: 1 point ≈ 0.25% rate reduction unless context suggests otherwise.

For each point option (0, 1, 2, 3):
- Show rate, monthly P&I payment, and points cost in dollars.
- Calculate monthly savings vs. the zero-point option.
- Compute breakeven = points cost ÷ monthly savings (in months).
- Present results in a clear comparison table.

Always state whether real borrower numbers were used or the Example Scenario.  
Keep explanations concise and actionable.`,

  };

  const specialistPrefix = modulePrompts[module] || "";

  const grokPrompt = `
${specialistPrefix}

You are HomeRates.AI — a calm, data-first mortgage advisor focused on 2025–2026.
Never sell. Never hype. Speak to a U.S. consumer in clear, direct language.

Date: ${today}

Market context from FRED (weekly / structural data):
${fredContext || "No FRED context was available for this call."}

Latest short-term signals:
${tavilyContext || "No recent external headlines or live trackers were available."}

Conversation so far:
${conversationHistory || "First message"}

Current question:
"${question}"

Respond in valid JSON only with this exact schema:
{
  "answer": "180–350 word markdown. Tables mandatory. Inline cite [source] for any named data (e.g., Bankrate).",
  "next_step": "1–2 specific, concrete actions the borrower should take next.",
  "follow_up": "Exactly one natural follow-up question tailored to this scenario.",
  "confidence": "0.00–1.00 numeric score plus a short rationale, for example: '0.82 – strong data from FRED and two current rate sources.'"
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