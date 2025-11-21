'use client';

import React, { useState } from 'react';

export default function GrokCard({ data, onFollowUp }) {
    const { grok, answerMarkdown, followUp, data_freshness } = data || {};
    const hasGrok = !!grok;

    // Default: card is OPEN
    const [expanded, setExpanded] = useState(true);

    // Extract hero (first bold line or fallback)
    const heroMatch =
        typeof answerMarkdown === 'string'
            ? answerMarkdown.match(/\*\*(.*?)\*\*/)
            : null;
    const heroText = heroMatch ? heroMatch[1] : 'Answer';

    // Build a deduped list of follow-up questions
    const followups = [];
    if (followUp && typeof followUp === 'string') {
        followups.push(followUp);
    }
    if (grok?.follow_up && typeof grok.follow_up === 'string') {
        if (!followups.includes(grok.follow_up)) {
            followups.push(grok.follow_up);
        }
    }

    // Very light markdown -> HTML (bold only) for now
    const html =
        typeof answerMarkdown === 'string'
            ? answerMarkdown.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            : '';

    return (
        <div
            style={{
                margin: '16px 0',
                border: '1px solid #e5e7eb',
                borderRadius: 16,
                background: '#f9fafb',
                overflow: 'hidden',
                boxShadow: '0 6px 18px rgba(15,23,42,0.06)',
                fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}
        >
            {/* Hero Bar */}
            <div
                style={{
                    background: 'linear-gradient(90deg, #4f46e5, #6366f1)',
                    color: 'white',
                    padding: '10px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}
            >
                <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{heroText}</div>
                    {hasGrok && (
                        <div
                            style={{
                                fontSize: '0.8rem',
                                marginTop: 2,
                                opacity: 0.9,
                            }}
                        >
                            • {data_freshness || 'Live (Grok-3)'}
                        </div>
                    )}
                </div>
                <button
                    onClick={() => setExpanded((x) => !x)}
                    style={{
                        background: 'rgba(255,255,255,0.15)',
                        border: 'none',
                        borderRadius: 999,
                        padding: '6px 10px',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                    aria-label={expanded ? 'Collapse answer' : 'Expand answer'}
                >
                    {expanded ? '−' : '+'}
                </button>
            </div>

            {/* Deep Dive */}
            {expanded && (
                <div
                    style={{
                        padding: '16px 18px 4px 18px',
                        background: '#f3f4ff',
                        lineHeight: 1.55,
                        color: '#111827',
                        fontSize: 14,
                    }}
                    dangerouslySetInnerHTML={{ __html: html }}
                />
            )}

            {/* Action Panel */}
            <div
                style={{
                    padding: '14px 18px 16px 18px',
                    background: '#f9fafb',
                    borderTop: '1px solid #e5e7eb',
                    display: 'grid',
                    gap: 10,
                }}
            >
                {hasGrok && grok.next_step && (
                    <div>
                        <div
                            style={{
                                fontWeight: 600,
                                color: '#4f46e5',
                                marginBottom: 4,
                                fontSize: 13,
                            }}
                        >
                            Next step
                        </div>
                        <div style={{ fontSize: 14 }}>{grok.next_step}</div>
                    </div>
                )}

                {followups.length > 0 && (
                    <div style={{ display: 'grid', gap: 8 }}>
                        <div
                            style={{
                                fontWeight: 600,
                                color: '#4f46e5',
                                fontSize: 13,
                            }}
                        >
                            Ask me next →
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 8,
                            }}
                        >
                            {followups.map((q, i) => (
                                <button
                                    key={i}
                                    onClick={() => {
                                        if (typeof onFollowUp === 'function') {
                                            onFollowUp(q);
                                        }
                                    }}
                                    style={{
                                        padding: '8px 14px',
                                        borderRadius: 999,
                                        border: i === 0 ? '1px solid #c7d2fe' : 'none',
                                        background: i === 0 ? '#e0e7ff' : '#4f46e5',
                                        color: i === 0 ? '#4f46e5' : 'white',
                                        fontSize: 13,
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
