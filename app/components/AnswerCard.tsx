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

    // 1) First bold line like **Something**
    const boldMatch = answerMarkdown.match(/\*\*(.+?)\*\*/);
    if (boldMatch && boldMatch[1]) {
        return boldMatch[1].trim();
    }

    // 2) First line of text
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
                border: '1px solid rgba(15, 23, 42, 0.08)',
                background:
                    'linear-gradient(135deg, rgba(239,246,255,0.96), rgba(224,231,255,0.96))',
                padding: 16,
                marginBottom: 16,
                boxShadow: '0 14px 30px rgba(15,23,42,0.12)',
                boxSizing: 'border-box',
            }}
        >
            {/* Hero header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    marginBottom: 8,
                }}
            >
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            marginBottom: 4,
                            flexWrap: 'wrap',
                        }}
                    >
                        {rateBadge && (
                            <div
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '4px 10px',
                                    borderRadius: 999,
                                    background: '#111827',
                                    color: '#F9FAFB',
                                    fontSize: 13,
                                    fontWeight: 600,
                                }}
                            >
                                {rateBadge}
                            </div>
                        )}

                        <div
                            style={{
                                fontSize: 13,
                                color: '#4B5563',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                flexWrap: 'wrap',
                            }}
                        >
                            {confidence && (
                                <span>
                                    Confidence:{' '}
                                    <b style={{ fontWeight: 600 }}>
                                        {confidence}
                                    </b>
                                </span>
                            )}
                            {dataFreshness && (
                                <span
                                    style={{
                                        padding: '2px 8px',
                                        borderRadius: 999,
                                        background: 'rgba(79,70,229,0.07)',
                                        color: '#4338CA',
                                        fontSize: 12,
                                    }}
                                >
                                    {dataFreshness}
                                </span>
                            )}
                            {generatedAt && (
                                <span style={{ opacity: 0.8 }}>
                                    • {new Date(generatedAt).toLocaleDateString()}
                                </span>
                            )}
                        </div>
                    </div>

                    <div
                        style={{
                            fontSize: 18,
                            fontWeight: 700,
                            color: '#111827',
                            lineHeight: 1.3,
                        }}
                    >
                        {hero}
                    </div>
                </div>

                {/* Expand / collapse button */}
                <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        padding: 4,
                        margin: -4,
                        borderRadius: 999,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                    aria-label={expanded ? 'Collapse details' : 'Expand details'}
                >
                    <span
                        style={{
                            display: 'inline-block',
                            fontSize: 18,
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
                        background: 'rgba(255,255,255,0.9)',
                        border: '1px solid rgba(148,163,184,0.3)',
                        fontSize: 14,
                        color: '#111827',
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.45,
                    }}
                >
                    {answerMarkdown}
                </div>
            )}

            {/* Divider */}
            <div
                style={{
                    height: 1,
                    background: 'rgba(148,163,184,0.4)',
                    margin: '12px 0',
                }}
            />

            {/* Action panel */}
            <div
                style={{
                    display: 'grid',
                    gap: 8,
                }}
            >
                {nextStep && (
                    <div>
                        <div
                            style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: '#111827',
                                marginBottom: 2,
                            }}
                        >
                            Next step
                        </div>
                        <div
                            style={{
                                fontSize: 14,
                                color: '#374151',
                            }}
                        >
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
                                fontSize: 13,
                                fontWeight: 600,
                                color: '#111827',
                            }}
                        >
                            Ask me next →
                        </span>
                        <button
                            type="button"
                            onClick={() => onFollowUp(followChip)}
                            style={{
                                padding: '4px 10px',
                                borderRadius: 999,
                                border: '1px solid rgba(79,70,229,0.35)',
                                background: '#EEF2FF',
                                color: '#312E81',
                                fontSize: 13,
                                cursor: 'pointer',
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
