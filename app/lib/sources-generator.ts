// app/lib/sources-generator.ts
// HomeRates.ai — Sources Generator (US-only; CA-aware; core-first; single-source)
// - Uses existing /api/tavily proxy (no direct Tavily API calls here)
// - Returns exactly ONE source:
//     1) Core match (preferred)
//     2) Tavily fallback (best single result)
// - No new dependencies (no @vercel/kv, no ai-sdk)

export type SourceItem = { title: string; url: string };

export type SourcesBundle = {
    mode: "core" | "tavily" | "none";
    usedTavily: boolean;
    sources: SourceItem[]; // ALWAYS length 0 or 1
    markdown: string; // "" or "**Sources**\n- [Title](url)"
};

type CoreSource = {
    id: string;
    title: string;
    url: string;
    pdf?: string;
    // score boosts depend on topic keywords
    matchAny: RegExp[];
    // optional: only use this source if these match
    requireAny?: RegExp[];
    // optional: block this source if these match
    excludeAny?: RegExp[];
    // priority: higher wins when multiple match
    priority: number;
};

const CORE_SOURCES: CoreSource[] = [
    {
        id: "loandepot",
        title: "LoanDepot Mortgage Products",
        url: "https://www.loandepot.com/mortgage/products",
        matchAny: [/loandepot/i, /\bld\b/i, /jumbo advantage/i, /advantage flex/i, /\bdscr\b/i, /bank statement/i],
        priority: 120,
    },
    {
        id: "calhfa",
        title: "CalHFA Homeownership Programs",
        url: "https://www.calhfa.ca.gov/homeownership/programs/",
        matchAny: [/calhfa/i, /california housing finance/i, /\bdpa\b/i, /down payment assistance/i],
        requireAny: [/california/i, /\bca\b/i, /los angeles/i, /san diego/i, /orange county/i, /bay area/i],
        priority: 110,
    },
    {
        id: "fannie",
        title: "Fannie Mae Selling Guide (Single Family)",
        url: "https://singlefamily.fanniemae.com/selling-guide",
        matchAny: [/fannie/i, /\bdu\b/i, /desktop underwriter/i, /selling guide/i, /conventional/i],
        priority: 100,
    },
    {
        id: "freddie",
        title: "Freddie Mac Single-Family Seller/Servicer Guide",
        url: "https://guide.freddiemac.com/app/guide/",
        matchAny: [/freddie/i, /\blp\b/i, /loan product advisor/i, /seller\/servicer/i],
        priority: 95,
    },
    {
        id: "fha",
        title: "HUD Handbook 4000.1 (FHA Single Family Housing Policy)",
        url: "https://www.hud.gov/handbook/4000-1",
        matchAny: [/\bfha\b/i, /hud handbook/i, /4000\.1/i],
        priority: 90,
    },
    {
        id: "va",
        title: "VA Lender’s Handbook (VA Pamphlet 26-7)",
        url: "https://www.benefits.va.gov/WARMS/pam26_7.asp",
        matchAny: [/\bva\b/i, /pamphlet 26-7/i, /va handbook/i, /residual income/i],
        priority: 88,
    },
    {
        id: "fhfa_limits",
        title: "FHFA Conforming Loan Limits",
        url: "https://www.fhfa.gov/data-tools-downloads/conforming-loan-limits",
        matchAny: [/fhfa/i, /loan limits?/i, /conforming limit/i, /high balance/i],
        priority: 80,
    },
];

function norm(s: string) {
    return (s || "").trim().toLowerCase();
}

function hasAny(topic: string, regs: RegExp[]) {
    return regs.some((r) => r.test(topic));
}

function pickCoreSingle(topicRaw: string): SourceItem | null {
    const topic = topicRaw || "";

    // Filter to candidates that match
    const candidates = CORE_SOURCES.filter((s) => hasAny(topic, s.matchAny))
        .filter((s) => (s.requireAny ? hasAny(topic, s.requireAny) : true))
        .filter((s) => (s.excludeAny ? !hasAny(topic, s.excludeAny) : true));

    if (!candidates.length) return null;

    // If CA context exists, CalHFA should win if it’s among matches
    const isCA =
        /\bcalifornia\b/i.test(topic) ||
        /\bca\b/i.test(topic) ||
        /los angeles|san diego|orange county|san francisco|sacramento|san jose/i.test(topic);

    // Sort by priority, with CA boost for CalHFA
    candidates.sort((a, b) => {
        const aScore = a.priority + (isCA && a.id === "calhfa" ? 25 : 0);
        const bScore = b.priority + (isCA && b.id === "calhfa" ? 25 : 0);
        return bScore - aScore;
    });

    const winner = candidates[0];
    return { title: winner.title, url: winner.url };
}

