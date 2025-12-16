"use client";

import React, { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

// ===== Modern Table Renderer ==============================================
// Renders markdown tables as a modern “grid card table”.
// Hardening: never throw (table parsing errors should not crash page).

function extractText(node) {
    if (node == null) return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(extractText).join("");
    if (typeof node === "object" && node.props && node.props.children != null) {
        return extractText(node.props.children);
    }
    return "";
}

function normalizeRowCells(cells) {
    return cells.map((c) => extractText(c).replace(/\s+/g, " ").trim());
}

function parseMarkdownTable(children) {
    // react-markdown passes a nested element structure; we map it into {headers, rows}.
    const all = React.Children.toArray(children);

    let thead = null;
    let tbody = null;

    for (const el of all) {
        if (!React.isValidElement(el)) continue;
        if (el.type === "thead") thead = el;
        if (el.type === "tbody") tbody = el;
    }

    const bodyRows = [];
    const headRowCells = [];

    const tbodyChildren = tbody ? React.Children.toArray(tbody.props.children) : [];
    const theadChildren = thead ? React.Children.toArray(thead.props.children) : [];

    // header row from thead if present
    if (theadChildren.length) {
        const tr = theadChildren.find((x) => React.isValidElement(x) && x.type === "tr");
        if (tr && React.isValidElement(tr)) {
            const ths = React.Children.toArray(tr.props.children).filter(
                (c) => React.isValidElement(c) && (c.type === "th" || c.type === "td")
            );
            headRowCells.push(...normalizeRowCells(ths));
        }
    }

    // body rows
    for (const r of tbodyChildren) {
        if (!React.isValidElement(r) || r.type !== "tr") continue;
        const tds = React.Children.toArray(r.props.children).filter(
            (c) => React.isValidElement(c) && (c.type === "td" || c.type === "th")
        );
        bodyRows.push(normalizeRowCells(tds));
    }

    // if no thead, promote first body row to header
    let headers = headRowCells;
    let rows = bodyRows;

    if (!headers.length && bodyRows.length) {
        headers = bodyRows[0];
        rows = bodyRows.slice(1);
    }

    const colCount = headers.length || (rows[0] ? rows[0].length : 0);
    if (!colCount) return null;

    const fixedHeaders = headers.length
        ? headers
        : Array.from({ length: colCount }).map((_, i) => `Col ${i + 1}`);

    const fixedRows = rows.map((r) => {
        const rr = r.slice(0, colCount);
        while (rr.length < colCount) rr.push("");
        return rr;
    });

    return {
        headers: fixedHeaders.slice(0, colCount),
        rows: fixedRows,
        colCount,
    };
}

function isMostlyNumericColumn(table, colIndex) {
    let scored = 0;
    let checked = 0;

    for (const row of table.rows) {
        const v = (row[colIndex] || "").trim();
        if (!v) continue;

        checked += 1;

        // numeric-ish: has digits and not too many letters
        const hasDigits = /\d/.test(v);
        const letters = (v.match(/[a-z]/gi) || []).length;

        // Let “30-45 days” and “$1,234” count as numeric-ish.
        if (hasDigits && letters <= 5) scored += 1;
        if (checked >= 10) break;
    }

    if (checked === 0) return false;
    return scored / checked >= 0.6;
}

function ModernTable({ table }) {
    const { headers, rows, colCount } = table;

    // First column wider (labels), remaining columns evenly sized
    const gridTemplateColumns =
        colCount === 1
            ? "1fr"
            : `minmax(260px, 2fr) ${Array.from({ length: colCount - 1 })
                .map(() => "minmax(160px, 1fr)")
                .join(" ")}`;

    // Decide numeric alignment per column
    const numericCols = new Set();
    for (let i = 1; i < colCount; i++) {
        if (isMostlyNumericColumn(table, i)) numericCols.add(i);
    }

    return (
        <div
            style={{
                margin: "12px 0",
                border: "1px solid rgba(0,0,0,0.10)",
                borderRadius: "14px",
                overflow: "hidden",
                background: "#fff",
                boxShadow: "0 8px 20px rgba(0,0,0,0.05)",
            }}
        >
            <div style={{ overflowX: "auto" }}>
                {/* Give the grid enough min-width so it feels “designed” not squished */}
                <div style={{ minWidth: Math.max(820, colCount * 210) }}>
                    {/* Header */}
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns,
                            background: "linear-gradient(to bottom, rgba(0,0,0,0.045), rgba(0,0,0,0.025))",
                            borderBottom: "1px solid rgba(0,0,0,0.10)",
                        }}
                    >
                        {headers.map((h, i) => (
                            <div
                                key={`h-${i}`}
                                style={{
                                    padding: "12px 14px",
                                    fontSize: "12px",
                                    fontWeight: 800,
                                    letterSpacing: "0.01em",
                                    color: "rgba(0,0,0,0.70)",
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
                        const bg = rowIdx % 2 === 0 ? "#fff" : "rgba(0,0,0,0.018)";
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

    const preparedFull = useMemo(
        () => injectMiniChartMarkers(answerMarkdown || ""),
        [answerMarkdown]
    );

    // STREAMING STATE (always available)
    const [displayedText, setDisplayedText] = useState(preparedFull);
    const [isStreaming, setIsStreaming] = useState(false);

    useEffect(() => {
        // If there is no Grok object or the text is short, just show immediately
        if (!grok || !preparedFull || preparedFull.length < 80) {
            setDisplayedText(preparedFull);
            setIsStreaming(false);
            return;
        }

        // Typewriter effect over raw text (SAFE)
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

            {/* While streaming: show plain text (so tables don't crash parser mid-stream).
          Once done: render final markdown with modern tables. */}
            {isStreaming ? (
                <div style={{ whiteSpace: "pre-wrap", fontSize: "13px", lineHeight: 1.55 }}>
                    {displayedText}
                </div>
            ) : (
                <ReactMarkdown
                    className="grok-markdown"
                    remarkPlugins={[remarkGfm]}
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

                        // ✅ Tables: modern grid renderer (never crash)
                        table({ children }) {
                            try {
                                const parsed = parseMarkdownTable(children);
                                if (parsed) return <ModernTable table={parsed} />;
                            } catch {
                                // fall through to safe fallback
                            }

                            return (
                                <div
                                    style={{
                                        overflowX: "auto",
                                        margin: "12px 0",
                                        border: "1px solid rgba(0,0,0,0.10)",
                                        borderRadius: "12px",
                                        background: "#fff",
                                    }}
                                >
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                                        {children}
                                    </table>
                                </div>
                            );
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
                    {preparedFull}
                </ReactMarkdown>
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
