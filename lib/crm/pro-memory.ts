// lib/crm/pro-memory.ts
// "Welcome Home" intelligence for professionals (LO + RE agent).
//
// ── THE HARD RULE (read before editing) ───────────────────────────────────
// A professional's personalization may be built from exactly three sources:
//   1. Their OWN person_activity entries — conversations they had/logged
//      inside their own relationship threads (Decision 4: always filtered
//      by lo_user_id = their Clerk id).
//   2. Explicit consumer-initiated shares (Decision 10, Option C) — which
//      land in person_activity as ordinary rows once that flow ships.
//   3. Public/shared knowledge (rates) and their own pipeline records
//      (borrowers.status, actual_rate — operational data they entered).
//
// NEVER from consumer_activity or any observation of a client's independent
// platform behavior — no "X has been active", no aggregates, no vague forms.
// Establishing a relationship grants zero behavioral intelligence.
//
// Callers must therefore exclude touchpoint_type='platform_event' rows:
// an abandoned early design (commit 6ce708ac) briefly wrote auto-captured
// platform events into person_activity, and any surviving rows are
// behavioral data, not logged conversations.
//
// Decision 2 note: only touchpoint metadata (type, date, subject) reaches
// synthesis here. key_facts are never selected, so NoteFact text cannot
// leak into the prompt — the exclusion is structural, same as
// toGenerationTouchpoint(). Decision 2 explicitly permits using the subject
// of the last touchpoint in generation context.

import { getFredSnapshot } from '@/lib/fred';
import { callClaudeJson } from '@/ai-providers/claude';
import { validNextSteps, withTimeout, type ConsumerNextStep } from './consumer-memory';

export interface ProRelationship {
    borrower_id: string;
    name:        string;
    status:      string | null;
    /** Days since the professional's own last logged conversation. Null = never. */
    days_since_touch: number | null;
    last_subject: string | null;
    last_type:    string | null;
    /** LO-recorded loan rate (pipeline data) — powers the refi flag. */
    actual_rate:  number | null;
}

export interface ProWelcomeSummary {
    hasRelationships: boolean;
    summaryText: string;
    /** Ordered: own-conversation recency first, never-touched last. */
    relationships: ProRelationship[];
    /** Hero — the relationship with the most recent OWN conversation. Null if none logged yet. */
    lastTouch: ProRelationship | null;
    nextSteps: ConsumerNextStep[];
    marketRate: number | null;
}

const STALE_DAYS = 14;

function firstName(name: string): string {
    return (name ?? '').trim().split(/\s+/)[0] || 'your client';
}

function whenLabel(days: number | null): string {
    if (days === null) return 'no conversation logged yet';
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    return `${Math.floor(days / 7)} week${days >= 14 ? 's' : ''} ago`;
}

// ── Deterministic fallbacks ───────────────────────────────────────────────

function buildFallbackSummary(rels: ProRelationship[], marketRate: number | null, clientWord: string): string {
    const touched = rels.filter(r => r.days_since_touch !== null);
    const stale = touched.filter(r => (r.days_since_touch ?? 0) >= STALE_DAYS);
    const parts: string[] = [];

    if (touched.length) {
        const last = touched[0];
        parts.push(`Your last logged conversation was with ${firstName(last.name)} ${whenLabel(last.days_since_touch)}${last.last_subject ? ` — "${last.last_subject}"` : ''}.`);
    } else {
        parts.push(`You have ${rels.length} ${clientWord}${rels.length === 1 ? '' : 's'} on your book — no conversations logged yet.`);
    }
    if (stale.length) {
        parts.push(`${stale.length} relationship${stale.length === 1 ? ' has' : 's have'} gone ${STALE_DAYS}+ days without a logged conversation.`);
    }
    if (marketRate) {
        parts.push(`Today's average 30-year rate is ${marketRate.toFixed(2)}%.`);
    }
    return parts.join(' ');
}

function buildHeuristicSteps(rels: ProRelationship[], marketRate: number | null): ConsumerNextStep[] {
    const steps: ConsumerNextStep[] = [];

    // Stale-relationship flag — from the ABSENCE of the pro's own activity,
    // never from anything the client did.
    const stale = rels
        .filter(r => r.days_since_touch !== null && r.days_since_touch >= STALE_DAYS)
        .sort((a, b) => (b.days_since_touch ?? 0) - (a.days_since_touch ?? 0))[0];
    if (stale) {
        steps.push({
            label:  `Check in with ${firstName(stale.name)}`,
            detail: `${stale.days_since_touch} days since your last conversation`,
            seed:   `Draft a short, warm check-in message to my client ${firstName(stale.name)} — it's been ${stale.days_since_touch} days since our last conversation${stale.last_subject ? ` (we last talked about "${stale.last_subject}")` : ''}. Keep it low-pressure.`,
        });
    }

    // Refi flag — public market data + a rate the pro themselves put on record.
    if (marketRate) {
        const refi = rels
            .filter(r => r.actual_rate !== null && r.actual_rate >= marketRate + 0.4)
            .sort((a, b) => (b.actual_rate ?? 0) - (a.actual_rate ?? 0))[0];
        if (refi) {
            steps.push({
                label:  `Refi conversation for ${firstName(refi.name)}`,
                detail: `On record at ${refi.actual_rate!.toFixed(2)}% vs ${marketRate.toFixed(2)}% today`,
                seed:   `My client ${firstName(refi.name)} has a loan on record at ${refi.actual_rate!.toFixed(2)}%. Today's average 30-year rate is ${marketRate.toFixed(2)}%. Is a refi conversation worth opening, and how should I frame it without overpromising?`,
            });
        }
    }

    if (steps.length < 3) {
        steps.push({
            label:  "Today's rate talking points",
            detail: 'A client-ready read on the current market',
            seed:   'What should I tell my clients about the current mortgage rate environment? Give me 3 client-ready talking points.',
        });
    }
    return steps.slice(0, 3);
}

