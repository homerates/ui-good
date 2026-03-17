// app/components/ShareAnswerButton.tsx
'use client';

import * as React from 'react';
import { ShareModal } from './ShareModal';

type ChatMsg =
    | { id: string; role: 'user'; content: string }
    | { id: string; role: 'assistant'; content: string; meta?: any };

type ShareAnswerButtonProps = {
    question: string;
    answer: string;
    messages: ChatMsg[]; // Full thread messages
    source?: string;
};

export function ShareAnswerButton({
    question,
    answer,
    messages,
    source = 'thread',
}: ShareAnswerButtonProps) {
    const [showModal, setShowModal] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [copied, setCopied] = React.useState(false);

    async function handleShare(method: 'link' | 'email', email?: string): Promise<void> {
        setLoading(true);

        try {
            // Call the share API with full messages
            const res = await fetch('/api/share', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages,
                    email: method === 'email' ? email : undefined,
                }),
            });

            const data = await res.json();

            if (!data.ok || !data.url) {
                throw new Error(data.error || 'Failed to create share link');
            }

            if (method === 'link') {
                // Copy to clipboard — navigator.clipboard fails on mobile if
                // document loses focus after async fetch; fall back to execCommand.
                let didCopy = false;
                try {
                    await navigator.clipboard.writeText(data.url);
                    didCopy = true;
                } catch {
                    try {
                        const el = document.createElement('input');
                        el.value = data.url;
                        el.style.position = 'fixed';
                        el.style.opacity = '0';
                        document.body.appendChild(el);
                        el.focus();
                        el.select();
                        didCopy = document.execCommand('copy');
                        document.body.removeChild(el);
                    } catch {
                        didCopy = false;
                    }
                }
                setCopied(didCopy);
                if (didCopy) setTimeout(() => setCopied(false), 2000);
            }

            // Email will be sent by the API, just close modal
            setShowModal(false);

        } catch (err: any) {
            console.error('[ShareAnswerButton] Error:', err);
            throw err; // Re-throw so modal can show error
        } finally {
            setLoading(false);
        }
    }

    const label = loading ? 'Sharing…' : copied ? 'Link copied!' : 'Share';

    return (
        <>
            <button
                type="button"
                onClick={() => setShowModal(true)}
                disabled={loading}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 999,
                    border: '1px solid rgba(148, 163, 184, 0.7)',
                    background: copied ? 'rgba(34, 197, 94, 0.2)' : '#0f172a',
                    color: copied ? '#4ade80' : '#e5e7eb',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    cursor: loading ? 'default' : 'pointer',
                    opacity: loading ? 0.7 : 1,
                    transition: 'all 0.2s',
                }}
            >
                <span
                    aria-hidden="true"
                    style={{
                        display: 'inline-flex',
                        width: 12,
                        height: 12,
                    }}
                >
                    {copied ? (
                        <svg viewBox="0 0 24 24" width="12" height="12" style={{ display: 'block' }}>
                            <path
                                d="M20 6L9 17l-5-5"
                                stroke="currentColor"
                                strokeWidth="2"
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    ) : (
                        <svg viewBox="0 0 24 24" width="12" height="12" style={{ display: 'block' }}>
                            <path
                                d="M17 4a3 3 0 1 1-2.83 4H9.83A3.001 3.001 0 0 1 7 10a3 3 0 0 1 2.83-4h4.34A3.001 3.001 0 0 1 17 4Zm-7.17 8h4.34A3.001 3.001 0 0 1 17 10a3 3 0 1 1-2.83 4H9.83A3.001 3.001 0 0 1 7 16a3 3 0 1 1 2.83-4Z"
                                fill="currentColor"
                            />
                        </svg>
                    )}
                </span>
                <span>{label}</span>
            </button>

            <ShareModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                onShare={handleShare}
            />
        </>
    );
}
