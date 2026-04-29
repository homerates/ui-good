'use client';

// app/components/PropertyIntelligenceCard.tsx
// CMA / Property Intelligence Card — dark theme, matches card design system

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
    rentEstimate?:    number | null;
    rentRangeLow?:    number | null;
    rentRangeHigh?:   number | null;
    grossYield?:      number | null;
    capRate?:         number | null;
    dscrRatio?:       number | null;
    dscrRate?:        number | null;
    dscrPiti?:        number | null;
    dscrDown?:        number | null;
    monthlyCashFlow?: number | null;
    cashOnCash?:      number | null;
    priceSource?:     string;
    estimatedValueLow?:  number | null;
    estimatedValueHigh?: number | null;
    onRunScenario?: (seed: string) => void;
}

// ── Formatters ─────────────────────────────────────────────────────────────
const fmt$ = (n: number, compact = false) => {
    if (compact && n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 2).replace(/\.?0+$/, '')}M`;
    if (compact && n >= 1_000)     return `$${Math.round(n / 1000)}k`;
    return `$${n.toLocaleString('en-US')}`;
};
const fmtMo = (n: number) => `$${n.toLocaleString('en-US')}/mo`;
const fmtYr = (n: number) => `$${Math.round(n / 1000)}k/yr`;

// ── Section parser ─────────────────────────────────────────────────────────
function parseSections(md: string): Array<{ title: string; body: string; emoji: string }> {
    const lines = md.split('\n');
    const sections: Array<{ title: string; body: string; emoji: string }> = [];
    let current: { title: string; body: string[]; emoji: string } | null = null;

    const emojiMap: Record<string, string> = {
        'highlight':     '✨',
        'market':        '📊',
        'snapshot':      '📊',
        'fair value':    '⚖️',
        'value':         '⚖️',
        'comps':         '⚖️',
        'decision':      '🧭',
        'consideration': '🧭',
        'trade-off':     '⚡',
        'rate':          '📈',
        'risk':          '⚠️',
    };

    for (const line of lines) {
        const h2 = line.match(/^##\s+(.+)/);
        if (h2) {
            if (current) sections.push({ title: current.title, body: current.body.join('\n').trim(), emoji: current.emoji });
            const titleClean = h2[1].replace(/^[\p{Emoji}\s]+/u, '').trim();
            const emojiKey = Object.keys(emojiMap).find(k => titleClean.toLowerCase().includes(k));
            current = { title: titleClean, body: [], emoji: emojiMap[emojiKey ?? ''] ?? '📌' };
        } else if (current) {
            current.body.push(line);
        }
    }
    if (current) sections.push({ title: current.title, body: current.body.join('\n').trim(), emoji: current.emoji });

    return sections.filter(s =>
        s.body.length > 0 &&
        !s.title.toLowerCase().includes('property intelligence') &&
        !s.title.toLowerCase().includes('rate sensitivity')
    );
}

// ── Markdown renderer (dark-theme aware) ───────────────────────────────────
function renderMD(md: string): React.ReactNode {
    const lines = md.split('\n');
    const out: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (line.startsWith('|')) {
            const tableLines: string[] = [];
            while (i < lines.length && lines[i].startsWith('|')) { tableLines.push(lines[i]); i++; }
            const rows = tableLines.filter(l => !/^\|[-|: ]+\|$/.test(l.trim()));
            out.push(
                <div key={`t${i}`} style={{ overflowX: 'auto', margin: '8px 0' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <tbody>
                            {rows.map((row, ri) => {
                                const cells = row.split('|').slice(1, -1).map(c => c.trim());
                                return (
                                    <tr key={ri} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: ri === 0 ? 'rgba(0,232,122,0.06)' : 'transparent' }}>
                                        {cells.map((cell, ci) => (
                                            <td key={ci} style={{ padding: '6px 10px', fontWeight: ri === 0 ? 600 : 400, color: ri === 0 ? '#00e87a' : 'rgba(255,255,255,0.8)' }}
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

        if (line.startsWith('>')) {
            const text = line.replace(/^>\s*/, '');
            out.push(
                <div key={`bq${i}`} style={{ borderLeft: '3px solid #00e87a', paddingLeft: 12, margin: '6px 0', color: 'rgba(255,255,255,0.6)', fontSize: 13, fontStyle: 'italic' }}
                    dangerouslySetInnerHTML={{ __html: mdInline(text) }} />
            );
            i++; continue;
        }

        if (/^[-*]\s/.test(line)) {
            out.push(
                <div key={`li${i}`} style={{ display: 'flex', gap: 8, margin: '3px 0', fontSize: 13 }}>
                    <span style={{ color: '#00e87a', flexShrink: 0 }}>·</span>
                    <span style={{ color: 'rgba(255,255,255,0.8)' }} dangerouslySetInnerHTML={{ __html: mdInline(line.replace(/^[-*]\s/, '')) }} />
                </div>
            );
            i++; continue;
        }

        const h3 = line.match(/^###\s+(.+)/);
        if (h3) {
            out.push(<div key={`h3${i}`} style={{ fontWeight: 700, fontSize: 13, marginTop: 10, marginBottom: 3, color: '#7ee3ff' }}>{h3[1].replace(/^[\p{Emoji}\s]+/u, '')}</div>);
            i++; continue;
        }

        if (line.trim()) {
            out.push(<p key={`p${i}`} style={{ fontSize: 13, margin: '4px 0', lineHeight: 1.6, color: 'rgba(255,255,255,0.75)' }} dangerouslySetInnerHTML={{ __html: mdInline(line) }} />);
        }
        i++;
    }
    return <>{out}</>;
}

function mdInline(s: string): string {
    return s
        .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#fff">$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code style="background:rgba(0,232,122,0.12);padding:1px 5px;border-radius:3px;font-size:12px;color:#00e87a">$1</code>');
}

// ── Stat cell ──────────────────────────────────────────────────────────────
function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
    return (
        <div style={{ textAlign: 'center', padding: '12px 8px' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: accent ? '#00e87a' : '#fff', lineHeight: 1 }}>{value}</div>
            {sub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 3 }}>{sub}</div>}
        </div>
    );
}

// ── Investment Intelligence Panel ──────────────────────────────────────────
function InvestmentPanel({ data }: { data: CMACardData }) {
    if (!data.rentEstimate) return null;
    const rent      = data.rentEstimate;
    const dscr      = data.dscrRatio ?? null;
    const flow      = data.monthlyCashFlow ?? null;
    const coc       = data.cashOnCash ?? null;
    const grossYield = data.grossYield ?? null;
    const capRate    = data.capRate ?? null;

    const dscrColor = dscr === null ? 'rgba(255,255,255,0.4)' : dscr >= 1.25 ? '#00e87a' : dscr >= 1.00 ? '#f59e0b' : '#ef4444';
    const dscrLabel = dscr === null ? '—' : dscr >= 1.25 ? 'Lender-eligible' : dscr >= 1.00 ? 'At threshold' : 'Below threshold';
    const flowColor = flow === null ? 'rgba(255,255,255,0.4)' : flow >= 0 ? '#00e87a' : '#ef4444';

    return (
        <div style={{ borderTop: '1px solid rgba(0,232,122,0.2)', background: 'rgba(0,232,122,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px 4px' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00e87a', display: 'inline-block' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#00e87a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Investment Intelligence</span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>Rent AVM · live</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ textAlign: 'center', padding: '10px 8px' }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Est. Rent</div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>${rent.toLocaleString()}/mo</div>
                    {data.rentRangeLow && data.rentRangeHigh && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>${Math.round(data.rentRangeLow/1000)}k–${Math.round(data.rentRangeHigh/1000)}k</div>}
                </div>
                <div style={{ textAlign: 'center', padding: '10px 8px' }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Gross Yield</div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>{grossYield ? `${grossYield}%` : '—'}</div>
                </div>
                <div style={{ textAlign: 'center', padding: '10px 8px' }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Cap Rate</div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>{capRate ? `${capRate}%` : '—'}</div>
                </div>
                <div style={{ textAlign: 'center', padding: '10px 8px' }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>DSCR</div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: dscrColor }}>{dscr?.toFixed(2) ?? '—'}</div>
                    <div style={{ fontSize: 10, color: dscrColor, marginTop: 2 }}>{dscrLabel}</div>
                </div>
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div><span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cash Flow </span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: flowColor }}>{flow !== null ? `${flow >= 0 ? '+' : ''}$${Math.abs(flow).toLocaleString()}/mo` : '—'}</span></div>
                {coc !== null && <><div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)' }} />
                <div><span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cash-on-Cash </span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: coc >= 0 ? '#00e87a' : '#ef4444' }}>{coc >= 0 ? '+' : ''}{coc}%/yr</span></div></>}
                {data.dscrDown && data.dscrRate && <div style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(255,255,255,0.3)', textAlign: 'right' }}>25% down · {data.dscrRate}% DSCR rate</div>}
            </div>
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function PropertyIntelligenceCard({ data, onSaveToVault }: { data: CMACardData; onSaveToVault?: () => Promise<void> }) {
    const [expandedSection, setExpandedSection] = useState<string | null>(null);
    const [vaultState, setVaultState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const sections = parseSections(data.answerMarkdown);
    const isJumbo = data.loanAmt > 832750;

    const cardStyle: React.CSSProperties = {
        borderRadius: 16,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)',
        background: '#0d1117',
        boxShadow: '0 4px 32px rgba(0,0,0,0.4)',
        maxWidth: 640,
        margin: '8px 0',
        fontFamily: 'inherit',
    };

    return (
        <div style={cardStyle}>

            {/* ── Photo hero / header ── */}
            {data.photoUrl ? (
                <div style={{ position: 'relative', height: 200, background: '#0d1117', overflow: 'hidden' }}>
                    <img src={data.photoUrl} alt={data.address} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(13,17,23,0.95) 0%, rgba(13,17,23,0.3) 60%, transparent 100%)' }} />
                    <div style={{ position: 'absolute', bottom: 14, left: 16, right: 80, color: '#fff' }}>
                        <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{data.address}</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 3 }}>
                            {data.beds}bd · {data.baths}ba · {data.sqft.toLocaleString()} sqft{data.pricePerSqft > 0 ? ` · $${data.pricePerSqft}/sqft` : ''}
                        </div>
                    </div>
                    <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(0,232,122,0.15)', backdropFilter: 'blur(6px)', borderRadius: 20, padding: '4px 12px', fontSize: 14, fontWeight: 800, color: '#00e87a', border: '1px solid rgba(0,232,122,0.3)' }}>
                        {fmt$(data.price, true)}
                    </div>
                    <div style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(96,165,250,0.2)', borderRadius: 20, padding: '3px 10px', fontSize: 10, fontWeight: 700, color: '#7ee3ff', letterSpacing: '0.06em', border: '1px solid rgba(96,165,250,0.3)' }}>
                        FOR SALE{isJumbo ? ' · JUMBO' : ''}
                    </div>
                </div>
            ) : (
                <div style={{ background: 'linear-gradient(135deg, #1a2332 0%, #0d1117 100%)', padding: '18px 20px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#7ee3ff', textTransform: 'uppercase', letterSpacing: '0.08em', background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: 20, padding: '2px 10px' }}>
                                    FOR SALE{isJumbo ? ' · JUMBO' : ''}
                                </span>
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>{data.address}</div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                                {data.beds}bd · {data.baths}ba · {data.sqft.toLocaleString()} sqft{data.pricePerSqft > 0 ? ` · $${data.pricePerSqft}/sqft` : ''}
                            </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 22, fontWeight: 800, color: '#00e87a' }}>{fmt$(data.price, true)}</div>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>List Price</div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Stat grid ── */}
            <div style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ padding: '6px 16px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Listing Estimate
                    </span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>·</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>20% down · 30yr fixed · {data.rate}%</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
                    <Stat label="Monthly PITI"   value={fmtMo(data.piti)}           sub={`at ${data.rate}%`} />
                    <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', margin: '8px 0' }} />
                    <Stat label="Down Payment"   value={fmt$(data.downAmt, true)}    sub="20%" />
                    <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', margin: '8px 0' }} />
                    <Stat label="Loan Amount"    value={fmt$(data.loanAmt, true)}    sub={isJumbo ? 'Jumbo' : 'Conforming'} />
                    <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', margin: '8px 0' }} />
                    <Stat label="Income to Qualify" value={fmtYr(data.incomeNeeded)} sub="@ 43% DTI" accent />
                </div>
            </div>

            {/* ── Investment Intelligence Panel ── */}
            <InvestmentPanel data={data} />

            {/* ── Report sections ── */}
            <div style={{ padding: '4px 0 8px' }}>
                {sections.map((sec, idx) => {
                    const isOpen = expandedSection === sec.title || sections.length <= 3;
                    return (
                        <div key={idx} style={{ borderBottom: idx < sections.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                            <button
                                onClick={() => setExpandedSection(isOpen && sections.length > 3 ? null : sec.title)}
                                style={{ width: '100%', textAlign: 'left', padding: '11px 16px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                            >
                                <span style={{ fontWeight: 700, fontSize: 13, color: '#7ee3ff' }}>
                                    {sec.emoji} {sec.title}
                                </span>
                                {sections.length > 3 && (
                                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{isOpen ? '▲' : '▼'}</span>
                                )}
                            </button>
                            {isOpen && (
                                <div style={{ padding: '0 16px 12px' }}>
                                    {renderMD(sec.body)}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* ── Rate Sensitivity ── */}
                {data.rateSensitivity && data.rateSensitivity.length > 0 && (
                    <div style={{ borderTop: sections.length > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                        <button
                            onClick={() => setExpandedSection(expandedSection === '__rate__' ? null : '__rate__')}
                            style={{ width: '100%', textAlign: 'left', padding: '11px 16px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                        >
                            <span style={{ fontWeight: 700, fontSize: 13, color: '#7ee3ff' }}>📈 Rate Sensitivity</span>
                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{expandedSection === '__rate__' ? '▲' : '▼'}</span>
                        </button>
                        {expandedSection === '__rate__' && (
                            <div style={{ padding: '0 16px 12px' }}>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(0,232,122,0.06)' }}>
                                                <th style={{ padding: '7px 10px', fontWeight: 600, textAlign: 'left', color: '#00e87a', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rate</th>
                                                <th style={{ padding: '7px 10px', fontWeight: 600, textAlign: 'right', color: '#00e87a', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Monthly PITI</th>
                                                <th style={{ padding: '7px 10px', fontWeight: 600, textAlign: 'right', color: '#00e87a', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Income to Qualify</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.rateSensitivity.map((s, i) => {
                                                const isCurrent = s.rate === data.rate;
                                                return (
                                                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: isCurrent ? 'rgba(0,232,122,0.06)' : 'transparent' }}>
                                                        <td style={{ padding: '8px 10px', fontWeight: isCurrent ? 700 : 400, color: isCurrent ? '#00e87a' : 'rgba(255,255,255,0.75)' }}>
                                                            {s.rate.toFixed(3)}%{isCurrent ? ' ◀' : ''}
                                                        </td>
                                                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: isCurrent ? 700 : 400, color: isCurrent ? '#fff' : 'rgba(255,255,255,0.7)' }}>
                                                            ${s.piti.toLocaleString()}/mo
                                                        </td>
                                                        <td style={{ padding: '8px 10px', textAlign: 'right', color: 'rgba(255,255,255,0.6)' }}>
                                                            ${Math.round(s.incomeNeeded / 1000)}k/yr
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 6 }}>20% down · 30yr fixed · 43% DTI · Calc engine verified</div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── CTA buttons ── */}
            <div style={{ padding: '0 16px 6px', display: 'flex', gap: 10 }}>
                <button
                    onClick={() => data.onRunScenario?.(`Get matched with a lender for ${data.address} at ${fmt$(data.price, true)}`)}
                    style={{
                        flex: 1,
                        padding: '11px 0',
                        borderRadius: 999,
                        border: 'none',
                        background: '#00e87a',
                        color: '#000',
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: 'pointer',
                        letterSpacing: '0.01em',
                    }}
                >
                    🏦 Get Matched →
                </button>
                <button
                    onClick={() => data.onRunScenario?.(`What income do I need to qualify for ${data.address}? Price ${fmt$(data.price, true)}, 20% down, ${data.rate}% rate.`)}
                    style={{
                        flex: 1,
                        padding: '11px 0',
                        borderRadius: 999,
                        border: '1px solid rgba(126,227,255,0.3)',
                        background: 'transparent',
                        color: '#7ee3ff',
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: 'pointer',
                    }}
                >
                    💰 What Income Do I Need?
                </button>
            </div>
            <div style={{ padding: '0 16px 14px' }}>
                <a
                    href={`/check-property?address=${encodeURIComponent(data.address)}`}
                    style={{
                        display: 'block',
                        textAlign: 'center',
                        padding: '10px 0',
                        borderRadius: 999,
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: 'rgba(255,255,255,0.04)',
                        color: 'rgba(255,255,255,0.6)',
                        fontWeight: 600,
                        fontSize: 13,
                        textDecoration: 'none',
                        letterSpacing: '0.01em',
                    }}
                >
                    🏠 Check Property →
                </a>
            </div>

            {/* ── Footer ── */}
            <div style={{ padding: '8px 16px', background: 'rgba(0,0,0,0.25)', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 11, color: 'rgba(255,255,255,0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span>HomeRates.ai · Educational only — not financial advice</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: data.liveMarketData ? '#7ee3ff' : 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
                        {data.liveMarketData ? 'Grok · Live data' : 'Grok synthesis'}
                    </span>
                    {onSaveToVault && (
                        <button
                            type="button"
                            onClick={async () => {
                                if (vaultState === 'saved' || vaultState === 'saving') return;
                                setVaultState('saving');
                                try { await onSaveToVault(); setVaultState('saved'); }
                                catch { setVaultState('error'); setTimeout(() => setVaultState('idle'), 3000); }
                            }}
                            style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '3px 10px',
                                borderRadius: 999,
                                border: '1px solid rgba(0,232,122,0.35)',
                                background: vaultState === 'saved' ? 'rgba(0,232,122,0.12)' : 'transparent',
                                color: vaultState === 'saved' ? '#00e87a' : vaultState === 'error' ? '#ef4444' : '#00e87a',
                                cursor: vaultState === 'saved' ? 'default' : 'pointer',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {vaultState === 'saving' ? 'Saving…' : vaultState === 'saved' ? '★ Vault ✓' : vaultState === 'error' ? 'Error' : '★ Vault'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
