'use client';
// app/library/VaultClient.tsx — searchable vault UI inside PageShell

import React, { useState, useMemo } from 'react';
import PageShell from '../components/PageShell';

type Answer = { id: string; created_at: string; question: string; answerText: string };
type PDF    = { name: string; label: string; created_at: string; signedUrl: string | null };

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

export default function VaultClient({ answers, pdfs }: { answers: Answer[]; pdfs: PDF[] }) {
    const [query, setQuery] = useState('');
    const q = query.trim().toLowerCase();

    const filteredAnswers = useMemo(() =>
        q ? answers.filter(a =>
            a.question.toLowerCase().includes(q) ||
            a.answerText.toLowerCase().includes(q)
        ) : answers,
    [answers, q]);

    const filteredPdfs = useMemo(() =>
        q ? pdfs.filter(p => p.label.toLowerCase().includes(q)) : pdfs,
    [pdfs, q]);

    const empty = filteredAnswers.length === 0 && filteredPdfs.length === 0;

    return (
        <PageShell backHref="/chat" backLabel="Back to chat" maxWidth={800}>

            {/* Page title */}
            <div style={{ marginBottom: 28 }}>
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10,
                    padding: '4px 12px', borderRadius: 999,
                    border: '1px solid rgba(0,232,122,0.2)', background: 'rgba(0,232,122,0.05)',
                    fontSize: '0.7rem', color: '#00e87a', fontWeight: 600,
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#00e87a', display: 'inline-block' }} />
                    My Vault
                </div>
                <h1>Saved Analyses</h1>
                <p>Your mortgage analyses and downloaded PDFs, saved from the chat.</p>
            </div>

            {/* Search bar */}
            {(answers.length > 0 || pdfs.length > 0) && (
                <div style={{ marginBottom: 28, position: 'relative' }}>
                    <span style={{
                        position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                        fontSize: 14, color: 'rgba(160,192,168,0.4)', pointerEvents: 'none',
                    }}>🔍</span>
                    <input
                        type="text"
                        placeholder="Search your vault…"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        style={{
                            width: '100%', boxSizing: 'border-box',
                            padding: '10px 14px 10px 36px',
                            borderRadius: 10,
                            border: '1px solid rgba(148,163,184,0.15)',
                            background: 'rgba(255,255,255,0.04)',
                            color: '#e0f0e8',
                            fontSize: '0.9rem',
                            outline: 'none',
                            fontFamily: 'inherit',
                        }}
                    />
                    {query && (
                        <button onClick={() => setQuery('')} style={{
                            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                            background: 'none', border: 'none', color: 'rgba(160,192,168,0.4)',
                            cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1,
                        }}>×</button>
                    )}
                </div>
            )}

            {/* PDF Documents */}
            {filteredPdfs.length > 0 && (
                <section style={{ marginBottom: 36 }}>
                    <h2 style={{
                        margin: '0 0 12px', fontSize: '0.72rem', fontWeight: 700,
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                        color: 'rgba(0,232,122,0.5)',
                    }}>
                        PDF Documents — {filteredPdfs.length}
                    </h2>
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
                                        <div style={{ fontSize: '0.72rem', color: 'rgba(160,192,168,0.4)' }}>
                                            {formatDate(pdf.created_at)}
                                        </div>
                                    )}
                                </div>
                                {pdf.signedUrl ? (
                                    <a
                                        href={pdf.signedUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            flexShrink: 0, fontSize: '0.75rem', fontWeight: 600,
                                            padding: '5px 12px', borderRadius: 999,
                                            border: '1px solid rgba(0,232,122,0.3)',
                                            background: 'rgba(0,232,122,0.06)',
                                            color: '#00e87a', textDecoration: 'none', whiteSpace: 'nowrap',
                                        }}
                                    >
                                        ↓ Download
                                    </a>
                                ) : (
                                    <span style={{ fontSize: '0.72rem', color: 'rgba(160,192,168,0.3)' }}>Expired</span>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Saved Q&A */}
            <section>
                <h2 style={{
                    margin: '0 0 12px', fontSize: '0.72rem', fontWeight: 700,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: 'rgba(0,232,122,0.5)',
                }}>
                    Saved Analyses — {filteredAnswers.length}
                </h2>

                {empty && answers.length === 0 && pdfs.length === 0 ? (
                    <div style={{
                        padding: '40px 24px', borderRadius: 14,
                        border: '1px dashed rgba(148,163,184,0.15)', textAlign: 'center',
                    }}>
                        <div style={{ fontSize: '1.5rem', marginBottom: 10 }}>✦</div>
                        <p style={{ color: 'rgba(160,192,168,0.5)', margin: '0 0 16px' }}>
                            Nothing saved yet. Hit <strong style={{ color: 'rgba(0,232,122,0.7)' }}>✦ Save</strong> on any answer in the chat.
                        </p>
                        <a href="/chat" style={{
                            display: 'inline-block', padding: '8px 20px', borderRadius: 999,
                            background: '#00e87a', color: '#080c12',
                            textDecoration: 'none', fontSize: '0.82rem', fontWeight: 700,
                        }}>
                            Go to chat →
                        </a>
                    </div>
                ) : empty && q ? (
                    <p style={{ color: 'rgba(160,192,168,0.4)', fontSize: '0.88rem' }}>
                        No results for "<strong style={{ color: 'rgba(224,240,232,0.6)' }}>{query}</strong>"
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {filteredAnswers.map(entry => (
                            <details key={entry.id} style={{
                                borderRadius: 12,
                                border: '1px solid rgba(148,163,184,0.1)',
                                background: 'rgba(255,255,255,0.025)',
                                overflow: 'hidden',
                            }}>
                                <summary style={{
                                    padding: '14px 16px', cursor: 'pointer',
                                    fontSize: '0.9rem', fontWeight: 600, color: '#e0f0e8',
                                    display: 'flex', alignItems: 'flex-start',
                                    justifyContent: 'space-between', gap: 12,
                                    listStyle: 'none',
                                }}>
                                    <span style={{ flex: '1 1 auto' }}>{highlight(entry.question, query)}</span>
                                    <span style={{ fontSize: '0.7rem', color: 'rgba(160,192,168,0.4)', flexShrink: 0, marginTop: 2 }}>
                                        {formatDate(entry.created_at)}
                                    </span>
                                </summary>
                                <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(148,163,184,0.08)' }}>
                                    <div style={{ marginTop: 12 }}>
                                        <div style={{
                                            fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em',
                                            textTransform: 'uppercase', color: 'rgba(0,232,122,0.5)', marginBottom: 6,
                                        }}>Answer</div>
                                        <div style={{
                                            fontSize: '0.85rem', lineHeight: 1.7,
                                            color: 'rgba(224,240,232,0.8)', whiteSpace: 'pre-wrap',
                                        }}>
                                            {entry.answerText || 'No answer text stored.'}
                                        </div>
                                    </div>
                                </div>
                            </details>
                        ))}
                    </div>
                )}
            </section>
        </PageShell>
    );
}
