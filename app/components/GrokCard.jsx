"use client";

import React, { useMemo } from "react";
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
    const s = line.trim();
    if (!s.includes("-") || !s.includes("|")) return false;
    if (!/^[\s\|\-:]+$/.test(s)) return false;
    return /\-+/.test(s);
}

function splitRow(line) {
    const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    return trimmed.split("|").map((c) => c.trim());
}

function parseTableAt(lines, startIdx) {
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
        if (!line || line.trim() === "") break;
        if (!line.includes("|")) break;

        const row = splitRow(line);

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

function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
}

function computeColumnMeta(headers, rows) {
    const colCount = headers.length;
    const maxLens = Array.from({ length: colCount }).map(() => 0);

    const consider = (s, colIdx) => {
        const t = String(s || "");
        // Count “display-ish” length, cap to prevent one long cell from dominating
        const len = clamp(t.length, 0, 40);
        maxLens[colIdx] = Math.max(maxLens[colIdx], len);
    };

    headers.forEach((h, i) => consider(h, i));
    rows.forEach((r) => r.forEach((cell, i) => consider(cell, i)));

    // Convert length to a weight (fr). Small text -> smaller fr.
    // First column usually label column: give it a baseline bump.
    const weights = maxLens.map((len, i) => {
        const base = i === 0 ? 10 : 6;
        return clamp(base + Math.floor(len / 4), 6, i === 0 ? 18 : 14);
    });

    // Minimum pixel widths per column (to avoid crushing on mobile)
    const minPx = maxLens.map((_len, i) => (i === 0 ? 160 : 110));

    // Total min width for the scroller; keep it reasonable (not a giant 720+ always)
    const totalMin = minPx.reduce((a, b) => a + b, 0);

    return { colCount, weights, minPx, totalMin };
}

