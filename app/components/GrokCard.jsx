"use client";

import React from "react";
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
// Props shape matches your page.tsx usage:
// <GrokCard
//   data={{ grok, answerMarkdown, followUp, data_freshness }}
//   onFollowUp={(q) => ...}
// />
export default function GrokCard({ data, onFollowUp }) {
    if (!data) return null;

    const { grok, answerMarkdown, followUp, data_freshness } = data;
    const prepared = injectMiniChartMarkers(answerMarkdown || "");

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
            {/* Simple header row (you can style this more if you like) */}
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

            {/* Main answer body with MiniChart support */}
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
                {prepared}
            </ReactMarkdown>

            {/* Follow-up CTA (optional) */}
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
                        }}
                    >
                        Ask: {followUp}
                    </button>
                </div>
            )}
        </div>
    );
}
