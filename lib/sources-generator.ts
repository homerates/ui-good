// lib/sources-generator.ts
// HomeRates.ai — Sources Generator (Core + Tavily dynamic)
//
// Goal:
// - Provide a consistent, reliable "Sources" block for mortgage answers.
// - Prefer authoritative core sources.
// - Optionally add Tavily-derived sources for freshness and niche items.
// - Keep output UI-safe, short, and stable.
//
// Notes:
// - Designed for server usage (API routes / server actions).
// - Uses Tavily via POST. Can call Tavily directly or via your /api/tavily proxy.

export type SourceItem = {
    title: string;
    url: string;
    pdf?: string | null;
    description?: string | null;
    authority?: "core" | "tavily";
};

export type SourceBundle = {
    usedCore: boolean;
    usedTavily: boolean;
    sources: SourceItem[];
    markdown: string; // ready-to-append "**Sources**\n- ..."
};

type TavilyResult = {
    title: string;
    url: string;
    content?: string;
    snippet?: string;
    raw_content?: string;
};

type TavilyMini = {
    ok: boolean;
    answer: string | null;
    results: TavilyResult[];
};

const CORE_SOURCES: SourceItem[] = [
    {
        title: "Fannie Mae Selling Guide",
        url: "https://singlefamily.fanniemae.com/selling-guide",
        pdf: "https://singlefamily.fanniemae.com/selling-guide-pdf",
        description: "Conventional underwriting requirements and eligibility.",
        authority: "core",
    },
    {
        title: "Freddie Mac Single-Family Seller/Servicer Guide",
        url: "https://guide.freddiemac.com/app/guide/",
        pdf: null,
        description: "Freddie Mac guidelines (web guide; updates via bulletins).",
        authority: "core",
    },
    {
        title: "HUD Handbook 4000.1",
        url: "https://www.hud.gov/handbook/4000-1",
        pdf: "https://www.hud.gov/sites/dfiles/OCHCO/documents/4000.1hsgh-1.pdf",
        description: "FHA Single Family Housing Policy Handbook.",
        authority: "core",
    },
    {
        title: "VA Lender’s Handbook (Pamphlet 26-7)",
        url: "https://www.benefits.va.gov/WARMS/pam26_7.asp",
        pdf: "https://www.benefits.va.gov/WARMS/docs/admin26/pamphlet/pam26_7.pdf",
        description: "VA guaranteed loan underwriting and eligibility rules.",
        authority: "core",
    },
    {
        title: "USDA HB-1-3555",
        url: "https://www.rd.usda.gov/resources/directives/handbooks",
        pdf: "https://www.rd.usda.gov/sites/default/files/hb-1-3555.pdf",
        description: "USDA guaranteed housing program technical handbook.",
        authority: "core",
    },
    {
        title: "FHFA Conforming Loan Limits",
        url: "https://www.fhfa.gov/data-tools-downloads/conforming-loan-limits",
        pdf: null,
        description: "County-level conforming loan limit data and announcements.",
        authority: "core",
    },
];

// ---------- Helpers ----------
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

function normalize(s: string) {
    return (s ?? "").toLowerCase();
}

function uniqByUrl(items: SourceItem[]) {
    const seen = new Set<string>();
    const out: SourceItem[] = [];
    for (const it of items) {
        const key = (it.url || "").trim();
        if (!key) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(it);
    }
    return out;
}

