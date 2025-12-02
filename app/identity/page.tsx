// app/identity/page.tsx
"use client";

import React from "react";

type IdentityResponse = {
    clerk?: {
        userId: string;
        email: string | null;
        firstName: string | null;
        role: string;
        proType: string | null;
    };
    supabase?: {
        loan_officer: any;
        borrower: any;
        professional: any;
    };
    error?: string;
};

export default function IdentityPage() {
    const [data, setData] = React.useState<IdentityResponse | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch("/api/identity");
                const json = await res.json();
                if (!res.ok) {
                    setError(json.error || "Failed to load identity snapshot");
                } else {
                    setData(json);
                }
            } catch (e) {
                console.error(e);
                setError("Unexpected error calling /api/identity");
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-8">
            <div className="w-full max-w-2xl border rounded-xl p-6 shadow-sm bg-white">
                <h1 className="text-xl font-semibold mb-2">
                    User Role & Profile Snapshot
                </h1>
                <p className="text-sm text-gray-600 mb-4">
                    This view shows how the current signed-in user is classified across
                    Clerk and Supabase (borrower, loan officer, professional).
                </p>

                {loading && <p className="text-sm">Loading identity...</p>}

                {error && (
                    <p className="text-sm text-red-600 mb-4">
                        {error}
                    </p>
                )}

                {data && !error && (
                    <div className="space-y-6 text-sm">
                        <section>
                            <h2 className="font-semibold mb-1">Clerk</h2>
                            <pre className="whitespace-pre-wrap break-words bg-gray-50 border rounded-md p-3 text-xs">
                                {JSON.stringify(data.clerk, null, 2)}
                            </pre>
                        </section>

                        <section>
                            <h2 className="font-semibold mb-1">Supabase</h2>
                            <pre className="whitespace-pre-wrap break-words bg-gray-50 border rounded-md p-3 text-xs">
                                {JSON.stringify(data.supabase, null, 2)}
                            </pre>
                        </section>
                    </div>
                )}
            </div>
        </div>
    );
}
