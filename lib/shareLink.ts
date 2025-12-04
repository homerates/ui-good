// lib/shareLink.ts

export type ShareLinkParams = {
    question: string;
    answer: string;
    source?: string; // e.g. "sms", "email"
};

export function buildAnswerShareUrl(params: ShareLinkParams): string {
    // If you ever change the domain, just update this env var
    const base =
        process.env.NEXT_PUBLIC_APP_BASE_URL || "https://chat.homerates.ai";

    const search = new URLSearchParams();
    search.set("q", params.question);
    search.set("a", params.answer);
    if (params.source) search.set("source", params.source);

    return `${base}/share?${search.toString()}`;
}
