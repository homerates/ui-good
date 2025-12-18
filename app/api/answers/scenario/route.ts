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

function noStoreJson(body: unknown, init?: { status?: number }) {
    const res = NextResponse.json(body, { status: init?.status ?? 200 });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    return res;
}

function nowMs() {
    return Date.now();
}

function detectDetailMode(q: string): "fast" | "full" {
    const s = (q || "").toLowerCase();

    // Explicit “make it heavy” cues
    const wantsFull =
        s.includes("full table") ||
        s.includes("detailed table") ||
        s.includes("amortization table") ||
        s.includes("full amortization") ||
        s.includes("export") ||
        s.includes("csv") ||
        s.includes("download") ||
        s.includes("spreadsheet") ||
        s.includes("full projection") ||
        s.includes("monte carlo") ||
        s.includes("1000 runs") ||
        s.includes("1,000 runs") ||
        s.includes("simulate") ||
        s.includes("probability distribution");

    return wantsFull ? "full" : "fast";
}

async function getCurrentMortgageData(): Promise<MarketData> {
    const fredApiKey = process.env.FRED_API_KEY;

    const fallback: MarketData = {
        date: todayISO(),
        thirtyYearFixed: 6.27,
        tenYearTreasury: 4.16,
        usedFallbacks: true,
        fallbackNotes: ["FRED_API_KEY missing or FRED fetch failed; using conservative default rates."],
    };

    if (!fredApiKey) return fallback;

    try {
        // Latest 30-year fixed mortgage rate (MORTGAGE30US - weekly)
        const mortgageRes = await fetch(
            `https://api.stlouisfed.org/fred/series/observations?series_id=MORTGAGE30US&api_key=${fredApiKey}&file_type=json&limit=1&sort_order=desc`,
            { cache: "no-store" }
        );
        const mortgageData = await mortgageRes.json();
        const latest30YearRaw = mortgageData?.observations?.[0]?.value;

        // Latest 10-year Treasury yield (DGS10 - daily)
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
                ? ["FRED returned non-numeric values for one or more series; default rate(s) used."]
                : [],
        };
    } catch (error) {
        console.error("FRED fetch error:", error);
        return fallback;
    }
}

// Minimal strict shape check so we can detect drift (and avoid silently rendering prose).
function assertScenarioResultShape(obj: any) {
    const requiredNumber = (k: string) =>
        typeof obj?.[k] === "number" && Number.isFinite(obj[k]);

    if (!obj || typeof obj !== "object") throw new Error("Model returned non-object JSON.");
    if (!requiredNumber("monthly_payment")) throw new Error("Missing/invalid monthly_payment.");
    if (!requiredNumber("total_interest_over_term")) throw new Error("Missing/invalid total_interest_over_term.");
    if (!Array.isArray(obj.amortization_summary)) throw new Error("Missing/invalid amortization_summary array.");
    if (!obj.sensitivity_table || typeof obj.sensitivity_table !== "object")
        throw new Error("Missing/invalid sensitivity_table.");
    if (!obj.monte_carlo_summary || typeof obj.monte_carlo_summary !== "object")
        throw new Error("Missing/invalid monte_carlo_summary.");
    if (typeof obj.plain_english_summary !== "string" || obj.plain_english_summary.trim().length < 30)
        throw new Error("Missing/invalid plain_english_summary.");
    if (!Array.isArray(obj.key_risks)) throw new Error("Missing/invalid key_risks array.");
}

