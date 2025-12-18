// HR-Build: scenario-proof-12-18-25-v2
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

/* =========================
   Helpers
========================= */
function noStore(json: any, init?: ResponseInit) {
    return NextResponse.json(json, {
        ...(init || {}),
        headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            Pragma: "no-cache",
            Expires: "0",
            ...(init?.headers || {}),
        },
    });
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string) {
    let t: any;
    const timeout = new Promise<never>((_, rej) => {
        t = setTimeout(() => rej(new Error(`Timeout: ${label} after ${ms}ms`)), ms);
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

function safeNumber(v: any): number | null {
    const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
    return Number.isFinite(n) ? n : null;
}

function extractLikelyJsonObject(text: string): string | null {
    if (!text) return null;
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first === -1 || last === -1 || last <= first) return null;
    const slice = text.slice(first, last + 1).trim();
    return slice.startsWith("{") && slice.endsWith("}") ? slice : null;
}

function compactWhitespace(s: string) {
    return s.replace(/\s+/g, " ").trim();
}

/* =========================
   FRED market data (parallel, fast)
========================= */
async function getCurrentMortgageData() {
    const fredApiKey = process.env.FRED_API_KEY;

    const today = new Date().toISOString().slice(0, 10);

    // Hard fallback if key missing
    if (!fredApiKey) {
        return {
            date: today,
            thirtyYearFixed: 6.27,
            tenYearTreasury: 4.16,
            usedFallbacks: true,
            fallbackNotes: ["FRED_API_KEY missing; used hardcoded defaults."],
        };
    }

    const base = "https://api.stlouisfed.org/fred/series/observations";
    const mortUrl = `${base}?series_id=MORTGAGE30US&api_key=${fredApiKey}&file_type=json&limit=1&sort_order=desc`;
    const tsyUrl = `${base}?series_id=DGS10&api_key=${fredApiKey}&file_type=json&limit=1&sort_order=desc`;

    const notes: string[] = [];
    let usedFallbacks = false;

    try {
        const [mortRes, tsyRes] = await Promise.all([
            withTimeout(fetch(mortUrl, { cache: "no-store" }), 8000, "FRED MORTGAGE30US"),
            withTimeout(fetch(tsyUrl, { cache: "no-store" }), 8000, "FRED DGS10"),
        ]);

        const [mortJson, tsyJson] = await Promise.all([
            mortRes.json().catch(() => null),
            tsyRes.json().catch(() => null),
        ]);

        const mortVal = mortJson?.observations?.[0]?.value;
        const tsyVal = tsyJson?.observations?.[0]?.value;

        const thirty = safeNumber(mortVal);
        const ten = safeNumber(tsyVal);

        if (thirty == null) {
            usedFallbacks = true;
            notes.push("FRED MORTGAGE30US missing/invalid; defaulted to 6.27.");
        }
        if (ten == null) {
            usedFallbacks = true;
            notes.push("FRED DGS10 missing/invalid; defaulted to 4.16.");
        }

        return {
            date: today,
            thirtyYearFixed: thirty ?? 6.27,
            tenYearTreasury: ten ?? 4.16,
            usedFallbacks,
            fallbackNotes: notes,
        };
    } catch (err: any) {
        return {
            date: today,
            thirtyYearFixed: 6.27,
            tenYearTreasury: 4.16,
            usedFallbacks: true,
            fallbackNotes: [`FRED fetch error: ${err?.message || String(err)}`],
        };
    }
}

/* =========================
   xAI chat call (self-contained)
========================= */
async function callXaiJson(systemPrompt: string, userPrompt: string, maxTokens: number) {
    const XAI_API_KEY = process.env.XAI_API_KEY;
    const model = process.env.XAI_MODEL_SCENARIO || process.env.XAI_MODEL || "grok-4";

    if (!XAI_API_KEY) {
        throw new Error("Missing XAI_API_KEY");
    }

    // Matches the pattern used in your main /api/answers route (no custom client import).
    const url = "https://api.x.ai/v1/chat/completions";

    const payload = {
        model,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: maxTokens,
        response_format: { type: "json_object" as const },
    };

    const res = await withTimeout(
        fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${XAI_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            cache: "no-store",
        }),
        240000, // keep high while diagnosing; we’ll tighten once we know behavior
        "xAI chat.completions"
    );

    const text = await res.text().catch(() => "");

    if (!res.ok) {
        throw new Error(`xAI error ${res.status}: ${text.slice(0, 300)}`);
    }

    let json: any = null;
    try {
        json = JSON.parse(text);
    } catch {
        // Some gateways wrap JSON weirdly; try to salvage
        const salvaged = extractLikelyJsonObject(text);
        if (!salvaged) throw new Error("xAI returned non-JSON response body");
        json = JSON.parse(salvaged);
    }

    const content = json?.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("Empty content from xAI");

    // content should itself be JSON because response_format=json_object
    try {
        return { model, raw: content, parsed: JSON.parse(content) };
    } catch {
        const salvaged = extractLikelyJsonObject(content);
        if (!salvaged) throw new Error("Model content was not valid JSON");
        return { model, raw: content, parsed: JSON.parse(salvaged) };
    }
}

/* =========================
   Route
========================= */
export async function POST(req: NextRequest) {
    const t0 = Date.now();
    const buildTag = "scenario-proof-12-18-25-v2";
    const requestId =
        (globalThis.crypto as any)?.randomUUID?.() ||
        Math.random().toString(36).slice(2);

    let fred_ms = 0;
    let xai_ms = 0;
    let parse_ms = 0;

    try {
        const body = (await req.json().catch(() => ({}))) as {
            message?: string;
            userId?: string;
        };

        const message = (body?.message || "").trim();
        const userId = body?.userId;

        if (!message) {
            return noStore(
                { error: "Message is required" },
                { status: 400, headers: { "X-Hr-Build-Tag": buildTag, "X-Hr-Request-Id": requestId } }
            );
        }

        // 1) FRED
        const tFred = Date.now();
        const marketData = await getCurrentMortgageData();
        fred_ms = Date.now() - tFred;

        // 2) Prompt (keep it tight; long system prompts = longer reasoning time)
        const systemPrompt = compactWhitespace(`
You are HomeRates.AI Smart Scenario Engine.
Return ONLY valid JSON matching the schema below. No markdown. No extra keys.

Date: ${marketData.date}
Live data:
- 30-year fixed (FRED MORTGAGE30US): ${marketData.thirtyYearFixed.toFixed(2)}%
- 10-year Treasury (FRED DGS10): ${marketData.tenYearTreasury.toFixed(2)}%

Defaults if user does not specify:
- Property taxes: 1.10% annually
- Homeowners insurance: 0.50% annually
- Vacancy: 6%
- Maintenance/CapEx: 1.00% annually
- Appreciation: 4% annually

Schema:
{
  "monthly_payment": number,
  "total_interest_over_term": number,
  "amortization_summary": [{ "year": number, "principal_paid": number, "interest_paid": number, "ending_balance": number }],
  "cash_flow_table": [{ "year": number, "net_cash_flow": number }],
  "sensitivity_table": { "current_rate": { "monthly_payment": number }, "plus_0_5pct": { "monthly_payment": number }, "minus_0_5pct": { "monthly_payment": number } },
  "monte_carlo_summary": { "probability_positive_cashflow": number, "median_irr": number, "worst_case_irr": number },
  "plain_english_summary": "string",
  "key_risks": ["string", "string"]
}
    `);

        // 3) xAI
        const tXai = Date.now();
        const maxTokens = 900;
        const xai = await callXaiJson(systemPrompt, message, maxTokens);
        xai_ms = Date.now() - tXai;

        // 4) parse timing (mostly negligible, but tracked)
        const tParse = Date.now();
        const result = xai.parsed;
        parse_ms = Date.now() - tParse;

        const total_ms = Date.now() - t0;

        return noStore(
            {
                success: true,
                provider: "xai",
                result,
                marketData,
                meta: {
                    build_tag: buildTag,
                    requestId,
                    userIdPresent: Boolean(userId),
                    model: xai.model,
                    maxTokens,
                    timing_ms: {
                        fred_ms,
                        xai_ms,
                        parse_ms,
                        total_ms,
                    },
                },
            },
            {
                headers: {
                    "X-Hr-Build-Tag": buildTag,
                    "X-Hr-Request-Id": requestId,
                },
            }
        );
    } catch (err: any) {
        const total_ms = Date.now() - t0;

        return noStore(
            {
                error: "Failed to process scenario. Please try again.",
                meta: {
                    build_tag: "scenario-proof-12-18-25-v2",
                    requestId,
                    timing_ms: { fred_ms, xai_ms, parse_ms, total_ms },
                    detail: err?.message || String(err),
                },
            },
            {
                status: 500,
                headers: {
                    "X-Hr-Build-Tag": "scenario-proof-12-18-25-v2",
                    "X-Hr-Request-Id": requestId,
                },
            }
        );
    }
}