type TavilyMini = {
    ok: boolean;
    answer: string | null;
    results: Array<{ title: string; url: string; content?: string; snippet?: string }>;
};

async function askTavilyProxy(reqUrl: string, query: string, depth: "basic" | "advanced", max: number): Promise<TavilyMini> {
    const url = new URL("/api/tavily", reqUrl);

    const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            query,
            searchDepth: depth,
            maxResults: max,
        }),
        cache: "no-store",
    });

    let parsed: any = null;
    try {
        parsed = await res.json();
    } catch {
        parsed = null;
    }

    const ok = !!parsed?.ok;
    const answer = typeof parsed?.answer === "string" ? parsed.answer : null;
    const results = Array.isArray(parsed?.results) ? parsed.results : [];
    return { ok, answer, results };
}

function buildUSLockedQuery(topicRaw: string) {
    // Hard US lock + explicit exclusions to stop NZ/AU/UK/CA drift (Canada)
    const US_ONLY =
        `United States mortgage ` +
        `-("New Zealand" OR NZ OR Australia OR AU OR UK OR "United Kingdom" OR Canada OR Canadian) ` +
        `-site:.nz -site:.au -site:.uk -site:.ca`;

    // Prefer authoritative domains when possible
    const AUTH =
        `site:singlefamily.fanniemae.com OR site:fanniemae.com OR site:freddiemac.com OR site:hud.gov OR ` +
        `site:benefits.va.gov OR site:va.gov OR site:cfpb.gov OR site:consumerfinance.gov OR ` +
        `site:fhfa.gov OR site:rd.usda.gov OR site:calhfa.ca.gov`;

    const cleaned = (topicRaw || "").replace(/\s+/g, " ").trim();
    return `${cleaned} ${US_ONLY} 2025 guidelines (${AUTH}) -reddit -forum -blog -quizlet -studylib`.trim();
}

function bestSingleResult(results: Array<{ title: string; url: string }>): SourceItem | null {
    if (!results?.length) return null;

    // Prefer gov/agency/guide domains
    const preferred = results.find((r) =>
        /singlefamily\.fanniemae\.com|fanniemae\.com|freddiemac\.com|hud\.gov|benefits\.va\.gov|va\.gov|cfpb\.gov|consumerfinance\.gov|fhfa\.gov|rd\.usda\.gov|calhfa\.ca\.gov/i.test(
            r.url
        )
    );

    const pick = preferred || results[0];
    if (!pick?.title || !pick?.url) return null;

    // Final hard block against non-US domains
    if (/\.(nz|au|uk|ca)\b/i.test(pick.url)) return null;

    return { title: pick.title, url: pick.url };
}

function toMarkdown(one: SourceItem | null): string {
    if (!one) return "";
    return `**Sources**\n- [${one.title}](${one.url})`;
}

export async function generateSourcesBundle(args: {
    topic: string;
    reqUrl: string; // pass req.url from route
    depth?: "basic" | "advanced";
}): Promise<SourcesBundle> {
    const topic = (args.topic || "").trim();
    if (!topic) return { mode: "none", usedTavily: false, sources: [], markdown: "" };

    // 1) Core (single)
    const core = pickCoreSingle(topic);
    if (core) {
        return { mode: "core", usedTavily: false, sources: [core], markdown: toMarkdown(core) };
    }

    // 2) Tavily fallback (single)
    if (!process.env.TAVILY_API_KEY) {
        return { mode: "none", usedTavily: false, sources: [], markdown: "" };
    }

    const query = buildUSLockedQuery(topic);
    const depth = args.depth ?? "basic";

    const tav = await askTavilyProxy(args.reqUrl, query, depth, 6);
    if (!tav.ok || !tav.results?.length) {
        return { mode: "none", usedTavily: true, sources: [], markdown: "" };
    }

    const one = bestSingleResult(tav.results);
    if (!one) {
        return { mode: "none", usedTavily: true, sources: [], markdown: "" };
    }

    return { mode: "tavily", usedTavily: true, sources: [one], markdown: toMarkdown(one) };
}
