// HR-Build: scenario-proof-12-19-25-v5
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
    return Promise.race([p.finally(() => clearTimeout(t)), timeout]);
}

function extractLikelyJsonObject(text: string) {
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

function isFiniteNumber(n: any): n is number {
    return typeof n === "number" && Number.isFinite(n);
}

function safeAbsMoney(n: any) {
    return isFiniteNumber(n) ? Math.abs(n) : n;
}

function hasAny(text: string, terms: string[]) {
    const t = (text || "").toLowerCase();
    return terms.some((k) => t.includes(k));
}

function formatUSD(n: number, decimals = 0) {
    try {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: decimals,
            minimumFractionDigits: decimals,
        }).format(n);
    } catch {
        // Fallback if Intl is unavailable
        const fixed = n.toFixed(decimals);
        return `$${fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
    }
}

function formatPct(n: number, decimals = 2) {
    return `${n.toFixed(decimals)}%`;
}

/**
 * Parse dollar amounts like "$650,000" "$3,600" "650k" "1.2m"
 * Returns a number or null.
 */
function parseMoneyLike(s: string) {
    if (!s) return null;
    const raw = s.toLowerCase().replace(/,/g, "").trim();
    const m = raw.match(/^\$?\s*(\d+(\.\d+)?)\s*([km])?$/i);
    if (!m) return null;
    const base = Number(m[1]);
    if (!Number.isFinite(base)) return null;
    const suffix = m[3];
    if (suffix === "k") return base * 1000;
    if (suffix === "m") return base * 1_000_000;
    return base;
}

/**
 * Only treat a percent as a USER-PROVIDED MORTGAGE RATE if it appears in a rate context.
 * Prevents capture of "tax 1.10%" / "vacancy 7%" etc.
 */
function detectUserProvidedRate(message: string) {
    const m = message || "";

    // Strong context: "rate 6.25%", "interest rate 6.25%", "APR 6.25%"
    const ctx1 = m.match(
        /\b(?:interest\s*rate|rate|apr)\s*(?:is|=|at)?\s*(\d{1,2}(?:\.\d{1,3})?)\s*%/i
    );
    if (ctx1) {
        const val = Number(ctx1[1]);
        if (Number.isFinite(val) && val >= 0.5 && val <= 20) return val;
    }

    // Moderate context: "at 6.25%" but reject if nearby mentions non-rate keywords.
    const ctx2 = m.match(/\bat\s*(\d{1,2}(?:\.\d{1,3})?)\s*%/i);
    if (ctx2) {
        const val = Number(ctx2[1]);
        if (!Number.isFinite(val) || val < 0.5 || val > 20) return null;

        const idx = ctx2.index ?? 0;
        const windowText = m
            .slice(Math.max(0, idx - 50), Math.min(m.length, idx + 50))
            .toLowerCase();

        const nonRateHints = [
            "tax",
            "property tax",
            "insurance",
            "vacancy",
            "maintenance",
            "capex",
            "hoa",
            "appreciation",
            "rent",
            "growth",
        ];

        if (nonRateHints.some((h) => windowText.includes(h))) return null;
        return val;
    }

    return null;
}

/**
 * Rate sensitivity ONLY when borrower explicitly asks for rate comparisons.
 */
function wantsRateSensitivity(message: string) {
    const m = (message || "").toLowerCase();

    const explicitPhrases = [
        "rate comparison",
        "compare rates",
        "if rates go up",
        "if rates go down",
        "if rates increase",
        "if rates decrease",
        "if rates rise",
        "if rates fall",
        "higher rate",
        "lower rate",
        "rate shock",
        "stress test",
        "rate stress",
        "rate sensitivity",
        "show cash flow under current rate vs",
    ];
    if (explicitPhrases.some((p) => m.includes(p))) return true;

    // Explicit deltas
    const deltaPatterns = [
        /(\+|\-)\s*0\.?5\s*%/i,
        /(\+|\-)\s*1(\.0)?\s*%/i,
        /\bplus\s*0\.?5\b/i,
        /\bplus\s*1\b/i,
        /\bminus\s*0\.?5\b/i,
    ];
    if (deltaPatterns.some((re) => re.test(m))) return true;

    return false;
}

/* =========================
   Inputs summary extraction (borrower-visible)
========================= */
function extractScenarioInputs(message: string) {
    const m = message || "";

    const inputs: any = {};

    // Price / balance: first large $ figure (> $50k) is typically price or balance.
    const dollarMatches = Array.from(m.matchAll(/\$?\s*[\d,.]+(?:\s*[km])?/gi))
        .map(x => x[0])
        .map(x => x.trim());

    const moneyValues = dollarMatches
        .map(v => ({ raw: v, val: parseMoneyLike(v) }))
        .filter(x => x.val != null) as { raw: string; val: number }[];

    // Rent detection
    const rentMatch = m.match(/rent\s*(?:is|=|:)?\s*\$?\s*([\d,.]+)\s*(?:\/?\s*mo|month|monthly)?/i);
    if (rentMatch) {
        const rentVal = parseMoneyLike(rentMatch[1]);
        if (rentVal != null) inputs.rent_monthly = rentVal;
    }

    // Purchase price / balance selection
    const largeMoney = moneyValues.filter(x => x.val >= 50_000);
    if (largeMoney.length) {
        // Prefer explicit "buying a $X home" / "purchase $X"
        const buyMatch = m.match(/buy(?:ing)?\s*(?:a|an)?\s*\$?\s*([\d,.]+)\s*(?:home|house|property)?/i);
        const ppMatch = m.match(/\b(?:purchase\s*price|price|pp)\s*(?:is|=|:)?\s*\$?\s*([\d,.]+)\b/i);
        const balMatch = m.match(/\b(?:balance|loan\s*balance)\s*(?:is|=|:)?\s*\$?\s*([\d,.]+)\b/i);

        const pick = (mm: RegExpMatchArray | null) => (mm ? parseMoneyLike(mm[1]) : null);

        const buyVal = pick(buyMatch);
        const ppVal = pick(ppMatch);
        const balVal = pick(balMatch);

        if (buyVal != null) inputs.price = buyVal;
        else if (ppVal != null) inputs.price = ppVal;
        else if (balVal != null) inputs.balance = balVal;
        else inputs.price = largeMoney[0].val;
    }

    // Down payment percent
    const downPct = m.match(/(\d{1,2}(?:\.\d+)?)\s*%\s*down/i);
    if (downPct) {
        const dp = Number(downPct[1]);
        if (Number.isFinite(dp) && dp > 0 && dp < 100) inputs.down_payment_pct = dp;
    }

    // Vacancy
    const vac = m.match(/vacancy\s*(?:is|=|:)?\s*(\d{1,2}(?:\.\d+)?)\s*%/i);
    if (vac) {
        const v = Number(vac[1]);
        if (Number.isFinite(v)) inputs.vacancy_pct = v;
    }

    // Maintenance
    const maint = m.match(/maintenance\s*(?:is|=|:)?\s*(\d{1,2}(?:\.\d+)?)\s*%/i);
    if (maint) {
        const v = Number(maint[1]);
        if (Number.isFinite(v)) inputs.maintenance_pct = v;
    }

    // Property tax
    const tax = m.match(/property\s*tax(?:es)?\s*(?:is|=|:)?\s*(\d{1,2}(?:\.\d+)?)\s*%/i);
    if (tax) {
        const v = Number(tax[1]);
        if (Number.isFinite(v)) inputs.property_tax_pct = v;
    }

    // Insurance
    const ins = m.match(/insurance\s*(?:is|=|:)?\s*(\d{1,2}(?:\.\d+)?)\s*%/i);
    if (ins) {
        const v = Number(ins[1]);
        if (Number.isFinite(v)) inputs.insurance_pct = v;
    }

    // Extra payment / invest return
    const extra = m.match(/extra\s*\$?\s*([\d,.]+)\s*\/?\s*(?:mo|month|monthly)/i);
    if (extra) {
        const v = parseMoneyLike(extra[1]);
        if (v != null) inputs.extra_payment_monthly = v;
    }

    const invest = m.match(/invest(?:ing)?\s*(?:it\s*)?at\s*(\d{1,2}(?:\.\d+)?)\s*%/i);
    if (invest) {
        const v = Number(invest[1]);
        if (Number.isFinite(v)) inputs.invest_return_pct = v;
    }

    // Term / years left
    const yrsLeft = m.match(/(\d{1,2})\s*years?\s*left/i);
    if (yrsLeft) {
        const v = Number(yrsLeft[1]);
        if (Number.isFinite(v)) inputs.years_left = v;
    }

    return inputs;
}

function buildInputsSummary(inputs: any, rate_context: any) {
    const lines: string[] = [];
    lines.push("Scenario inputs");

    if (inputs.price != null) lines.push(`- Purchase price: ${formatUSD(inputs.price)}`);
    if (inputs.balance != null) lines.push(`- Loan balance: ${formatUSD(inputs.balance)}`);

    if (inputs.down_payment_pct != null && inputs.price != null) {
        const dpPct = inputs.down_payment_pct;
        const dpAmt = (inputs.price * dpPct) / 100;
        const loanAmt = inputs.price - dpAmt;
        lines.push(`- Down payment: ${formatPct(dpPct, 2)} (${formatUSD(dpAmt)})`);
        lines.push(`- Loan amount: ${formatUSD(loanAmt)}`);
    } else if (inputs.down_payment_pct != null) {
        lines.push(`- Down payment: ${formatPct(inputs.down_payment_pct, 2)}`);
    }

    if (inputs.rent_monthly != null) lines.push(`- Rent: ${formatUSD(inputs.rent_monthly)}/mo`);

    if (inputs.vacancy_pct != null) lines.push(`- Vacancy: ${formatPct(inputs.vacancy_pct, 2)}`);
    if (inputs.maintenance_pct != null) lines.push(`- Maintenance: ${formatPct(inputs.maintenance_pct, 2)} (annual assumption)`);
    if (inputs.property_tax_pct != null) lines.push(`- Property tax: ${formatPct(inputs.property_tax_pct, 2)} (annual assumption)`);
    if (inputs.insurance_pct != null) lines.push(`- Insurance: ${formatPct(inputs.insurance_pct, 2)} (annual assumption)`);

    if (inputs.extra_payment_monthly != null) lines.push(`- Extra payment: ${formatUSD(inputs.extra_payment_monthly)}/mo`);
    if (inputs.invest_return_pct != null) lines.push(`- Investment return: ${formatPct(inputs.invest_return_pct, 2)} (assumed)`);

    if (inputs.years_left != null) lines.push(`- Term remaining: ${inputs.years_left} years`);

    if (rate_context?.rate_used != null) {
        const rateLine = `- Rate used: ${formatPct(Number(rate_context.rate_used), 2)} (${rate_context.source}${rate_context.as_of ? `, ${rate_context.as_of}` : ""})`;
        lines.push(rateLine);
    }

    return lines.join("\n");
}

/* =========================
   Scenario normalizer
========================= */
function normalizeForGrokCard(result: any, message: string, marketData: any) {
    const out = { ...(result || {}) };

    // Always protect against negative payments being rendered as negative “payment”
    out.monthly_payment = safeAbsMoney(out.monthly_payment);

    // Decide if borrower requested rate comparison
    const includeRateSensitivity = wantsRateSensitivity(message);

    // If NOT explicitly requested, remove sensitivity_table entirely (even if model returns it)
    if (!includeRateSensitivity) {
        delete out.sensitivity_table;
    } else if (out.sensitivity_table && typeof out.sensitivity_table === "object") {
        // sanitize within sensitivity rows
        for (const key of Object.keys(out.sensitivity_table)) {
            const row = out.sensitivity_table[key];
            if (row && typeof row === "object" && "monthly_payment" in row) {
                row.monthly_payment = safeAbsMoney((row as any).monthly_payment);
            }
        }
    }

    // Rate provenance: add rate_context + prepend to summary
    const userRate = detectUserProvidedRate(message);
    const rateUsed = userRate ?? marketData?.thirtyYearFixed ?? null;

    const rate_context = {
        rate_used: rateUsed,
        source: userRate != null ? "user" : "FRED",
        as_of: marketData?.date ?? null,
        series: userRate != null ? null : "MORTGAGE30US",
    };
    out.rate_context = rate_context;

    // Inputs summary (borrower-visible + structured)
    const extractedInputs = extractScenarioInputs(message);
    out.scenario_inputs = extractedInputs;
    const inputsBlock = buildInputsSummary(extractedInputs, rate_context);

    // Summary: ensure Inputs block appears first, then the model narrative (no duplication)
    const narrative =
        typeof out.plain_english_summary === "string" && out.plain_english_summary.trim()
            ? out.plain_english_summary.trim()
            : "";

    // If narrative already starts with "Scenario inputs", don't double-insert.
    if (narrative.toLowerCase().startsWith("scenario inputs")) {
        out.plain_english_summary = narrative;
    } else {
        out.plain_english_summary = narrative
            ? `${inputsBlock}\n\n${narrative}`
            : inputsBlock;
    }

    // GrokCard-friendly tables with short headers (prevents header overlap)
    const grokcard_tables: any = {};

    if (Array.isArray(out.amortization_summary) && out.amortization_summary.length) {
        grokcard_tables.amortization_snapshot = {
            headers: ["Yr", "Prin", "Int", "Bal"],
            rows: out.amortization_summary.map((r: any) => [
                r.year,
                r.principal_paid,
                r.interest_paid,
                r.ending_balance,
            ]),
        };
    }

    if (Array.isArray(out.cash_flow_table) && out.cash_flow_table.length) {
        grokcard_tables.cash_flow = {
            headers: ["Yr", "Net CF"],
            rows: out.cash_flow_table.map((r: any) => [r.year, r.net_cash_flow]),
            unit: "annual_or_periodic",
        };
    }

    // Only build rate sensitivity table if borrower requested it AND sensitivity_table exists
    if (includeRateSensitivity && out.sensitivity_table && typeof out.sensitivity_table === "object") {
        const rows: any[] = [];
        const order = ["current_rate", "plus_0_5pct", "plus_1pct", "minus_0_5pct"];
        const keys = Array.from(new Set([...order, ...Object.keys(out.sensitivity_table)]));

        for (const k of keys) {
            const v: any = (out.sensitivity_table as any)[k];
            if (!v || typeof v !== "object") continue;

            const hasRateMetrics =
                isFiniteNumber(v.monthly_payment) || isFiniteNumber(v.monthly_cash_flow) || isFiniteNumber(v.dscr);
            if (!hasRateMetrics) continue;

            const label =
                k === "current_rate"
                    ? "Current"
                    : k === "plus_0_5pct"
                        ? "+0.5%"
                        : k === "plus_1pct"
                            ? "+1.0%"
                            : k === "minus_0_5pct"
                                ? "-0.5%"
                                : k.replace(/_/g, " ");

            rows.push([label, safeAbsMoney(v.monthly_payment), v.monthly_cash_flow ?? null, v.dscr ?? null]);
        }

        if (rows.length >= 2) {
            grokcard_tables.rate_sensitivity = {
                headers: ["Case", "Pmt", "CF", "DSCR"],
                rows,
            };
        }
    }

    out.grokcard_tables = grokcard_tables;
    return out;
}

/* =========================
   FRED market data (parallel, fast)
========================= */
async function getCurrentMortgageData() {
    const fredApiKey = process.env.FRED_API_KEY;
    const today = new Date().toISOString().slice(0, 10);

    if (!fredApiKey) {
        return {
            date: today,
            thirtyYearFixed: 6.27,
            tenYearTreasury: 4.16,
            usedFallbacks: true,
            fallbackNotes: ["FRED_API_KEY missing; used hardcoded defaults."],
        };
    }

    const base =
        "https://api.stlouisfed.org/fred/series/observations?file_type=json&sort_order=desc&limit=1";
    const u30 = `${base}&series_id=MORTGAGE30US&api_key=${encodeURIComponent(fredApiKey)}`;
    const dgs10 = `${base}&series_id=DGS10&api_key=${encodeURIComponent(fredApiKey)}`;

    try {
        const [u30Res, dgs10Res] = await Promise.all([
            fetch(u30, { cache: "no-store" }),
            fetch(dgs10, { cache: "no-store" }),
        ]);

        const [u30Json, dgs10Json] = await Promise.all([u30Res.json(), dgs10Res.json()]);

        const parseLatest = (j: any) => {
            const v = j?.observations?.[0]?.value;
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
        };

        const thirty = parseLatest(u30Json);
        const ten = parseLatest(dgs10Json);

        let usedFallbacks = false;
        const notes: string[] = [];

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
   xAI chat call
========================= */
async function callXaiJson(systemPrompt: string, userPrompt: string, maxTokens: number) {
    const XAI_API_KEY = process.env.XAI_API_KEY;
    const model = process.env.XAI_MODEL_SCENARIO || process.env.XAI_MODEL || "grok-4";

    if (!XAI_API_KEY) throw new Error("Missing XAI_API_KEY");

    const url = "https://api.x.ai/v1/chat/completions";
    const payload = {
        model,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
    };

    const res = await withTimeout(
        fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${XAI_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        }),
        15000,
        "xAI chat.completions"
    );

    if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`xAI HTTP ${res.status}: ${errText.slice(0, 400)}`);
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty content from xAI");

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
    const buildTag = "scenario-proof-12-19-25-v5";
    const requestId =
        (globalThis.crypto as any)?.randomUUID?.() || Math.random().toString(36).slice(2);

    let fred_ms = 0;
    let xai_ms = 0;
    let parse_ms = 0;

    try {
        const body = (await req.json().catch(() => ({}))) as { message?: string; userId?: string };
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

        // 2) System prompt (sensitivity OPTIONAL + only if borrower asks)
        const systemPrompt = compactWhitespace(`
You are HomeRates.AI Smart Scenario Engine.
Return ONLY valid JSON. No markdown. No extra keys.

CRITICAL:
- Always include a short "plain_english_summary" that restates the key scenario inputs (price/balance, down payment, rent, vacancy, taxes, insurance, maintenance, rate source/date).
- Never output negative values for "monthly_payment". If savings exist, express as a separate delta, not a negative payment.
- Do NOT include any rate sensitivity table unless the user explicitly asks for a rate comparison (rates up/down, +0.5%, stress test, etc).
- Keep labels short for table headers.

Date: ${marketData.date}
Live data:
- 30-year fixed (FRED MORTGAGE30US): ${marketData.thirtyYearFixed.toFixed(2)}%
- 10-year Treasury (FRED DGS10): ${marketData.tenYearTreasury.toFixed(2)}%

Schema:
{
  "monthly_payment": number,
  "total_interest_over_term": number,
  "amortization_summary": [{ "year": number, "principal_paid": number, "interest_paid": number, "ending_balance": number }],
  "cash_flow_table": [{ "year": number, "net_cash_flow": number }],
  "plain_english_summary": "string",
  "key_risks": ["string", "string"],

  // OPTIONAL: include ONLY if user explicitly asks for rate comparison / stress test
  "sensitivity_table": {
     "current_rate": { "monthly_payment": number, "monthly_cash_flow": number, "dscr": number },
     "plus_0_5pct": { "monthly_payment": number, "monthly_cash_flow": number, "dscr": number },
     "plus_1pct": { "monthly_payment": number, "monthly_cash_flow": number, "dscr": number },
     "minus_0_5pct": { "monthly_payment": number }
  }
}
`);

        // 3) xAI
        const tXai = Date.now();
        const maxTokens = 900;
        const xai = await callXaiJson(systemPrompt, message, maxTokens);
        xai_ms = Date.now() - tXai;

        // 4) parse timing
        const tParse = Date.now();
        let result = xai.parsed;
        parse_ms = Date.now() - tParse;

        // Validation gate
        if (!result || typeof result !== "object" || typeof result.plain_english_summary !== "string") {
            return noStore(
                {
                    success: false,
                    provider: "xai",
                    error: { message: "Scenario payload missing required fields", requestId },
                    marketData,
                    meta: {
                        build_tag: buildTag,
                        requestId,
                        userIdPresent: Boolean(userId),
                        model: xai.model,
                        maxTokens,
                        timing_ms: { fred_ms, xai_ms, parse_ms, total_ms: Date.now() - t0 },
                    },
                },
                { status: 502, headers: { "X-Hr-Build-Tag": buildTag, "X-Hr-Request-Id": requestId } }
            );
        }

        // Normalize for GrokCard + Inputs block + on-demand sensitivity only
        result = normalizeForGrokCard(result, message, marketData);

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
                    timing_ms: { fred_ms, xai_ms, parse_ms, total_ms },
                },
            },
            { headers: { "X-Hr-Build-Tag": buildTag, "X-Hr-Request-Id": requestId } }
        );
    } catch (err: any) {
        const total_ms = Date.now() - t0;
        return noStore(
            {
                success: false,
                provider: "xai",
                error: {
                    message: "Scenario engine failed",
                    requestId,
                    timing_ms: { fred_ms, xai_ms, parse_ms, total_ms },
                    detail: err?.message || String(err),
                },
            },
            { status: 500, headers: { "X-Hr-Build-Tag": buildTag, "X-Hr-Request-Id": requestId } }
        );
    }
}
