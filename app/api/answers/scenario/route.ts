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
    res.headers.set(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    return res;
}

async function getCurrentMortgageData(): Promise<MarketData> {
    const fredApiKey = process.env.FRED_API_KEY;

    const fallback: MarketData = {
        date: todayISO(),
        thirtyYearFixed: 6.27,
        tenYearTreasury: 4.16,
        usedFallbacks: true,
        fallbackNotes: [
            "FRED_API_KEY missing or FRED fetch failed; using conservative default rates.",
        ],
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
            thirtyYearFixed: Number.isFinite(thirtyYearFixed)
                ? thirtyYearFixed
                : fallback.thirtyYearFixed,
            tenYearTreasury: Number.isFinite(tenYearTreasury)
                ? tenYearTreasury
                : fallback.tenYearTreasury,
            usedFallbacks,
            fallbackNotes: usedFallbacks
                ? [
                    "FRED returned non-numeric values for one or more series; default rate(s) used.",
                ]
                : [],
        };
    } catch (error) {
        console.error("FRED fetch error:", error);
        return fallback;
    }
}

function assertScenarioResultShape(obj: any) {
    const requiredNumber = (k: string) =>
        typeof obj?.[k] === "number" && Number.isFinite(obj[k]);
    const requiredString = (k: string) =>
        typeof obj?.[k] === "string" && obj[k].length > 0;

    if (!obj || typeof obj !== "object") throw new Error("Model returned non-object JSON.");

    if (!requiredNumber("monthly_payment")) throw new Error("Missing/invalid monthly_payment.");
    if (!requiredNumber("total_interest_over_term")) throw new Error("Missing/invalid total_interest_over_term.");
    if (!Array.isArray(obj.amortization_summary)) throw new Error("Missing/invalid amortization_summary array.");
    if (!obj.sensitivity_table || typeof obj.sensitivity_table !== "object")
        throw new Error("Missing/invalid sensitivity_table.");
    if (!obj.monte_carlo_summary || typeof obj.monte_carlo_summary !== "object")
        throw new Error("Missing/invalid monte_carlo_summary.");
    if (!requiredString("plain_english_summary")) throw new Error("Missing/invalid plain_english_summary.");
    if (!Array.isArray(obj.key_risks)) throw new Error("Missing/invalid key_risks array.");
}

function buildSystemPrompt(marketData: MarketData) {
    const fallbackLine = marketData.usedFallbacks
        ? `\nNOTE: Some market data used fallbacks: ${marketData.fallbackNotes.join(" ")}`
        : "";

    return `
You are HomeRates.AI — an unbiased, privacy-first mortgage intelligence engine.
Current date: ${marketData.date}
Latest market data:
- 30-year fixed mortgage rate: ${marketData.thirtyYearFixed.toFixed(2)}%
- 10-year Treasury yield: ${marketData.tenYearTreasury.toFixed(2)}%
${fallbackLine}

TASK:
Analyze the user's mortgage, refinance, or investment property scenario using the data above.
Use conservative defaults unless the user specifies otherwise:
- Property taxes: 1.0–1.25% of home value annually
- Homeowners insurance: 0.5% annually
- Rental vacancy: 5–8%
- Maintenance/CapEx: 1% of property value annually
- Home price appreciation: 3–5% annually

CRITICAL OUTPUT RULES:
- Return ONLY valid JSON (no markdown, no extra text).
- Use numbers as raw numbers (no % signs, no commas).
- If the user did not provide a value needed, choose ONE conservative assumption and clearly reflect it in the plain_english_summary and key_risks.

Return JSON matching EXACTLY this structure:
{
  "monthly_payment": number,
  "total_interest_over_term": number,
  "amortization_summary": [{ "year": number, "principal_paid": number, "interest_paid": number, "ending_balance": number }],
  "cash_flow_table": [{ "year": number, "net_cash_flow": number }],
  "sensitivity_table": { "current_rate": { ... }, "plus_0_5pct": { ... }, "minus_0_5pct": { ... } },
  "monte_carlo_summary": { "probability_positive_cashflow": number, "median_irr": number, "worst_case_irr": number },
  "plain_english_summary": "string (100–200 words)",
  "key_risks": ["string", "string"]
}

IMPORTANT:
- cash_flow_table can be an empty array if scenario is not a rental/investment analysis.
- sensitivity_table keys must exist even if values are simplified.
`.trim();
}

async function callXaiChatCompletions(params: {
    system: string;
    user: string;
    model: string;
    temperature: number;
}) {
    const apiKey =
        process.env.XAI_API_KEY ||
        process.env.GROK_API_KEY ||
        process.env.XAI_TOKEN ||
        "";

    if (!apiKey) {
        throw new Error("Missing XAI_API_KEY (or GROK_API_KEY).");
    }

    // xAI docs: OpenAI-compatible endpoint at https://api.x.ai/v1/chat/completions :contentReference[oaicite:1]{index=1}
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
    try {
        const body = await req.json().catch(() => ({}));
        const message = (body?.message || "").toString().trim();
        const userId = body?.userId ? String(body.userId) : null;

        if (!message) {
            return noStoreJson({ error: "Message is required" }, { status: 400 });
        }

        if (message.length > 20_000) {
            return noStoreJson(
                { error: "Message too long. Please shorten and retry." },
                { status: 400 }
            );
        }

        const marketData = await getCurrentMortgageData();
        const systemPrompt = buildSystemPrompt(marketData);

        const model = process.env.GROK_MODEL || "grok-4";

        const result = await callXaiChatCompletions({
            system: systemPrompt,
            user: message,
            model,
            temperature: 0.1,
        });

        assertScenarioResultShape(result);

        return noStoreJson({
            success: true,
            provider: "xai",
            result,
            marketData,
            meta: {
                userIdPresent: Boolean(userId),
                usedFREDFallbacks: marketData.usedFallbacks,
            },
        });
    } catch (error) {
        console.error("Scenario endpoint error:", error);
        return noStoreJson(
            { error: "Failed to process scenario. Please try again." },
            { status: 500 }
        );
    }
}
