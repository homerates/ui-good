// app/components/ShareModal.tsx
'use client';

import * as React from 'react';

type ShareModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onShare: (method: 'link' | 'email', email?: string) => Promise<void>;
    onSocialShare?: (platform: 'linkedin' | 'instagram') => Promise<void>;
    onSavePdf?: () => Promise<void>;
};

type Method = 'link' | 'email' | 'pdf';

export function ShareModal({ isOpen, onClose, onShare, onSocialShare, onSavePdf }: ShareModalProps) {
    const [method, setMethod] = React.useState<Method>('link');
    const [email, setEmail] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState('');
    const [pdfSaved, setPdfSaved] = React.useState(false);

    // Reset to default when modal opens
    React.useEffect(() => {
        if (isOpen) {
            setMethod('link');
            setEmail('');
            setError('');
            setPdfSaved(false);
        }
    }, [isOpen]);

    async function handleAction() {
        if (method === 'email' && !email.trim()) {
            setError('Please enter an email address');
            return;
        }
        if (method === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setError('Please enter a valid email address');
            return;
        }

        setLoading(true);
        setError('');

        try {
            if (method === 'pdf' && onSavePdf) {
                await onSavePdf();
                setPdfSaved(true);
                setTimeout(() => { setPdfSaved(false); onClose(); }, 1400);
                return;
            }
            await onShare(method as 'link' | 'email', email || undefined);
            onClose();
            setEmail('');
        } catch (err: any) {
            setError(err?.message || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    }

    if (!isOpen) return null;

    const actionLabel = loading
        ? (method === 'pdf' ? 'Saving…' : method === 'link' ? 'Copying…' : 'Sending…')
        : pdfSaved
        ? '✓ Saved to library'
        : method === 'pdf'
        ? 'Save to library'
        : method === 'link'
        ? 'Copy link'
        : 'Send email';

    const option = (id: Method, icon: React.ReactNode, title: string, sub: string) => {
        const active = method === id;
        return (
            <button
                onClick={() => setMethod(id)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '13px 14px',
                    borderRadius: 11,
                    border: active ? '1.5px solid rgba(0,232,122,0.5)' : '1px solid rgba(255,255,255,0.08)',
                    backgroundColor: active ? 'rgba(0,232,122,0.06)' : 'rgba(255,255,255,0.02)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                    width: '100%',
                }}
            >
                <div style={{
                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                    backgroundColor: active ? 'rgba(0,232,122,0.12)' : 'rgba(255,255,255,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.15s',
                }}>
                    {icon}
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: active ? '#ffffff' : '#c8d6e5', lineHeight: 1.3 }}>
                        {title}
                    </div>
                    <div style={{ fontSize: 11, color: '#5a7a94', marginTop: 2 }}>
                        {sub}
                    </div>
                </div>
                {active && (
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00e87a', flexShrink: 0 }} />
                )}
            </button>
        );
    };

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0,
                    backgroundColor: 'rgba(0,0,0,0.65)',
                    zIndex: 9998, backdropFilter: 'blur(6px)',
                }}
            />

            {/* Modal */}
            <div style={{
                position: 'fixed', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 9999, width: '90%', maxWidth: 440,
                backgroundColor: '#0e1420',
                borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.09)',
                boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
                padding: '22px 22px 20px',
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}>
                            Share
                        </h3>
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#5a7a94' }}>
                            Choose how to share this analysis
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5a7a94', padding: 2, lineHeight: 1 }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Options */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                    {option('link',
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={method === 'link' ? '#00e87a' : '#5a7a94'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        </svg>,
                        'Copy link',
                        'Anyone with the link can view this conversation'
                    )}
                    {option('email',
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={method === 'email' ? '#00e87a' : '#5a7a94'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                            <path d="m22 6-10 7L2 6" />
                        </svg>,
                        'Send via email',
                        'Invite someone directly'
                    )}
                    {onSavePdf && option('pdf',
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={method === 'pdf' ? '#00e87a' : '#5a7a94'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="12" y1="18" x2="12" y2="12" />
                            <line x1="9" y1="15" x2="15" y2="15" />
                        </svg>,
                        'Save PDF',
                        'Saved to your library — download any time'
                    )}
                </div>

                {/* Email input */}
                {method === 'email' && (
                    <div style={{ marginBottom: 14 }}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#5a7a94', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                            Email address
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="colleague@example.com"
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAction(); } }}
                            style={{
                                width: '100%', padding: '9px 11px', borderRadius: 8,
                                border: '1px solid rgba(255,255,255,0.1)',
                                backgroundColor: '#080c12', color: '#ffffff',
                                fontSize: 13, outline: 'none', boxSizing: 'border-box',
                                fontFamily: 'inherit',
                            }}
                        />
                    </div>
                )}

                {/* Social — only when link is selected and onSocialShare provided */}
                {method === 'link' && onSocialShare && (
                    <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#3a5a70', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                            Share to social
                        </div>
                        <button
                            onClick={() => onSocialShare('linkedin')}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 7,
                                padding: '8px 14px', borderRadius: 8,
                                border: '1px solid rgba(10,102,194,0.3)',
                                background: 'rgba(10,102,194,0.08)',
                                color: '#60a5fa', fontSize: 12, fontWeight: 600,
                                cursor: 'pointer', fontFamily: 'inherit',
                            }}
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="#0a66c2">
                                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                            </svg>
                            Share on LinkedIn
                        </button>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div style={{
                        padding: '9px 11px', borderRadius: 8, marginBottom: 12,
                        backgroundColor: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.25)',
                        color: '#fca5a5', fontSize: 12,
                    }}>
                        {error}
                    </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button
                        onClick={onClose}
                        disabled={loading}
                        style={{
                            padding: '9px 18px', borderRadius: 8,
                            border: '1px solid rgba(255,255,255,0.1)',
                            backgroundColor: 'transparent', color: '#8a9bb8',
                            fontSize: 13, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer',
                            opacity: loading ? 0.5 : 1, fontFamily: 'inherit',
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleAction}
                        disabled={loading || pdfSaved}
                        style={{
                            padding: '9px 18px', borderRadius: 8, border: 'none',
                            backgroundColor: pdfSaved ? 'rgba(0,232,122,0.15)' : '#00e87a',
                            color: pdfSaved ? '#00e87a' : '#000000',
                            fontSize: 13, fontWeight: 700,
                            cursor: loading || pdfSaved ? 'not-allowed' : 'pointer',
                            opacity: loading ? 0.7 : 1,
                            transition: 'all 0.2s', fontFamily: 'inherit',
                            minWidth: 110,
                        }}
                    >
                        {actionLabel}
                    </button>
                </div>
            </div>
        </>
    );
}