function extractPdfUrl(text: string): string | null {
    const s = String(text || "");
    const m = s.match(/https?:\/\/[^\s"'<>]+\.pdf(\?[^\s"'<>]+)?/i);
    return m?.[0] ?? null;
}

function looksAuthoritative(url: string) {
    const u = normalize(url);
    return (
        u.includes("fanniemae.com") ||
        u.includes("freddiemac.com") ||
        u.includes("hud.gov") ||
        u.includes("va.gov") ||
        u.includes("benefits.va.gov") ||
        u.includes("cfpb.gov") ||
        u.includes("consumerfinance.gov") ||
        u.includes("fhfa.gov") ||
        u.includes("stlouisfed.org") ||
        u.includes("rd.usda.gov") ||
        u.includes(".gov")
    );
}

function coreMatchesTopic(topic: string): SourceItem[] {
    const t = normalize(topic);

    // fast intent keywords
    const wantsFannie = /(fannie|du\b|desktop underwriter|conventional|selling guide)/i.test(t);
    const wantsFreddie = /(freddie|lp\b|loan product advisor|seller\/servicer)/i.test(t);
    const wantsFha = /(fha|hud|4000\.1|mortgage insurance premium|ufmip|mip)/i.test(t);
    const wantsVa = /\bva\b|pamphlet 26-7|residual income|funding fee/i.test(t);
    const wantsUsda = /(usda|rd|rural development|3555)/i.test(t);
    const wantsLimits = /(loan limit|conforming limit|fhfa|high balance)/i.test(t);

    const out: SourceItem[] = [];

    if (wantsFannie) out.push(CORE_SOURCES[0]);
    if (wantsFreddie) out.push(CORE_SOURCES[1]);
    if (wantsFha) out.push(CORE_SOURCES[2]);
    if (wantsVa) out.push(CORE_SOURCES[3]);
    if (wantsUsda) out.push(CORE_SOURCES[4]);
    if (wantsLimits) out.push(CORE_SOURCES[5]);

    // If no matches, still provide the “big 4” for underwriting-ish topics
    if (out.length === 0 && /(underwrit|guideline|dti|ltv|reserve|income|assets|credit)/i.test(t)) {
        out.push(CORE_SOURCES[0], CORE_SOURCES[1], CORE_SOURCES[2], CORE_SOURCES[3]);
    }

    return uniqByUrl(out);
}

// ---------- Tavily ----------
type TavilyMode =
    | { mode: "direct"; apiKey: string }
    | { mode: "proxy"; baseUrl: string }; // e.g. https://chat.homerates.ai (or req.url base)

async function tavilySearch(
    tav: TavilyMode | null,
    query: string,
    opts?: { depth?: "basic" | "advanced"; max?: number }
): Promise<TavilyMini> {
    if (!tav) return { ok: false, answer: null, results: [] };

    const searchDepth = opts?.depth ?? "basic";
    const maxResults = typeof opts?.max === "number" ? opts.max : 6;

    try {
        if (tav.mode === "proxy") {
            // Uses your existing /api/tavily route signature:
            // { query, searchDepth, maxResults }
            const url = new URL("/api/tavily", tav.baseUrl).toString();
            const res = await fetch(url, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ query, searchDepth, maxResults }),
                cache: "no-store",
            });
            const json = (await res.json().catch(() => null)) as any;
            return {
                ok: !!json?.ok,
                answer: typeof json?.answer === "string" ? json.answer : null,
                results: Array.isArray(json?.results) ? json.results : [],
            };
        }

        // Direct Tavily (POST)
        const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                api_key: tav.apiKey,
                query,
                search_depth: searchDepth,
                max_results: maxResults,
                include_raw_content: false, // keep responses smaller + faster
            }),
            cache: "no-store",
        });

        const json = (await res.json().catch(() => null)) as any;

        const results: TavilyResult[] = Array.isArray(json?.results) ? json.results : [];
        const answer = typeof json?.answer === "string" ? json.answer : null;
        const ok = Boolean(json && (answer || results.length));
        return { ok, answer, results };
    } catch {
        return { ok: false, answer: null, results: [] };
    }
}

