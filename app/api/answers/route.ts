// ==== SINGLE ENDPOINT GROK LANE: app/api/answers/route.ts ====
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
const XAI_API_KEY = process.env.XAI_API_KEY || "";
// Default to Grok 4.1 Fast for the speed test (can override via env)
const XAI_MODEL = (process.env.XAI_MODEL || "grok-4.1-fast").trim();

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

// --- fetch with timeout (hard cap) ---
async function fetchWithTimeout(
    input: RequestInfo | URL,
    init: RequestInit,
    timeoutMs: number
) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(input, { ...init, signal: controller.signal });
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
    | "refi"
    | "general";

function topicFromQuestion(q: string): Topic {
    const s = q.toLowerCase();
    if (/\brefi\b|refinance|break[- ]?even|closing costs?|term|years? left/.test(s))
        return "refi";
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
        case "refi":
            return "What’s your current rate, loan balance, and years left (or original term and start date)?";
        case "pmi":
            return "Want me to estimate PMI based on down payment and credit tier, or compare lender-paid vs borrower-paid?";
        case "rates":
            return "Are you asking about the market generally, or your specific scenario (state, loan type, credit range, down payment)?";
        case "fha":
            return "Do you want a 5-year cost comparison of FHA vs Conventional for your down payment and credit score?";
        case "va":
            return "Should I calculate your VA funding fee for first vs subsequent use across down payment tiers?";
        case "dp":
            return "Want me to show how +5% down changes payment and breakeven vs buying points?";
        case "dpa":
            return "What county and approximate income range should I use to narrow DPA options?";
        case "jumbo":
            return "What purchase price, down payment, and credit range should I assume for jumbo eligibility and reserves?";
        case "dscr":
            return "What’s the property type, ZIP, and estimated market rent so I can model DSCR and max loan?";
        default:
            return "What state/county and rough credit range should I tailor this to?";
    }
}

/* ===== Minimal “module” prompts (tiny by design for speed) ===== */
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

function moduleFromQuestion(q: string): ModuleKey {
    const s = q.toLowerCase();
    if (/(current.*rate|today.*rate|30.*year|30 year fixed|arm.*rate)/i.test(s))
        return "rate";
    if (
        /(refinance|refi|closing costs?|break[- ]?even|loan balance|remaining.*(year|term|month)|years? left)/i.test(
            s
        )
    )
        return "refi";
    if (
        /(how much.*qualify|qualify for|how much.*afford|afford.*home|income.*qualify|debt.*ratio|pre.?approve)/i.test(
            s
        )
    )
        return "qualify";
    if (/(arm\b|5\/1|7\/1|10\/1|adjustable|fixed vs arm)/i.test(s)) return "arm";
    if (/(points?|buy ?down|discount points?|buydown)/i.test(s)) return "buydown";
    if (/(jumbo|non.?conforming|high.?balance|loan limit)/i.test(s)) return "jumbo";
    if (/(underwrit|guideline|du\b|lp\b|manual underwrite|reserve|overlay)/i.test(s))
        return "underwriting";
    if (
        /(what is homerates|tell me about this site|what makes you different|who is the founder|who built homerates)/i.test(
            s
        )
    )
        return "about";
    return "general";
}

