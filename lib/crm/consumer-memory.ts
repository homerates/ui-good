// lib/crm/consumer-memory.ts
// Personal memory (consumer_activity) + shared knowledge (live rate data)
// combined into a natural-language summary plus structured continuation data.
// Powers the My Home "Welcome Home" experience and consumer-mode chat context.
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
// Fetch more than we show: repeated identical actions (same property looked
// up three times while debugging, same scenario re-run) are separate rows in
// consumer_activity, and without deduping they fill the whole window with
// "today, you looked at X. today, you looked at X. today, you looked at X."
const FETCH_LIMIT = 25;

export interface ConsumerActivityEvent {
    id:         string;
    event_type: string;
    subject:    string;
    key_facts:  Record<string, unknown>[];
    created_at: string;
}

/** A personalized next action — label/detail for the card, seed for /chat?sq= */
export interface ConsumerNextStep {
    label:  string;
    detail: string;
    seed:   string;
}

/** The most recent thing the user was doing, reconstructed for the hero card. */
export interface ConsumerLastAction {
    event_type: string;
    /** e.g. "Conventional · $1.04M · 20% down" */
    title:  string;
    /** e.g. "~$6,505/mo PITI · yesterday" */
    detail: string;
    /** CTA button text, e.g. "Continue this scenario" */
    ctaLabel: string;
    /** Where the CTA goes — a /chat?sq= seed link or a tool deep link. */
    href: string;
}

export interface ConsumerMemorySummary {
    hasActivity: boolean;
    events:      ConsumerActivityEvent[];
    /** Ready-to-display or ready-to-inject natural-language summary. Empty if no activity. */
    summaryText: string;
    /** 2–3 personalized next actions (Claude-synthesized, heuristic fallback). */
    nextSteps: ConsumerNextStep[];
    /** Hero "pick up where you left off" — deterministic, no AI dependency. */
    lastAction: ConsumerLastAction | null;
}

/** Canonical identity of an event — used to collapse repeats of the same action. */
function eventSignature(e: ConsumerActivityEvent): string {
    const f = (Array.isArray(e.key_facts) ? e.key_facts[0] : null) as Record<string, unknown> | null;
    switch (e.event_type) {
        case 'property_viewed':
            return `pv:${String(f?.address ?? e.subject).toLowerCase().trim()}`;
        case 'affordability_run':
            return `ar:${f?.loan_type}:${f?.purchase_price}:${f?.down_pct}`;
        case 'rate_engine_run':
            return `re:${f?.loan_type}:${f?.loan_amount}:${f?.ltv}`;
        case 'ami_run':
        case 'ami_result':
            return `ami:${String(f?.county ?? '').toLowerCase()}:${f?.state}`;
        default:
            return `${e.event_type}:${e.subject.toLowerCase()}`;
    }
}

