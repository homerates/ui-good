// components/GrokCard.jsx
'use client';

import React, { useState } from "react";

export default function GrokCard({ data, onFollowUp }) {
    // Default: card is open (expanded)
    const [expanded, setExpanded] = useState(true);

    const {
        grok,
        answerMarkdown,
        followUp,
        data_freshness,
    } = data || {};

    const hasGrok = !!grok;

    // ---- Safe answer markdown handling ----
    const rawAnswer =
        (typeof answerMarkdown === "string" && answerMarkdown) ||
        (typeof grok?.answerMarkdown === "string" && grok.answerMarkdown) ||
        (typeof grok?.answer === "string" && grok.answer) ||
        "";

    // Hero text: first **bold** match, else first non-empty line, else fallback
    let heroText = "Your Answer";
    if (rawAnswer) {
        const heroMatch = rawAnswer.match(/\*\*(.*?)\*\*/);
        if (heroMatch && heroMatch[1] && heroMatch[1].trim()) {
            heroText = heroMatch[1].trim();
        } else {
            const firstLine =
                rawAnswer
                    .split("\n")
                    .map((l) => l.trim())
                    .find((l) => l.length > 0) || "";
            if (firstLine) {
                heroText = firstLine.replace(/\*\*/g, "").slice(0, 160);
            }
        }
    }

    // Confidence handling: accept 0–1 or 0–100
    let confidenceLabel = null;
    if (hasGrok && typeof grok.confidence !== "undefined") {
        const c = Number(grok.confidence);
        if (!Number.isNaN(c)) {
            const pct = c <= 1 ? Math.round(c * 100) : Math.round(c);
            confidenceLabel = pct + "% confident";
        }
    }

    // Convert lightweight markdown to HTML for the deep dive
    const htmlBody = rawAnswer
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n{2,}/g, "<br/><br/>")
        .replace(/\n/g, "<br/>");

    // Build a de-duplicated list of follow-up questions (no click behaviour)
    const followups = [];
    if (followUp && typeof followUp === "string") {
        followups.push(followUp);
    }
    if (grok?.follow_up && typeof grok.follow_up === "string") {
        if (!followups.includes(grok.follow_up)) {
            followups.push(grok.follow_up);
        }
    }

    return (
        <div
            style={{
                margin: "16px 0",
                border: "1px solid #e0e0e0",
                borderRadius: "12px",
                background: "#f8faff",
                overflow: "hidden",
                boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                fontFamily:
                    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                width: "100%",
                maxWidth: "100%",
            }}
        >
            {/* Hero Bar */}
            <div
                style={{
                    background: "linear-gradient(90deg, #4f46e5, #7c3aed)",
                    color: "white",
                    padding: "14px 16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                }}
            >
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                        style={{
                            fontSize: "1.15rem",
                            fontWeight: "bold",
                            lineHeight: 1.3,
                            wordWrap: "break-word",
                        }}
                    >
                        {heroText}
                    </div>
                    {(confidenceLabel || data_freshness) && (
                        <div
                            style={{
                                fontSize: "0.8rem",
                                marginTop: "4px",
                                opacity: 0.9,
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "6px",
                            }}
                        >
                            {confidenceLabel && <span>{confidenceLabel}</span>}
                            {data_freshness && (
                                <span style={{ opacity: 0.9 }}>
                                    • {data_freshness}
                                </span>
                            )}
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => setExpanded(!expanded)}
                    style={{
                        flexShrink: 0,
                        background: "rgba(255,255,255,0.16)",
                        border: "none",
                        borderRadius: "999px",
                        padding: "6px 10px",
                        color: "white",
                        cursor: "pointer",
                        fontSize: "1.2rem",
                        lineHeight: 1,
                    }}
                >
                    {expanded ? "−" : "+"}
                </button>
            </div>

            {/* Deep Dive – shown when expanded */}
            {expanded && rawAnswer && (
                <div
                    style={{
                        padding: "16px",
                        background: "white",
                        lineHeight: 1.6,
                        color: "#1f2937",
                        fontSize: "0.95rem",
                        wordWrap: "break-word",
                    }}
                    dangerouslySetInnerHTML={{ __html: htmlBody }}
                />
            )}

            {/* Action Panel */}
            <div
                style={{
                    padding: "12px 16px 14px",
                    background: "#f1f5f9",
                    borderTop: "1px solid #e0e0e0",
                }}
            >
                {hasGrok && grok.next_step && (
                    <div style={{ marginBottom: "10px" }}>
                        <strong
                            style={{
                                color: "#4f46e5",
                                fontSize: "0.9rem",
                            }}
                        >
                            Next step
                        </strong>
                        <div style={{ marginTop: "4px", fontSize: "0.9rem" }}>
                            {grok.next_step}
                        </div>
                    </div>
                )}

                {followups.length > 0 && (
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                        }}
                    >
                        <strong
                            style={{
                                color: "#4f46e5",
                                fontSize: "0.85rem",
                                marginRight: "4px",
                            }}
                        >
                            Ask me next →
                        </strong>

                        <div
                            style={{
                                display: "grid",
                                gap: "2px",
                            }}
                        >
                            {followups.map((q, i) => (
                                <div
                                    key={i}
                                    style={{
                                        fontSize: "0.85rem",
                                        color: "#111827",
                                        wordWrap: "break-word",
                                    }}
                                >
                                    {q}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
