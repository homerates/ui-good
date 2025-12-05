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
            window.setTimeout(() => setCopied(false), 1500);
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
                gap: 6,
                whiteSpace: 'nowrap',
            }}
            aria-label="Share this answer"
        >
            {/* Simple share icon (ChatGPT-style export arrow) */}
            <span
                aria-hidden="true"
                style={{
                    width: 12,
                    height: 12,
                    display: 'inline-block',
                }}
            >
                <svg
                    viewBox="0 0 24 24"
                    width="12"
                    height="12"
                    style={{ display: 'block' }}
                >
                    <path
                        d="M7 11a1 1 0 0 0 0 2h7.586l-2.293 2.293a1 1 0 1 0 1.414 1.414l4-4a1 1 0 0 0 0-1.414l-4-4a1 1 0 0 0-1.414 1.414L14.586 11H7Z"
                        fill="currentColor"
                    />
                    <path
                        d="M5 5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-2a1 1 0 1 1 2 0v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v2a1 1 0 1 1-2 0V5Z"
                        fill="currentColor"
                        opacity={0.8}
                    />
                </svg>
            </span>

            {copied ? 'Shared' : 'Share'}

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