export async function getRecentConsumerActivity(
    sb: SupabaseClient,
    consumerUserId: string,
    sinceOverride?: string,
): Promise<ConsumerActivityEvent[]> {
    const since = sinceOverride ?? new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await sb
        .from('consumer_activity')
        .select('id, event_type, subject, key_facts, created_at')
        .eq('consumer_user_id', consumerUserId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(FETCH_LIMIT);

    // Keep the most recent occurrence of each distinct action, cap at MAX_EVENTS.
    const seen = new Set<string>();
    const distinct: ConsumerActivityEvent[] = [];
    for (const e of (data as ConsumerActivityEvent[] | null) ?? []) {
        const sig = eventSignature(e);
        if (seen.has(sig)) continue;
        seen.add(sig);
        distinct.push(e);
        if (distinct.length >= MAX_EVENTS) break;
    }
    return distinct;
}

// ── "Since you were last here" — visit tracking ────────────────────────────
// Deliberately NOT called from buildConsumerMemorySummary itself: that
// function is also called from app/api/answers/route.ts on every chat turn,
// and chatting is not "visiting home" — bumping last_seen_at there would
// reset the marker on every message and break this feature. Only
// app/api/consumer-memory/route.ts's GET handler (the real "opened /activity"
// moment) calls this, then passes the result into buildConsumerMemorySummary.

export interface LastVisitInfo {
    /** null = first-ever visit — no prior row existed. */
    previousLastSeenAt: string | null;
}

export async function readAndBumpLastSeen(
    sb: SupabaseClient,
    consumerUserId: string,
): Promise<LastVisitInfo> {
    const { data } = await sb
        .from('consumer_last_seen')
        .select('last_seen_at')
        .eq('user_id', consumerUserId)
        .maybeSingle();
    const previousLastSeenAt = (data?.last_seen_at as string | undefined) ?? null;

    await sb
        .from('consumer_last_seen')
        .upsert({ user_id: consumerUserId, last_seen_at: new Date().toISOString() });

    return { previousLastSeenAt };
}

interface NewProperty {
    property_address: string;
    created_at: string;
}

async function getPropertiesSince(
    sb: SupabaseClient,
    consumerUserId: string,
    since: string,
): Promise<NewProperty[]> {
    const { data } = await sb
        .from('consumer_homeowner_properties')
        .select('property_address, created_at')
        .eq('user_id', consumerUserId)
        .gte('created_at', since)
        .order('created_at', { ascending: false });
    return (data as NewProperty[] | null) ?? [];
}

function relativeDay(iso: string): string {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 14) return 'last week';
    return `${Math.floor(days / 7)} weeks ago`;
}

function fmtMoney(n: number): string {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
    return `$${Math.round(n / 1000)}k`;
}

function loanLabel(lt: unknown): string {
    const s = String(lt ?? '').toLowerCase();
    if (s === 'fha') return 'FHA';
    if (s === 'va') return 'VA';
    if (s === 'dscr') return 'DSCR';
    if (s === 'jumbo') return 'Jumbo';
    return 'Conventional';
}

