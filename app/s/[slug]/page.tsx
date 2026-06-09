// app/s/[slug]/page.tsx
// Shared thread landing page.
// Crawlers (LinkedIn, Twitter, iMessage) get a 200 with dynamic property OG.
// Humans get JS-redirected immediately to /chat?shared={slug}.

import { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
}

const BASE = "https://chat.homerates.ai";

interface Props { params: Promise<{ slug: string }> }

interface PropertyOG {
  address: string;
  score: number | null;
  verdict: string;
  price: number | null;
  photo: string | null;
}

function computeVerdict(score: number): string {
  if (score >= 85) return "Strong Buy";
  if (score >= 70) return "Ready to Offer";
  if (score >= 55) return "Buy with Caution";
  if (score >= 40) return "Watch the Market";
  return "Hold Off";
}

function extractFromMessages(messages: unknown[]): PropertyOG {
  const result: PropertyOG = { address: "", score: null, verdict: "", price: null, photo: null };
  if (!Array.isArray(messages)) return result;

  for (const msg of messages) {
    if (typeof msg !== "object" || !msg) continue;
    const meta = (msg as Record<string, unknown>).meta as Record<string, unknown> | undefined;
    if (!meta) continue;

    // DecisionScoreCard — has address + compositeScore
    const dsc = meta.decisionScoreCard as Record<string, unknown> | undefined | null;
    if (dsc) {
      if (!result.address && typeof dsc.address === "string") result.address = dsc.address;
      if (result.score == null && typeof dsc.compositeScore === "number") {
        result.score = dsc.compositeScore;
        result.verdict = computeVerdict(dsc.compositeScore);
      }
    }

    // PropertyLookup meta — has price + photoUrl
    const pl = meta.propertyLookup as Record<string, unknown> | undefined | null;
    if (pl) {
      if (!result.address && typeof pl.address === "string") result.address = pl.address;
      if (!result.price && typeof pl.price === "number") result.price = pl.price;
      if (!result.photo && typeof pl.photoUrl === "string" && /^https:\/\/ssl\.cdn-redfin\.com\//.test(pl.photoUrl)) {
        result.photo = pl.photoUrl;
      }
    }

    // Seed data fallback
    const seed = meta.seed as Record<string, unknown> | undefined | null;
    if (seed) {
      if (!result.address && typeof seed.address === "string") result.address = seed.address;
      if (!result.price && typeof seed.price === "number") result.price = seed.price;
    }
  }

  return result;
}

async function fetchThreadData(slug: string): Promise<{ messages: unknown[]; found: boolean; isShortLink: boolean; targetUrl: string | null }> {
  const sb = getSupabase();
  if (!sb || !slug) return { messages: [], found: false, isShortLink: false, targetUrl: null };

  const { data: thread } = await sb
    .from("shared_threads")
    .select("slug, messages")
    .eq("slug", slug)
    .maybeSingle();

  if (thread?.slug) {
    return { messages: Array.isArray(thread.messages) ? thread.messages : [], found: true, isShortLink: false, targetUrl: null };
  }

  const { data: link } = await sb
    .from("short_links")
    .select("target_url")
    .eq("slug", slug)
    .maybeSingle();

  if (link?.target_url) {
    return { messages: [], found: true, isShortLink: true, targetUrl: link.target_url };
  }

  return { messages: [], found: false, isShortLink: false, targetUrl: null };
}

