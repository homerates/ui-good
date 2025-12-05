import * as React from 'react';
import Link from 'next/link';

type SharePageProps = {
    searchParams: {
        q?: string;
        a?: string;
        source?: string;
    };
};

function sanitizeQuestion(raw: string | undefined): string {
    if (!raw) return '';
    // Strip obvious URLs so the share link itself never shows up as the question text
    return raw.replace(/https?:\/\/\S+/g, '').trim();
}

export default function SharePage({ searchParams }: SharePageProps) {
    const rawQuestion = searchParams.q ?? '';
    const rawAnswer = searchParams.a ?? '';

    const question = sanitizeQuestion(rawQuestion) || 'Question asked in HomeRates.ai';
    const answer =
        (rawAnswer || '').trim() ||
        'This shared link did not include an answer body. Please open HomeRates.ai to see the full conversation.';

    return (
        <main
            style={{
                minHeight: '100vh',
                background: '#0f172a',
                padding: '24px 12px',
            }}
        >
            <div
                style={{
                    maxWidth: 840,
                    margin: '0 auto',
                    background: '#0b1220',
                    borderRadius: 24,
                    padding: 1,
                }}
            >
                <div
                    style={{
                        borderRadius: 23,
                        background: '#f8fafc',
                        padding: '24px 20px 20px',
                    }}
                >
                    {/* Header */}
                    <header
                        style={{
                            marginBottom: 20,
                        }}
                    >
                        <div
                            style={{
                                fontSize: '0.75rem',
                                letterSpacing: '0.12em',
                                textTransform: 'uppercase',
                                color: '#64748b',
                                marginBottom: 6,
                            }}
                        >
                            Answer snapshot from
                        </div>
                        <h1
                            style={{
                                fontSize: '1.35rem',
                                fontWeight: 700,
                                color: '#020617',
                                margin: 0,
                            }}
                        >
                            HomeRates.ai Mortgage Coach
                        </h1>
                        <p
                            style={{
                                marginTop: 8,
                                marginBottom: 0,
                                fontSize: '0.9rem',
                                color: '#64748b',
                                maxWidth: 520,
                            }}
                        >
                            This page shows a real question and answer from a HomeRates.ai conversation.
                            Use it to review the advice and, if you like, continue the conversation
                            directly in the app.
                        </p>
                    </header>

                    {/* Borrower question */}
                    <section
                        style={{
                            marginBottom: 16,
                        }}
                    >
                        <div
                            style={{
                                borderRadius: 12,
                                background: '#020617',
                                color: '#f9fafb',
                                padding: '10px 14px',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                                marginBottom: 8,
                            }}
                        >
                            Borrower Question
                        </div>
                        <div
                            style={{
                                borderRadius: 14,
                                background: '#020617',
                                color: '#e5e7eb',
                                padding: '12px 14px',
                                fontSize: '0.9rem',
                            }}
                        >
                            {question}
                        </div>
                    </section>

                    {/* Answer overview with internal scroll */}
                    <section
                        style={{
                            marginBottom: 18,
                        }}
                    >
                        <div
                            style={{
                                borderRadius: 12,
                                background: '#e5e7eb',
                                color: '#020617',
                                padding: '10px 14px',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                                marginBottom: 8,
                            }}
                        >
                            Answer Overview
                        </div>

                        <div
                            style={{
                                borderRadius: 16,
                                background: '#ffffff',
                                padding: '14px 16px',
                                fontSize: '0.9rem',
                                color: '#0f172a',
                                lineHeight: 1.55,
                                maxHeight: 420,
                                overflowY: 'auto',
                                boxShadow: 'inset 0 0 0 1px rgba(15,23,42,0.04)',
                            }}
                        >
                            <div
                                style={{
                                    whiteSpace: 'pre-wrap',
                                    fontFamily:
                                        '-apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", sans-serif',
                                }}
                            >
                                {answer}
                            </div>
                        </div>

                        <div
                            style={{
                                marginTop: 6,
                                fontSize: '0.75rem',
                                color: '#6b7280',
                            }}
                        >
                            This is a read-only snapshot. For live updates, calculators, and follow-up
                            questions, open the original HomeRates.ai conversation.
                        </div>
                    </section>

                    {/* Footer CTA */}
                    <footer
                        style={{
                            borderTop: '1px solid #e5e7eb',
                            marginTop: 10,
                            paddingTop: 12,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                        }}
                    >
                        <div
                            style={{
                                fontSize: '0.75rem',
                                color: '#6b7280',
                            }}
                        >
                            HomeRates.ai gives borrowers and investors a private way to test scenarios,
                            stress test advice, and ask follow-up questions in plain language.
                        </div>

                        <div
                            style={{
                                marginTop: 2,
                            }}
                        >
                            <Link
                                href="/"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '8px 14px',
                                    borderRadius: 999,
                                    border: '1px solid #0f172a',
                                    background: '#0f172a',
                                    color: '#f9fafb',
                                    fontSize: '0.85rem',
                                    fontWeight: 500,
                                    textDecoration: 'none',
                                    gap: 6,
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                Open HomeRates.ai free app
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
                            </Link>
                        </div>

                        <div
                            style={{
                                fontSize: '0.7rem',
                                color: '#9ca3af',
                                marginTop: 4,
                            }}
                        >
                            No login required to browse and ask initial questions.
                        </div>
                    </footer>
                </div>
            </div>
        </main>
    );
}