function chatSeedHref(seed: string): string {
    return `/chat?sq=${encodeURIComponent(seed)}&from=%2Fmy-home&fromLabel=My+Home`;
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

// ── Last action (hero) ────────────────────────────────────────────────────
// Deterministic — never depends on the AI call, so the hero always renders.
//
// True "resume" of the original chat thread is not possible from here:
// consumer_activity events don't record a chat id, and /chat has no
// URL-parameter route into a stored thread (onSelectHistory is UI-only).
// Instead we reconstruct a start-again-with-these-numbers seed via the
// existing /chat?sq= auto-send mechanism, which regenerates the same card
// stack from the captured facts.

function buildLastAction(events: ConsumerActivityEvent[]): ConsumerLastAction | null {
    const e = events[0];
    if (!e) return null;
    const fact = Array.isArray(e.key_facts) ? e.key_facts[0] : null;
    const when = relativeDay(e.created_at);

    switch (e.event_type) {
        case 'affordability_run': {
            const f = fact as { loan_type?: string; purchase_price?: number; down_pct?: number; monthly_piti?: number } | null;
            if (!f?.purchase_price) break;
            const lt = loanLabel(f.loan_type);
            const seed = `Run a ${lt.toLowerCase()} scenario on a $${Math.round(f.purchase_price).toLocaleString()} home with ${f.down_pct ?? 20}% down`;
            return {
                event_type: e.event_type,
                title:  `${lt} · ${fmtMoney(f.purchase_price)} · ${f.down_pct ?? 20}% down`,
                detail: `${f.monthly_piti ? `~$${Math.round(f.monthly_piti).toLocaleString()}/mo PITI · ` : ''}${when}`,
                ctaLabel: 'Continue this scenario',
                href: chatSeedHref(seed),
            };
        }
        case 'property_viewed': {
            const f = fact as { address?: string } | null;
            if (!f?.address) break;
            return {
                event_type: e.event_type,
                title:  f.address,
                detail: `Property you were looking at · ${when}`,
                ctaLabel: 'Revisit this property',
                href: chatSeedHref(`Run my numbers for ${f.address}`),
            };
        }
        case 'rate_engine_run': {
            const f = fact as { state?: string; loan_type?: string; loan_amount?: number; ltv?: number; rate_equivalent?: number } | null;
            if (!f?.loan_amount) break;
            const ltv = typeof f.ltv === 'number' && f.ltv > 0 && f.ltv <= 100 ? f.ltv : 80;
            const price = Math.round(f.loan_amount / (ltv / 100));
            const downPct = Math.round((100 - ltv) * 10) / 10;
            const p = new URLSearchParams({ price: String(price), downPct: String(downPct) });
            if (f.loan_type) p.set('lt', String(f.loan_type));
            if (f.state)     p.set('st', String(f.state));
            return {
                event_type: e.event_type,
                title:  `Rate decode · ${loanLabel(f.loan_type)} · ${fmtMoney(f.loan_amount)} loan`,
                detail: `${typeof f.rate_equivalent === 'number' ? `Fair rate ${f.rate_equivalent.toFixed(3)}% · ` : ''}${when}`,
                ctaLabel: 'Re-run the rate engine',
                href: `/rate-intelligence-engine?${p.toString()}`,
            };
        }
        case 'ami_result':
        case 'ami_run': {
            const f = fact as { county?: string; state?: string } | null;
            const loc = f ? [f.county, f.state].filter(Boolean).join(', ') : '';
            return {
                event_type: e.event_type,
                title:  `Assistance check${loc ? ` · ${loc}` : ''}`,
                detail: `Down payment assistance eligibility · ${when}`,
                ctaLabel: 'Check another area',
                href: '/ami-qualifier',
            };
        }
    }

    // Unknown/incomplete event — still give the hero something honest.
    return {
        event_type: e.event_type,
        title:  e.subject,
        detail: when,
        ctaLabel: 'Pick up in chat',
        href: chatSeedHref(e.subject),
    };
}

// ── Heuristic next steps (fallback when synthesis is unavailable) ─────────

function buildHeuristicNextSteps(events: ConsumerActivityEvent[]): ConsumerNextStep[] {
    const steps: ConsumerNextStep[] = [];
    const seenTypes = new Set<string>();

    for (const e of events) {
        if (steps.length >= 3 || seenTypes.has(e.event_type)) continue;
        seenTypes.add(e.event_type);
        const fact = Array.isArray(e.key_facts) ? e.key_facts[0] : null;

        if (e.event_type === 'affordability_run') {
            const f = fact as { loan_type?: string; purchase_price?: number; down_pct?: number } | null;
            if (!f?.purchase_price) continue;
            const lt = String(f.loan_type ?? '').toLowerCase();
            const price = Math.round(f.purchase_price);
            const downPct = f.down_pct ?? 20;
            // Loan-type comparisons are only a real decision when both options are
            // available to any qualifying buyer at this price: FHA vs conventional
            // (down-payment/MI tradeoff) and conventional vs jumbo (at the conforming
            // limit boundary). VA and USDA are eligibility-gated, not a preference —
            // a buyer who qualifies for either almost always wins on cost vs
            // conventional, so "VA vs conventional" isn't a real comparison to
            // suggest. DSCR is investment-only with no owner-occupied counterpart.
            if (lt === 'fha') {
                steps.push({
                    label:  'Compare FHA vs conventional',
                    detail: `Same ${fmtMoney(price)} home, different loan structure`,
                    seed:   `Compare FHA 3.5% down vs conventional ${downPct}% down on a $${price.toLocaleString()} home`,
                });
            } else if (lt === 'jumbo' || (lt !== 'va' && lt !== 'usda' && lt !== 'dscr' && price >= 750_000)) {
                steps.push({
                    label:  'Compare conventional vs jumbo',
                    detail: `See if staying conforming saves you money at ${fmtMoney(price)}`,
                    seed:   `Compare staying conforming vs going jumbo on a $${price.toLocaleString()} home`,
                });
            } else if (lt === 'conventional' || lt === '') {
                steps.push({
                    label:  'Compare FHA vs conventional',
                    detail: `Same ${fmtMoney(price)} home, different loan structure`,
                    seed:   `Compare FHA 3.5% down vs conventional ${downPct}% down on a $${price.toLocaleString()} home`,
                });
            } else if (lt === 'va') {
                steps.push({
                    label:  'See your VA funding fee breakdown',
                    detail: 'Full payment breakdown including the funding fee',
                    seed:   `Break down my VA funding fee and monthly payment for a $${price.toLocaleString()} home with ${downPct}% down`,
                });
            } else if (lt === 'usda') {
                steps.push({
                    label:  'See your USDA loan breakdown',
                    detail: 'Full payment breakdown including the guarantee fee',
                    seed:   `Break down my USDA loan payment for a $${price.toLocaleString()} home with ${downPct}% down`,
                });
            }
            // dscr and anything else: no loan-type comparison — falls through to
            // the market-read filler below if nothing else fires for this event.
        } else if (e.event_type === 'property_viewed') {
            const f = fact as { address?: string } | null;
            if (!f?.address) continue;
            const short = f.address.split(',')[0];
            steps.push({
                label:  `Score ${short}`,
                detail: 'Run the full Decision Score on it',
                seed:   `Run my numbers for ${f.address}`,
            });
        } else if (e.event_type === 'rate_engine_run') {
            steps.push({
                label:  'Sanity-check a lender quote',
                detail: 'Compare an actual quote against your fair rate',
                seed:   'I got a rate quote from a lender — help me evaluate whether it\'s fair for my scenario',
            });
        } else if (e.event_type === 'ami_run' || e.event_type === 'ami_result') {
            const f = fact as { county?: string; state?: string } | null;
            steps.push({
                label:  'Explore assistance programs',
                detail: f?.county ? `What's available in ${f.county} County` : 'See what you may qualify for',
                seed:   f?.county
                    ? `What down payment assistance programs are available in ${f.county} County, ${f.state ?? ''}?`
                    : 'What down payment assistance programs might I qualify for?',
            });
        }
    }

    if (steps.length < 2) {
        steps.push({
            label:  'Where do rates stand today?',
            detail: 'Live market read before your next move',
            seed:   'What are mortgage rates doing today?',
        });
    }
    return steps.slice(0, 3);
}

// ── Claude synthesis ──────────────────────────────────────────────────────
// The deterministic template above (describeEvent + join) is the guaranteed
// fallback. When available, we hand the same underlying facts to Claude to
// write ONE natural, warm welcome-back message plus 2-3 personalized next
// steps — one intelligence call powers both the copy and the action cards,
// rather than bolting separate logic onto the page.
//
// Never blocks or breaks personalization: any failure (no API key, timeout,
// bad response) falls straight back to the deterministic summary + heuristics.

// Measured (2026-07-18, 3 runs against api.anthropic.com with the real prompt):
// 4.4s / 5.1s / 5.3s. The previous 4500ms timeout lost that race almost every
// time — synthesis silently fell back to the robotic template in production
// and the Claude-written copy was essentially never shown. 12s gives honest
// headroom; the 10-min cache means the wait is paid at most once per user
// per new-activity window, and the page renders without blocking on it.
const SYNTH_TIMEOUT_MS = 12_000;

interface SynthResult {
    message:   string;
    nextSteps: ConsumerNextStep[];
}

// In-memory cache — same lifetime/shape as the FRED snapshot cache. Keyed by
// user + the newest event id, so it naturally invalidates the moment a new
// event lands, without needing a DB column or explicit invalidation call.
const _synthCache = new Map<string, { result: SynthResult; at: number }>();
const SYNTH_CACHE_TTL_MS = 10 * 60 * 1000;

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        p,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('synthesis timeout')), ms)),
    ]);
}

