// app/share/page.tsx
// Public share snapshot page (no auth required).
// Renders a read-only branded view from ?q=...&a=... query params.

import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";

function pickOne(v: unknown): string {
    if (!v) return "";
    if (Array.isArray(v)) return String(v[0] ?? "");
    return String(v);
}

export async function generateMetadata(props: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
    const sp = props.searchParams ? await props.searchParams : {};
    const question = pickOne(sp.q).trim();
    const hasQuestion = question.length > 0 && question !== "*";

    const title = hasQuestion
        ? `${question.slice(0, 80)}${question.length > 80 ? "…" : ""} — HomeRates.ai`
        : "Shared mortgage answer — HomeRates.ai";

    return {
        title,
        description: "Real mortgage math, live rates — shared from HomeRates.ai.",
        openGraph: {
            title,
            description: "Real mortgage math, live rates — no sales pitch.",
            siteName: "HomeRates.ai",
            images: [{ url: "/assets/og-card.png", width: 1200, height: 627, alt: "HomeRates.ai" }],
        },
        twitter: {
            card: "summary_large_image",
            title,
            description: "Real mortgage math, live rates — no sales pitch.",
            images: ["/assets/og-card.png"],
        },
    };
}

export default async function SharePage(props: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    const sp = props.searchParams ? await props.searchParams : {};

    const question = pickOne(sp.q).trim();
    const answer   = pickOne(sp.a).trim();

    const hasQuestion = question.length > 0 && question !== "*";
    const hasAnswer   = answer.length > 0   && answer   !== "*";

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
                }}>
                    Shared snapshot
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
                {/* Source badge */}
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
                    HomeRates.ai — Educational mortgage intelligence
                </div>

                {/* Question */}
                {hasQuestion && (
                    <h1 style={{
                        fontSize: "clamp(1.1rem, 3vw, 1.5rem)",
                        fontWeight: 700,
                        lineHeight: 1.3,
                        color: "#fff",
                        margin: "0 0 24px",
                        fontFamily: "var(--font-dm-sans, 'DM Sans', sans-serif)",
                    }}>
                        {question}
                    </h1>
                )}

                {/* Answer card */}
                <div style={{
                    borderRadius: 16,
                    border: "1px solid rgba(148,163,184,0.12)",
                    background: "rgba(255,255,255,0.03)",
                    overflow: "hidden",
                }}>
                    {!hasQuestion && (
                        <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(148,163,184,0.1)" }}>
                            <span style={{
                                fontSize: "0.7rem",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                color: "rgba(185,208,192,0.5)",
                                fontWeight: 600,
                            }}>Question</span>
                            <p style={{ margin: "6px 0 0", fontSize: "0.9rem", color: "rgba(185,208,192,0.45)", lineHeight: 1.5 }}>
                                Question not included in this link.
                            </p>
                        </div>
                    )}

                    <div style={{ padding: "18px 18px" }}>
                        <span style={{
                            fontSize: "0.7rem",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            color: "rgba(0,232,122,0.6)",
                            fontWeight: 600,
                        }}>Answer</span>
                        <div style={{
                            marginTop: 10,
                            whiteSpace: "pre-wrap",
                            fontSize: "0.92rem",
                            lineHeight: 1.7,
                            color: hasAnswer ? "rgba(224,240,232,0.9)" : "rgba(185,208,192,0.4)",
                        }}>
                            {hasAnswer ? answer : "Answer not included in this link."}
                        </div>
                    </div>
                </div>

                {/* Disclaimer */}
                <p style={{
                    marginTop: 14,
                    fontSize: "0.75rem",
                    color: "rgba(185,208,192,0.4)",
                    lineHeight: 1.6,
                }}>
                    This is a read-only educational snapshot. Outputs are for informational purposes only and do not constitute financial or mortgage advice. Verify all figures with a licensed mortgage professional.
                </p>

                {/* CTA */}
                <div style={{ marginTop: 24, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <Link href="/chat" style={{
                        display: "inline-block",
                        padding: "10px 22px",
                        borderRadius: 999,
                        background: "#00e87a",
                        color: "#080c12",
                        textDecoration: "none",
                        fontSize: "0.88rem",
                        fontWeight: 700,
                    }}>
                        Ask your own question →
                    </Link>
                    <Link href="/" style={{
                        display: "inline-block",
                        padding: "10px 18px",
                        borderRadius: 999,
                        border: "1px solid rgba(148,163,184,0.2)",
                        color: "rgba(185,208,192,0.7)",
                        textDecoration: "none",
                        fontSize: "0.85rem",
                    }}>
                        Learn more
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
                color: "rgba(185,208,192,0.35)",
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
