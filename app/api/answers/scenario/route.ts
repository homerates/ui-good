import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type MarketData = {
    date: string;
    thirtyYearFixed: number;
    tenYearTreasury: number;
    usedFallbacks: boolean;
    fallbackNotes: string[];
};

function todayISO(): string {
    return new Date().toISOString().split("T")[0];
}

function ms() {
    return Date.now();
}

function setNoStore(res: NextResponse) {
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
}

function attachServerTiming(
    res: NextResponse,
    timing: { fredMs?: number; xaiMs?: number; parseMs?: number; totalMs: number }
) {
    // Server-Timing header format: metric;dur=123.4
    const parts: string[] = [];
    if (typeof timing.fredMs === "number") parts.push(`fred;dur=${timing.fredMs}`);
    if (typeof timing.xaiMs === "number") parts.push(`xai;dur=${timing.xaiMs}`);
    if (typeof timing.parseMs === "number") parts.push(`parse;dur=${timing.parseMs}`);
    parts.push(`total;dur=${timing.totalMs}`);
    res.headers.set("Server-Timing", parts.join(", "));
}

async function getCurrentMortgageData(): Promise<MarketData> {
    const fredApiKey = process.env.FRED_API_KEY;

    const fallback: MarketData = {
        date: todayISO(),
        thirtyYearFixed: 6.27,
        tenYearTreasury: 4.16,
        usedFallbacks: true,
        fallbackNotes: ["FRED_API_KEY missing or FRED fetch failed; using default rates."],
    };

    if (!fredApiKey) return fallback;

    try {
        const mortgageRes = await fetch(
            `https://api.stlouisfed.org/fred/series/observations?series_id=MORTGAGE30US&api_key=${fredApiKey}&file_type=json&limit=1&sort_order=desc`,
            { cache: "no-store" }
        );
        const mortgageData = await mortgageRes.json();
        const latest30YearRaw = mortgageData?.observations?.[0]?.value;

        const treasuryRes = await fetch(
            `https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&api_key=${fredApiKey}&file_type=json&limit=1&sort_order=desc`,
            { cache: "no-store" }
        );
        const treasuryData = await treasuryRes.json();
        const tenYearRaw = treasuryData?.observations?.[0]?.value;

        const thirtyYearFixed = Number.parseFloat(latest30YearRaw);
        const tenYearTreasury = Number.parseFloat(tenYearRaw);

        const usedFallbacks =
            !Number.isFinite(thirtyYearFixed) || !Number.isFinite(tenYearTreasury);

        return {
            date: todayISO(),
            thirtyYearFixed: Number.isFinite(thirtyYearFixed) ? thirtyYearFixed : fallback.thirtyYearFixed,
            tenYearTreasury: Number.isFinite(tenYearTreasury) ? tenYearTreasury : fallback.tenYearTreasury,
            usedFallbacks,
            fallbackNotes: usedFallbacks
                ? ["FRED returned non-numeric values; default rate(s) used."]
                : [],
        };
    } catch (e) {
        console.error("FRED fetch error:", e);
        return fallback;
    }
}

// Minimal shape guard (keeps drift visible)
function assertScenarioResultShape(obj: any) {
    const requiredNumber = (k: string) =>
        typeof obj?.[k] === "number" && Number.isFinite(obj[k]);

    if (!obj || typeof obj !== "object") throw new Error("Model returned non-object JSON.");
    if (!requiredNumber("monthly_payment")) throw new Error("Missing/invalid monthly_payment.");
    if (!requiredNumber("total_interest_over_term")) throw new Error("Missing/invalid total_interest_over_term.");
    if (!Array.isArray(obj.amortization_summary)) throw new Error("Missing/invalid amortization_summary.");
    if (!obj.sensitivity_table || typeof obj.sensitivity_table !== "object")
        throw new Error("Missing/invalid sensitivity_table.");
    if (!obj.monte_carlo_summary || typeof obj.monte_carlo_summary !== "object")
        throw new Error("Missing/invalid monte_carlo_summary.");
    if (typeof obj.plain_english_summary !== "string") throw new Error("Missing/invalid plain_english_summary.");
    if (!Array.isArray(obj.key_risks)) throw new Error("Missing/invalid key_risks.");
}

