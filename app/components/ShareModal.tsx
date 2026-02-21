// app/components/ShareModal.tsx
'use client';

import * as React from 'react';

type ShareModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onShare: (method: 'link' | 'email', email?: string) => Promise<void>;
};

export function ShareModal({ isOpen, onClose, onShare }: ShareModalProps) {
    const [method, setMethod] = React.useState<'link' | 'email'>('link');
    const [email, setEmail] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState('');

    async function handleShare() {
        if (method === 'email' && !email.trim()) {
            setError('Please enter an email address');
            return;
        }

        if (method === 'email' && !isValidEmail(email)) {
            setError('Please enter a valid email address');
            return;
        }

        setLoading(true);
        setError('');

        try {
            await onShare(method, email || undefined);
            onClose();
            // Reset state
            setMethod('link');
            setEmail('');
        } catch (err: any) {
            setError(err?.message || 'Failed to share. Please try again.');
        } finally {
            setLoading(false);
        }
    }

    function isValidEmail(email: string): boolean {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    zIndex: 9998,
                    backdropFilter: 'blur(4px)',
                }}
            />

            {/* Modal */}
            <div
                style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 9999,
                    width: '90%',
                    maxWidth: 480,
                    backgroundColor: '#1e293b',
                    borderRadius: 16,
                    border: '1px solid rgba(148, 163, 184, 0.3)',
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
                    padding: 24,
                }}
            >
                {/* Header */}
                <div style={{ marginBottom: 20 }}>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#e5e7eb' }}>
                        Share this conversation
                    </h3>
                    <p style={{ margin: '8px 0 0', fontSize: 14, color: '#94a3b8' }}>
                        Anyone with the link can view and continue this conversation
                    </p>
                </div>

                {/* Options */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                    {/* Copy Link Option */}
                    <button
                        onClick={() => setMethod('link')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: 16,
                            borderRadius: 12,
                            border: method === 'link'
                                ? '2px solid #3b82f6'
                                : '1px solid rgba(148, 163, 184, 0.3)',
                            backgroundColor: method === 'link' ? 'rgba(59, 130, 246, 0.1)' : '#0f172a',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'all 0.2s',
                        }}
                    >
                        <div style={{
                            width: 40,
                            height: 40,
                            borderRadius: 8,
                            backgroundColor: 'rgba(59, 130, 246, 0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
                                    stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
                                    stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#e5e7eb' }}>
                                Copy link
                            </div>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                                Anyone with the link can view
                            </div>
                        </div>
                    </button>

                    {/* Email Option */}
                    <button
                        onClick={() => setMethod('email')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: 16,
                            borderRadius: 12,
                            border: method === 'email'
                                ? '2px solid #3b82f6'
                                : '1px solid rgba(148, 163, 184, 0.3)',
                            backgroundColor: method === 'email' ? 'rgba(59, 130, 246, 0.1)' : '#0f172a',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'all 0.2s',
                        }}
                    >
                        <div style={{
                            width: 40,
                            height: 40,
                            borderRadius: 8,
                            backgroundColor: 'rgba(168, 85, 247, 0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"
                                    stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="m22 6-10 7L2 6"
                                    stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#e5e7eb' }}>
                                Send via email
                            </div>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                                Invite specific people
                            </div>
                        </div>
                    </button>
                </div>

                {/* Email Input (conditional) */}
                {method === 'email' && (
                    <div style={{ marginBottom: 20 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#cbd5e1', marginBottom: 8 }}>
                            Email address
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="colleague@example.com"
                            autoFocus
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: 8,
                                border: '1px solid rgba(148, 163, 184, 0.3)',
                                backgroundColor: '#0f172a',
                                color: '#e5e7eb',
                                fontSize: 14,
                                outline: 'none',
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleShare();
                                }
                            }}
                        />
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div style={{
                        padding: 12,
                        borderRadius: 8,
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#fca5a5',
                        fontSize: 13,
                        marginBottom: 20,
                    }}>
                        {error}
                    </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                    <button
                        onClick={onClose}
                        disabled={loading}
                        style={{
                            padding: '10px 20px',
                            borderRadius: 8,
                            border: '1px solid rgba(148, 163, 184, 0.3)',
                            backgroundColor: 'transparent',
                            color: '#cbd5e1',
                            fontSize: 14,
                            fontWeight: 500,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            opacity: loading ? 0.5 : 1,
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleShare}
                        disabled={loading}
                        style={{
                            padding: '10px 20px',
                            borderRadius: 8,
                            border: 'none',
                            backgroundColor: '#3b82f6',
                            color: '#fff',
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            opacity: loading ? 0.7 : 1,
                        }}
                    >
                        {loading ? 'Sharing...' : method === 'link' ? 'Copy link' : 'Send email'}
                    </button>
                </div>
            </div>
        </>
    );
}
