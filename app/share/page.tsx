// app/share/page.tsx
import React from "react";
import Link from "next/link";

type SharePageProps = {
    searchParams: Promise<{
        [key: string]: string | string[] | undefined;
    }>;
};

export default async function SharePage({ searchParams }: SharePageProps) {
    const resolved = await searchParams;

    const rawQ = typeof resolved.q === "string" ? resolved.q : null;
    const rawA = typeof resolved.a === "string" ? resolved.a : null;

    const question = rawQ?.trim() || null;
    const answer = rawA?.trim() || null;

    const hasData = !!question && !!answer;

    const appBaseUrl =
        process.env.NEXT_PUBLIC_APP_BASE_URL || "https://chat.homerates.ai";

    return (
        <main
            className="min-h-screen"
            style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "stretch",
                padding: "32px 16px",
                background:
                    "radial-gradient(circle at top, #e5f0ff 0, #f3f4f6 40%, #ffffff 100%)",
            }}
        >
            <div
                style={{
                    width: "100%",
                    maxWidth: 720,
                    margin: "0 auto",
                    background: "#ffffff",
                    borderRadius: 24,
                    boxShadow:
                        "0 18px 45px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(148, 163, 184, 0.12)",
                    padding: "28px 22px",
                    display: "grid",
                    gap: 18,
                }}
            >
                {/* Header / Hero */}
                <header style={{ display: "grid", gap: 6 }}>
                    <div
                        style={{
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: "#64748b",
                        }}
                    >
                        Answer snapshot from
                    </div>
                    <h1
                        style={{
                            fontSize: "1.5rem",
                            fontWeight: 700,
                            letterSpacing: "-0.03em",
                            color: "#0f172a",
                        }}
                    >
                        HomeRates.ai Mortgage Coach
                    </h1>
                    <p
                        style={{
                            fontSize: "0.9rem",
                            color: "#475569",
                            maxWidth: "52ch",
                        }}
                    >
                        This page shows a real question and answer from a HomeRates.ai
                        conversation. Use it to review the advice and, if you like it,
                        continue the conversation directly in the app.
                    </p>
                </header>

                {/* Content */}
                {hasData ? (
                    <section
                        style={{
                            display: "grid",
                            gap: 18,
                            padding: 16,
                            borderRadius: 18,
                            background:
                                "linear-gradient(135deg, rgba(226, 232, 240, 0.7), rgba(248, 250, 252, 0.9))",
                            border: "1px solid rgba(148, 163, 184, 0.35)",
                        }}
                    >
                        {/* Question */}
                        <div
                            style={{
                                padding: "10px 12px 12px",
                                borderRadius: 14,
                                background: "#0f172a",
                                color: "#e5e7eb",
                                display: "grid",
                                gap: 6,
                            }}
                        >
                            <div
                                style={{
                                    fontSize: "0.72rem",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.14em",
                                    fontWeight: 600,
                                    color: "#94a3b8",
                                }}
                            >
                                Borrower question
                            </div>
                            <p
                                style={{
                                    fontSize: "0.92rem",
                                    lineHeight: 1.5,
                                    whiteSpace: "pre-wrap",
                                }}
                            >
                                {question}
                            </p>
                        </div>

                        {/* Answer */}
                        <div
                            style={{
                                padding: "12px 12px 14px",
                                borderRadius: 14,
                                background: "#ffffff",
                                border: "1px solid rgba(148, 163, 184, 0.45)",
                                display: "grid",
                                gap: 8,
                            }}
                        >
                            <div
                                style={{
                                    fontSize: "0.78rem",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.12em",
                                    fontWeight: 600,
                                    color: "#64748b",
                                }}
                            >
                                Answer overview
                            </div>
                            <div
                                style={{
                                    fontSize: "0.94rem",
                                    lineHeight: 1.6,
                                    color: "#0f172a",
                                    whiteSpace: "pre-wrap",
                                }}
                            >
                                {answer}
                            </div>
                        </div>
                    </section>
                ) : (
                    <section
                        style={{
                            padding: 16,
                            borderRadius: 16,
                            border: "1px solid rgba(148, 163, 184, 0.35)",
                            background: "#f8fafc",
                            display: "grid",
                            gap: 6,
                        }}
                    >
                        <div
                            style={{
                                fontSize: "0.95rem",
                                fontWeight: 600,
                                color: "#0f172a",
                            }}
                        >
                            Link is missing data
                        </div>
                        <p
                            style={{
                                fontSize: "0.9rem",
                                color: "#475569",
                            }}
                        >
                            This share link does not include a valid question and answer. It
                            may have been copied incorrectly or expired from your messaging
                            app.
                        </p>
                    </section>
                )}

                {/* Call to action */}
                <section
                    style={{
                        paddingTop: 6,
                        borderTop: "1px dashed rgba(148, 163, 184, 0.5)",
                        marginTop: 4,
                        display: "grid",
                        gap: 10,
                    }}
                >
                    <div
                        style={{
                            fontSize: "0.9rem",
                            color: "#475569",
                        }}
                    >
                        HomeRates.ai gives borrowers and investors a private way to test
                        scenarios, stress test advice, and ask follow up questions in plain
                        language.
                    </div>

                    <div
                        style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 10,
                            alignItems: "center",
                        }}
                    >
                        <Link
                            href={appBaseUrl}
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: "8px 16px",
                                borderRadius: 999,
                                border: "1px solid #0f172a",
                                background: "#0f172a",
                                color: "#f9fafb",
                                fontSize: "0.9rem",
                                fontWeight: 600,
                                textDecoration: "none",
                            }}
                        >
                            Open HomeRates.ai free app
                        </Link>

                        <span
                            style={{
                                fontSize: "0.8rem",
                                color: "#64748b",
                            }}
                        >
                            No login required to browse and ask initial questions.
                        </span>
                    </div>
                </section>
            </div>
        </main>
    );
}