function buildTavilyQuery(topic: string) {
    // Opinionated: prioritize official docs and reduce junk sources.
    const t = topic.trim();

    // underwriting-ish
    const underwriting = /(underwrit|guideline|dti|ltv|reserve|income|assets|credit|du\b|lp\b|manual)/i.test(t);

    if (underwriting) {
        return `${t} 2025 mortgage guidelines site:singlefamily.fanniemae.com OR site:fanniemae.com OR site:freddiemac.com OR site:hud.gov OR site:benefits.va.gov OR site:va.gov OR site:cfpb.gov OR site:consumerfinance.gov OR site:fhfa.gov -reddit -forum -blog -studylib -quizlet`;
    }

    // rates-ish
    const rates = /(rate|treasury|mbs|mortgage news daily|bankrate|freddie mac pmms|spread)/i.test(t);
    if (rates) {
        return `${t} 2025 mortgage rates site:freddiemac.com OR site:mortgagenewsdaily.com OR site:bankrate.com OR site:stlouisfed.org -reddit -forum -blog`;
    }

    // generic
    return `${t} mortgage 2025 site:.gov OR site:fanniemae.com OR site:freddiemac.com -reddit -forum -blog -studylib -quizlet`;
}

function tavilyToSources(results: TavilyResult[], limit = 5): SourceItem[] {
    const mapped: SourceItem[] = [];

    for (const r of results || []) {
        if (!r?.url || !r?.title) continue;

        const pdfFromUrl = r.url.toLowerCase().includes(".pdf") ? r.url : null;
        const pdfFromText = extractPdfUrl(r.content || r.snippet || "") || null;

        mapped.push({
            title: clampText(r.title, 120),
            url: r.url,
            pdf: pdfFromUrl || pdfFromText,
            description: clampText(r.snippet || "", 160) || null,
            authority: "tavily",
        });

        if (mapped.length >= limit) break;
    }

    // Prefer authoritative domains
    mapped.sort((a, b) => Number(looksAuthoritative(b.url)) - Number(looksAuthoritative(a.url)));

    return uniqByUrl(mapped).slice(0, limit);
}

function sourcesToMarkdown(sources: SourceItem[]): string {
    if (!sources?.length) return "";

    const lines = sources.map((s) => {
        const pdf = s.pdf ? ` (PDF)` : "";
        // Keep it clean: title links to url; if PDF present and different, append.
        const pdfPart =
            s.pdf && s.pdf !== s.url ? ` — [PDF](${s.pdf})` : "";
        return `- [${s.title}](${s.url})${pdf}${pdfPart}`;
    });

    return `**Sources**\n${lines.join("\n")}`;
}

// ---------- Public API ----------
export async function generateSourcesBundle(opts: {
    topic: string;               // e.g., "FHA student loan DTI deferred 0 payment"
    tavily?: TavilyMode | null;  // pass proxy/direct
    includeCore?: boolean;       // default true
    includeTavily?: boolean;     // default true
    tavilyDepth?: "basic" | "advanced";
    tavilyMax?: number;
    maxTotal?: number;           // default 6
}): Promise<SourceBundle> {
    const topic = compactWhitespace(opts.topic || "");
    const includeCore = opts.includeCore !== false;
    const includeTavily = opts.includeTavily !== false;
    const maxTotal = typeof opts.maxTotal === "number" ? opts.maxTotal : 6;

    let sources: SourceItem[] = [];
    let usedCore = false;
    let usedTavily = false;

    if (includeCore) {
        const core = coreMatchesTopic(topic);
        if (core.length) {
            sources.push(...core);
            usedCore = true;
        }
    }

    if (includeTavily && sources.length < maxTotal) {
        const query = buildTavilyQuery(topic);
        const tav = await tavilySearch(opts.tavily ?? null, query, {
            depth: opts.tavilyDepth ?? "basic",
            max: opts.tavilyMax ?? 6,
        });

        if (tav.ok && tav.results?.length) {
            const dyn = tavilyToSources(tav.results, Math.min(5, maxTotal));
            if (dyn.length) {
                usedTavily = true;
                sources.push(...dyn);
            }
        }
    }

    sources = uniqByUrl(sources).slice(0, maxTotal);

    return {
        usedCore,
        usedTavily,
        sources,
        markdown: sourcesToMarkdown(sources),
    };
}