export function validNextSteps(raw: unknown): ConsumerNextStep[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((s): s is { label: string; detail?: string; seed: string } =>
            !!s && typeof s === 'object'
            && typeof (s as any).label === 'string' && (s as any).label.trim().length > 0
            && typeof (s as any).seed === 'string' && (s as any).seed.trim().length > 0)
        .slice(0, 3)
        .map(s => ({
            label:  s.label.trim().slice(0, 60),
            detail: typeof s.detail === 'string' ? s.detail.trim().slice(0, 90) : '',
            seed:   s.seed.trim().slice(0, 300),
        }));
}

async function synthesizeWelcomeBack(
    consumerUserId: string,
    events: ConsumerActivityEvent[],
    marketLine: string,
    sinceVisitSection: string,
): Promise<SynthResult | null> {
    // Cache key includes whether a since-visit section is present so a fresh
    // visit (or a newly saved property with no consumer_activity event) isn't
    // served stale copy from a cache entry keyed on the same newest event id.
    const cacheKey = `${consumerUserId}:${events[0]?.id ?? ''}:${sinceVisitSection ? 'sv' : 'nosv'}`;
    const cached = _synthCache.get(cacheKey);
    if (cached && Date.now() - cached.at < SYNTH_CACHE_TTL_MS) {
        console.log('[consumer-memory] serving cached synthesis', cacheKey);
        return cached.result;
    }

    if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('[consumer-memory] ANTHROPIC_API_KEY not set — using template fallback');
        return null;
    }

    const factLines = events.map(describeEvent).join('\n');

    const systemPrompt = `You are HomeRates.ai, warmly welcoming back a returning user based on their own recent activity on the platform.

Produce a welcome-back message AND 2-3 suggested next steps.

The message (2-3 sentences, under 45 words):
- Synthesizes the activity below into a natural narrative — if they explored several similar scenarios, notice the pattern instead of listing each one
- Mentions today's rate only if it's genuinely relevant (e.g. it moved, or they were rate-sensitive)
- Tone: warm, calm, precise — a competent assistant who remembers you, not a marketer
- Never invent facts, numbers, or activity beyond what's listed below
- If a "SINCE YOUR LAST VISIT" section is present below, open with that — genuine "since you were here [when]..." framing, naming what's actually new. If that section is absent, do NOT invent a "since you were here" narrative — summarize their recent activity normally instead.

The next steps (2-3 of them), each:
- "label": a short action name, max 6 words, grounded in what they actually did
- "detail": one supporting line, max 12 words, why this follows naturally
- "seed": the full message to send to the mortgage chat assistant to perform that step — self-contained, includes the concrete numbers/addresses from their activity
- Steps must be genuinely distinct from each other and from simply repeating what they already did
- Never write a seed that is a bare market-rates question ("what are rates today", "where are rates") — always tie the seed to their specific numbers, address, or task

LOAN-TYPE COMPARISON RULE — if you notice the user tried more than one loan type, resist the urge to always suggest comparing them. Only propose a loan-type comparison when it is a real decision for a qualifying buyer:
- FHA vs conventional is legitimate (real down-payment/mortgage-insurance tradeoff).
- Conventional vs jumbo is legitimate near or above the conforming loan limit.
- NEVER suggest comparing VA or USDA against anything (conventional, FHA, jumbo, each other). VA and USDA are eligibility-gated (military service / rural-income), not a preference — a buyer who qualifies almost always wins on cost over conventional, so framing it as "which is better" is misleading, not a value-add.
- DSCR is investment-only — never compare it to an owner-occupied loan type.
- If their most recent or most prominent activity used VA, USDA, or DSCR, do not propose any loan-type comparison next step — suggest something else genuinely grounded in their activity instead (a funding-fee/payment breakdown, a different property, assistance programs, a lender-quote sanity check).

Return ONLY valid JSON:
{"message": "...", "next_steps": [{"label": "...", "detail": "...", "seed": "..."}]}`;

    const userMessage = `${sinceVisitSection ? `${sinceVisitSection}\n\n` : ''}RECENT ACTIVITY (most recent first):\n${factLines}${marketLine ? `\n\n${marketLine}` : ''}`;

    try {
        const { parsed } = await withTimeout(
            // 1000 tokens: measured output is 445-520 with thinking disabled —
            // the old 600 cap truncated mid-JSON whenever thinking was active.
            callClaudeJson(systemPrompt, userMessage, 1000, 0),
            SYNTH_TIMEOUT_MS,
        );
        const message = typeof parsed?.message === 'string' ? parsed.message.trim() : null;
        if (!message) {
            console.warn('[consumer-memory] Claude returned no usable message field', parsed);
            return null;
        }

        const result: SynthResult = {
            message,
            // Bad/missing steps don't sink the message — heuristics cover them.
            nextSteps: validNextSteps(parsed?.next_steps),
        };
        console.log('[consumer-memory] synthesis succeeded', cacheKey, `steps=${result.nextSteps.length}`);
        _synthCache.set(cacheKey, { result, at: Date.now() });
        return result;
    } catch (err) {
        console.warn('[consumer-memory] Claude synthesis failed, using template fallback', (err as Error)?.message ?? err);
        return null;
    }
}

