'use client';

// app/components/PdfDownloadButton.tsx
// Auth-gated PDF download button — redirects to /sign-up if not signed in

import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export interface PdfDownloadButtonProps {
    type: 'refi' | 'conventional' | 'fha' | 'va' | 'jumbo' | 'affordability' | 'dscr';
    getParams: () => Record<string, unknown>;
    style?: React.CSSProperties;
}

export default function PdfDownloadButton({ type, getParams, style }: PdfDownloadButtonProps) {
    const { isSignedIn } = useUser();
    const router = useRouter();
    const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

    async function handleClick() {
        if (!isSignedIn) {
            router.push('/sign-up?redirect_url=' + encodeURIComponent(window.location.href));
            return;
        }

        setState('loading');
        try {
            const res = await fetch('/api/pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, params: getParams() }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                console.error('[PdfDownloadButton]', err);
                setState('error');
                setTimeout(() => setState('idle'), 3000);
                return;
            }

            const blob = await res.blob();
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `homerates-${type}-analysis.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setState('idle');
        } catch (e) {
            console.error('[PdfDownloadButton]', e);
            setState('error');
            setTimeout(() => setState('idle'), 3000);
        }
    }

    const label = state === 'loading' ? 'Generating…'
                : state === 'error'   ? 'Failed — try again'
                : isSignedIn          ? '↓ Save as PDF'
                :                      '↓ Save as PDF — free account';

    const btnColor = state === 'error' ? '#dc2626' : '#475569';

    return (
        <button
            onClick={handleClick}
            disabled={state === 'loading'}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '7px 13px',
                borderRadius: 8,
                border: `1px solid ${state === 'error' ? '#fca5a5' : '#e2e8f0'}`,
                background: state === 'error' ? '#fef2f2' : '#f8fafc',
                color: btnColor,
                fontSize: 12,
                fontWeight: 600,
                cursor: state === 'loading' ? 'wait' : 'pointer',
                opacity: state === 'loading' ? 0.7 : 1,
                fontFamily: 'system-ui, -apple-system, sans-serif',
                letterSpacing: '-0.01em',
                ...style,
            }}
        >
            {label}
        </button>
    );
}