function buildOgUrl(p: PropertyOG): string {
  const q = new URLSearchParams();
  q.set("address", p.address || "Property Analysis");
  if (p.score != null) q.set("score", String(p.score));
  if (p.verdict)       q.set("verdict", p.verdict);
  if (p.price != null) q.set("price", String(p.price));
  if (p.photo)         q.set("photo", p.photo);
  return `${BASE}/api/og/property?${q.toString()}`;
}

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1000).toLocaleString()}K`;
  return `$${n}`;
}

// ── Dynamic OG metadata ────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { messages, found, isShortLink } = await fetchThreadData(slug);

  if (!found || isShortLink || messages.length === 0) {
    return {
      title: "HomeRates.Ai — Home + Mortgage AI Chat",
      openGraph: {
        title: "HomeRates.Ai — Home + Mortgage AI Chat",
        siteName: "HomeRates.Ai",
        images: [{ url: `${BASE}/assets/share/og/homerates-brand-default-og-1200x630-v1.png`, width: 1200, height: 630 }],
      },
    };
  }

  const prop = extractFromMessages(messages);

  if (!prop.address && prop.score == null) {
    return {
      title: "HomeRates.Ai — Home + Mortgage AI Chat",
      openGraph: {
        title: "HomeRates.Ai — Home + Mortgage AI Chat",
        siteName: "HomeRates.Ai",
        images: [{ url: `${BASE}/assets/share/og/homerates-brand-default-og-1200x630-v1.png`, width: 1200, height: 630 }],
      },
    };
  }

  const ogUrl  = buildOgUrl(prop);
  const street = prop.address.split(",")[0]?.trim() ?? prop.address;
  const title  = prop.score != null
    ? `${street} — My Decision Portfolio ${prop.score}/100 | HomeRates.Ai`
    : `${street} — My Decision Portfolio | HomeRates.Ai`;
  const desc   = prop.score != null
    ? `${prop.address}${prop.verdict ? ` · ${prop.verdict}` : ""}. Decision Score: ${prop.score}/100. My Decision Portfolio — powered by HomeRates.Ai.`
    : `My Decision Portfolio entry for ${prop.address} — powered by HomeRates.Ai.`;

  return {
    title,
    description: desc,
    openGraph: {
      title, description: desc,
      url: `${BASE}/s/${slug}`,
      siteName: "HomeRates.Ai",
      images: [{ url: ogUrl, width: 1200, height: 630, alt: `My Decision Portfolio — ${street}` }],
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description: desc, images: [ogUrl] },
  };
}

// ── Page component ─────────────────────────────────────────────────────────

export default async function SharedThreadPage({ params }: Props) {
  const { slug } = await params;
  const { messages, found, isShortLink, targetUrl } = await fetchThreadData(slug);

  // Determine redirect destination
  const dest = isShortLink && targetUrl
    ? targetUrl
    : found
    ? `${BASE}/chat?shared=${encodeURIComponent(slug)}`
    : `${BASE}/chat`;

  // Extract property data for display
  const prop = (!isShortLink && messages.length > 0) ? extractFromMessages(messages) : null;
  const hasProperty = prop && (prop.address || prop.score != null);
  const street    = prop?.address ? prop.address.split(",")[0]?.trim() : null;
  const cityState = prop?.address ? prop.address.split(",").slice(1, 3).join(",").trim() : null;
  const scoreColor = !prop?.score ? "#4a6080"
    : prop.score >= 75 ? "#00e87a"
    : prop.score >= 55 ? "#f0c040"
    : "#ff5a5a";

  const detailParts: string[] = [];
  if (prop?.price) detailParts.push(fmt$(prop.price));

  return (
    <div className="page-standalone" style={{ minHeight: "100dvh", background: "#080f1c", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* JS redirect for human visitors — crawlers ignore this */}
      <script dangerouslySetInnerHTML={{ __html: `window.location.replace(${JSON.stringify(dest)});` }} />

      <div style={{ width: "100%", maxWidth: 600 }}>

        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#3a5070", textTransform: "uppercase" }}>
            My Decision Portfolio
          </span>
        </div>

        {/* Card */}
        <div style={{ background: "#0b1221", border: "1px solid #1e2d45", borderRadius: 18, overflow: "hidden" }}>

          {/* Property photo */}
          {prop?.photo && (
            <div style={{ width: "100%", height: 220, overflow: "hidden", position: "relative" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={prop.photo} alt={street ?? "Property"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 50%, #0b1221 100%)" }} />
            </div>
          )}

          <div style={{ padding: "28px 28px 32px" }}>

            {hasProperty ? (
              <>
                {/* Tag */}
                <div style={{ display: "inline-block", background: "rgba(0,232,122,0.10)", border: "1px solid rgba(0,232,122,0.30)", color: "#00e87a", fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", padding: "4px 12px", borderRadius: 999, marginBottom: 20 }}>
                  MY DECISION PORTFOLIO
                </div>

                {/* Address */}
                {street && (
                  <div style={{ color: "#ffffff", fontSize: 26, fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.02em", marginBottom: 4 }}>
                    {street}
                  </div>
                )}
                {cityState && (
                  <div style={{ color: "rgba(200,214,230,0.50)", fontSize: 16, fontWeight: 400, marginBottom: 16 }}>
                    {cityState}
                  </div>
                )}
                {detailParts.length > 0 && (
                  <div style={{ color: "rgba(200,214,230,0.45)", fontSize: 14, fontWeight: 500, marginBottom: 28 }}>
                    {detailParts.join("  ·  ")}
                  </div>
                )}

                {/* Score */}
                {prop.score != null && (
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 32 }}>
                    <span style={{ fontSize: 72, fontWeight: 900, color: scoreColor, lineHeight: 1, letterSpacing: "-0.04em" }}>
                      {prop.score}
                    </span>
                    <div style={{ paddingBottom: 8, display: "flex", flexDirection: "column" }}>
                      <span style={{ color: "rgba(200,214,230,0.40)", fontSize: 13, fontWeight: 600 }}>/100</span>
                      {prop.verdict && (
                        <span style={{ color: scoreColor, fontSize: 13, fontWeight: 700, marginTop: 2 }}>{prop.verdict}</span>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: "rgba(200,214,230,0.60)", fontSize: 16, fontWeight: 500, marginBottom: 32 }}>
                HomeRates.Ai — Home + Mortgage AI Chat
              </div>
            )}

            {/* CTA */}
            <Link
              href={dest}
              style={{ display: "block", textAlign: "center", background: "#00e87a", color: "#000", fontSize: 14, fontWeight: 800, letterSpacing: "0.03em", padding: "14px 24px", borderRadius: 10, textDecoration: "none" }}
            >
              Open in HomeRates.Ai →
            </Link>

            <div style={{ textAlign: "center", marginTop: 14, color: "rgba(200,214,230,0.30)", fontSize: 11 }}>
              My Decision Portfolio — powered by HomeRates.Ai
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