function compactWhitespace(s: string) {
    return (s ?? "")
        .replace(/\r/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function clampText(s: string, maxChars: number) {
    const x = (s ?? "").trim();
    if (!x) return "";
    if (x.length <= maxChars) return x;
    return x.slice(0, Math.max(0, maxChars - 1)).trimEnd() + "…";
}

/* ===== Core handler (single Grok lane) ===== */
async function handle(req: NextRequest, intentParam?: string) {
    type Body = {
        question?: string;
        intent?: string;
        mode?: "borrower" | "public";
        userId?: string;
    };

    const t0 = Date.now();
    const mark = (label: string) => console.log(`[ANSWERS TIMER] ${label}:`, Date.now() - t0, "ms");
    mark("start");

    const generatedAt = new Date().toISOString();
    const path = "answers";
    const tag = "answers-grok-single";

    let body: Body = {};
    let userId: string | undefined;

    if (req.method === "POST") {
        try {
            const raw = (await req.json()) as Body;
            body = raw;
            userId = raw.userId;
        } catch {
            body = {};
        }
    }

    const question = (req.nextUrl.searchParams.get("q") || body.question || "").trim();
    const intent = (intentParam || body.intent || "web").trim() || "web";

    if (!question) {
        const followUp =
            "Ask a specific mortgage question. Example: 'Refi break-even on $650k at 3.75% with 25 years left' or 'PMI at 5% down with ~720 credit in CA'.";
        return noStore({
            ok: true,
            route: "answers",
            intent,
            path,
            tag,
            generatedAt,
            message: followUp,
            answerMarkdown: "",
            followUp,
            usedFRED: false,
            usedTavily: false,
            fred: { tenYearYield: null, mort30Avg: null, spread: null, asOf: null },
            topSources: [],
            grok: null,
        });
    }

    const topic = topicFromQuestion(question);
    const module = moduleFromQuestion(question);

    // Minimal memory (optional)
    let conversationHistory = "";
    if (userId && supabase) {
        try {
            const { data: history } = await supabase
                .from("user_answers")
                .select("question, answer_summary, answer")
                .eq("clerk_user_id", userId)
                .order("created_at", { ascending: false })
                .limit(2);

            if (history?.length) {
                conversationHistory = history
                    .reverse()
                    .map((entry: any) => {
                        const prev =
                            entry.answer_summary ||
                            (typeof entry.answer === "object" && entry.answer?.answer
                                ? String(entry.answer.answer).slice(0, 220) + "…"
                                : "Previous answer");
                        return `User: ${entry.question}\nAssistant: ${prev}`;
                    })
                    .join("\n\n");
            }
        } catch (err: any) {
            console.warn("ANSWERS: memory fetch failed", err?.message || err);
        }
    }
    mark("after memory");

    const modulePrompts: Record<ModuleKey, string> = {
        general: "Answer clearly and concisely. If key inputs are missing, ask ONE question and stop.",
        rate: "Do not invent live market rates. Ask for state + scenario details if needed.",
        refi: "Refi Lab. Do not invent numbers. Ask ONE question if missing inputs.",
        arm: "Compare fixed vs ARM at a high level. Do not invent numbers unless asked for an example.",
        buydown: "Do not invent points/costs unless asked for an example.",
        jumbo: "Ask for purchase price, down payment, and credit range if missing.",
        underwriting: "Avoid guessing rules. Ask for program type and occupancy if missing.",
        qualify: "Use only user-provided income/debt. Ask ONE question if missing.",
        about: "Explain HomeRates.ai clearly (product + mission). Calm and precise.",
    };

    const today = new Date().toISOString().slice(0, 10);
    const specialist = clampText(compactWhitespace(modulePrompts[module] ?? ""), 420);
    const convoTrim = clampText(compactWhitespace(conversationHistory || ""), 340);

    const grokPrompt = compactWhitespace(`
${specialist}

Date: ${today}

Conversation (optional):
${convoTrim || "None"}

Current question:
"${question}"

ABSOLUTE RULES:
- Do NOT invent numbers, rates, payments, fees, or example scenarios unless the user explicitly asks for an example.
- If key inputs are missing, ask ONE short follow-up question and stop.
- Markdown only. Never output HTML (no <table>, <div>, etc.).
- If asked for "today's rates" / "market rates", do not quote a number without a cited source; ask for scenario details instead.

Return valid JSON only:
{
  "answer": "Markdown only. Use: **Summary**, **Key Numbers**, **What This Means For You**. Include **Comparison Table** ONLY if the user gave at least two numeric scenarios. Keep it 70–120 words.",
  "next_step": "1–2 concrete actions.",
  "follow_up": "One sharp follow-up question.",
  "confidence": "0.00–1.00 numeric score plus a short reason."
}
`.trim());

    if (!XAI_API_KEY) {
        return noStore(
            {
                ok: false,
                route: "answers",
                intent,
                path,
                tag,
                generatedAt,
                error: "Missing XAI_API_KEY",
                followUp: followUpFor(topic),
            },
            500
        );
    }

    mark("before Grok call");
    const grokStart = Date.now();
    console.log("[ANSWERS] model=", XAI_MODEL, "prompt_chars=", grokPrompt.length);

    let grokFinal: any = null;
    let servedModel: string | null = null;
    let reqId: string | null = null;

    try {
        const res = await fetchWithTimeout(
            "https://api.x.ai/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${XAI_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: XAI_MODEL,
                    messages: [{ role: "user", content: grokPrompt }],
                    response_format: { type: "json_object" },
                    temperature: 0.15,
                    max_tokens: 260,
                }),
                cache: "no-store",
            },
            60000
        );

        reqId = res.headers.get("x-request-id") ?? res.headers.get("request-id");
        if (!res.ok) throw new Error(`Grok HTTP ${res.status}`);
        const data = await res.json();

        servedModel = data?.model ?? data?.choices?.[0]?.model ?? null;

        const content = data?.choices?.[0]?.message?.content?.trim();
        if (!content) throw new Error("Empty Grok response");

        let cleaned = content.replace(/^```json\s*\n?/, "").replace(/\n?```$/, "").trim();
        const first = cleaned.indexOf("{");
        const last = cleaned.lastIndexOf("}");
        if (first !== -1 && last > first) cleaned = cleaned.slice(first, last + 1);

        if (cleaned.includes("<table") || cleaned.includes("<div")) throw new Error("HTML detected");

        grokFinal = JSON.parse(cleaned);

        if (!grokFinal.answer || !grokFinal.next_step || !grokFinal.follow_up || !grokFinal.confidence) {
            throw new Error("Missing fields in Grok JSON");
        }

        console.log("[ANSWERS] SUCCESS confidence:", grokFinal.confidence);
    } catch (e: any) {
        console.error("[ANSWERS] GROK FAILED", e?.name || "", e?.message || e, "reqId=", reqId);
        grokFinal = null;
    }

    mark("after Grok call");

    // If Grok failed: NO legacy answer. Return 502 so the UI can show a clean error state.
    if (!grokFinal) {
        return noStore(
            {
                ok: false,
                route: "answers",
                intent,
                path,
                tag,
                generatedAt,
                error: "Grok failed/timeout",
                followUp: followUpFor(topic),
                debug: {
                    requestedModel: XAI_MODEL,
                    servedModel,
                    promptChars: grokPrompt.length,
                    elapsedMs: Date.now() - grokStart,
                    requestId: reqId,
                },
            },
            502
        );
    }

    // Save memory
    if (userId && supabase) {
        try {
            await supabase.from("user_answers").insert({
                clerk_user_id: userId,
                question,
                answer: grokFinal,
                answer_summary:
                    typeof grokFinal.answer === "string" ? String(grokFinal.answer).slice(0, 320) + "…" : "",
                model: XAI_MODEL,
                created_at: new Date().toISOString(),
            });
        } catch (err: any) {
            console.warn("ANSWERS: save failed", err?.message || err);
        }
    }

    const finalMarkdown = `**Answer**\n${grokFinal.answer}\n\n**Confidence**: ${grokFinal.confidence}\n`;

    return noStore({
        ok: true,
        route: "answers",
        intent,
        path,
        tag,
        generatedAt,
        message: grokFinal.answer,
        answerMarkdown: finalMarkdown,
        followUp: grokFinal.follow_up || followUpFor(topic),
        usedFRED: false,
        usedTavily: false,
        fred: { tenYearYield: null, mort30Avg: null, spread: null, asOf: null },
        topSources: [],
        grok: grokFinal,
        debug: {
            requestedModel: XAI_MODEL,
            servedModel,
            promptChars: grokPrompt.length,
            elapsedMs: Date.now() - grokStart,
            requestId: reqId,
        },
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
