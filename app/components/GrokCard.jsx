"use client";

import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { AIDisclosureTag } from "./AIDisclosureTag";

// ===== Section metadata =====================================================
const SECTION_META = [
    { keys: ['summary'],                    icon: '📊', color: '#00e87a' },
    { keys: ['key numbers', 'key metrics'], icon: '🔢', color: '#3b82f6' },
    { keys: ['strategy comparison', 'comparison'],   icon: '⚖️', color: '#3b82f6' },
    { keys: ['current baseline', 'baseline'],        icon: '🏠', color: '#94a3b8' },
    { keys: ['extra monthly', 'extra payment'],      icon: '💵', color: '#00e87a' },
    { keys: ['biweekly', 'bi-weekly'],               icon: '📅', color: '#10b981' },
    { keys: ['equity trajectory', 'acceleration options', 'payoff'], icon: '📈', color: '#8b5cf6' },
    { keys: ['what this means', 'what it means'], icon: '💡', color: '#f59e0b' },
    { keys: ['next steps', 'action items'],  icon: '✅', color: '#10b981' },
    { keys: ['loan structure'],              icon: '🏠', color: '#3b82f6' },
    { keys: ['monthly payment', 'piti'],     icon: '💰', color: '#00e87a' },
    { keys: ['lifetime cost', 'total cost'], icon: '📊', color: '#8b5cf6' },
    { keys: ['income', 'qualify'],           icon: '💼', color: '#f97316' },
    { keys: ['15-year refi', '15yr refi', '15 year refi'], icon: '🔄', color: '#f59e0b' },
    { keys: ['refi', 'refinanc'],            icon: '🔄', color: '#3b82f6' },
    { keys: ['market', 'comps', 'comp'],     icon: '📍', color: '#94a3b8' },
    { keys: ['heloc'],                       icon: '💳', color: '#3b82f6' },
    { keys: ['dscr', 'investment'],          icon: '📐', color: '#8b5cf6' },
    { keys: ['fha'],                         icon: '🏛', color: '#f97316' },
    { keys: ['va loan', 'entitlement'],      icon: '🎖️', color: '#dc2626' },
    { keys: ['jumbo'],                       icon: '🏛️', color: '#7c3aed' },
    { keys: ['broker', 'loan officer'],      icon: '🏠', color: '#3b82f6' },
    { keys: ['analysis', 'breakdown'],       icon: '🔍', color: '#94a3b8' },
];

