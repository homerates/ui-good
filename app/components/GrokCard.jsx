"use client";

import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";

// ===== Section metadata =====================================================
const SECTION_META = [
    { keys: ['summary'],                    icon: '📊', color: '#00e87a' },
    { keys: ['key numbers', 'key metrics'], icon: '🔢', color: '#3b82f6' },
    { keys: ['equity trajectory', 'acceleration options', 'payoff'], icon: '📈', color: '#8b5cf6' },
    { keys: ['what this means', 'what it means'], icon: '💡', color: '#f59e0b' },
    { keys: ['next steps', 'action items'],  icon: '✅', color: '#10b981' },
    { keys: ['loan structure'],              icon: '🏠', color: '#3b82f6' },
    { keys: ['monthly payment', 'piti'],     icon: '💰', color: '#00e87a' },
    { keys: ['lifetime cost', 'total cost'], icon: '📊', color: '#8b5cf6' },
    { keys: ['income', 'qualify'],           icon: '💼', color: '#f97316' },
    { keys: ['refi', 'refinanc'],            icon: '🔄', color: '#3b82f6' },
    { keys: ['market', 'comps', 'comp'],     icon: '📍', color: '#94a3b8' },
    { keys: ['heloc'],                       icon: '💳', color: '#3b82f6' },
    { keys: ['dscr', 'investment'],          icon: '📐', color: '#8b5cf6' },
    { keys: ['fha'],                         icon: '🏛', color: '#f97316' },
    { keys: ['va loan', 'entitlement'],      icon: '🎖️', color: '#dc2626' },
    { keys: ['jumbo'],                       icon: '🏛️', color: '#7c3aed' },
    { keys: ['analysis', 'breakdown'],       icon: '🔍', color: '#94a3b8' },
];

function getSectionMeta(heading) {
    const lower = heading.toLowerCase();
    for (const m of SECTION_META) {
        if (m.keys.some(k => lower.includes(k))) return m;
    }
    return { icon: '▸', color: 'rgba(255,255,255,0.3)' };
}

// ===== MiniChart ===========================================================
const MiniChart = ({ values }) => {
    if (!values || values.length === 0) return null;
    const max = Math.max(...values, 0);
    const min = Math.min(...values, 0);
    const range = max - min || 1;
    return (
        <span style={{ display: "inline-block", marginLeft: "8px", verticalAlign: "middle" }}>
            {values.map((v, i) => (
                <span key={i} style={{
                    display: "inline-block", width: "5px", height: "16px",
                    background: v >= 0 ? "#10b981" : "#ef4444", margin: "0 1px",
                    borderRadius: "2px",
                    transform: `translateY(${16 - ((v - min) / range) * 16}px)`,
                }} />
            ))}
        </span>
    );
};

// ===== Helpers ==============================================================
function injectMiniChartMarkers(text) {
    if (!text) return "";
    return text.replace(/<MiniChart\s+values=\{\s*\[([^\]]+)\]\s*\}\s*\/>/g, (_match, inner) => {
        try {
            const values = inner.split(",").map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
            if (!values.length) return "";
            return `[[MINICHART:${values.join(",")}]]`;
        } catch { return ""; }
    });
}

function isTableSeparatorLine(line) {
    const s = line.trim();
    if (!s.includes("-") || !s.includes("|")) return false;
    if (!/^[\s\|\-:]+$/.test(s)) return false;
    return /\-+/.test(s);
}

function splitRow(line) {
    return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
}

function parseTableAt(lines, startIdx) {
    const headerLine = lines[startIdx];
    const sepLine    = lines[startIdx + 1];
    if (!headerLine || !sepLine) return null;
    if (!headerLine.includes("|")) return null;
    if (!isTableSeparatorLine(sepLine)) return null;
    const headers = splitRow(headerLine);
    if (!headers.length) return null;
    const rows = [];
    let i = startIdx + 2;
    while (i < lines.length) {
        const line = lines[i];
        if (!line || line.trim() === "" || !line.includes("|")) break;
        const row = splitRow(line);
        const fixed = row.slice(0, headers.length);
        while (fixed.length < headers.length) fixed.push("");
        rows.push(fixed);
        i += 1;
    }
    return { table: { headers, rows }, nextIndex: i };
}