function ModernTable({ headers, rows }) {
    const { colCount, weights, minPx, totalMin } = useMemo(
        () => computeColumnMeta(headers, rows),
        [headers, rows]
    );

    const numericCols = useMemo(() => {
        const set = new Set();
        for (let i = 1; i < colCount; i++) {
            if (isMostlyNumericColumn(headers, rows, i)) set.add(i);
        }
        return set;
    }, [headers, rows, colCount]);

    // Build dynamic grid columns:
    // minmax(0, …fr) allows shrinking; minPx prevents total collapse.
    const gridTemplateColumns = useMemo(() => {
        const parts = [];
        for (let i = 0; i < colCount; i++) {
            parts.push(`minmax(${minPx[i]}px, ${weights[i]}fr)`);
        }
        return parts.join(" ");
    }, [colCount, minPx, weights]);

    return (
        <div
            style={{
                margin: "12px 0",
                border: "1px solid var(--border, rgba(0,0,0,0.10))",
                borderRadius: "14px",
                overflow: "hidden",
                background: "var(--card, #fff)",
                boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
                color: "var(--text)",
            }}
        >
            <div style={{ overflowX: "auto" }}>
                {/* key change: don’t force 720px+ always. Use computed minimum instead. */}
                <div style={{ minWidth: totalMin }}>
                    {/* Header */}
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns,
                            background: "var(--surface, rgba(0,0,0,0.035))",
                            borderBottom: "1px solid var(--border, rgba(0,0,0,0.10))",
                        }}
                    >
                        {headers.map((h, i) => (
                            <div
                                key={`h-${i}`}
                                style={{
                                    padding: "10px 12px",
                                    fontSize: "12px",
                                    fontWeight: 700,
                                    color: "var(--text-weak, rgba(0,0,0,0.72))",
                                    whiteSpace: "nowrap",
                                    textAlign: i === 0 ? "left" : numericCols.has(i) ? "right" : "left",
                                    borderRight: i === colCount - 1 ? "none" : "1px solid var(--border, rgba(0,0,0,0.06))",
                                }}
                            >
                                {h}
                            </div>
                        ))}
                    </div>

                    {/* Rows */}
                    {rows.map((r, rowIdx) => {
                        const bg = rowIdx % 2 === 0 ? "var(--card, #fff)" : "var(--surface, rgba(0,0,0,0.015))";
                        return (
                            <div
                                key={`r-${rowIdx}`}
                                style={{
                                    display: "grid",
                                    gridTemplateColumns,
                                    background: bg,
                                    borderBottom: rowIdx === rows.length - 1 ? "none" : "1px solid var(--border, rgba(0,0,0,0.06))",
                                }}
                            >
                                {r.map((cell, colIdx) => (
                                    <div
                                        key={`c-${rowIdx}-${colIdx}`}
                                        style={{
                                            padding: "10px 12px",
                                            fontSize: "13px",
                                            lineHeight: 1.35,
                                            color: "var(--text, rgba(0,0,0,0.88))",
                                            whiteSpace: "normal",
                                            wordBreak: "break-word",
                                            overflowWrap: "anywhere",
                                            textAlign: colIdx === 0 ? "left" : numericCols.has(colIdx) ? "right" : "left",
                                            borderRight: colIdx === colCount - 1 ? "none" : "1px solid var(--border, rgba(0,0,0,0.06))",
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
export default function GrokCard({ data, onFollowUp, onSaveToVault }) {
    if (!data) return null;

    const { grok, answerMarkdown, followUp, data_freshness } = data;
    const [vaultState, setVaultState] = React.useState("idle"); // idle | saving | saved | error

    const preparedFull = useMemo(() => injectMiniChartMarkers(answerMarkdown || ""), [answerMarkdown]);

    // Always render full blocks — internal typewriter removed.
    // It was causing scroll chaos: every page.tsx re-render (including setInput keypresses)
    // could re-trigger the useEffect, flipping isStreaming and causing layout shifts.
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
                background: "var(--card, #0e1420)",
                borderRadius: "12px",
                border: "1px solid var(--border, rgba(255,255,255,0.07))",
                color: "var(--text)",
                marginTop: "12px",
                whiteSpace: "normal",
                fontFamily: "var(--font-dm-sans, 'DM Sans', sans-serif)",
                fontSize: "14px",
                lineHeight: 1.65,
            }}
        >
            {/* Header row — subtle metadata, should not compete with content */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: "6px",
                    fontSize: "10px",
                    color: "var(--text-weak, rgba(0,0,0,0.32))",
                    letterSpacing: "0.02em",
                }}
            >
                <span>{grok ? "Live · AI analysis" : ""}</span>
                {data_freshness && <span>{data_freshness}</span>}
            </div>

            {/* Always render full markdown blocks — no streaming state */}
            <div>
                {blocks.map((b, idx) => {
                    if (b.type === "table") {
                        const { headers, rows } = b.table || {};
                        if (!headers || !headers.length) return null;
                        return <ModernTable key={`t-${idx}`} headers={headers} rows={rows || []} />;
                    }

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
                                    return <h1 style={{ margin: "12px 0 6px", fontSize: "18px", fontFamily: "var(--font-syne, 'Syne', sans-serif)", fontWeight: 700, letterSpacing: "-0.02em" }}>{children}</h1>;
                                },
                                h2({ children }) {
                                    return <h2 style={{ margin: "12px 0 6px", fontSize: "15px", fontFamily: "var(--font-syne, 'Syne', sans-serif)", fontWeight: 700, letterSpacing: "-0.01em" }}>{children}</h2>;
                                },
                                h3({ children }) {
                                    return <h3 style={{ margin: "10px 0 4px", fontSize: "13px", fontFamily: "var(--font-syne, 'Syne', sans-serif)", fontWeight: 600 }}>{children}</h3>;
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
                                                    fontSize: "0.88em",
                                                    fontFamily: "var(--font-dm-mono, 'DM Mono', monospace)",
                                                    background: "var(--surface2, rgba(255,255,255,0.05))",
                                                    padding: "1px 6px",
                                                    borderRadius: "6px",
                                                    color: "var(--accent, #00e87a)",
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
                                                background: "var(--surface2, rgba(255,255,255,0.04))",
                                                borderRadius: "10px",
                                                overflowX: "auto",
                                                fontFamily: "var(--font-dm-mono, 'DM Mono', monospace)",
                                                fontSize: "12px",
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

            {/* Educational disclaimer + Save to Vault */}
            <div
                style={{
                    marginTop: "14px",
                    paddingTop: "10px",
                    borderTop: "1px solid var(--border, rgba(0,0,0,0.06))",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "12px",
                }}
            >
                <div style={{ fontSize: "11px", color: "var(--text-weak, rgba(0,0,0,0.4))", lineHeight: 1.5, flex: "1 1 auto" }}>
                    ⓘ Educational purposes only — not financial advice, a recommendation, or a substitute for guidance from a licensed mortgage professional. Verify all rates, payments, and eligibility with a licensed lender before making any decisions.
                </div>
                {onSaveToVault && (
                    <button
                        type="button"
                        onClick={async () => {
                            if (vaultState === "saved" || vaultState === "saving") return;
                            setVaultState("saving");
                            try {
                                await onSaveToVault();
                                setVaultState("saved");
                            } catch {
                                setVaultState("error");
                                setTimeout(() => setVaultState("idle"), 3000);
                            }
                        }}
                        style={{
                            flexShrink: 0,
                            fontSize: "11px",
                            fontWeight: 600,
                            padding: "4px 10px",
                            borderRadius: "999px",
                            border: "1px solid rgba(0,232,122,0.3)",
                            background: vaultState === "saved"
                                ? "rgba(0,232,122,0.12)"
                                : "rgba(0,232,122,0.05)",
                            color: vaultState === "saved"
                                ? "#00e87a"
                                : vaultState === "error"
                                ? "#ef4444"
                                : "rgba(0,232,122,0.7)",
                            cursor: vaultState === "saved" ? "default" : "pointer",
                            transition: "all 150ms ease",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {vaultState === "saving" ? "Saving…" : vaultState === "saved" ? "✓ Saved" : vaultState === "error" ? "Error" : "✦ Save"}
                    </button>
                )}
            </div>

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
                            border: "1px solid var(--border, rgba(0,0,0,0.12))",
                            background: "var(--surface, #f9fafb)",
                            color: "var(--text)",
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