// ── Claude synthesis (same pattern as consumer-memory) ────────────────────

// 12s to match consumer-memory: measured Claude latency for this call shape
// is 4.4–5.3s, so the old 4500ms timeout silently forced the deterministic
// fallback in production (see consumer-memory.ts for the measurement note).
const SYNTH_TIMEOUT_MS = 12_000;
const _synthCache = new Map<string, { result: { message: string; nextSteps: ConsumerNextStep[] }; at: number }>();
const SYNTH_CACHE_TTL_MS = 10 * 60 * 1000;

async function synthesizeProWelcome(
    proUserId: string,
    rels: ProRelationship[],
    marketRate: number | null,
    clientWord: string,
): Promise<{ message: string; nextSteps: ConsumerNextStep[] } | null> {
    const newest = rels.find(r => r.days_since_touch !== null);
    const cacheKey = `${proUserId}:${newest?.borrower_id ?? 'none'}:${newest?.days_since_touch ?? 'x'}`;
    const cached = _synthCache.get(cacheKey);
    if (cached && Date.now() - cached.at < SYNTH_CACHE_TTL_MS) return cached.result;

    if (!process.env.ANTHROPIC_API_KEY) return null;

    const lines = rels.slice(0, 8).map(r => {
        const bits = [
            `${firstName(r.name)}`,
            r.status ? `status: ${r.status}` : null,
            r.days_since_touch === null
                ? 'no conversation logged yet'
                : `last conversation ${whenLabel(r.days_since_touch)}${r.last_subject ? ` about "${r.last_subject}"` : ''}`,
            r.actual_rate !== null ? `loan on record at ${r.actual_rate.toFixed(2)}%` : null,
        ].filter(Boolean);
        return `- ${bits.join(' · ')}`;
    }).join('\n');

    const systemPrompt = `You are HomeRates.ai, welcoming back a mortgage/real-estate professional to their ${clientWord} relationship dashboard.

STRICT SOURCE RULE — the ONLY things you know are:
- Conversations the professional themselves logged (dates and subjects below)
- Their own pipeline records (status, a loan rate they entered)
- Today's public market rate
You know NOTHING about what any client does independently on any platform. NEVER say or imply a client "has been active", "has been looking at", "has been running scenarios", or anything suggesting observed behavior — not even vaguely or in aggregate. Frame everything as "you and X last talked", "your conversation with X", "X's file shows".

Produce a welcome-back message AND 2-3 suggested next steps.

The message (2-3 sentences, under 45 words): warm, calm, precise. Notice patterns in THEIR OWN outreach (who they've talked to, who's gone quiet on their side). Mention today's rate only if genuinely relevant to a relationship below.

The next steps (2-3), each:
- "label": short action, max 6 words
- "detail": one line, max 12 words, why it follows from their own records
- "seed": the full self-contained message to send to their AI assistant to do it (include the concrete names/numbers from below)
Steps must come only from the sources above — a follow-up flag means THEY haven't logged a conversation recently, never that the client did or didn't do something.

Return ONLY valid JSON:
{"message": "...", "next_steps": [{"label": "...", "detail": "...", "seed": "..."}]}`;

    const userMessage = `THEIR RELATIONSHIPS (their own records only):\n${lines}${marketRate ? `\n\nToday's average 30-year rate: ${marketRate.toFixed(2)}%.` : ''}`;

    try {
        const { parsed } = await withTimeout(callClaudeJson(systemPrompt, userMessage, 600, 0), SYNTH_TIMEOUT_MS);
        const message = typeof parsed?.message === 'string' ? parsed.message.trim() : null;
        if (!message) return null;
        const result = { message, nextSteps: validNextSteps(parsed?.next_steps) };
        _synthCache.set(cacheKey, { result, at: Date.now() });
        return result;
    } catch (err) {
        console.warn('[pro-memory] synthesis failed, using deterministic fallback', (err as Error)?.message ?? err);
        return null;
    }
}

// ── Assembly ──────────────────────────────────────────────────────────────

export async function buildProWelcome(
    proUserId: string,
    relationships: ProRelationship[],
    role: 'lo' | 'agent',
): Promise<ProWelcomeSummary> {
    if (!relationships.length) {
        return { hasRelationships: false, summaryText: '', relationships: [], lastTouch: null, nextSteps: [], marketRate: null };
    }

    const clientWord = role === 'agent' ? 'client' : 'borrower';

    // Order: own-conversation recency first (most recent → oldest), never-touched last.
    const ordered = [...relationships].sort((a, b) => {
        if (a.days_since_touch === null && b.days_since_touch === null) return 0;
        if (a.days_since_touch === null) return 1;
        if (b.days_since_touch === null) return -1;
        return a.days_since_touch - b.days_since_touch;
    });

    let marketRate: number | null = null;
    try {
        const fred = await getFredSnapshot({ timeoutMs: 2500 });
        marketRate = fred?.mort30Avg ?? null;
    } catch { /* public-data garnish only — never blocks */ }

    const synth = await synthesizeProWelcome(proUserId, ordered, marketRate, clientWord);
    const summaryText = synth?.message ?? buildFallbackSummary(ordered, marketRate, clientWord);
    const nextSteps = synth?.nextSteps.length ? synth.nextSteps : buildHeuristicSteps(ordered, marketRate);

    return {
        hasRelationships: true,
        summaryText,
        relationships: ordered,
        lastTouch: ordered.find(r => r.days_since_touch !== null) ?? null,
        nextSteps,
        marketRate,
    };
}