// ===== Block splitter — adds section header detection =======================
function splitMarkdownIntoBlocks(markdown) {
    const lines  = (markdown || "").replace(/\r\n/g, "\n").split("\n");
    const blocks = [];
    let buffer   = [];

    const flushBuffer = () => {
        if (!buffer.length) return;
        blocks.push({ type: "md", content: buffer.join("\n") });
        buffer = [];
    };

    let i = 0;
    while (i < lines.length) {
        // Table detection
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

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function computeColumnMeta(headers, rows) {
    const colCount = headers.length;
    const maxLens  = Array.from({ length: colCount }).map(() => 0);
    const consider = (s, colIdx) => { maxLens[colIdx] = Math.max(maxLens[colIdx], clamp(String(s || "").length, 0, 40)); };
    headers.forEach((h, i) => consider(h, i));
    rows.forEach(r => r.forEach((cell, i) => consider(cell, i)));
    const weights = maxLens.map((len, i) => clamp((i === 0 ? 10 : 6) + Math.floor(len / 4), 6, i === 0 ? 18 : 14));
    const minPx   = maxLens.map((_l, i) => (i === 0 ? 140 : 100));
    return { colCount, weights, minPx, totalMin: minPx.reduce((a, b) => a + b, 0) };
}

function isMostlyNumericColumn(headers, rows, colIndex) {
    let scored = 0, checked = 0;
    for (const r of rows) {
        const v = (r[colIndex] || "").trim();
        if (!v) continue;
        checked++;
        if (/\d/.test(v) && (v.match(/[a-z]/gi) || []).length <= 3) scored++;
        if (checked >= 10) break;
    }
    return checked === 0 ? false : scored / checked >= 0.6;
}

// ===== Enhanced Table =======================================================
function ModernTable({ headers, rows }) {
    const { colCount, weights, minPx, totalMin } = useMemo(() => computeColumnMeta(headers, rows), [headers, rows]);
    const numericCols = useMemo(() => {
        const set = new Set();
        for (let i = 1; i < colCount; i++) { if (isMostlyNumericColumn(headers, rows, i)) set.add(i); }
        return set;
    }, [headers, rows, colCount]);
    const gridTemplateColumns = weights.map((w, i) => `minmax(${minPx[i]}px, ${w}fr)`).join(" ");

    return (
        <div style={{ margin: "14px 0", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden", background: "#0f172a" }}>
            <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: totalMin }}>
                    <div style={{ display: "grid", gridTemplateColumns, background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                        {headers.map((h, i) => (
                            <div key={`h-${i}`} style={{
                                padding: "9px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                                letterSpacing: "0.06em", color: "#475569",
                                textAlign: i === 0 ? "left" : numericCols.has(i) ? "right" : "left",
                                borderRight: i < colCount - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                            }}>{h}</div>
                        ))}
                    </div>
                    {rows.map((r, rowIdx) => (
                        <div key={`r-${rowIdx}`} style={{
                            display: "grid", gridTemplateColumns,
                            background: rowIdx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                            borderBottom: rowIdx < rows.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                        }}>
                            {r.map((cell, colIdx) => (
                                <div key={`c-${rowIdx}-${colIdx}`} style={{
                                    padding: "10px 12px", fontSize: 13, lineHeight: 1.4,
                                    color: colIdx === 0 ? "rgba(255,255,255,0.7)" : "#f1f5f9",
                                    fontWeight: colIdx > 0 && numericCols.has(colIdx) ? 700 : 400,
                                    fontVariantNumeric: "tabular-nums",
                                    textAlign: colIdx === 0 ? "left" : numericCols.has(colIdx) ? "right" : "left",
                                    borderRight: colIdx < colCount - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                                    wordBreak: "break-word", overflowWrap: "anywhere",
                                }}>{cell || "\u00A0"}</div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ===== Blockquote classifier ================================================
function classifyBlockquote(text) {
    const t = text.toLowerCase();
    if (t.includes("assumption")) return "assumption";
    if (t.includes("live fred") || t.includes("📡")) return "live";
    if (t.includes("⚠") || t.includes("warning") || t.includes("note:")) return "warning";
    if (t.includes("✅") || t.includes("no pmi") || t.includes("✓")) return "ok";
    return "info";
}

const BQ_STYLES = {
    assumption: { bg: "rgba(234,179,8,0.08)", border: "rgba(234,179,8,0.3)", color: "#fbbf24", icon: "💡" },
    live:       { bg: "rgba(0,232,122,0.06)", border: "rgba(0,232,122,0.25)", color: "#00e87a", icon: "📡" },
    warning:    { bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.25)", color: "#f87171", icon: "⚠️" },
    ok:         { bg: "rgba(16,185,129,0.07)", border: "rgba(16,185,129,0.25)", color: "#34d399", icon: "✅" },
    info:       { bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.1)", color: "#94a3b8", icon: "ℹ" },
};

// ===== Custom ReactMarkdown components =====================================
function buildComponents() {
    return {
        p({ children }) {
            const raw = Array.isArray(children) ? children.join("") : String(children ?? "");
            if (raw.includes("[[MINICHART:")) {
                const match = raw.match(/\[\[MINICHART:(.*?)\]\]/);
                if (!match) return <p style={{ margin: "8px 0" }}>{children}</p>;
                const nums    = match[1].split(",").map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
                const cleaned = raw.replace(match[0], "").trim();
                return <p style={{ margin: "8px 0" }}>{cleaned}<MiniChart values={nums} /></p>;
            }
            return <p style={{ margin: "8px 0", lineHeight: 1.65, color: "rgba(255,255,255,0.82)" }}>{children}</p>;
        },

        h1({ children }) {
            const text   = String(children ?? "");
            const meta   = getSectionMeta(text);
            return (
                <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "18px 0 10px", paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <span style={{ fontSize: 16 }}>{meta.icon}</span>
                    <h1 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.02em" }}>{text}</h1>
                </div>
            );
        },
        h2({ children }) {
            const text = String(children ?? "");
            const meta = getSectionMeta(text);
            return (
                <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "20px 0 8px", padding: "7px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 8, borderLeft: `3px solid ${meta.color}` }}>
                    <span style={{ fontSize: 14 }}>{meta.icon}</span>
                    <h2 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: meta.color, textTransform: "uppercase", letterSpacing: "0.07em" }}>{text}</h2>
                </div>
            );
        },
        h3({ children }) {
            const text = String(children ?? "");
            const meta = getSectionMeta(text);
            return (
                <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "14px 0 6px" }}>
                    <span style={{ fontSize: 12 }}>{meta.icon}</span>
                    <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.6)", letterSpacing: "0.04em" }}>{text}</h3>
                </div>
            );
        },

        blockquote({ children }) {
            // Extract text to classify
            const raw = (function extract(c) {
                if (typeof c === "string") return c;
                if (Array.isArray(c)) return c.map(extract).join("");
                if (c?.props?.children) return extract(c.props.children);
                return "";
            })(children);
            const kind   = classifyBlockquote(raw);
            const bqs    = BQ_STYLES[kind];
            return (
                <div style={{ margin: "8px 0", padding: "8px 12px", background: bqs.bg, border: `1px solid ${bqs.border}`, borderRadius: 8, fontSize: 12, color: bqs.color, lineHeight: 1.5 }}>
                    {children}
                </div>
            );
        },

        ul({ children }) {
            return <ul style={{ margin: "8px 0", paddingLeft: 0, listStyle: "none" }}>{children}</ul>;
        },
        ol({ children }) {
            return <ol style={{ margin: "8px 0", paddingLeft: "20px" }}>{children}</ol>;
        },
        li({ children }) {
            // Try to parse as a stat line: "Label: $value (sub-note)"
            const raw = (function extract(c) {
                if (typeof c === "string") return c;
                if (Array.isArray(c)) return c.map(extract).join("");
                if (c?.props?.children) return extract(c.props.children);
                return "";
            })(children);

            const statMatch = raw.match(/^(.+?):\s+([\$\d\+\-].+)$/);
            if (statMatch) {
                const [, label, valueRaw] = statMatch;
                const subMatch = valueRaw.match(/^([^\(]+?)\s*(\([^)]+\))?$/);
                const mainVal  = subMatch?.[1]?.trim() ?? valueRaw;
                const sub      = subMatch?.[2] ?? "";
                const isGreen  = /^\$[\d,]+$/.test(mainVal) || mainVal.startsWith("+");
                return (
                    <li style={{
                        listStyle: "none", display: "flex", justifyContent: "space-between", alignItems: "baseline",
                        padding: "8px 12px", margin: "4px 0",
                        background: "rgba(255,255,255,0.03)", borderRadius: 8,
                        borderLeft: "2px solid rgba(0,232,122,0.2)",
                    }}>
                        <span style={{ fontSize: 12, color: "#64748b", flexShrink: 0, paddingRight: 12 }}>{label}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: isGreen ? "#00e87a" : "#f1f5f9", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                            {mainVal}
                            {sub && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: 6 }}>{sub}</span>}
                        </span>
                    </li>
                );
            }
            // Regular li
            return (
                <li style={{ listStyle: "none", display: "flex", alignItems: "flex-start", gap: 8, margin: "5px 0", color: "rgba(255,255,255,0.8)", fontSize: 13, lineHeight: 1.5 }}>
                    <span style={{ color: "#00e87a", marginTop: 2, flexShrink: 0, fontSize: 10 }}>▸</span>
                    <span>{children}</span>
                </li>
            );
        },

        strong({ children }) {
            return <strong style={{ color: "#f1f5f9", fontWeight: 700 }}>{children}</strong>;
        },
        em({ children }) {
            return <em style={{ color: "#94a3b8", fontStyle: "italic" }}>{children}</em>;
        },

        code({ inline, children }) {
            if (inline) {
                return (
                    <code style={{ fontSize: "0.88em", fontFamily: "monospace", background: "rgba(255,255,255,0.06)", padding: "1px 6px", borderRadius: 6, color: "#00e87a" }}>
                        {children}
                    </code>
                );
            }
            return (
                <pre style={{ margin: "10px 0", padding: "10px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 10, overflowX: "auto", fontSize: 12, fontFamily: "monospace" }}>
                    <code>{children}</code>
                </pre>
            );
        },

        hr() {
            return <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.07)", margin: "16px 0" }} />;
        },
    };
}

// ===== GrokCard =============================================================
export default function GrokCard({ data, onFollowUp, onSaveToVault }) {
    if (!data) return null;

    const { grok, answerMarkdown, followUp, data_freshness } = data;

    // Suppress rendering when Grok completely failed (empty answerMarkdown, no grok object)
    if (!grok && (!answerMarkdown || answerMarkdown.trim().length < 20)) return null;
    const [vaultState, setVaultState] = React.useState("idle");

    const preparedFull = useMemo(() => injectMiniChartMarkers(answerMarkdown || ""), [answerMarkdown]);
    const blocks = useMemo(() => {
        try { return splitMarkdownIntoBlocks(preparedFull); }
        catch { return [{ type: "md", content: preparedFull }]; }
    }, [preparedFull]);

    const components = useMemo(() => buildComponents(), []);

    // Detect answer type for accent color
    const isBuyer    = /buyer|for sale|offer|comp|market position/i.test(answerMarkdown || "");
    const accentColor = isBuyer ? "#3b82f6" : "#00e87a";

    return (
        <div className="grok-card" style={{
            background: "#0f172a",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.07)",
            color: "#f1f5f9",
            marginTop: 12,
            fontFamily: "var(--font-dm-sans, 'DM Sans', system-ui, sans-serif)",
            fontSize: 14,
            lineHeight: 1.65,
            overflow: "hidden",
        }}>
            {/* Accent top bar */}
            <div style={{ height: 3, background: `linear-gradient(90deg, ${accentColor}, ${isBuyer ? "#6366f1" : "#00b459"})` }} />

            {/* Card header */}
            <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 16px 0",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                textTransform: "uppercase", color: "#334155",
            }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ color: accentColor, fontSize: 8 }}>●</span>
                    {grok ? "AI Analysis" : "Answer"}
                </span>
                {data_freshness && <span>{data_freshness}</span>}
            </div>

            {/* Content */}
            <div style={{ padding: "8px 16px 4px" }}>
                {blocks.map((b, idx) => {
                    if (b.type === "table") {
                        const { headers, rows } = b.table || {};
                        if (!headers?.length) return null;
                        return <ModernTable key={`t-${idx}`} headers={headers} rows={rows || []} />;
                    }
                    return (
                        <ReactMarkdown key={`m-${idx}`} className="grok-markdown" components={components}>
                            {b.content}
                        </ReactMarkdown>
                    );
                })}
            </div>

            {/* Footer: disclaimer + vault */}
            <div style={{
                margin: "4px 16px 0",
                padding: "10px 0 12px",
                borderTop: "1px solid rgba(255,255,255,0.06)",
                display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
            }}>
                <div style={{ fontSize: 11, color: "#334155", lineHeight: 1.5, flex: "1 1 auto" }}>
                    ⓘ Educational only — not financial advice or a commitment to lend. Verify rates and eligibility with a licensed lender.
                </div>
                {onSaveToVault && (
                    <button
                        type="button"
                        onClick={async () => {
                            if (vaultState === "saved" || vaultState === "saving") return;
                            setVaultState("saving");
                            try { await onSaveToVault(); setVaultState("saved"); }
                            catch { setVaultState("error"); setTimeout(() => setVaultState("idle"), 3000); }
                        }}
                        style={{
                            flexShrink: 0, fontSize: 11, fontWeight: 600,
                            padding: "4px 10px", borderRadius: 999,
                            border: "1px solid rgba(0,232,122,0.3)",
                            background: vaultState === "saved" ? "rgba(0,232,122,0.12)" : "rgba(0,232,122,0.05)",
                            color: vaultState === "saved" ? "#00e87a" : vaultState === "error" ? "#ef4444" : "rgba(0,232,122,0.7)",
                            cursor: vaultState === "saved" ? "default" : "pointer",
                            transition: "all 150ms ease", whiteSpace: "nowrap",
                        }}
                    >
                        {vaultState === "saving" ? "Saving…" : vaultState === "saved" ? "✓ Saved" : vaultState === "error" ? "Error" : "✦ Save"}
                    </button>
                )}
            </div>

            {/* Follow-up CTA */}
            {followUp && onFollowUp && (
                <div style={{ padding: "0 16px 14px" }}>
                    <button
                        type="button"
                        onClick={() => onFollowUp(followUp)}
                        style={{
                            fontSize: 12, padding: "6px 14px", borderRadius: 999,
                            border: `1px solid rgba(255,255,255,0.1)`,
                            background: "rgba(255,255,255,0.04)",
                            color: "rgba(255,255,255,0.6)",
                            cursor: "pointer", transition: "all 120ms",
                        }}
                    >
                        {followUp} →
                    </button>
                </div>
            )}
        </div>
    );
}
