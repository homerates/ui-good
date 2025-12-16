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

    return text.replace(chartRegex, (_match, inner) => {
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

// ===== Table parsing without remark-gfm ===================================
// We avoid remark-gfm entirely to prevent the production crash:
//   this.data.inTable = !0
// Instead we detect markdown table blocks from raw text and render them ourselves.

function isTableSeparatorLine(line) {
    // Examples:
    // |---|---|
    // |:--|--:|
    // ---|---|---
    const s = line.trim();
    if (!s.includes("-") || !s.includes("|")) return false;

    // Must be made of pipes, dashes, colons, and spaces
    if (!/^[\s\|\-:]+$/.test(s)) return false;

    // Must contain at least one dash group
    return /\-+/.test(s);
}

function splitRow(line) {
    // Trim outer pipes, then split
    const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    return trimmed.split("|").map((c) => c.trim());
}

function parseTableAt(lines, startIdx) {
    // Needs: header line + separator line
    const headerLine = lines[startIdx];
    const sepLine = lines[startIdx + 1];

    if (!headerLine || !sepLine) return null;
    if (!headerLine.includes("|")) return null;
    if (!isTableSeparatorLine(sepLine)) return null;

    const headers = splitRow(headerLine);
    if (!headers.length) return null;

    const rows = [];
    let i = startIdx + 2;

    while (i < lines.length) {
        const line = lines[i];

        // Stop table on blank line or on a non-pipe line
        if (!line || line.trim() === "") break;
        if (!line.includes("|")) break;

        const row = splitRow(line);

        // Normalize row length to header length
        const fixed = row.slice(0, headers.length);
        while (fixed.length < headers.length) fixed.push("");
        rows.push(fixed);

        i += 1;
    }

    return { table: { headers, rows }, nextIndex: i };
}

function splitMarkdownIntoBlocks(markdown) {
    const lines = (markdown || "").replace(/\r\n/g, "\n").split("\n");
    const blocks = [];
    let buffer = [];

    const flushBuffer = () => {
        if (!buffer.length) return;
        blocks.push({ type: "md", content: buffer.join("\n") });
        buffer = [];
    };

    let i = 0;
    while (i < lines.length) {
        const attempt = parseTableAt(lines, i);
        if (attempt) {
            flushBuffer();
            blocks.push({ type: "table", table: attempt.table });
            i = attempt.nextIndex;
            continue;
        }

        buffer.push(lines[i]);
        i += 1;
    }

    flushBuffer();
    return blocks;
}

function isMostlyNumericColumn(headers, rows, colIndex) {
    // Skip col 0 usually label column
    let scored = 0;
    let checked = 0;

    for (const r of rows) {
        const v = (r[colIndex] || "").trim();
        if (!v) continue;
        checked += 1;

        const hasDigits = /\d/.test(v);
        const letters = (v.match(/[a-z]/gi) || []).length;

        if (hasDigits && letters <= 3) scored += 1;
        if (checked >= 10) break;
    }

    if (checked === 0) return false;
    return scored / checked >= 0.6;
}

function ModernTable({ headers, rows }) {
    const colCount = headers.length;

    // Wider first col; others even
    const gridTemplateColumns =
        colCount === 1
            ? "1fr"
            : `minmax(220px, 1.8fr) ${Array.from({ length: colCount - 1 })
                .map(() => "minmax(140px, 1fr)")
                .join(" ")}`;

    const numericCols = new Set();
    for (let i = 1; i < colCount; i++) {
        if (isMostlyNumericColumn(headers, rows, i)) numericCols.add(i);
    }

    return (
        <div
            style={{
                margin: "12px 0",
                border: "1px solid rgba(0,0,0,0.10)",
                borderRadius: "14px",
                overflow: "hidden",
                background: "#fff",
                boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
            }}
        >
            <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: Math.max(720, colCount * 180) }}>
                    {/* Header */}
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns,
                            background: "rgba(0,0,0,0.035)",
                            borderBottom: "1px solid rgba(0,0,0,0.10)",
                        }}
                    >
                        {headers.map((h, i) => (
                            <div
                                key={`h-${i}`}
                                style={{
                                    padding: "12px 14px",
                                    fontSize: "12px",
                                    fontWeight: 700,
                                    color: "rgba(0,0,0,0.72)",
                                    whiteSpace: "nowrap",
                                    textAlign: i === 0 ? "left" : numericCols.has(i) ? "right" : "left",
                                    borderRight: i === colCount - 1 ? "none" : "1px solid rgba(0,0,0,0.06)",
                                }}
                            >
                                {h}
                            </div>
                        ))}
                    </div>

                    {/* Rows */}
                    {rows.map((r, rowIdx) => {
                        const bg = rowIdx % 2 === 0 ? "#fff" : "rgba(0,0,0,0.015)";
                        return (
                            <div
                                key={`r-${rowIdx}`}
                                style={{
                                    display: "grid",
                                    gridTemplateColumns,
                                    background: bg,
                                    borderBottom: rowIdx === rows.length - 1 ? "none" : "1px solid rgba(0,0,0,0.06)",
                                }}
                            >
                                {r.map((cell, colIdx) => (
                                    <div
                                        key={`c-${rowIdx}-${colIdx}`}
                                        style={{
                                            padding: "12px 14px",
                                            fontSize: "13px",
                                            lineHeight: 1.35,
                                            color: "rgba(0,0,0,0.88)",
                                            whiteSpace: "normal",
                                            wordBreak: "break-word",
                                            overflowWrap: "anywhere",
                                            textAlign: colIdx === 0 ? "left" : numericCols.has(colIdx) ? "right" : "left",
                                            borderRight: colIdx === colCount - 1 ? "none" : "1px solid rgba(0,0,0,0.06)",
                                        }}
                                    >
                                        {cell || "\u00A0"}
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// ===== GrokCard ============================================================
export default function GrokCard({ data, onFollowUp }) {
    if (!data) return null;

    const { grok, answerMarkdown, followUp, data_freshness } = data;

    const preparedFull = useMemo(() => injectMiniChartMarkers(answerMarkdown || ""), [answerMarkdown]);

    // STREAMING STATE
    const [displayedText, setDisplayedText] = useState(preparedFull);
    const [isStreaming, setIsStreaming] = useState(false);

    useEffect(() => {
        if (!grok || !preparedFull || preparedFull.length < 80) {
            setDisplayedText(preparedFull);
            setIsStreaming(false);
            return;
        }

        let cancelled = false;
        const chars = Array.from(preparedFull);
        const total = chars.length;

        setDisplayedText("");
        setIsStreaming(true);

        let index = 0;
        const tick = () => {
            if (cancelled) return;

            index += 24;
            if (index >= total) {
                setDisplayedText(preparedFull);
                setIsStreaming(false);
                return;
            }

            setDisplayedText(chars.slice(0, index).join(""));
            window.setTimeout(tick, 20);
        };

        window.setTimeout(tick, 20);
        return () => {
            cancelled = true;
        };
    }, [preparedFull, grok]);

    // Only split into blocks when not streaming (so we never parse half a table)
    const blocks = useMemo(() => {
        try {
            return splitMarkdownIntoBlocks(preparedFull);
        } catch {
            return [{ type: "md", content: preparedFull }];
        }
    }, [preparedFull]);

    return (
        <div
            className="grok-card"
            style={{
                padding: "16px",
                background: "var(--card-bg, #ffffff)",
                borderRadius: "12px",
                border: "1px solid rgba(0,0,0,0.08)",
                marginTop: "12px",
                whiteSpace: "normal",
            }}
        >
            {/* Header row */}
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

            {/* Streaming: plain text only (safe).
          Done: render blocks (markdown + modern tables). */}
            {isStreaming ? (
                <div style={{ whiteSpace: "pre-wrap", fontSize: "13px", lineHeight: 1.55 }}>
                    {displayedText}
                </div>
            ) : (
                <div>
                    {blocks.map((b, idx) => {
                        if (b.type === "table") {
                            const { headers, rows } = b.table || {};
                            if (!headers || !headers.length) return null;
                            return <ModernTable key={`t-${idx}`} headers={headers} rows={rows || []} />;
                        }

                        // markdown block
                        return (
                            <ReactMarkdown
                                key={`m-${idx}`}
                                className="grok-markdown"
                                components={{
                                    p({ children }) {
                                        const raw = Array.isArray(children) ? children.join("") : String(children ?? "");

                                        if (raw.includes("[[MINICHART:")) {
                                            const match = raw.match(/\[\[MINICHART:(.*?)\]\]/);
                                            if (!match) {
                                                return <p style={{ margin: "8px 0", whiteSpace: "pre-wrap" }}>{children}</p>;
                                            }

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

                                    h1({ children }) {
                                        return <h1 style={{ margin: "10px 0 6px", fontSize: "18px" }}>{children}</h1>;
                                    },
                                    h2({ children }) {
                                        return <h2 style={{ margin: "10px 0 6px", fontSize: "16px" }}>{children}</h2>;
                                    },
                                    h3({ children }) {
                                        return <h3 style={{ margin: "10px 0 6px", fontSize: "14px" }}>{children}</h3>;
                                    },

                                    ul({ children }) {
                                        return <ul style={{ margin: "8px 0", paddingLeft: "18px" }}>{children}</ul>;
                                    },
                                    ol({ children }) {
                                        return <ol style={{ margin: "8px 0", paddingLeft: "18px" }}>{children}</ol>;
                                    },
                                    li({ children }) {
                                        return <li style={{ margin: "4px 0" }}>{children}</li>;
                                    },

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
                                {b.content}
                            </ReactMarkdown>
                        );
                    })}
                </div>
            )}

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
