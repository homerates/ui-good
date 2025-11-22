// ==== REPLACE ENTIRE FILE: app/library/page.tsx ====
// Server component: Library of saved Q&A per Clerk user

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { auth } from '@clerk/nextjs/server';

type UserAnswerRow = {
    id: string;
    clerk_user_id: string;
    question: string;
    answer: any; // stored JSON from Grok (answer / next_step / follow_up)
    created_at: string;
};

/**
 * Safe server-side Supabase client.
 * - Reads SUPABASE_URL / SUPABASE_ANON_KEY first (Vercel + .env.local)
 * - Falls back to NEXT_PUBLIC_* only if needed
 * - Returns null instead of throwing if misconfigured
 */
function getServerSupabase(): SupabaseClient | null {
    const url =
        process.env.SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        '';

    const key =
        process.env.SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        '';

    if (!url || !key) {
        console.warn('[library/page] Supabase not configured (missing URL or ANON KEY)');
        return null;
    }

    return createClient(url, key);
}

export default async function LibraryPage() {
    // 1) Require sign-in via Clerk
    const { userId } = await auth();
    if (!userId) {
        return (
            <main className="p-8">
                <p className="text-sm opacity-80">
                    Please sign in to view your saved mortgage answers.
                </p>
            </main>
        );
    }

    // 2) Supabase client (guarded)
    const supabase = getServerSupabase();
    if (!supabase) {
        return (
            <main className="p-8">
                <p className="text-sm text-red-600">
                    Library is not configured yet. Supabase URL or key is missing on this environment.
                </p>
            </main>
        );
    }

    // 3) Fetch rows for this Clerk user
    const { data, error } = await supabase
        .from('user_answers')
        .select('*')
        .eq('clerk_user_id', userId)
        .order('created_at', { ascending: false }) as {
            data: UserAnswerRow[] | null;
            error: { message: string } | null;
        };

    if (error) {
        console.error('[library/page] Supabase select error:', error);
        return (
            <main className="p-8">
                <p className="text-sm text-red-600">
                    Error loading your library: {error.message}
                </p>
            </main>
        );
    }

    const rows = data ?? [];

    return (
        <main className="p-8 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">Your Mortgage Library</h1>

            {rows.length === 0 ? (
                <p className="text-sm opacity-80">
                    No saved answers yet. Ask a mortgage question in Chat and we&apos;ll start building your library.
                </p>
            ) : (
                <div className="space-y-4">
                    {rows.map((a) => {
                        const ans = a.answer ?? {};
                        const answerText = ans.answer ?? ans.message ?? '';
                        const nextStep = ans.next_step ?? ans.nextStep ?? null;
                        const followUp = ans.follow_up ?? ans.followUp ?? null;

                        return (
                            <details
                                key={a.id}
                                className="border rounded-lg p-4 bg-white shadow-sm"
                            >
                                <summary className="font-semibold text-lg cursor-pointer text-blue-700">
                                    {a.question}
                                </summary>
                                <div className="mt-3 p-4 bg-gray-50 rounded">
                                    <p className="font-medium mb-2">Answer</p>
                                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                                        {answerText || 'No answer payload stored.'}
                                    </p>

                                    {nextStep && (
                                        <>
                                            <p className="font-medium mt-4">Next Step</p>
                                            <p className="text-sm leading-relaxed">{nextStep}</p>
                                        </>
                                    )}

                                    {followUp && (
                                        <>
                                            <p className="font-medium mt-4">Follow Up</p>
                                            <p className="text-sm leading-relaxed">{followUp}</p>
                                        </>
                                    )}

                                    <p className="mt-4 text-xs opacity-60">
                                        Saved at {new Date(a.created_at).toLocaleString()}
                                    </p>
                                </div>
                            </details>
                        );
                    })}
                </div>
            )}
        </main>
    );
}
