// lib/shareLink.ts

export type ShareLinkParams = {
    question: string;
    answer: string;
    source?: string; // e.g. "sms", "email", "thread"
};

export function getAppBaseUrl(): string {
    return process.env.NEXT_PUBLIC_APP_BASE_URL || "https://chat.homerates.ai";
}

/**
 * Legacy share URL: encodes a single Q/A into query params.
 * Keep this for fallback + backwards compatibility.
 */
export function buildAnswerShareUrl(params: ShareLinkParams): string {
    const base = getAppBaseUrl();

    const search = new URLSearchParams();
    search.set("q", params.question || "");
    search.set("a", params.answer || "");
    if (params.source) search.set("source", params.source);

    return `${base}/share?${search.toString()}`;
}
