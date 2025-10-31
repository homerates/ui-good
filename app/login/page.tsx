'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const router = useRouter();

    // Close on ESC
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') router.back();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [router]);

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-title"
            // Backdrop (same vibe as search)
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.35)',
                display: 'grid',
                placeItems: 'center',
                padding: '24px',
                zIndex: 10000,
            }}
            onClick={(e) => {
                // click outside card closes
                if ((e.target as HTMLElement).getAttribute('data-closable') === 'backdrop') {
                    router.back();
                }
            }}
            data-closable="backdrop"
        >
            {/* Centered card */}
            <div
                style={{
                    width: '100%',
                    maxWidth: 520,
                    borderRadius: 16,
                    border: '1px solid var(--border, #e5e7eb)',
                    background: 'var(--card, #fff)',
                    boxShadow: '0 12px 36px rgba(0,0,0,0.18)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>
                    <h1 id="login-title" className="text-lg font-semibold">Login</h1>
                    <button
                        onClick={() => router.back()}
                        aria-label="Close"
                        className="btn"
                        style={{ padding: '6px 10px' }}
                    >
                        Esc
                    </button>
                </div>

                {/* Body */}
                <form
                    className="space-y-4"
                    style={{ padding: 18 }}
                    onSubmit={(e) => {
                        e.preventDefault();
                        // TODO: wire to your auth flow (NextAuth signIn, or custom /api/auth/login)
                        // await signIn('credentials', { email, password, redirect: true, callbackUrl: '/' });
                    }}
                >
                    <label className="block">
                        <span className="text-sm">Email</span>
                        <input
                            type="email"
                            required
                            className="mt-1 w-full rounded-xl border px-3 py-2"
                            placeholder="you@example.com"
                        />
                    </label>

                    <label className="block">
                        <span className="text-sm">Password</span>
                        <input
                            type="password"
                            required
                            className="mt-1 w-full rounded-xl border px-3 py-2"
                            placeholder="••••••••"
                        />
                    </label>

                    <button type="submit" className="w-full btn">Sign in</button>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                        <Link href="/" className="underline text-sm">Home</Link>
                        <button
                            type="button"
                            onClick={() => router.back()}
                            className="text-sm underline"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
