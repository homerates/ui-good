'use client';

import Link from 'next/link';

export default function LoginPage() {
    return (
        <main className="max-w-md mx-auto p-6">
            <h1 className="text-2xl font-semibold mb-4">Login</h1>

            {/* TODO: wire to your auth (NextAuth/credentials/API) */}
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); /* signIn(...) */ }}>
                <label className="block">
                    <span className="text-sm">Email</span>
                    <input type="email" required className="mt-1 w-full rounded-xl border px-3 py-2" />
                </label>
                <label className="block">
                    <span className="text-sm">Password</span>
                    <input type="password" required className="mt-1 w-full rounded-xl border px-3 py-2" />
                </label>
                <button type="submit" className="w-full btn">Sign in</button>
            </form>

            <p className="text-xs text-gray-500 mt-4">
                Don’t have an account? <Link href="/" className="underline">Go home</Link>
            </p>
        </main>
    );
}
