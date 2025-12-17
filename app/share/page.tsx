// app/share/page.tsx
// Public share snapshot page (no auth required).
// Renders a read-only view from ?q=...&a=... and never redirects to "/".

import React from "react";

export const dynamic = "force-dynamic";

function pickOne(v: any): string {
    if (!v) return "";
    if (Array.isArray(v)) return String(v[0] ?? "");
    return String(v);
}

export default async function SharePage(props: {
    searchParams?: Promise<any>;
}) {
    const sp = props.searchParams ? await props.searchParams : {};

    const question = pickOne(sp.q).trim();
    const answer = pickOne(sp.a).trim();

    // Some older links may pass placeholders like "*" or omit fields.
    const hasQuestion = question.length > 0 && question !== "*";
    const hasAnswer = answer.length > 0 && answer !== "*";

    const title = hasQuestion ? question : "Shared answer";

    return (
        <main
            style={{
                minHeight: "100dvh",
                background: "#0b1220",
                color: "#e5e7eb",
                padding: "24px 14px 64px",
            }}
        >
            <div style={{ maxWidth: 920, margin: "0 auto" }}>
                <div
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        border: "1px solid rgba(148, 163, 184, 0.35)",
                        background: "rgba(15, 23, 42, 0.75)",
                        borderRadius: 999,
                        padding: "6px 10px",
                        fontSize: 12,
                        color: "rgba(226, 232, 240, 0.92)",
                        marginBottom: 14,
                    }}
                >
                    HomeRates.ai shared snapshot
                </div>

                <h1
                    style={{
                        fontSize: 18,
                        lineHeight: 1.35,
                        margin: "0 0 12px",
                        fontWeight: 650,
                    }}
                >
                    {title}
                </h1>

                <div
                    style={{
                        border: "1px solid rgba(148, 163, 184, 0.35)",
                        background: "rgba(15, 23, 42, 0.6)",
                        borderRadius: 16,
                        padding: 14,
                    }}
                >
                    <div
                        style={{
                            fontSize: 12,
                            color: "rgba(203, 213, 225, 0.9)",
                            marginBottom: 8,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                        }}
                    >
                        Question
                    </div>

                    <div
                        style={{
                            whiteSpace: "pre-wrap",
                            fontSize: 14,
                            lineHeight: 1.55,
                            marginBottom: 16,
                            color: hasQuestion ? "#e5e7eb" : "rgba(226, 232, 240, 0.75)",
                        }}
                    >
                        {hasQuestion ? question : "Question not included in this link."}
                    </div>

                    <div
                        style={{
                            fontSize: 12,
                            color: "rgba(203, 213, 225, 0.9)",
                            marginBottom: 8,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                        }}
                    >
                        Answer
                    </div>

                    <div
                        style={{
                            whiteSpace: "pre-wrap",
                            fontSize: 14,
                            lineHeight: 1.55,
                            color: hasAnswer ? "#e5e7eb" : "rgba(226, 232, 240, 0.75)",
                        }}
                    >
                        {hasAnswer ? answer : "Answer not included in this link."}
                    </div>
                </div>

                <div
                    style={{
                        marginTop: 14,
                        fontSize: 12,
                        color: "rgba(203, 213, 225, 0.75)",
                        lineHeight: 1.5,
                    }}
                >
                    This is a read-only snapshot. To ask follow-up questions, open HomeRates.ai and start a new chat.
                </div>

                <div style={{ marginTop: 18 }}>
                    <a
                        href="/"
                        style={{
                            display: "inline-block",
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: "1px solid rgba(148, 163, 184, 0.45)",
                            background: "rgba(15, 23, 42, 0.9)",
                            color: "#e5e7eb",
                            textDecoration: "none",
                            fontSize: 13,
                            fontWeight: 600,
                        }}
                    >
                        Open HomeRates.ai
                    </a>
                </div>
            </div>
        </main>
    );
}
