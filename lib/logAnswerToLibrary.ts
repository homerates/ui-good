// lib/logAnswerToLibrary.ts

/**
 * Fire-and-forget logger to save Q&A into /api/library.
 * - Runs client-side
 * - Requires Clerk sign-in or /api/library will just 401 gracefully
 * - Never throws into the UI; errors are console-only
 */
export async function logAnswerToLibrary(
    question: string,
    answer: unknown
): Promise<void> {
    try {
        await fetch("/api/library", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question, answer }),
        });
    } catch (err) {
        console.error("logAnswerToLibrary error:", err);
    }
}