export async function buildConsumerMemorySummary(
    sb: SupabaseClient,
    consumerUserId: string,
    opts?: { previousLastSeenAt?: string | null },
): Promise<ConsumerMemorySummary> {
    const events = await getRecentConsumerActivity(sb, consumerUserId);
    if (!events.length) {
        return { hasActivity: false, events: [], summaryText: '', nextSteps: [], lastAction: null };
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

    // "Since you were last here" — only when there's a real prior visit AND
    // genuinely new content since it. Never a "nothing changed" filler.
    let sinceVisitSection = '';
    let sinceVisitOpener = '';
    if (opts?.previousLastSeenAt) {
        const since = opts.previousLastSeenAt;
        const [sinceEvents, sinceProperties] = await Promise.all([
            getRecentConsumerActivity(sb, consumerUserId, since),
            getPropertiesSince(sb, consumerUserId, since),
        ]);
        const lines: string[] = [
            ...sinceEvents.map(describeEvent),
            ...sinceProperties.map(p => `you saved a new property: ${p.property_address}`),
        ];
        if (lines.length) {
            const when = relativeDay(since);
            sinceVisitSection = `SINCE YOUR LAST VISIT (${when}):\n${lines.join('\n')}`;
            sinceVisitOpener = `Since your last visit ${when}, ${lines.map(l => l.charAt(0).toUpperCase() + l.slice(1)).join('. ')}.`;
        }
    }

    const synthesized = await synthesizeWelcomeBack(consumerUserId, events, marketLine, sinceVisitSection);
    // sinceVisitOpener already recaps what's new (which overlaps the general
    // 30-day recap below whenever the last visit was recent, the common
    // case) — show one or the other, never both, to avoid an obviously
    // duplicated-looking fallback message.
    const summaryText = synthesized?.message
        ?? (sinceVisitOpener
            ? [sinceVisitOpener, marketLine].filter(Boolean).join(' ')
            : [
                `${events.map(describeEvent).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('. ')}.`,
                marketLine,
            ].filter(Boolean).join(' '));
    const nextSteps = synthesized?.nextSteps.length
        ? synthesized.nextSteps
        : buildHeuristicNextSteps(events);

    return {
        hasActivity: true,
        events,
        summaryText,
        nextSteps,
        lastAction: buildLastAction(events),
    };
}
