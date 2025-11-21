// components/GrokCard.jsx
import React, { useState } from "react";

export default function GrokCard({ data, onFollowUp }) {
    const [expanded, setExpanded] = useState(false);

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
        if (heroMatch && heroMatch[1]?.trim()) {
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
            confidenceLabel = `${pct}% confident`;
        }
    }

    // Convert lightweight markdown to HTML for the deep dive
    const htmlBody = rawAnswer
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n{2,}/g, "<br/><br/>")
        .replace(/\n/g, "<br/>");

    const handleFollowUpClick = (q) => {
        if (!q || typeof onFollowUp !== "function") return;
        onFollowUp(q);
    };

    return (
        <div
            style={{
                margin: "16px 0",
                border: "1px solid #e0e0e0",
                borderRadius: "12px",
                background: "#f8faff",
                overflow: "hidden",
                boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
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

            {/* Deep Dive – only shown when expanded */}
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
                        <strong style={{ color: "#4f46e5", fontSize: "0.9rem" }}>
                            Next step
                        </strong>
                        <div style={{ marginTop: "4px", fontSize: "0.9rem" }}>
                            {grok.next_step}
                        </div>
                    </div>
                )}

                {(followUp || grok?.follow_up) && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                        <strong
                            style={{
                                color: "#4f46e5",
                                fontSize: "0.85rem",
                                marginRight: "4px",
                            }}
                        >
                            Ask me next →
                        </strong>

                        {followUp && (
                            <button
                                type="button"
                                onClick={() => handleFollowUpClick(followUp)}
                                style={{
                                    padding: "6px 12px",
                                    background: "#e0e7ff",
                                    color: "#4f46e5",
                                    border: "1px solid #c7d2fe",
                                    borderRadius: "999px",
                                    cursor: "pointer",
                                    fontSize: "0.85rem",
                                    maxWidth: "100%",
                                    whiteSpace: "nowrap",
                                    textOverflow: "ellipsis",
                                    overflow: "hidden",
                                }}
                            >
                                {followUp}
                            </button>
                        )}

                        {grok?.follow_up && (
                            <button
                                type="button"
                                onClick={() => handleFollowUpClick(grok.follow_up)}
                                style={{
                                    padding: "6px 12px",
                                    background: "#4f46e5",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "999px",
                                    cursor: "pointer",
                                    fontSize: "0.85rem",
                                    maxWidth: "100%",
                                    whiteSpace: "nowrap",
                                    textOverflow: "ellipsis",
                                    overflow: "hidden",
                                }}
                            >
                                {grok.follow_up}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
