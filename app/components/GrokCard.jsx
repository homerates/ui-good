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
        <span
            style={{
                display: "inline-block",
                marginLeft: "8px",
                verticalAlign: "middle",
            }}
        >
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
// Goal: render markdown tables as a modern “grid card table” with:
// - consistent column sizing
// - striped rows
// - better wrapping
// - horizontal scroll on small screens
// - no ugly markdown spacing
//
// We parse react-markdown table children into a simple structure and render divs.
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
    return cells.map((c) => {
        const t = extractText(c).replace(/\s+/g, " ").trim();
        return t;
    });
}

function parseMarkdownTable(children) {
    // children in table() is usually [thead, tbody] or just [tbody] depending on markdown.
    const all = React.Children.toArray(children);

    let thead = null;
    let tbody = null;

    for (const el of all) {
        if (!React.isValidElement(el)) continue;
        const type = el.type;
        if (type === "thead") thead = el;
        if (type === "tbody") tbody = el;
    }

    // Some markdown tables might not emit thead; first row in tbody becomes header.
    const bodyRows = [];
    const headRowCells = [];

    const tbodyChildren = tbody ? React.Children.toArray(tbody.props.children) : [];
    const theadChildren = thead ? React.Children.toArray(thead.props.children) : [];

    // Parse header row
    if (theadChildren.length) {
        const tr = theadChildren.find((x) => React.isValidElement(x) && x.type === "tr");
        if (tr && React.isValidElement(tr)) {
            const ths = React.Children.toArray(tr.props.children).filter(
                (c) => React.isValidElement(c) && (c.type === "th" || c.type === "td")
            );
            headRowCells.push(...normalizeRowCells(ths));
        }
    }

    // Parse body rows
    for (const r of tbodyChildren) {
        if (!React.isValidElement(r) || r.type !== "tr") continue;
        const tds = React.Children.toArray(r.props.children).filter(
            (c) => React.isValidElement(c) && (c.type === "td" || c.type === "th")
        );
        bodyRows.push(normalizeRowCells(tds));
    }

    // If no explicit thead, promote first body row to header (common markdown behavior)
    let headers = headRowCells;
    let rows = bodyRows;

    if (!headers.length && bodyRows.length) {
        headers = bodyRows[0];
        rows = bodyRows.slice(1);
    }

    // Validate
    const colCount = headers.length || (rows[0] ? rows[0].length : 0);
    if (!colCount) return null;

    // Normalize all rows to same column count
    const fixedHeaders = headers.length ? headers : Array.from({ length: colCount }).map((_, i) => `Col ${i + 1}`);
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
        // numeric-ish: contains digits and not too many letters
        const hasDigits = /\d/.test(v);
        const letters = (v.match(/[a-z]/gi) || []).length;
        if (hasDigits && letters <= 3) scored += 1;
        if (checked >= 8) break; // cap work
    }
    if (checked === 0) return false;
    return scored / checked >= 0.6;
}

function ModernTable({ table }) {
    const { headers, rows, colCount } = table;

    // Column sizing: first column wider; others even. Works well for “Agency/Lender + numbers”.
    const gridTemplateColumns =
        colCount === 1
            ? "1fr"
            : `minmax(180px, 1.4fr) ${Array.from({ length: colCount - 1 })
                .map(() => "minmax(120px, 1fr)")
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
            }}
        >
            <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: Math.max(520, colCount * 140) }}>
                    {/* Header */}
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns,
                            gap: 0,
                            background: "rgba(0,0,0,0.035)",
                            borderBottom: "1px solid rgba(0,0,0,0.10)",
                            position: "sticky",
                            top: 0,
                            zIndex: 1,
                        }}
                    >
                        {headers.map((h, i) => (
                            <div
                                key={`h-${i}`}
                                style={{
                                    padding: "10px 12px",
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
                    <div style={{ display: "grid", gridTemplateColumns: "1fr" }}>
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
                                                padding: "10px 12px",
                                                fontSize: "13px",
                                                lineHeight: 1.35,
                                                color: "rgba(0,0,0,0.88)",
                                                whiteSpace: "normal",
                                                wordBreak: "break-word",
                                                overflowWrap: "anywhere",
                                                textAlign: colIdx === 0 ? "left" : numericCols.has(colIdx) ? "right" : "left",
                                                borderRight:
                                                    colIdx === colCount - 1 ? "none" : "1px solid rgba(0,0,0,0.06)",
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
        </div>
    );
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
                remarkPlugins={[remarkGfm]}
                components={{
                    // Tighten paragraph spacing + preserve line breaks without breaking tables
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

                    // ✅ Tables: render as modern grid cards (fallback to basic table if parsing fails)
                    table({ children }) {
                        const parsed = parseMarkdownTable(children);
                        if (!parsed) {
                            // Fallback – still safe
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
                                            minWidth: "460px",
                                        }}
                                    >
                                        {children}
                                    </table>
                                </div>
                            );
                        }
                        return <ModernTable table={parsed} />;
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