function buildSystemPrompt(marketData: MarketData) {
    const fallbackLine = marketData.usedFallbacks
        ? `\nNOTE: Some market data used fallbacks: ${marketData.fallbackNotes.join(" ")}`
        : "";

    // IMPORTANT: this prompt still asks for structured JSON, but we’re not changing
    // your business logic yet — only measuring where time is spent.
    return `
You are HomeRates.AI — a privacy-first mortgage scenario engine.
Current date: ${marketData.date}
Market data:
- 30-year fixed mortgage rate: ${marketData.thirtyYearFixed.toFixed(2)}%
- 10-year Treasury yield: ${marketData.tenYearTreasury.toFixed(2)}%
${fallbackLine}

Return ONLY valid JSON matching this exact structure (no markdown, no extra text):
{
  "monthly_payment": number,
  "total_interest_over_term": number,
  "amortization_summary": [{ "year": number, "principal_paid": number, "interest_paid": number, "ending_balance": number }],
  "cash_flow_table": [{ "year": number, "net_cash_flow": number }],
  "sensitivity_table": { "current_rate": { "monthly_payment": number }, "plus_0_5pct": { "monthly_payment": number }, "minus_0_5pct": { "monthly_payment": number } },
  "monte_carlo_summary": { "probability_positive_cashflow": number, "median_irr": number, "worst_case_irr": number },
  "plain_english_summary": "string (100–200 words)",
  "key_risks": ["string", "string"]
}
`.trim();
}

async function callXaiChatCompletions(params: {
    system: string;
    user: string;
    model: string;
    temperature: number;
    maxTokens: number;
}) {
    const apiKey =
        process.env.XAI_API_KEY ||
        process.env.GROK_API_KEY ||
        process.env.XAI_TOKEN ||
        "";

    if (!apiKey) throw new Error("Missing XAI_API_KEY (or GROK_API_KEY).");

    const baseUrl = process.env.XAI_BASE_URL || "https://api.x.ai/v1";

    const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        cache: "no-store",
        body: JSON.stringify({
            model: params.model,
            messages: [
                { role: "system", content: params.system },
                { role: "user", content: params.user },
            ],
            temperature: params.temperature,
            response_format: { type: "json_object" },
            max_tokens: params.maxTokens,
        }),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`xAI chat/completions failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content?.trim();
    if (!raw) throw new Error("Empty response from xAI.");

    return JSON.parse(raw);
}

export async function POST(req: NextRequest) {
    const requestId =
        (globalThis.crypto as any)?.randomUUID?.() ||
        `hr_${Math.random().toString(36).slice(2)}_${Date.now()}`;

    const t0 = ms();
    let fredMs: number | undefined;
    let xaiMs: number | undefined;
    let parseMs: number | undefined;

    try {
        const body = await req.json().catch(() => ({}));
        const message = (body?.message || "").toString().trim();
        const userId = body?.userId ? String(body.userId) : null;

        if (!message) {
            const res = NextResponse.json({ error: "Message is required" }, { status: 400 });
            res.headers.set("x-hr-request-id", requestId);
            setNoStore(res);
            attachServerTiming(res, { totalMs: ms() - t0 });
            return res;
        }

        const tFred0 = ms();
        const marketData = await getCurrentMortgageData();
        fredMs = ms() - tFred0;

        const systemPrompt = buildSystemPrompt(marketData);

        const model = process.env.GROK_MODEL || "grok-4";
        const maxTokens = Number(process.env.XAI_MAX_TOKENS || 900);

        const tXai0 = ms();
        const result = await callXaiChatCompletions({
            system: systemPrompt,
            user: message,
            model,
            temperature: 0.1,
            maxTokens,
        });
        xaiMs = ms() - tXai0;

        const tParse0 = ms();
        assertScenarioResultShape(result);
        parseMs = ms() - tParse0;

        const res = NextResponse.json({
            success: true,
            provider: "xai",
            result,
            marketData,
            meta: {
                requestId,
                userIdPresent: Boolean(userId),
                model,
                maxTokens,
                timing_ms: {
                    fred_ms: fredMs,
                    xai_ms: xaiMs,
                    parse_ms: parseMs,
                    total_ms: ms() - t0,
                },
            },
        });

        res.headers.set("x-hr-request-id", requestId);
        setNoStore(res);
        attachServerTiming(res, { fredMs, xaiMs, parseMs, totalMs: ms() - t0 });
        return res;
    } catch (err: any) {
        const res = NextResponse.json(
            {
                error: "Scenario engine failed.",
                code: "SCENARIO_FAILED",
                detail: err instanceof Error ? err.message : String(err),
                meta: {
                    requestId,
                    timing_ms: {
                        fred_ms: fredMs ?? null,
                        xai_ms: xaiMs ?? null,
                        parse_ms: parseMs ?? null,
                        total_ms: ms() - t0,
                    },
                },
            },
            { status: 502 }
        );

        res.headers.set("x-hr-request-id", requestId);
        setNoStore(res);
        attachServerTiming(res, { fredMs, xaiMs, parseMs, totalMs: ms() - t0 });
        return res;
    }
}
