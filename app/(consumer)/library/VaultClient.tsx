'use client';
// app/library/VaultClient.tsx — PDF-only library (analyses tab removed)

import React, { useState, useMemo } from 'react';
import PageShell from '@/components/PageShell';

type PDF = { name: string; label: string; created_at: string; signedUrl: string | null };

function formatDate(iso: string) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function highlight(text: string, query: string) {
    if (!query.trim()) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    return (
        <>
            {parts.map((p, i) =>
                p.toLowerCase() === query.toLowerCase()
                    ? <mark key={i} style={{ background: 'rgba(0,232,122,0.25)', color: '#00e87a', borderRadius: 2, padding: '0 1px' }}>{p}</mark>
                    : p
            )}
        </>
    );
}

// answers prop kept for API compatibility but not displayed
export default function VaultClient({ pdfs }: { answers?: any[]; pdfs: PDF[] }) {
    const [query, setQuery] = useState('');
    const q = query.trim().toLowerCase();

    const filteredPdfs = useMemo(() =>
        q ? pdfs.filter(p => p.label.toLowerCase().includes(q)) : pdfs,
    [pdfs, q]);

    return (
        <PageShell backHref="/chat" backLabel="Back to chat" maxWidth={800}>

            {/* Page title */}
            <div style={{ marginBottom: 24 }}>
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10,
                    padding: '4px 12px', borderRadius: 999,
                    border: '1px solid rgba(0,232,122,0.2)', background: 'rgba(0,232,122,0.05)',
                    fontSize: '0.7rem', color: '#00e87a', fontWeight: 600,
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#00e87a', display: 'inline-block' }} />
                    Library
                </div>
                <h1>Saved PDFs</h1>
                <p>Your scenario analyses saved as PDF — shared via the Share button in chat.</p>
            </div>

            {/* Search */}
            {pdfs.length > 0 && (
                <div style={{ position: 'relative', maxWidth: 320, marginBottom: 24 }}>
                    <span style={{
                        position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                        fontSize: 13, color: 'rgba(185,208,192,0.35)', pointerEvents: 'none',
                    }}>🔍</span>
                    <input
                        type="text"
                        placeholder="Search PDFs…"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        style={{
                            width: '100%', boxSizing: 'border-box',
                            padding: '8px 32px 8px 30px', borderRadius: 8,
                            border: '1px solid rgba(148,163,184,0.12)',
                            background: 'rgba(255,255,255,0.04)',
                            color: '#e0f0e8', fontSize: '0.85rem',
                            outline: 'none', fontFamily: 'inherit',
                        }}
                    />
                    {query && (
                        <button onClick={() => setQuery('')} style={{
                            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                            background: 'none', border: 'none', color: 'rgba(185,208,192,0.4)',
                            cursor: 'pointer', fontSize: 15, padding: '0 2px', lineHeight: 1,
                        }}>×</button>
                    )}
                </div>
            )}

            {/* PDF list */}
            {pdfs.length === 0 ? (
                <div style={{
                    padding: '48px 24px', borderRadius: 14,
                    border: '1px dashed rgba(148,163,184,0.15)', textAlign: 'center',
                }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: 10 }}>📄</div>
                    <p style={{ color: 'rgba(185,208,192,0.5)', margin: '0 0 16px' }}>
                        No PDFs saved yet. Use the <strong style={{ color: 'rgba(0,232,122,0.7)' }}>Share</strong> button in chat and choose <strong style={{ color: 'rgba(0,232,122,0.7)' }}>Save PDF</strong>.
                    </p>
                    <a href="/chat" style={{
                        display: 'inline-block', padding: '8px 20px', borderRadius: 999,
                        background: '#00e87a', color: '#080c12',
                        textDecoration: 'none', fontSize: '0.82rem', fontWeight: 700,
                    }}>
                        Go to chat →
                    </a>
                </div>
            ) : filteredPdfs.length === 0 ? (
                <p style={{ color: 'rgba(185,208,192,0.4)', fontSize: '0.88rem' }}>
                    No PDFs match &ldquo;<strong style={{ color: 'rgba(224,240,232,0.6)' }}>{query}</strong>&rdquo;
                </p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {filteredPdfs.map(pdf => (
                        <div key={pdf.name} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '12px 16px', borderRadius: 10,
                            border: '1px solid rgba(148,163,184,0.1)',
                            background: 'rgba(255,255,255,0.025)', gap: 12,
                        }}>
                            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#e0f0e8', marginBottom: 2 }}>
                                    {highlight(pdf.label, query)}
                                </div>
                                {pdf.created_at && (
                                    <div style={{ fontSize: '0.72rem', color: 'rgba(185,208,192,0.4)' }}>
                                        {formatDate(pdf.created_at)}
                                    </div>
                                )}
                            </div>
                            {pdf.signedUrl ? (
                                <a href={pdf.signedUrl} target="_blank" rel="noopener noreferrer" style={{
                                    flexShrink: 0, fontSize: '0.75rem', fontWeight: 600,
                                    padding: '5px 12px', borderRadius: 999,
                                    border: '1px solid rgba(0,232,122,0.3)',
                                    background: 'rgba(0,232,122,0.06)',
                                    color: '#00e87a', textDecoration: 'none', whiteSpace: 'nowrap',
                                }}>
                                    ↓ Download
                                </a>
                            ) : (
                                <span style={{ fontSize: '0.72rem', color: 'rgba(185,208,192,0.3)' }}>Expired</span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </PageShell>
    );
}