function getSectionMeta(heading) {
    const lower = (heading || '').toLowerCase();
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

// Lightweight inline-markdown renderer for contexts that don't go through
// ReactMarkdown (table cells). Handles the subset that actually shows up in
// generated table content: **bold**, *italic*, `code`. Anything unmatched
// passes through as plain text — this is deliberately not a full parser.
function renderInlineMd(text, keyPrefix = '') {
    const str = String(text ?? '');
    if (!str) return str;
    const parts = str.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).filter(s => s !== '');
    if (parts.length === 1) return str;
    return parts.map((part, i) => {
        const key = `${keyPrefix}-${i}`;
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={key} style={{ color: "#f1f5f9", fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={key} style={{ fontSize: "0.9em", fontFamily: "monospace", background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 5, color: "#00e87a" }}>{part.slice(1, -1)}</code>;
        }
        if (part.startsWith('*') && part.endsWith('*')) {
            return <em key={key} style={{ color: "#94a3b8", fontStyle: "italic" }}>{part.slice(1, -1)}</em>;
        }
        return part;
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

// ===== Lead extraction ======================================================
// Pulls an optional card title (a leading "# Heading") and an optional
// "bottom line" lead paragraph (plain prose immediately following it, before
// any subheading/table/list) off the front of the markdown. Anything that
// doesn't match this shape (answer opens directly with a table, a ##
// subsection, a list, etc.) falls through with title/lead both null — the
// card then renders exactly as it always has, no forced structure.
function extractLeadContent(markdown) {
    const lines = (markdown || "").replace(/\r\n/g, "\n").split("\n");
    let i = 0;
    while (i < lines.length && lines[i].trim() === "") i++;

    // Accepts either "# Title" or "## Title" as the card's title line — both
    // show up as the leading heading across different answer sources (e.g.
    // the affordability reference-table fallback in app/api/answers/route.ts
    // uses "## 💰 What Can You Afford?"). Whichever it is, it's consumed here
    // and won't be re-processed as a section boundary by splitMarkdownIntoBlocks.
    let title = null;
    if (lines[i] && /^#{1,2}\s+.+/.test(lines[i])) {
        title = lines[i].replace(/^#{1,2}\s+/, "").trim();
        i++;
    }
    if (!title) return { title: null, lead: null, remainder: markdown || "" };

    while (i < lines.length && lines[i].trim() === "") i++;

    const leadLines = [];
    while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        !/^#{1,6}\s/.test(lines[i]) &&
        !lines[i].includes("|") &&
        !/^[-*]\s/.test(lines[i]) &&
        !/^\d+\.\s/.test(lines[i]) &&
        !/^>/.test(lines[i])
    ) {
        leadLines.push(lines[i]);
        i++;
    }
    const lead = leadLines.join(" ").trim();
    const remainder = lines.slice(i).join("\n");
    return { title, lead: lead.length > 0 ? lead : null, remainder };
}

// ===== Block splitter — tables + section (##) boundaries ====================
function splitMarkdownIntoBlocks(markdown) {
    const lines  = (markdown || "").replace(/\r\n/g, "\n").split("\n");
    const blocks = [];
    let buffer   = [];

    const flushBuffer = () => {
        if (!buffer.length) return;
        const content = buffer.join("\n");
        if (content.trim()) blocks.push({ type: "md", content });
        buffer = [];
    };

    let i = 0;
    while (i < lines.length) {
        const h2Match = lines[i].match(/^##\s+(.+)$/);
        if (h2Match) {
            flushBuffer();
            blocks.push({ type: "section-start", title: h2Match[1].trim() });
            i += 1;
            continue;
        }
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

// Groups a flat block list into { intro: [...blocks before first section],
// sections: [{ title, blocks: [...] }, ...] } so sections can render as
// fully-enclosed panels instead of a heading with nothing marking where it ends.
function groupIntoSections(blocks) {
    const intro = [];
    const sections = [];
    let current = null;
    for (const b of blocks) {
        if (b.type === "section-start") {
            current = { title: b.title, blocks: [] };
            sections.push(current);
            continue;
        }
        (current ? current.blocks : intro).push(b);
    }
    return { intro, sections };
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
                                letterSpacing: "0.06em", color: "#eaf8f7",
                                textAlign: i === 0 ? "left" : numericCols.has(i) ? "right" : "left",
                                borderRight: i < colCount - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                            }}>{renderInlineMd(h, `h-${i}`)}</div>
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
                                }}>{cell ? renderInlineMd(cell, `c-${rowIdx}-${colIdx}`) : " "}</div>
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
function buildComponents(isAiResponse = false) {
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
            if (!isAiResponse) {
                return <h1 style={{ margin: "18px 0 8px", fontSize: 16, fontWeight: 800, color: "#f1f5f9" }}>{text}</h1>;
            }
            const meta   = getSectionMeta(text);
            return (
                <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "18px 0 10px", paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <span style={{ fontSize: 16 }}>{meta.icon}</span>
                    <h1 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.02em" }}>{text}</h1>
                </div>
            );
        },
        h2({ children }) {
            // Section h2s are now consumed by splitMarkdownIntoBlocks/groupIntoSections
            // and rendered as panel headers (see SectionPanel below) — this only
            // fires for a ## that appears somewhere ReactMarkdown parses directly
            // (e.g. inside a lead paragraph edge case), so keep a plain fallback.
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
                        <span style={{ fontSize: 12, color: "#eaf8f7", flexShrink: 0, paddingRight: 12 }}>{label}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: isGreen ? "#00e87a" : "#f1f5f9", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                            {mainVal}
                            {sub && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: 6 }}>{sub}</span>}
                        </span>
                    </li>
                );
            }
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

// ===== Block renderer (shared by intro + section bodies) ===================
function RenderBlocks({ blocks, components, keyPrefix }) {
    return blocks.map((b, idx) => {
        if (b.type === "table") {
            const { headers, rows } = b.table || {};
            if (!headers?.length) return null;
            return <ModernTable key={`${keyPrefix}-t-${idx}`} headers={headers} rows={rows || []} />;
        }
        return (
            <ReactMarkdown key={`${keyPrefix}-m-${idx}`} className="grok-markdown" components={components}>
                {b.content}
            </ReactMarkdown>
        );
    });
}

// ===== Section panel — fully enclosed, icon + colored header =============
function SectionPanel({ title, blocks, components, keyPrefix }) {
    const meta = getSectionMeta(title);
    return (
        <div style={{ margin: "16px 0", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 14px", background: "rgba(255,255,255,0.025)" }}>
                <span style={{
                    width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
                    background: `${meta.color}1f`,
                }}>{meta.icon}</span>
                <span style={{ fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: meta.color }}>{title}</span>
            </div>
            <div style={{ padding: "12px 14px 4px" }}>
                <RenderBlocks blocks={blocks} components={components} keyPrefix={keyPrefix} />
            </div>
        </div>
    );
}

// ===== GrokCard =============================================================
export default function GrokCard({ data, onFollowUp, onSaveToVault }) {
    if (!data) return null;

    const { grok, answerMarkdown, followUp, data_freshness } = data;

    // Suppress rendering when Grok completely failed (empty answerMarkdown, no grok object)
    if (!grok && (!answerMarkdown || answerMarkdown.trim().length < 20)) return null;
    const [vaultState, setVaultState] = React.useState("idle");

    const preparedFull = useMemo(() => injectMiniChartMarkers(answerMarkdown || ""), [answerMarkdown]);

    const { title, lead, remainder } = useMemo(() => extractLeadContent(preparedFull), [preparedFull]);

    const blocks = useMemo(() => {
        try { return splitMarkdownIntoBlocks(remainder); }
        catch { return [{ type: "md", content: remainder }]; }
    }, [remainder]);

    const { intro, sections } = useMemo(() => groupIntoSections(blocks), [blocks]);

    const isAiResponse = !!grok;
    const components = useMemo(() => buildComponents(isAiResponse), [isAiResponse]);

    // Accent: derived from the extracted title when present (matches the
    // per-topic identity every loan-type card already has — FHA amber, VA
    // teal, Jumbo purple), falling back to the first section's topic, then
    // to the original buyer/default green split for content with no clean
    // title (e.g. answers that open directly with a table).
    const topicMeta = title ? getSectionMeta(title) : sections[0] ? getSectionMeta(sections[0].title) : null;
    const isBuyer    = /buyer|for sale|offer|comp|market position/i.test(answerMarkdown || "");
    const accentColor = topicMeta && topicMeta.color !== 'rgba(255,255,255,0.3)'
        ? topicMeta.color
        : (isBuyer ? "#3b82f6" : "#00e87a");
    const headerIcon = topicMeta ? topicMeta.icon : "✦";

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
            {title ? (
                // ── Titled header — icon chip + title + freshness, topic-colored ──
                <div style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "14px 16px 12px",
                    background: `linear-gradient(135deg, ${accentColor}1a, ${accentColor}05)`,
                    borderBottom: "1px solid rgba(255,255,255,0.07)",
                }}>
                    <span style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        background: `${accentColor}24`, border: `1px solid ${accentColor}4d`,
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17,
                    }}>{headerIcon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.01em" }}>{title}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, fontSize: 11, color: "#8fa3b8" }}>
                            {isAiResponse && <AIDisclosureTag variant="inline" />}
                            {data_freshness && <span>{isAiResponse ? "· " : ""}{data_freshness}</span>}
                        </div>
                    </div>
                </div>
            ) : (
                // ── Fallback header — original treatment for content with no
                //    clean leading "# Title" (opens directly with a table, list, etc.) ──
                <>
                    <div style={{ height: 3, background: `linear-gradient(90deg, ${accentColor}, ${isBuyer ? "#6366f1" : "#00b459"})` }} />
                    <div style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "10px 16px 0",
                        fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                        textTransform: "uppercase", color: "#eaf8f7",
                    }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ color: accentColor, fontSize: 8 }}>●</span>
                            {grok ? "AI Analysis" : "Answer"}
                        </span>
                        {data_freshness && <span>{data_freshness}</span>}
                    </div>
                    {isAiResponse && (
                        <div style={{ padding: "6px 16px 0" }}>
                            <AIDisclosureTag variant="inline" />
                        </div>
                    )}
                </>
            )}

            {/* Bottom line — the lead paragraph, promoted so the takeaway doesn't
                require reading past a table first. Only renders when the content
                had a clean lead paragraph to extract. */}
            {lead && (
                <div style={{
                    margin: "14px 16px 4px", padding: "13px 15px", borderRadius: 11,
                    background: "rgba(0,232,122,0.06)", border: "1px solid rgba(0,232,122,0.2)",
                    display: "flex", gap: 10, alignItems: "flex-start",
                }}>
                    <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>💡</span>
                    <div>
                        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#00e87a", marginBottom: 3 }}>Bottom line</div>
                        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "#eafff4" }}>{renderInlineMd(lead, 'lead')}</div>
                    </div>
                </div>
            )}

            {/* Content */}
            <div style={{ padding: "8px 16px 4px" }}>
                <RenderBlocks blocks={intro} components={components} keyPrefix="intro" />
                {sections.map((s, i) => (
                    <SectionPanel key={`sec-${i}`} title={s.title} blocks={s.blocks} components={components} keyPrefix={`sec-${i}`} />
                ))}
            </div>

            {/* Footer: disclaimer + vault */}
            <div style={{
                margin: "4px 16px 0",
                padding: "10px 0 12px",
                borderTop: "1px solid rgba(255,255,255,0.06)",
                display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
            }}>
                <div style={{ fontSize: 11, color: "#eaf8f7", lineHeight: 1.5, flex: "1 1 auto" }}>
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
                            flexShrink: 0, fontSize: 11, fontWeight: 700,
                            padding: "6px 12px", borderRadius: 999,
                            border: "1px solid rgba(0,232,122,0.35)",
                            background: vaultState === "saved" ? "rgba(0,232,122,0.14)" : "rgba(0,232,122,0.08)",
                            color: vaultState === "saved" ? "#00e87a" : vaultState === "error" ? "#ef4444" : "#00e87a",
                            cursor: vaultState === "saved" ? "default" : "pointer",
                            transition: "all 150ms ease", whiteSpace: "nowrap",
                        }}
                    >
                        {vaultState === "saving" ? "Saving…" : vaultState === "saved" ? "✓ Saved" : vaultState === "error" ? "Error" : "✦ Save"}
                    </button>
                )}
            </div>

            {/* Follow-up CTA — promoted to the same solid-green pill used for
                primary actions elsewhere (Decode my rate, Run Adjusted Scenario)
                since it's the action most likely to move the conversation forward. */}
            {followUp && onFollowUp && (
                <div style={{ padding: "0 16px 14px" }}>
                    <button
                        type="button"
                        onClick={() => onFollowUp(followUp)}
                        style={{
                            fontSize: 12.5, fontWeight: 700, padding: "8px 16px", borderRadius: 999,
                            border: "none",
                            background: "#00e87a",
                            color: "#04120a",
                            cursor: "pointer", transition: "opacity 120ms",
                            display: "inline-flex", alignItems: "center", gap: 6,
                        }}
                    >
                        {followUp} →
                    </button>
                </div>
            )}
        </div>
    );
}
