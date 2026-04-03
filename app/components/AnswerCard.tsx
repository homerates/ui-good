// app/components/AnswerCard.tsx
'use client';

import * as React from 'react';

type AnswerCardProps = {
    answerMarkdown: string;
    grok?: {
        answer?: string;
        next_step?: string;
        follow_up?: string;
        confidence?: string;
    } | null;
    followUp?: string;
    dataFreshness?: string;
    generatedAt?: string;
    onFollowUp?: (q: string) => void;
};

function extractHero(answerMarkdown: string): string {
    if (!answerMarkdown) return 'Your mortgage answer';
    const boldMatch = answerMarkdown.match(/\*\*(.+?)\*\*/);
    if (boldMatch && boldMatch[1]) return boldMatch[1].trim();
    const firstLine =
        answerMarkdown
            .split('\n')
            .map((l) => l.trim())
            .find((l) => l.length > 0) || '';
    return firstLine || 'Your mortgage answer';
}

function extractRateBadge(answerMarkdown: string): string | null {
    if (!answerMarkdown) return null;
    const match = answerMarkdown.match(/(\d{1,2}\.\d{2,3})\s*%/);
    return match ? `${match[1]}%` : null;
}

export default function AnswerCard({
    answerMarkdown,
    grok,
    followUp,
    dataFreshness,
    generatedAt,
    onFollowUp,
}: AnswerCardProps) {
    const [expanded, setExpanded] = React.useState<boolean>(false);

    const hero = extractHero(answerMarkdown);
    const rateBadge = extractRateBadge(answerMarkdown);
    const confidence = grok?.confidence || '';
    const nextStep = grok?.next_step || '';
    const followChip = grok?.follow_up || followUp || '';

    return (
        <div
            className="answer-card"
            style={{
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.07)',
                background: '#0e1420',
                padding: 16,
                marginBottom: 16,
                boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
                boxSizing: 'border-box',
            }}
        >
            {/* Hero header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        {rateBadge && (
                            <div
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '3px 10px',
                                    borderRadius: 999,
                                    background: 'rgba(0,232,122,0.12)',
                                    border: '1px solid rgba(0,232,122,0.3)',
                                    color: '#00e87a',
                                    fontSize: 13,
                                    fontWeight: 700,
                                    fontFamily: "'DM Mono', monospace",
                                    letterSpacing: '0.04em',
                                }}
                            >
                                {rateBadge}
                            </div>
                        )}

                        <div
                            style={{
                                fontSize: 12,
                                color: '#3a4560',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                flexWrap: 'wrap',
                                fontFamily: "'DM Mono', monospace",
                            }}
                        >
                            {confidence && (
                                <span style={{ color: '#6b7a99' }}>
                                    Confidence: <b style={{ fontWeight: 600, color: '#f0f4ff' }}>{confidence}</b>
                                </span>
                            )}
                            {dataFreshness && (
                                <span
                                    style={{
                                        padding: '2px 8px',
                                        borderRadius: 999,
                                        background: 'rgba(61,139,255,0.1)',
                                        border: '1px solid rgba(61,139,255,0.2)',
                                        color: '#3d8bff',
                                        fontSize: 11,
                                    }}
                                >
                                    {dataFreshness}
                                </span>
                            )}
                            {generatedAt && (
                                <span style={{ color: '#3a4560' }}>
                                    · {new Date(generatedAt).toLocaleDateString()}
                                </span>
                            )}
                        </div>
                    </div>

                    <div
                        style={{
                            fontSize: 17,
                            fontWeight: 700,
                            color: '#f0f4ff',
                            lineHeight: 1.35,
                            fontFamily: "'Syne', sans-serif",
                        }}
                    >
                        {hero}
                    </div>
                </div>

                {/* Expand / collapse */}
                <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    style={{
                        border: '1px solid rgba(255,255,255,0.07)',
                        background: 'rgba(255,255,255,0.04)',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        margin: -4,
                        borderRadius: 8,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#6b7a99',
                        transition: 'background 0.15s, color 0.15s',
                    }}
                    aria-label={expanded ? 'Collapse details' : 'Expand details'}
                >
                    <span
                        style={{
                            display: 'inline-block',
                            fontSize: 14,
                            lineHeight: 1,
                            transform: expanded ? 'rotate(180deg)' : 'none',
                            transition: 'transform 120ms ease-out',
                        }}
                    >
                        ▾
                    </span>
                </button>
            </div>

            {/* Deep dive body */}
            {expanded && (
                <div
                    style={{
                        marginTop: 8,
                        padding: 12,
                        borderRadius: 10,
                        background: '#141b28',
                        border: '1px solid rgba(255,255,255,0.07)',
                        fontSize: 14,
                        color: '#6b7a99',
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.65,
                        fontFamily: "'DM Sans', sans-serif",
                    }}
                >
                    {answerMarkdown}
                </div>
            )}

            {/* Divider */}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '12px 0' }} />

            {/* Action panel */}
            <div style={{ display: 'grid', gap: 8 }}>
                {nextStep && (
                    <div>
                        <div
                            style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: '#3a4560',
                                marginBottom: 4,
                                fontFamily: "'DM Mono', monospace",
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                            }}
                        >
                            Next step
                        </div>
                        <div style={{ fontSize: 14, color: '#6b7a99', lineHeight: 1.6 }}>
                            {nextStep}
                        </div>
                    </div>
                )}

                {followChip && onFollowUp && (
                    <div
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 8,
                            alignItems: 'center',
                            marginTop: 4,
                        }}
                    >
                        <span
                            style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: '#3a4560',
                                fontFamily: "'DM Mono', monospace",
                                letterSpacing: '0.06em',
                                textTransform: 'uppercase',
                            }}
                        >
                            Ask next →
                        </span>
                        <button
                            type="button"
                            onClick={() => onFollowUp(followChip)}
                            style={{
                                padding: '5px 12px',
                                borderRadius: 999,
                                border: '1px solid rgba(0,232,122,0.25)',
                                background: 'rgba(0,232,122,0.06)',
                                color: '#00e87a',
                                fontSize: 13,
                                cursor: 'pointer',
                                fontFamily: "'DM Sans', sans-serif",
                                transition: 'background 0.15s, border-color 0.15s',
                            }}
                        >
                            {followChip}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
