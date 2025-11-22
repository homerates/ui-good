"use client";

import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

// ===== MiniChart ===========================================================
const MiniChart = ({ values }) => {
    if (!values || values.length === 0) return null;

    const max = Math.max(...values, 0);
    const min = Math.min(...values, 0);
    const range = max - min || 1;

    return (
        <span style={{ display: "inline-block", marginLeft: "8px", verticalAlign: "middle" }}>
            {values.map((v, i) => (
                <span
                    key={i}
                    style={{
                        display: "inline-block",
                        width: "5px",
                        height: "16px",
                        background: v >= 0 ? "#10b981" : "#ef4444",
                        margin: "0 1px",
                        borderRadius: "2px",
                        transform: `translateY(${16 - ((v - min) / range) * 16}px)`,
                    }}
                />
            ))}
        </span>
    );
};

// ===== Helper: encode inline MiniChart tags safely =========================
// We let Grok output something like:
//   Payment change: +$202 → +$72 → -$108
//   <MiniChart values={[202, 72, -108]} />
//
// This helper converts that into a marker token we can interpret in ReactMarkdown.
function injectMiniChartMarkers(text) {
    if (!text) return "";
    const chartRegex = /<MiniChart\s+values=\{\s*\[([^\]]+)\]\s*\}\s*\/>/g;

    return text.replace(chartRegex, (match, inner) => {
        try {
            const values = inner
                .split(",")
                .map((v) => parseFloat(v.trim()))
                .filter((v) => !isNaN(v));

            if (!values.length) return "";
            return `[[MINICHART:${values.join(",")}]]`;
        } catch {
            return "";
        }
    });
}

// ===== GrokCard ============================================================
// <GrokCard
//   data={{ grok, answerMarkdown, followUp, data_freshness }}
//   onFollowUp={(q) => ...}
// />
export default function GrokCard({ data, onFollowUp }) {
    if (!data) return null;

    const { grok, answerMarkdown, followUp, data_freshness } = data;

    // Full markdown text with MiniChart markers injected
    const preparedFull = injectMiniChartMarkers(answerMarkdown || "");

    // Streaming-ish state: we "type out" preparedFull when there's a Grok answer
    const [displayedText, setDisplayedText] = useState(preparedFull);
    const [isStreaming, setIsStreaming] = useState(false);

    useEffect(() => {
        // If there is no Grok object or the text is short, just show immediately
        if (!grok || !preparedFull || preparedFull.length < 80) {
            setDisplayedText(preparedFull);
            setIsStreaming(false);
            return;
        }

        // Typewriter effect over the already-computed markdown
        let cancelled = false;
        const chars = Array.from(preparedFull);
        const total = chars.length;

        setDisplayedText("");
        setIsStreaming(true);

        let index = 0;

        const tick = () => {
            if (cancelled) return;

            index += 24; // characters per step
            if (index >= total) {
                setDisplayedText(preparedFull);
                setIsStreaming(false);
                return;
            }

            const slice = chars.slice(0, index).join("");
            setDisplayedText(slice);

            window.setTimeout(tick, 20); // ms between steps
        };

        window.setTimeout(tick, 20);

        return () => {
            cancelled = true;
        };
    }, [preparedFull, grok]);

    return (
        <div
            style={{
                padding: "16px",
                background: "var(--card-bg, #ffffff)",
                borderRadius: "12px",
                border: "1px solid rgba(0,0,0,0.08)",
                marginTop: "12px",
                whiteSpace: "pre-wrap",
            }}
        >
            {/* Header row stays the same */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: "8px",
                    fontSize: "12px",
                    color: "rgba(0,0,0,0.55)",
                }}
            >
                <span>{grok ? "Live 2025–2026 (Grok-3)" : "Legacy stack"}</span>
                {data_freshness && <span>{data_freshness}</span>}
            </div>

            {/* Main answer body with MiniChart support + typewriter text */}
            <ReactMarkdown
                components={{
                    p({ children }) {
                        const raw = String(children ?? "");

                        if (raw.includes("[[MINICHART:")) {
                            const match = raw.match(/\[\[MINICHART:(.*?)\]\]/);
                            if (!match) return <p>{children}</p>;

                            const nums = match[1]
                                .split(",")
                                .map((v) => parseFloat(v.trim()))
                                .filter((v) => !isNaN(v));

                            const cleaned = raw.replace(match[0], "").trim();

                            return (
                                <p>
                                    {cleaned}
                                    <MiniChart values={nums} />
                                </p>
                            );
                        }

                        return <p>{children}</p>;
                    },
                }}
            >
                {displayedText}
            </ReactMarkdown>

            {/* Follow-up CTA */}
            {followUp && onFollowUp && (
                <div style={{ marginTop: "12px" }}>
                    <button
                        type="button"
                        onClick={() => onFollowUp(followUp)}
                        style={{
                            fontSize: "13px",
                            padding: "6px 10px",
                            borderRadius: "999px",
                            border: "1px solid rgba(0,0,0,0.12)",
                            background: "#f9fafb",
                            cursor: "pointer",
                            opacity: isStreaming ? 0.7 : 1,
                        }}
                    >
                        Ask: {followUp}
                    </button>
                </div>
            )}
        </div>
    );
}