function buildSystemPrompt(marketData: MarketData, mode: "fast" | "full") {
    const fallbackLine = marketData.usedFallbacks
        ? `\nNOTE: Some market data used fallbacks: ${marketData.fallbackNotes.join(" ")}`
        : "";

    // The key latency fix: default “fast” forbids heavy outputs unless explicitly asked.
    const modeRules =
        mode === "fast"
            ? `
MODE: FAST
- Keep output compact.
- amortization_summary: YEARLY rows, max 10 rows (years 1–10).
- cash_flow_table: YEARLY rows, max 10 rows; use [] if not a rental/investment analysis.
- sensitivity_table: include only monthly_payment values.
- monte_carlo_summary: provide LIGHTWEIGHT estimates (no heavy simulation).
`
            : `
MODE: FULL
- amortization_summary: YEARLY rows, max 30 rows.
- cash_flow_table: YEARLY rows, max 30 rows if applicable.
- sensitivity_table: can include additional fields if helpful.
- monte_carlo_summary: still keep it summary-level (no huge outputs).
`;

    return `
You are HomeRates.AI — a privacy-first mortgage "Smart Scenario" engine.
Current date: ${marketData.date}
Market data:
- 30-year fixed mortgage rate: ${marketData.thirtyYearFixed.toFixed(2)}%
- 10-year Treasury yield: ${marketData.tenYearTreasury.toFixed(2)}%
${fallbackLine}

DEFAULTS (only if user doesn't specify):
- Property taxes: 1.0–1.25% annually
- Homeowners insurance: 0.5% annually
- Rental vacancy: 5–8% (rentals)
- Maintenance/CapEx: 1% annually
- Home price appreciation: 3–5% annually

${modeRules}

CRITICAL OUTPUT RULES:
- Output ONLY valid JSON (no markdown, no extra text).
- Use raw numbers only (no % signs, no commas).
- If inputs are missing, choose ONE conservative assumption and mention it in plain_english_summary + key_risks.

Return ONLY this structure:
{
  "monthly_payment": number,
  "total_interest_over_term": number,
  "amortization_summary": [{ "year": number, "principal_paid": number, "interest_paid": number, "ending_balance": number }],
  "cash_flow_table": [{ "year": number, "net_cash_flow": number }],
  "sensitivity_table": {
    "current_rate": { "monthly_payment": number },
    "plus_0_5pct": { "monthly_payment": number },
    "minus_0_5pct": { "monthly_payment": number }
  },
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

    if (!apiKey) {
        throw new Error("Missing XAI_API_KEY (or GROK_API_KEY).");
    }

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

    // MUST be JSON (response_format should enforce, but we still parse + validate)
    return { raw, parsed: JSON.parse(raw) };
}

export async function POST(req: NextRequest) {
    const t0 = nowMs();

    let tFredStart = 0;
    let tFredEnd = 0;
    let tXaiStart = 0;
    let tXaiEnd = 0;
    let tParseStart = 0;
    let tParseEnd = 0;

    try {
        const body = await req.json().catch(() => ({}));
        const message = (body?.message || "").toString().trim();
        const userId = body?.userId ? String(body.userId) : null;

        if (!message) return noStoreJson({ error: "Message is required" }, { status: 400 });
        if (message.length > 20000) {
            return noStoreJson({ error: "Message too long. Please shorten and retry." }, { status: 400 });
        }

        const mode = detectDetailMode(message);

        tFredStart = nowMs();
        const marketData = await getCurrentMortgageData();
        tFredEnd = nowMs();

        const systemPrompt = buildSystemPrompt(marketData, mode);

        // Practical latency control: cap tokens in FAST mode
        const model = process.env.GROK_MODEL || "grok-4";
        const maxTokens =
            mode === "fast"
                ? Number(process.env.XAI_MAX_TOKENS_FAST || 700)
                : Number(process.env.XAI_MAX_TOKENS_FULL || 1200);

        tXaiStart = nowMs();
        const { parsed } = await callXaiChatCompletions({
            system: systemPrompt,
            user: message,
            model,
            temperature: 0.1,
            maxTokens,
        });
        tXaiEnd = nowMs();

        tParseStart = nowMs();
        assertScenarioResultShape(parsed);
        tParseEnd = nowMs();

        const totalMs = nowMs() - t0;

        return noStoreJson({
            success: true,
            provider: "xai",
            mode,
            result: parsed,
            marketData,
            meta: {
                userIdPresent: Boolean(userId),
                usedFREDFallbacks: marketData.usedFallbacks,
                model,
                maxTokens,
                timing_ms: {
                    fred_ms: tFredEnd - tFredStart,
                    xai_ms: tXaiEnd - tXaiStart,
                    parse_ms: tParseEnd - tParseStart,
                    total_ms: totalMs,
                },
            },
        });
    } catch (error: any) {
        const totalMs = nowMs() - t0;
        const detail = error instanceof Error ? error.message : String(error);

        console.error("Scenario endpoint error:", error);

        return noStoreJson(
            {
                error: "Scenario engine failed.",
                code: "SCENARIO_FAILED",
                detail,
                meta: {
                    timing_ms: {
                        fred_ms: tFredEnd && tFredStart ? tFredEnd - tFredStart : null,
                        xai_ms: tXaiEnd && tXaiStart ? tXaiEnd - tXaiStart : null,
                        parse_ms: tParseEnd && tParseStart ? tParseEnd - tParseStart : null,
                        total_ms: totalMs,
                    },
                },
            },
            { status: 502 }
        );
    }
}
