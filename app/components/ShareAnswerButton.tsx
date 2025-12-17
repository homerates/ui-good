'use client';

import * as React from 'react';
import { buildAnswerShareUrl } from '../../lib/shareLink';

type ShareAnswerButtonProps = {
    question: string;
    answer: string;
    source?: string;
};

function safeFallbackShareUrl(question: string, answer: string) {
    // Force a share URL even if buildAnswerShareUrl regresses to "/"
    const origin =
        (typeof window !== 'undefined' && window.location?.origin) ||
        'https://chat.homerates.ai';

    const q = encodeURIComponent((question || '').trim());
    const a = encodeURIComponent((answer || '').trim());

    return `${origin}/share?q=${q}&a=${a}`;
}

function normalizeUrl(u: string) {
    const s = (u || '').trim();
    if (!s) return '';
    return s;
}

function isBadShareTarget(longUrl: string) {
    try {
        const origin =
            (typeof window !== 'undefined' && window.location?.origin) ||
            'https://chat.homerates.ai';

        // Treat exact homepage (with or without trailing slash) as invalid share target
        return longUrl === origin || longUrl === `${origin}/` || longUrl === '/';
    } catch {
        return longUrl === '/' || longUrl === '';
    }
}

export function ShareAnswerButton({
    question,
    answer,
    source = 'thread',
}: ShareAnswerButtonProps) {
    const [loading, setLoading] = React.useState(false);
    const [copied, setCopied] = React.useState(false);
    const [shortUrl, setShortUrl] = React.useState<string | null>(null);

    async function ensureShortUrl(longUrl: string): Promise<string> {
        if (shortUrl) return shortUrl;

        try {
            const res = await fetch('/api/shorten', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: longUrl }),
            });

            const json: any = await res.json().catch(() => null);

            if (!res.ok || !json?.ok || !json?.shortUrl) {
                console.warn('[ShareAnswerButton] shorten failed, falling back', {
                    status: res.status,
                    json,
                });
                return longUrl;
            }

            setShortUrl(json.shortUrl as string);
            return json.shortUrl as string;
        } catch (err) {
            console.error('[ShareAnswerButton] shorten error', err);
            return longUrl;
        }
    }

    async function handleClick() {
        if (loading) return;

        try {
            setLoading(true);

            // 1) Ask shareLink builder for best URL (thread preferred)
            const built = normalizeUrl(
                buildAnswerShareUrl({
                    question,
                    answer,
                    source,
                })
            );

            // 2) If builder regressed and gives homepage, force a usable /share fallback
            const longUrl = isBadShareTarget(built)
                ? safeFallbackShareUrl(question, answer)
                : built;

            // 3) Shorten the final long URL (never "/")
            const urlToCopy = await ensureShortUrl(longUrl);

            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(urlToCopy);
            } else {
                const temp = document.createElement('textarea');
                temp.value = urlToCopy;
                temp.style.position = 'fixed';
                temp.style.left = '-9999px';
                document.body.appendChild(temp);
                temp.select();
                try {
                    document.execCommand('copy');
                } catch {
                    // ignore
                }
                document.body.removeChild(temp);
            }

            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } finally {
            setLoading(false);
        }
    }

    const label = loading ? 'Preparing…' : copied ? 'Link copied' : 'Share';

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={loading}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 999,
                border: '1px solid rgba(148, 163, 184, 0.7)',
                background: '#0f172a',
                color: '#e5e7eb',
                fontSize: '0.75rem',
                fontWeight: 500,
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.7 : 1,
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
                <svg viewBox="0 0 24 24" width="12" height="12" style={{ display: 'block' }}>
                    <path
                        d="M17 4a3 3 0 1 1-2.83 4H9.83A3.001 3.001 0 0 1 7 10a3 3 0 0 1 2.83-4h4.34A3.001 3.001 0 0 1 17 4Zm-7.17 8h4.34A3.001 3.001 0 0 1 17 10a3 3 0 1 1-2.83 4H9.83A3.001 3.001 0 0 1 7 16a3 3 0 1 1 2.83-4Z"
                        fill="currentColor"
                    />
                </svg>
            </span>
            <span>{label}</span>
        </button>
    );
}
