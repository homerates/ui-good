// lib/guidelineRetrieval.ts
// Real RAG retrieval over public.guideline_chunks (migration 074) — official
// Fannie Mae / Freddie Mac / HUD / VA / USDA guideline text, fetched and
// embedded via scripts/ingest-guideline-chunks.mjs. This is additive to the
// existing hand-maintained uwDatabase/getGuidelineContextForQuestion paths in
// app/api/answers/route.ts, not a replacement — if this returns nothing
// (no credentials, no rows, low-similarity match, or an API error), callers
// fall back to exactly today's behavior.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

const supabase =
    SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
        ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
        : null;

const MIN_SIMILARITY = 0.4;

export type GuidelineMatch = {
    sourceLabel: string;
    sectionTitle: string | null;
    url: string;
    chunkText: string;
    similarity: number;
};

async function embedQuestion(question: string): Promise<number[] | null> {
    if (!OPENAI_API_KEY) return null;
    try {
        const res = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
            body: JSON.stringify({ model: 'text-embedding-3-small', input: question }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data?.data?.[0]?.embedding ?? null;
    } catch {
        return null;
    }
}

/**
 * Retrieves the most relevant real guideline passages for a question.
 * Returns [] on any failure (no config, embedding error, DB error, or no
 * match above MIN_SIMILARITY) rather than throwing — this must never break
 * the answer path it's grounding.
 */
export async function retrieveGuidelineChunks(question: string, matchCount = 4): Promise<GuidelineMatch[]> {
    if (!supabase || !question) return [];
    const embedding = await embedQuestion(question);
    if (!embedding) return [];

    try {
        const { data, error } = await supabase.rpc('match_guideline_chunks', {
            query_embedding: embedding,
            match_count: matchCount,
        });
        if (error || !data) return [];
        return (data as any[])
            .filter(row => row.similarity >= MIN_SIMILARITY)
            .map(row => ({
                sourceLabel: row.source_label,
                sectionTitle: row.section_title,
                url: row.url,
                chunkText: row.chunk_text,
                similarity: row.similarity,
            }));
    } catch {
        return [];
    }
}

/** Formats retrieved chunks into prompt-ready context text with citations. */
export function formatGuidelineContext(matches: GuidelineMatch[]): string {
    if (!matches.length) return '';
    return matches
        .map(m => `Source: ${m.sourceLabel}${m.sectionTitle ? ` — ${m.sectionTitle}` : ''} (${m.url})\n${m.chunkText}`)
        .join('\n\n---\n\n');
}
