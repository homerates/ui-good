"use client";

import React, { useEffect, useMemo, useState } from "react";
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
export default function GrokCard({ data, onFollowUp }) {
    if (!data) return null;

    const { grok, answerMarkdown, followUp, data_freshness } = data;

    // Inject MiniChart markers once per answerMarkdown change
    const preparedFull = useMemo(
        () => injectMiniChartMarkers(answerMarkdown || ""),
        [answerMarkdown]
    );

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

            window.setTimeout(tick, 20);
        };

        window.setTimeout(tick, 20);

        return () => {
            cancelled = true;
        };
    }, [preparedFull, grok]);

    return (
        <div
            className="grok-card"
            style={{
                padding: "16px",
                background: "var(--card-bg, #ffffff)",
                borderRadius: "12px",
                border: "1px solid rgba(0,0,0,0.08)",
                marginTop: "12px",
                // IMPORTANT: do NOT force pre-wrap on the whole card (breaks tables/lists).
                whiteSpace: "normal",
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
                <span>{grok ? "Live 2025–2026 (Grok 4.1)" : "Legacy stack"}</span>
                {data_freshness && <span>{data_freshness}</span>}
            </div>

            {/* Main answer body with MiniChart support + typewriter text */}
            <ReactMarkdown
                className="grok-markdown"
                components={{
                    // Tighten paragraph spacing + preserve line breaks without breaking tables
                    p({ children }) {
                        const raw = Array.isArray(children) ? children.join("") : String(children ?? "");

                        if (raw.includes("[[MINICHART:")) {
                            const match = raw.match(/\[\[MINICHART:(.*?)\]\]/);
                            if (!match) return <p style={{ margin: "8px 0", whiteSpace: "pre-wrap" }}>{children}</p>;

                            const nums = match[1]
                                .split(",")
                                .map((v) => parseFloat(v.trim()))
                                .filter((v) => !isNaN(v));

                            const cleaned = raw.replace(match[0], "").trim();

                            return (
                                <p style={{ margin: "8px 0", whiteSpace: "pre-wrap" }}>
                                    {cleaned}
                                    <MiniChart values={nums} />
                                </p>
                            );
                        }

                        return <p style={{ margin: "8px 0", whiteSpace: "pre-wrap" }}>{children}</p>;
                    },

                    // Headings: tighter
                    h1({ children }) {
                        return <h1 style={{ margin: "10px 0 6px", fontSize: "18px" }}>{children}</h1>;
                    },
                    h2({ children }) {
                        return <h2 style={{ margin: "10px 0 6px", fontSize: "16px" }}>{children}</h2>;
                    },
                    h3({ children }) {
                        return <h3 style={{ margin: "10px 0 6px", fontSize: "14px" }}>{children}</h3>;
                    },

                    // Lists: tighter and readable
                    ul({ children }) {
                        return <ul style={{ margin: "8px 0", paddingLeft: "18px" }}>{children}</ul>;
                    },
                    ol({ children }) {
                        return <ol style={{ margin: "8px 0", paddingLeft: "18px" }}>{children}</ol>;
                    },
                    li({ children }) {
                        return <li style={{ margin: "4px 0" }}>{children}</li>;
                    },

                    // Tables: better container + borders + mobile scroll
                    table({ children }) {
                        return (
                            <div
                                style={{
                                    overflowX: "auto",
                                    margin: "10px 0",
                                    border: "1px solid rgba(0,0,0,0.08)",
                                    borderRadius: "10px",
                                    background: "#fff",
                                }}
                            >
                                <table
                                    style={{
                                        width: "100%",
                                        borderCollapse: "separate",
                                        borderSpacing: 0,
                                        fontSize: "13px",
                                        lineHeight: 1.35,
                                        // Smaller minWidth so it looks better on typical questions
                                        minWidth: "460px",
                                    }}
                                >
                                    {children}
                                </table>
                            </div>
                        );
                    },
                    thead({ children }) {
                        return <thead>{children}</thead>;
                    },
                    tbody({ children }) {
                        return <tbody>{children}</tbody>;
                    },
                    tr({ children }) {
                        return <tr>{children}</tr>;
                    },
                    th({ children }) {
                        return (
                            <th
                                style={{
                                    textAlign: "left",
                                    padding: "10px 12px",
                                    borderBottom: "1px solid rgba(0,0,0,0.12)",
                                    whiteSpace: "nowrap",
                                    background: "rgba(0,0,0,0.03)",
                                    fontWeight: 600,
                                }}
                            >
                                {children}
                            </th>
                        );
                    },
                    td({ children }) {
                        return (
                            <td
                                style={{
                                    padding: "10px 12px",
                                    borderBottom: "1px solid rgba(0,0,0,0.08)",
                                    verticalAlign: "top",
                                    // Helps long “Key Citation” text not destroy the table
                                    wordBreak: "break-word",
                                    overflowWrap: "anywhere",
                                    whiteSpace: "normal",
                                }}
                            >
                                {children}
                            </td>
                        );
                    },

                    // Inline code and code blocks stay readable
                    code({ inline, children }) {
                        if (inline) {
                            return (
                                <code
                                    style={{
                                        fontSize: "0.95em",
                                        background: "rgba(0,0,0,0.04)",
                                        padding: "1px 6px",
                                        borderRadius: "6px",
                                    }}
                                >
                                    {children}
                                </code>
                            );
                        }
                        return (
                            <pre
                                style={{
                                    margin: "10px 0",
                                    padding: "10px 12px",
                                    background: "rgba(0,0,0,0.04)",
                                    borderRadius: "10px",
                                    overflowX: "auto",
                                }}
                            >
                                <code>{children}</code>
                            </pre>
                        );
                    },
                }}
            >
                {displayedText}
            </ReactMarkdown>

            {/* Follow-up CTA */}
            {followUp && onFollowUp && (
                <div style={{ marginTop: "6px" }}>
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
