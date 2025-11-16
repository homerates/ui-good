// ==== RESTORED WEB-FIRST + ENV-INTEGRATED: app/api/answers/route.ts ====
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

// === Env: use what exists; no reinvention ===
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";
const FRED_API_KEY = process.env.FRED_API_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

/* ===== Types kept ===== */
type TavilyResult = { title: string; url: string; content?: string };
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

/* ===== Helpers kept ===== */
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

/* ===== Topic handling (unchanged) ===== */
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

/* ===== Web lookup (web-first if Tavily key exists) ===== */
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

/* ===== Optional FRED snapshot for 'rates' questions ===== */
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

/* ===== Optional OpenAI summarizer for Tavily text ===== */
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

/* ===== Core handler (same response shape as yours) ===== */
async function handle(req: NextRequest, intentParam?: string) {
  type Body = { question?: string; intent?: string; mode?: "borrower" | "public" };

  const generatedAt = new Date().toISOString();
  const path = "web";
  const tag = "answers-v2";

  let body: Body = {};
  if (req.method === "POST") {
    try {
      body = (await req.json()) as Body;
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

  // 1) Web-first answer
  let tav = await askTavily(req, `${question} 2025 mortgage insurance -pmi.org -project -management`, { depth: "basic", max: 6 });
  if ((!tav.answer || tav.answer.trim().length < 80) && tav.results.length < 2) {
    tav = await askTavily(req, `${question} mortgage insurance -pmi.org`, { depth: "advanced", max: 8 });
  }
  const usedTavily = tav.ok && (tav.answer !== null || tav.results.length > 0);

  // 2) Optional FRED snapshot for rate/10y topics
  const topic = topicFromQuestion(question);
  const wantFred = topic === "rates";
  const fred = wantFred
    ? await getFredSnapshot()
    : { tenYearYield: null, mort30Avg: null, spread: null, asOf: null };
  const usedFRED =
    wantFred &&
    (fred.tenYearYield !== null || fred.mort30Avg !== null);

  // 3) Build answer (prefer Tavily answer; else summarize results; else minimal baseline)
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

  // 4) Markdown + legacy message
  const intro = firstParagraph(base, 800);
  const bullets = bulletsFrom(base, 4);
  const topSources = (tav.results || [])
    .slice(0, 3)
    .map((s) => ({ title: s.title, url: s.url }));
  const sourcesMd = topSources
    .map((s) => `- [${s.title}](${s.url})`)
    .join("\n");

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

  // === GROK FINAL BRAIN: FINAL VERSION ===
  let grokFinal: any = null;
  if (process.env.XAI_API_KEY) {
    try {
      const grokPrompt = `
  You are a US mortgage AI assistant for homebuyers. Use ONLY 2025 data (ignore 2023/2024).
  Question: "${question}"
  Context: Home loans only. FRED: 10y=$$ {fred.tenYearYield ?? "—"}%, 30y avg= $${fred.mort30Avg ?? "—"}% (as of Nov 16, 2025).
  Tavily: ${tav.answer || "None"}. Sources: ${topSources.map(s => s.title).join(" | ")}.
  If data is outdated, say "Check latest at HUD/Freddie Mac."
  JSON: { answer: "3 timely sentences", piti_example: "if relevant", next_step: "1 action", follow_up: "1 question" }
`.trim();


      const grokRes = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'grok-3',
          messages: [{ role: 'user', content: grokPrompt }],
          response_format: { type: 'json_object' }
        })
      });

      if (!grokRes.ok) throw new Error(`HTTP ${grokRes.status}`);
      const grokData = await grokRes.json();
      const content = grokData.choices?.[0]?.message?.content;
      if (content) grokFinal = JSON.parse(content);
    } catch (e) {
      console.error("Grok failed:", e);
    }
  }
  // === AUTO-SAVE GROK ANSWER TO LIBRARY ===
  if (grokFinal && body.userId) {
    await fetch(`${req.headers.get('origin')}/api/library`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clerkUserId: body.userId,
        question,
        answer: grokFinal,
      }),
    }).catch(() => { }); // fire-and-forget
  }
  // =========================================
  // =======================================
  const legacyAnswer = [
    intro,
    bullets.length ? bullets.map((b) => `- ${b}`).join("\n") : "",
    topSources.length
      ? `Sources:\n${topSources
        .map((s) => `- ${s.title} — ${s.url}`)
        .join("\n")}`
      : "",
    usedFRED
      ? `FRED snapshot: 10y=${fred.tenYearYield ?? "—"}%, 30y mtg avg=${fred.mort30Avg ?? "—"
      }%, spread=${fred.spread ?? "—"} (${fred.asOf ?? "latest"})`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const followUp = followUpFor(topic);

  return noStore({
    ok: true,
    route: "answers",
    intent,
    path,
    tag,
    generatedAt,
    usedFRED,
    usedTavily,
    fred: usedFRED ? fred : undefined,
    sources: topSources,
    followUp,
    follow_up: followUp,
    cta: followUp,

    // === GROK + FRESHNESS ===
    grok: grokFinal || null,
    data_freshness: grokFinal ? "2025" : "Check sources—may be pre-2025",
    // =========================

    message: grokFinal?.answer || legacyAnswer,
    answer: grokFinal?.answer || legacyAnswer,
    answerMarkdown: grokFinal
      ? `**Answer**\n${grokFinal.answer}\n\n**Next Step**\n${grokFinal.next_step}\n\n**Sources**\n${sourcesMd}${fredLine}`
      : answerMarkdown,

    suggest: [
      "Explain PMI for a Conventional loan with 5% down and ~720 credit in California.",
      "Are 30-year fixed rates trending up this week? Cite two sources.",
      "What down-payment help is active in Los Angeles County for ~680 credit?",
    ],
  });
}

// ===== Entry points =====
export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  const intent = (req.nextUrl.searchParams.get("intent") ?? "").trim();
  return handle(req, intent);
}
