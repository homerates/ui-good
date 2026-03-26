'use client';

// app/components/PropertyIntelligenceCard.tsx
// Premium CMA / Property Intelligence Card — photo hero, stat grid, markdown sections

import React, { useState } from 'react';

export interface RateScenario {
    rate:         number;
    piti:         number;
    incomeNeeded: number;
}

export interface CMACardData {
    address:         string;
    price:           number;
    photoUrl:        string | null;
    piti:            number;
    downAmt:         number;
    loanAmt:         number;
    incomeNeeded:    number;
    pricePerSqft:    number;
    rate:            number;
    beds:            number;
    baths:           number;
    sqft:            number;
    answerMarkdown:  string;
    rateSensitivity?: RateScenario[];
    liveMarketData?:  boolean;
}

// ── Formatters ─────────────────────────────────────────────────────────────
const fmt$ = (n: number) =>
    n >= 1_000_000
        ? `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`
        : `$${Math.round(n / 1000)}k`;

const fmtMo = (n: number) =>
    `$${n.toLocaleString('en-US')}/mo`;

const fmtYr = (n: number) =>
    `$${Math.round(n / 1000)}k/yr`;

// ── Section parser — splits markdown into labelled sections ────────────────
function parseSections(md: string): Array<{ title: string; body: string; emoji: string }> {
    const lines = md.split('\n');
    const sections: Array<{ title: string; body: string; emoji: string }> = [];
    let current: { title: string; body: string[]; emoji: string } | null = null;

    const emojiMap: Record<string, string> = {
        'market':     '📊',
        'fair value': '⚖️',
        'comps':      '⚖️',
        'decision':   '🧭',
        'rate':       '📈',
        'risk':       '⚠️',
    };

    for (const line of lines) {
        const h2 = line.match(/^##\s+(.+)/);
        if (h2) {
            if (current) sections.push({ title: current.title, body: current.body.join('\n').trim(), emoji: current.emoji });
            const titleClean = h2[1].replace(/^[\p{Emoji}\s]+/u, '').trim();
            const emojiKey = Object.keys(emojiMap).find(k => titleClean.toLowerCase().includes(k));
            current = { title: titleClean, body: [], emoji: emojiMap[emojiKey ?? ''] ?? '📌' };
        } else if (current) {
            // Skip the property header summary lines already shown in stats
            if (!line.startsWith('**Key Stats') && !line.startsWith('**Financiels') && !line.startsWith('**Financials')) {
                current.body.push(line);
            }
        }
    }
    if (current) sections.push({ title: current.title, body: current.body.join('\n').trim(), emoji: current.emoji });

    // Drop the first "Property Intelligence Report" heading section (it's the header)
    return sections.filter(s => s.body.length > 0 && !s.title.toLowerCase().includes('property intelligence'));
}

// ── Simple markdown-to-JSX (tables, bold, bullets, blockquotes) ────────────
function renderMD(md: string): React.ReactNode {
    const lines = md.split('\n');
    const out: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // Table
        if (line.startsWith('|')) {
            const tableLines: string[] = [];
            while (i < lines.length && lines[i].startsWith('|')) {
                tableLines.push(lines[i]);
                i++;
            }
            const rows = tableLines.filter(l => !/^\|[-|: ]+\|$/.test(l.trim()));
            out.push(
                <div key={`t${i}`} style={{ overflowX: 'auto', margin: '8px 0' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <tbody>
                            {rows.map((row, ri) => {
                                const cells = row.split('|').slice(1, -1).map(c => c.trim());
                                return (
                                    <tr key={ri} style={{ borderBottom: '1px solid rgba(0,0,0,0.07)', background: ri === 0 ? 'rgba(59,130,246,0.06)' : 'transparent' }}>
                                        {cells.map((cell, ci) => (
                                            <td key={ci} style={{ padding: '6px 10px', fontWeight: ri === 0 ? 600 : 400 }}
                                                dangerouslySetInnerHTML={{ __html: mdInline(cell) }} />
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            );
            continue;
        }

        // Blockquote
        if (line.startsWith('>')) {
            const text = line.replace(/^>\s*/, '');
            out.push(
                <div key={`bq${i}`} style={{ borderLeft: '3px solid #3b82f6', paddingLeft: 12, margin: '6px 0', color: '#374151', fontSize: 13, fontStyle: 'italic' }}
                    dangerouslySetInnerHTML={{ __html: mdInline(text) }} />
            );
            i++;
            continue;
        }

        // Bullet
        if (/^[-*]\s/.test(line)) {
            out.push(
                <div key={`li${i}`} style={{ display: 'flex', gap: 8, margin: '3px 0', fontSize: 13 }}>
                    <span style={{ color: '#3b82f6', flexShrink: 0 }}>·</span>
                    <span dangerouslySetInnerHTML={{ __html: mdInline(line.replace(/^[-*]\s/, '')) }} />
                </div>
            );
            i++;
            continue;
        }

        // h3
        const h3 = line.match(/^###\s+(.+)/);
        if (h3) {
            out.push(<div key={`h3${i}`} style={{ fontWeight: 700, fontSize: 13, marginTop: 10, marginBottom: 3, color: '#1e3a5f' }}>{h3[1].replace(/^[\p{Emoji}\s]+/u, '')}</div>);
            i++;
            continue;
        }

        // Normal paragraph
        if (line.trim()) {
            out.push(<p key={`p${i}`} style={{ fontSize: 13, margin: '4px 0', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: mdInline(line) }} />);
        }
        i++;
    }
    return <>{out}</>;
}

function mdInline(s: string): string {
    return s
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code style="background:#f1f5f9;padding:1px 4px;border-radius:3px;font-size:12px">$1</code>');
}

// ── Stat pill ──────────────────────────────────────────────────────────────
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div style={{ textAlign: 'center', padding: '10px 8px' }}>
            <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#1e3a5f', lineHeight: 1 }}>{value}</div>
            {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function PropertyIntelligenceCard({ data }: { data: CMACardData }) {
    const [expandedSection, setExpandedSection] = useState<string | null>(null);
    const sections = parseSections(data.answerMarkdown);

    const isJumbo = data.loanAmt > 832750;

    return (
        <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.1)', background: '#fff', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', maxWidth: 640, margin: '8px 0', fontFamily: 'inherit' }}>

            {/* ── Photo hero ── */}
            {data.photoUrl ? (
                <div style={{ position: 'relative', height: 200, background: '#1e3a5f', overflow: 'hidden' }}>
                    <img src={data.photoUrl} alt={data.address} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(10,20,40,0.75) 0%, transparent 55%)' }} />
                    <div style={{ position: 'absolute', bottom: 14, left: 16, right: 16, color: '#fff' }}>
                        <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{data.address}</div>
                        <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>
                            {data.beds}bd · {data.baths}ba · {data.sqft.toLocaleString()} sqft
                            {data.pricePerSqft > 0 && ` · $${data.pricePerSqft.toLocaleString()}/sqft`}
                        </div>
                    </div>
                    <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(6px)', borderRadius: 20, padding: '4px 12px', fontSize: 14, fontWeight: 800, color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}>
                        {fmt$(data.price)}
                    </div>
                    {isJumbo && (
                        <div style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(239,68,68,0.85)', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700, color: '#fff', letterSpacing: '0.05em' }}>
                            JUMBO
                        </div>
                    )}
                </div>
            ) : (
                <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)', padding: '20px 20px 14px', color: '#fff' }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{data.address}</div>
                    <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>{fmt$(data.price)} · {data.beds}bd · {data.sqft.toLocaleString()} sqft{isJumbo ? ' · JUMBO' : ''}</div>
                </div>
            )}

            {/* ── Stat grid ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid rgba(0,0,0,0.07)', background: '#f8fafc' }}>
                <Stat label="Monthly PITI" value={fmtMo(data.piti)} sub={`at ${data.rate}%`} />
                <div style={{ width: 1, background: 'rgba(0,0,0,0.07)', margin: '8px 0' }} />
                <Stat label="Down Payment" value={fmt$(data.downAmt)} sub="20%" />
                <div style={{ width: 1, background: 'rgba(0,0,0,0.07)', margin: '8px 0' }} />
                <Stat label="Loan Amount" value={fmt$(data.loanAmt)} sub={isJumbo ? 'Jumbo' : 'Conforming'} />
                <div style={{ width: 1, background: 'rgba(0,0,0,0.07)', margin: '8px 0' }} />
                <Stat label="Income Needed" value={fmtYr(data.incomeNeeded)} sub="@ 43% DTI" />
            </div>

            {/* ── Report sections ── */}
            <div style={{ padding: '4px 0 8px' }}>
                {sections.map((sec, idx) => {
                    const isOpen = expandedSection === sec.title || sections.length <= 3;
                    return (
                        <div key={idx} style={{ borderBottom: idx < sections.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                            <button
                                onClick={() => setExpandedSection(isOpen && sections.length > 3 ? null : sec.title)}
                                style={{ width: '100%', textAlign: 'left', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                            >
                                <span style={{ fontWeight: 700, fontSize: 13, color: '#1e3a5f' }}>
                                    {sec.emoji} {sec.title}
                                </span>
                                {sections.length > 3 && (
                                    <span style={{ fontSize: 12, color: '#9ca3af' }}>{isOpen ? '▲' : '▼'}</span>
                                )}
                            </button>
                            {isOpen && (
                                <div style={{ padding: '0 16px 12px', color: '#374151' }}>
                                    {renderMD(sec.body)}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* ── Deterministic Rate Sensitivity ── */}
                {data.rateSensitivity && data.rateSensitivity.length > 0 && (
                    <div style={{ borderTop: sections.length > 0 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                        <button
                            onClick={() => setExpandedSection(expandedSection === '__rate__' ? null : '__rate__')}
                            style={{ width: '100%', textAlign: 'left', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                        >
                            <span style={{ fontWeight: 700, fontSize: 13, color: '#1e3a5f' }}>📈 Rate Sensitivity</span>
                            <span style={{ fontSize: 12, color: '#9ca3af' }}>{expandedSection === '__rate__' ? '▲' : '▼'}</span>
                        </button>
                        {expandedSection === '__rate__' && (
                            <div style={{ padding: '0 16px 12px' }}>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(59,130,246,0.06)' }}>
                                                <th style={{ padding: '6px 10px', fontWeight: 600, textAlign: 'left' }}>Rate</th>
                                                <th style={{ padding: '6px 10px', fontWeight: 600, textAlign: 'right' }}>Monthly PITI</th>
                                                <th style={{ padding: '6px 10px', fontWeight: 600, textAlign: 'right' }}>Income Needed</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.rateSensitivity.map((s, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.07)', background: s.rate === data.rate ? 'rgba(59,130,246,0.04)' : 'transparent' }}>
                                                    <td style={{ padding: '6px 10px', fontWeight: s.rate === data.rate ? 700 : 400 }}>
                                                        {s.rate.toFixed(3)}%{s.rate === data.rate ? ' ◀ current' : ''}
                                                    </td>
                                                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: s.rate === data.rate ? 700 : 400 }}>
                                                        ${s.piti.toLocaleString()}/mo
                                                    </td>
                                                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#6b7280' }}>
                                                        ${Math.round(s.incomeNeeded / 1000)}k/yr
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>20% down · 30yr fixed · 43% DTI · Calc engine verified</div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Footer ── */}
            <div style={{ padding: '8px 16px', background: '#f8fafc', borderTop: '1px solid rgba(0,0,0,0.06)', fontSize: 11, color: '#9ca3af', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>HomeRates.ai · Educational only — not financial advice</span>
                <span style={{ color: data.liveMarketData ? '#3b82f6' : '#f59e0b', fontWeight: 600 }}>
                    {data.liveMarketData ? 'Grok synthesis · Live data' : 'Grok synthesis · AI training data'}
                </span>
            </div>
        </div>
    );
}
