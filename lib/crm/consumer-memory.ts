// lib/crm/consumer-memory.ts
// Personal memory (consumer_activity) + shared knowledge (live rate data)
// combined into one short natural-language summary. Powers the My Home
// "welcome back" card and consumer-mode chat context.
//
// See PLATFORM_INTELLIGENCE_VISION.md "Personal memory vs. shared knowledge" —
// personalization comes from combining a person's own recent activity with a
// shared-knowledge signal (here: today's rate), not from either layer alone.
//
// Window: last 30 days, capped at the 5 most recent events within that
// window. Deliberately does NOT reach further back to fill the cap — fewer
// than 5 is fine; this is continuity, not a log.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getFredSnapshot } from '@/lib/fred';
import { callClaudeJson } from '@/ai-providers/claude';

const WINDOW_DAYS = 30;
const MAX_EVENTS = 5;

export interface ConsumerActivityEvent {
    id:         string;
    event_type: string;
    subject:    string;
    key_facts:  Record<string, unknown>[];
    created_at: string;
}

export interface ConsumerMemorySummary {
    hasActivity: boolean;
    events:      ConsumerActivityEvent[];
    /** Ready-to-display or ready-to-inject natural-language summary. Empty if no activity. */
    summaryText: string;
}

export async function getRecentConsumerActivity(
    sb: SupabaseClient,
    consumerUserId: string,
): Promise<ConsumerActivityEvent[]> {
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await sb
        .from('consumer_activity')
        .select('id, event_type, subject, key_facts, created_at')
        .eq('consumer_user_id', consumerUserId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(MAX_EVENTS);
    return (data as ConsumerActivityEvent[] | null) ?? [];
}

function relativeDay(iso: string): string {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 14) return 'last week';
    return `${Math.floor(days / 7)} weeks ago`;
}

function describeEvent(e: ConsumerActivityEvent): string {
    const fact = Array.isArray(e.key_facts) ? e.key_facts[0] : null;
    const when = relativeDay(e.created_at);

    switch (e.event_type) {
        case 'affordability_run': {
            const f = fact as { loan_type?: string; purchase_price?: number; monthly_piti?: number } | null;
            if (!f?.purchase_price) return `${when}, ${e.subject}`;
            return `${when}, you ran a ${String(f.loan_type ?? '').toUpperCase()} scenario at $${Math.round(f.purchase_price / 1000)}k (about $${f.monthly_piti ?? '?'}/mo)`;
        }
        case 'property_viewed': {
            const f = fact as { address?: string } | null;
            return `${when}, you looked at ${f?.address ?? 'a property'}`;
        }
        case 'ami_result':
        case 'ami_run': {
            const f = fact as { county?: string; state?: string; home_possible?: boolean; home_ready?: boolean } | null;
            const loc = f ? [f.county, f.state].filter(Boolean).join(', ') : '';
            const elig = f?.home_possible || f?.home_ready
                ? ' — you may qualify for down payment assistance there'
                : '';
            return `${when}, you checked down payment assistance eligibility${loc ? ` in ${loc}` : ''}${elig}`;
        }
        case 'rate_engine_run': {
            const f = fact as { loan_type?: string; loan_amount?: number; rate_equivalent?: number } | null;
            if (!f?.loan_amount) return `${when}, ${e.subject}`;
            const rate = typeof f.rate_equivalent === 'number' ? f.rate_equivalent.toFixed(3) : '?';
            return `${when}, you ran the rate engine on a ${String(f.loan_type ?? '').toUpperCase()} loan for $${Math.round(f.loan_amount / 1000)}k at ${rate}%`;
        }
        default:
            return `${when}, ${e.subject}`;
    }
}

