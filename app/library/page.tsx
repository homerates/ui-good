// app/library/page.tsx
// My Vault — saved Q&A answers + downloaded PDFs
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'My Vault',
    description: 'Your saved mortgage analyses and downloaded PDFs.',
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getSupabase() {
    if (!SUPABASE_URL || !SERVICE_KEY) return null;
    return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function labelFromPath(name: string) {
    // e.g. "refi-1714000000000.pdf" → "Refi Analysis"
    const base = name.replace(/\.pdf$/, '').replace(/-\d+$/, '');
    return base.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) + ' Analysis';
}

export default async function VaultPage() {
    const { userId } = await auth();
    if (!userId) redirect('/sign-in?redirect_url=/library');

    const supabase = getSupabase();

    // Fetch saved Q&A (library_events — written by vault save buttons)
    const qaPromise = supabase
        ? supabase
            .from('library_events')
            .select('id, created_at, question, answer, answer_summary, tool_id')
            .eq('clerk_user_id', userId)
            .or('tool_id.is.null,tool_id.neq.library_route')
            .order('created_at', { ascending: false })
            .limit(30)
        : Promise.resolve({ data: null, error: null });

    // Fetch stored PDFs
    const pdfListPromise = supabase
        ? supabase.storage.from('user-vault').list(userId, {
            sortBy: { column: 'created_at', order: 'desc' },
          })
        : Promise.resolve({ data: null, error: null });

    const [{ data: qaRows }, { data: pdfObjects }] = await Promise.all([qaPromise, pdfListPromise]);

    // Generate signed URLs for PDFs
    let pdfs: Array<{ name: string; label: string; created_at: string; signedUrl: string | null }> = [];
    if (supabase && pdfObjects && pdfObjects.length > 0) {
        const paths = pdfObjects.map((o) => `${userId}/${o.name}`);
        const { data: signed } = await supabase.storage.from('user-vault').createSignedUrls(paths, 3600);
        pdfs = pdfObjects.map((o, i) => ({
            name: o.name,
            label: labelFromPath(o.name),
            created_at: o.created_at ?? '',
            signedUrl: signed?.[i]?.signedUrl ?? null,
        }));
    }

    const answers = qaRows ?? [];

    return (
        <div style={{
            minHeight: '100dvh',
            background: '#080c12',
            color: '#e0f0e8',
            fontFamily: "var(--font-dm-sans, 'DM Sans', sans-serif)",
            display: 'flex',
            flexDirection: 'column',
        }}>
            {/* Header */}
            <header style={{
                borderBottom: '1px solid rgba(0,232,122,0.1)',
                background: 'rgba(8,12,18,0.92)',
                backdropFilter: 'blur(12px)',
                padding: '12px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                position: 'sticky',
                top: 0,
                zIndex: 50,
            }}>
                <Link href="/chat" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" style={{ height: 28, width: 'auto' }} />
                </Link>
                <Link href="/chat" style={{
                    fontSize: '0.78rem',
                    color: 'rgba(0,232,122,0.6)',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                }}>
                    ← Back to chat
                </Link>
            </header>

            {/* Body */}
            <main style={{ flex: 1, padding: '40px 16px 80px', maxWidth: 800, margin: '0 auto', width: '100%' }}>

                {/* Page title */}
                <div style={{ marginBottom: 32 }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        marginBottom: 12,
                        padding: '4px 12px',
                        borderRadius: 999,
                        border: '1px solid rgba(0,232,122,0.2)',
                        background: 'rgba(0,232,122,0.05)',
                        fontSize: '0.7rem',
                        color: '#00e87a',
                        fontWeight: 600,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                    }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#00e87a', display: 'inline-block' }} />
                        My Vault
                    </div>
                    <h1 style={{
                        margin: 0,
                        fontSize: 'clamp(1.4rem, 3vw, 1.9rem)',
                        fontWeight: 800,
                        fontFamily: "var(--font-syne, 'Syne', sans-serif)",
                        letterSpacing: '-0.02em',
                        color: '#fff',
                    }}>
                        Saved Analyses
                    </h1>
                    <p style={{ margin: '8px 0 0', fontSize: '0.88rem', color: 'rgba(160,192,168,0.55)' }}>
                        Your mortgage analyses and downloaded PDFs, saved from the chat.
                    </p>
                </div>

                {/* PDF Documents */}
                {pdfs.length > 0 && (
                    <section style={{ marginBottom: 40 }}>
                        <h2 style={{
                            margin: '0 0 14px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            color: 'rgba(0,232,122,0.5)',
                        }}>
                            PDF Documents — {pdfs.length}
                        </h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {pdfs.map((pdf) => (
                                <div key={pdf.name} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '12px 16px',
                                    borderRadius: 10,
                                    border: '1px solid rgba(148,163,184,0.1)',
                                    background: 'rgba(255,255,255,0.025)',
                                    gap: 12,
                                }}>
                                    <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                                        <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#e0f0e8', marginBottom: 2 }}>
                                            {pdf.label}
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
                                            download
                                            style={{
                                                flexShrink: 0,
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                padding: '5px 12px',
                                                borderRadius: 999,
                                                border: '1px solid rgba(0,232,122,0.3)',
                                                background: 'rgba(0,232,122,0.06)',
                                                color: '#00e87a',
                                                textDecoration: 'none',
                                                whiteSpace: 'nowrap',
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
                        margin: '0 0 14px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: 'rgba(0,232,122,0.5)',
                    }}>
                        Saved Analyses — {answers.length}
                    </h2>

                    {answers.length === 0 && pdfs.length === 0 ? (
                        <div style={{
                            padding: '40px 24px',
                            borderRadius: 14,
                            border: '1px dashed rgba(148,163,184,0.15)',
                            textAlign: 'center',
                        }}>
                            <div style={{ fontSize: '1.5rem', marginBottom: 10 }}>✦</div>
                            <p style={{ fontSize: '0.9rem', color: 'rgba(160,192,168,0.5)', margin: 0 }}>
                                Nothing saved yet. Hit <strong style={{ color: 'rgba(0,232,122,0.7)' }}>✦ Save</strong> on any answer in the chat to build your vault.
                            </p>
                            <Link href="/chat" style={{
                                display: 'inline-block',
                                marginTop: 16,
                                padding: '8px 20px',
                                borderRadius: 999,
                                background: '#00e87a',
                                color: '#080c12',
                                textDecoration: 'none',
                                fontSize: '0.82rem',
                                fontWeight: 700,
                            }}>
                                Go to chat →
                            </Link>
                        </div>
                    ) : answers.length === 0 ? (
                        <p style={{ fontSize: '0.85rem', color: 'rgba(160,192,168,0.4)' }}>
                            No saved Q&amp;A yet. Hit <strong style={{ color: 'rgba(0,232,122,0.7)' }}>✦ Save</strong> on any answer in the chat.
                        </p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {answers.map((entry: any) => {
                                const answerText =
                                    typeof entry.answer === 'string'
                                        ? entry.answer
                                        : entry.answer?.answer ?? entry.answer?.message ?? entry.answer_summary ?? '';

                                return (
                                    <details key={entry.id} style={{
                                        borderRadius: 12,
                                        border: '1px solid rgba(148,163,184,0.1)',
                                        background: 'rgba(255,255,255,0.025)',
                                        overflow: 'hidden',
                                    }}>
                                        <summary style={{
                                            padding: '14px 16px',
                                            cursor: 'pointer',
                                            fontSize: '0.9rem',
                                            fontWeight: 600,
                                            color: '#e0f0e8',
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            justifyContent: 'space-between',
                                            gap: 12,
                                            listStyle: 'none',
                                        }}>
                                            <span style={{ flex: '1 1 auto' }}>{entry.question}</span>
                                            <span style={{ fontSize: '0.7rem', color: 'rgba(160,192,168,0.4)', flexShrink: 0, marginTop: 2 }}>
                                                {formatDate(entry.created_at)}
                                            </span>
                                        </summary>
                                        <div style={{
                                            padding: '0 16px 16px',
                                            borderTop: '1px solid rgba(148,163,184,0.08)',
                                        }}>
                                            <div style={{ marginTop: 12 }}>
                                                <div style={{
                                                    fontSize: '0.68rem',
                                                    fontWeight: 700,
                                                    letterSpacing: '0.08em',
                                                    textTransform: 'uppercase',
                                                    color: 'rgba(0,232,122,0.5)',
                                                    marginBottom: 6,
                                                }}>
                                                    Answer
                                                </div>
                                                <div style={{
                                                    fontSize: '0.85rem',
                                                    lineHeight: 1.7,
                                                    color: 'rgba(224,240,232,0.8)',
                                                    whiteSpace: 'pre-wrap',
                                                }}>
                                                    {answerText || 'No answer text stored.'}
                                                </div>
                                            </div>
                                        </div>
                                    </details>
                                );
                            })}
                        </div>
                    )}
                </section>
            </main>

            {/* Footer */}
            <footer style={{
                padding: '12px 20px',
                borderTop: '1px solid rgba(0,232,122,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                flexWrap: 'wrap',
                fontSize: '0.7rem',
                color: 'rgba(160,192,168,0.35)',
            }}>
                <span>HomeRates.ai — independent educational tool, not a mortgage lender.</span>
                <span style={{ opacity: 0.4 }}>•</span>
                <Link href="/disclosures" style={{ color: 'rgba(0,232,122,0.5)', textDecoration: 'none' }}>Terms</Link>
                <span style={{ opacity: 0.4 }}>•</span>
                <Link href="/privacy" style={{ color: 'rgba(0,232,122,0.5)', textDecoration: 'none' }}>Privacy</Link>
            </footer>
        </div>
    );
}
