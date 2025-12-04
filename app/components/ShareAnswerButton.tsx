'use client';

import * as React from 'react';
import { buildAnswerShareUrl } from '../../lib/shareLink';

type ShareAnswerButtonProps = {
    question: string;
    answer: string;
    source?: string; // e.g. "sms", "email", "thread"
};

export function ShareAnswerButton({
    question,
    answer,
    source = 'thread',
}: ShareAnswerButtonProps) {
    const [copied, setCopied] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const handleClick = async () => {
        try {
            setError(null);

            const url = buildAnswerShareUrl({
                question,
                answer,
                source,
            });

            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(url);
            } else {
                // Basic fallback for older browsers
                window.prompt('Copy this link:', url);
            }

            setCopied(true);
            window.setTimeout(() => {
                setCopied(false);
            }, 1500);
        } catch (err) {
            console.error('Failed to copy share link', err);
            setError('Could not copy link');
            window.setTimeout(() => setError(null), 2000);
        }
    };

    const disabled = !question?.trim() || !answer?.trim();

    return (
        <button
            type="button"
            onClick={disabled ? undefined : handleClick}
            disabled={disabled}
            className="share-answer-btn"
            style={{
                fontSize: '0.75rem',
                padding: '4px 10px',
                borderRadius: 999,
                border: '1px solid rgba(148, 163, 184, 0.6)',
                background: disabled ? '#f9fafb' : '#ffffff',
                color: disabled ? '#94a3b8' : '#0f172a',
                cursor: disabled ? 'default' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                whiteSpace: 'nowrap',
            }}
        >
            {copied ? 'Link copied' : 'Copy link to this answer'}
            {error && (
                <span
                    style={{
                        marginLeft: 6,
                        fontSize: '0.7rem',
                        color: '#b91c1c',
                    }}
                >
                    {error}
                </span>
            )}
        </button>
    );
}
