// ==== CREATE FILE: app/chat/error.tsx (BEGIN) ====
'use client';

import * as React from 'react';

export default function Error(props: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    React.useEffect(() => {
        // Optional: log to your telemetry here
        // console.error(props.error);
    }, [props.error]);

    return (
        <main className="max-w-3xl mx-auto p-4">
            <div className="rounded-xl border p-4 bg-rose-50 text-rose-900">
                <h2 className="text-lg font-semibold">Chat crashed</h2>
                <p className="mt-2 text-sm">
                    {props.error?.message || 'Unknown error'} {props.error?.digest ? `(digest: ${props.error.digest})` : ''}
                </p>
                <button
                    onClick={props.reset}
                    className="mt-3 px-3 py-1.5 rounded-md border bg-white hover:bg-rose-100"
                >
                    Try again
                </button>
            </div>
        </main>
    );
}
// ==== CREATE FILE: app/chat/error.tsx (END) ====
