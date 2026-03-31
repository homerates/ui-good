// app/s/[slug]/page.tsx
// Branded share preview page — shows logo, slug, first question preview.
// For social media: renders content + OG metadata before any redirect.
// User clicks "View conversation" to load the full thread in chat.

import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

const supabase =
    SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
        ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
        : null;

interface SharedThread {
    slug: string;
    messages: Array<{ role: string; content: string }>;
}

async function getSharedThread(slug: string): Promise<SharedThread | null> {
    if (!supabase) return null;
    const { data } = await supabase
        .from("shared_threads")
        .select("slug, messages")
        .eq("slug", slug)
        .maybeSingle();
    return data ?? null;
}

async function getShortLink(slug: string): Promise<string | null> {
    if (!supabase) return null;
    const { data } = await supabase
        .from("short_links")
        .select("target_url")
        .eq("slug", slug)
        .maybeSingle();
    return data?.target_url ?? null;
}

// ── OG Metadata ──────────────────────────────────────────────────────────────

export async function generateMetadata(props: {
    params: Promise<{ slug: string }>;
}): Promise<Metadata> {
    const { slug } = await props.params;
    const thread = await getSharedThread(slug);

    const firstQuestion = thread?.messages?.find((m) => m.role === "user")?.content ?? "";
    const truncated = firstQuestion.length > 90
        ? firstQuestion.slice(0, 90) + "…"
        : firstQuestion;

    const title = truncated
        ? `${truncated} — HomeRates.ai`
        : "Shared conversation — HomeRates.ai";

    return {
        title,
        description: "Real mortgage math, live rates — shared from HomeRates.ai.",
        openGraph: {
            title,
            description: "Real mortgage math, live rates — no sales pitch.",
            siteName: "HomeRates.ai",
        },
        twitter: { card: "summary", title, description: "Real mortgage math — HomeRates.ai" },
    };
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function SlugPreviewPage(props: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await props.params;

    const thread = await getSharedThread(slug);

    // Legacy short link — redirect immediately (no preview needed)
    if (!thread) {
        const targetUrl = await getShortLink(slug);
        if (targetUrl) redirect(targetUrl);
        redirect("/chat");
    }

    const messages = thread.messages ?? [];
    const firstQuestion = messages.find((m) => m.role === "user")?.content ?? "";
    const firstAnswer   = messages.find((m) => m.role === "assistant")?.content ?? "";
    const totalMessages = messages.length;

    const chatHref = `/chat?shared=${slug}`;

    return (
        <div style={{
            minHeight: "100dvh",
            background: "#080c12",
            color: "#e0f0e8",
            fontFamily: "var(--font-dm-sans, 'DM Sans', sans-serif)",
            display: "flex",
            flexDirection: "column",
        }}>
            {/* Header */}
            <header style={{
                borderBottom: "1px solid rgba(0,232,122,0.1)",
                background: "rgba(8,12,18,0.92)",
                backdropFilter: "blur(12px)",
                padding: "12px 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
            }}>
                <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src="/assets/HomeRates-Logo Green.png"
                        alt="HomeRates.ai"
                        style={{ height: 28, width: "auto" }}
                    />
                </Link>
                <span style={{
                    fontSize: "0.7rem",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "rgba(0,232,122,0.6)",
                    fontWeight: 600,
                    fontFamily: "var(--font-dm-mono, monospace)",
                }}>
                    {slug}
                </span>
            </header>

            {/* Body */}
            <main style={{
                flex: 1,
                padding: "40px 16px 64px",
                maxWidth: 760,
                margin: "0 auto",
                width: "100%",
            }}>
                {/* Badge */}
                <div style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 20,
                    padding: "5px 12px",
                    borderRadius: 999,
                    border: "1px solid rgba(0,232,122,0.2)",
                    background: "rgba(0,232,122,0.05)",
                    fontSize: "0.72rem",
                    color: "#00e87a",
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                }}>
                    <span style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "#00e87a",
                        display: "inline-block",
                        flexShrink: 0,
                    }} />
                    Shared conversation — {totalMessages} message{totalMessages !== 1 ? "s" : ""}
                </div>

                {/* First question as headline */}
                {firstQuestion && (
                    <h1 style={{
                        fontSize: "clamp(1.1rem, 3vw, 1.5rem)",
                        fontWeight: 700,
                        lineHeight: 1.3,
                        color: "#fff",
                        margin: "0 0 24px",
                        fontFamily: "var(--font-syne, 'Syne', sans-serif)",
                    }}>
                        {firstQuestion}
                    </h1>
                )}

                {/* Answer preview */}
                {firstAnswer && (
                    <div style={{
                        borderRadius: 16,
                        border: "1px solid rgba(148,163,184,0.12)",
                        background: "rgba(255,255,255,0.03)",
                        overflow: "hidden",
                        marginBottom: 20,
                    }}>
                        <div style={{
                            padding: "10px 18px",
                            borderBottom: "1px solid rgba(148,163,184,0.08)",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                        }}>
                            <span style={{
                                fontSize: "0.7rem",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                color: "rgba(0,232,122,0.6)",
                                fontWeight: 600,
                            }}>Answer preview</span>
                        </div>
                        <div style={{
                            padding: "16px 18px",
                            whiteSpace: "pre-wrap",
                            fontSize: "0.9rem",
                            lineHeight: 1.7,
                            color: "rgba(224,240,232,0.85)",
                            maxHeight: 260,
                            overflow: "hidden",
                            maskImage: "linear-gradient(to bottom, black 70%, transparent 100%)",
                            WebkitMaskImage: "linear-gradient(to bottom, black 70%, transparent 100%)",
                        }}>
                            {firstAnswer}
                        </div>
                    </div>
                )}

                {/* More messages hint */}
                {totalMessages > 2 && (
                    <p style={{
                        fontSize: "0.82rem",
                        color: "rgba(160,192,168,0.5)",
                        marginBottom: 20,
                    }}>
                        + {Math.floor((totalMessages - 2) / 2)} more exchange{Math.floor((totalMessages - 2) / 2) !== 1 ? "s" : ""} in this conversation
                    </p>
                )}

                {/* Disclaimer */}
                <p style={{
                    marginTop: 8,
                    fontSize: "0.72rem",
                    color: "rgba(160,192,168,0.38)",
                    lineHeight: 1.6,
                    marginBottom: 24,
                }}>
                    Educational snapshot only. Not financial or mortgage advice. Verify all figures with a licensed mortgage professional.
                </p>

                {/* CTAs */}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <Link href={chatHref} style={{
                        display: "inline-block",
                        padding: "11px 24px",
                        borderRadius: 999,
                        background: "#00e87a",
                        color: "#080c12",
                        textDecoration: "none",
                        fontSize: "0.9rem",
                        fontWeight: 700,
                    }}>
                        View full conversation →
                    </Link>
                    <Link href="/chat" style={{
                        display: "inline-block",
                        padding: "11px 18px",
                        borderRadius: 999,
                        border: "1px solid rgba(148,163,184,0.2)",
                        color: "rgba(160,192,168,0.7)",
                        textDecoration: "none",
                        fontSize: "0.85rem",
                    }}>
                        Ask your own question
                    </Link>
                </div>
            </main>

            {/* Footer */}
            <footer style={{
                padding: "12px 20px",
                borderTop: "1px solid rgba(0,232,122,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                flexWrap: "wrap",
                fontSize: "0.7rem",
                color: "rgba(160,192,168,0.35)",
            }}>
                <span>HomeRates.ai — independent educational tool, not a mortgage lender.</span>
                <span style={{ opacity: 0.4 }}>•</span>
                <Link href="/disclosures" style={{ color: "rgba(0,232,122,0.5)", textDecoration: "none" }}>Terms</Link>
                <span style={{ opacity: 0.4 }}>•</span>
                <Link href="/privacy" style={{ color: "rgba(0,232,122,0.5)", textDecoration: "none" }}>Privacy</Link>
            </footer>
        </div>
    );
}