// ── Claude synthesis ──────────────────────────────────────────────────────
// The deterministic template above (describeEvent + join) is the guaranteed
// fallback. When available, we hand the same underlying facts to Claude to
// write ONE natural, warm welcome-back line instead of a mechanical
// concatenation — the way Claude or ChatGPT greets a returning user: notices
// the pattern, doesn't repeat itself, and offers a grounded next step.
//
// Never blocks or breaks personalization: any failure (no API key, timeout,
// bad response) falls straight back to the deterministic summary.

const SYNTH_TIMEOUT_MS = 4500;

// In-memory cache — same lifetime/shape as the FRED snapshot cache. Keyed by
// user + the newest event id, so it naturally invalidates the moment a new
// event lands, without needing a DB column or explicit invalidation call.
const _synthCache = new Map<string, { text: string; at: number }>();
const SYNTH_CACHE_TTL_MS = 10 * 60 * 1000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        p,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('synthesis timeout')), ms)),
    ]);
}

async function synthesizeWelcomeBack(
    consumerUserId: string,
    events: ConsumerActivityEvent[],
    marketLine: string,
): Promise<string | null> {
    const cacheKey = `${consumerUserId}:${events[0]?.id ?? ''}`;
    const cached = _synthCache.get(cacheKey);
    if (cached && Date.now() - cached.at < SYNTH_CACHE_TTL_MS) {
        console.log('[consumer-memory] serving cached synthesis', cacheKey);
        return cached.text;
    }

    if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('[consumer-memory] ANTHROPIC_API_KEY not set — using template fallback');
        return null;
    }

    const factLines = events.map(describeEvent).join('\n');

    const systemPrompt = `You are HomeRates.ai, warmly welcoming back a returning user based on their own recent activity on the platform.

Write ONE short welcome-back message (2-3 sentences, under 45 words) that:
- Synthesizes the activity below into a natural narrative — if they explored several similar scenarios, notice the pattern instead of listing each one
- Mentions today's rate only if it's genuinely relevant (e.g. it moved, or they were rate-sensitive)
- Ends with one grounded, low-pressure suggestion for what to do next — based only on what they actually did, never generic
- Tone: warm, calm, precise — a competent assistant who remembers you, not a marketer
- Never invent facts, numbers, or activity beyond what's listed below

Return ONLY valid JSON: {"message": "..."}`;

    const userMessage = `RECENT ACTIVITY (most recent first):\n${factLines}${marketLine ? `\n\n${marketLine}` : ''}`;

    try {
        const { parsed } = await withTimeout(
            callClaudeJson(systemPrompt, userMessage, 200, 0),
            SYNTH_TIMEOUT_MS,
        );
        const message = typeof parsed?.message === 'string' ? parsed.message.trim() : null;
        if (!message) {
            console.warn('[consumer-memory] Claude returned no usable message field', parsed);
            return null;
        }

        console.log('[consumer-memory] synthesis succeeded', cacheKey);
        _synthCache.set(cacheKey, { text: message, at: Date.now() });
        return message;
    } catch (err) {
        console.warn('[consumer-memory] Claude synthesis failed, using template fallback', (err as Error)?.message ?? err);
        return null;
    }
}

export async function buildConsumerMemorySummary(
    sb: SupabaseClient,
    consumerUserId: string,
): Promise<ConsumerMemorySummary> {
    const events = await getRecentConsumerActivity(sb, consumerUserId);
    if (!events.length) {
        return { hasActivity: false, events: [], summaryText: '' };
    }

    let marketLine = '';
    try {
        const fred = await getFredSnapshot({ timeoutMs: 2500 });
        if (fred?.mort30Avg) {
            marketLine = `Today's average 30-year rate is ${fred.mort30Avg.toFixed(2)}%.`;
        }
    } catch {
        // Market line is a nice-to-have — never block personalization on it.
    }

    const synthesized = await synthesizeWelcomeBack(consumerUserId, events, marketLine);
    const summaryText = synthesized
        ?? [`${events.map(describeEvent).join('. ')}.`, marketLine].filter(Boolean).join(' ');

    return { hasActivity: true, events, summaryText };
}
