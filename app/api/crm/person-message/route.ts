// app/api/crm/person-message/route.ts
// Pre-flight gate for messages sent through person-scoped chat (brief page).
//
// POST /api/crm/person-message
// Body: { borrower_id: string, message: string, chat_id: string }
//
// Steps:
//   1. Ownership check (borrower belongs to this LO)
//   2. Decision 7 blocklist check on the raw message
//   3. If blocked: log to compliance_events, return 422
//   4. If clear: fire async Grok extraction → person_activity insert
//   5. Return { ok: true } — client then calls /api/answers for the AI response
//
// COMPLIANCE (COMPLIANCE_DECISIONS.md):
//   Decision 1: Extraction prompt bars income/credit/DTI identifiers.
//   Decision 2: Raw message stored as NoteFact — excluded from generation by construction.
//   Decision 7: Blocklist runs before extraction. Both passes log to compliance_events.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { auth } from '@clerk/nextjs/server';
import type { CrmKeyFact } from '../../../../lib/crm/types';
import { checkFairLendingBlocklist, extractFreeformFields, ClassifierUnavailableError } from '../../../../lib/crm/blocklist';

export const runtime    = 'nodejs';
export const maxDuration = 45;

// ── Extraction ────────────────────────────────────────────────────────────────

type ExtractedFact =
    | { key: 'budget_updated';       from: number;        to: number }
    | { key: 'timeline_updated';     from_months: number; to_months: number }
    | { key: 'concern_raised';       concern: string }
    | { key: 'concern_resolved';     concern: string }
    | { key: 'life_event';           event: string }
    | { key: 'preference_expressed'; preference: string }
    | { key: 'property_of_interest'; address: string }
    | { key: 'competitor_mentioned'; competitor: string };

const EXTRACTION_SYSTEM_PROMPT = `You are an AI assistant that extracts structured facts from loan officer notes about borrowers.

Given a message from a loan officer (from a call relay, chat, or note), extract:
1. A one-sentence "subject" summarising the key update (e.g., "Budget increased to $550K")
2. A "facts" array of structured facts found in the message

Extractable fact types — use exact key names:
- budget_updated:       { "key": "budget_updated", "from": <number>, "to": <number> }
- timeline_updated:     { "key": "timeline_updated", "from_months": <number>, "to_months": <number> }
- concern_raised:       { "key": "concern_raised", "concern": "<string>" }
- concern_resolved:     { "key": "concern_resolved", "concern": "<string>" }
- life_event:           { "key": "life_event", "event": "<string>" }
- preference_expressed: { "key": "preference_expressed", "preference": "<string>" }
- property_of_interest: { "key": "property_of_interest", "address": "<string>" }
- competitor_mentioned: { "key": "competitor_mentioned", "competitor": "<string>" }

Rules:
- Extract only what is clearly stated. Do not infer or fabricate.
- Do NOT extract income amounts, credit scores, or debt ratios under any key name.
- Do NOT extract personal characteristics (age, race, religion, national origin, family status, disability, marital status, sex).
- Return an empty facts array if nothing structured is extractable.
- Return valid JSON only. Output: { "subject": "string", "facts": [...] }`;

function isValidExtractedFact(f: unknown): f is ExtractedFact {
    if (!f || typeof f !== 'object' || !('key' in f)) return false;
    const o = f as Record<string, unknown>;
    switch (o.key) {
        case 'budget_updated':       return typeof o.from === 'number' && typeof o.to === 'number';
        case 'timeline_updated':     return typeof o.from_months === 'number' && typeof o.to_months === 'number';
        case 'concern_raised':
        case 'concern_resolved':     return typeof o.concern === 'string' && (o.concern as string).trim().length > 0;
        case 'life_event':           return typeof o.event === 'string' && (o.event as string).trim().length > 0;
        case 'preference_expressed': return typeof o.preference === 'string' && (o.preference as string).trim().length > 0;
        case 'property_of_interest': return typeof o.address === 'string' && (o.address as string).trim().length > 0;
        case 'competitor_mentioned': return typeof o.competitor === 'string' && (o.competitor as string).trim().length > 0;
        default: return false;
    }
}

async function extractFromMessage(message: string): Promise<{ subject: string; facts: ExtractedFact[] }> {
    const fallbackSubject = message.slice(0, 120).split('\n')[0]?.trim() ?? 'Chat message';
    try {
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.XAI_API_KEY}` },
            body: JSON.stringify({
                model:           'grok-4-1-fast-non-reasoning',
                temperature:     0.1,
                max_tokens:      1200,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
                    { role: 'user',   content: message.slice(0, 8000) },
                ],
            }),
            signal: AbortSignal.timeout(25_000),
        });
        if (!response.ok) throw new Error(`xAI ${response.status}`);
        const json = await response.json();
        const text = (json.choices?.[0]?.message?.content ?? '{}') as string;
        const parsed = JSON.parse(text) as { subject?: string; facts?: unknown[] };
        return {
            subject: typeof parsed.subject === 'string' && parsed.subject.trim()
                ? parsed.subject.trim().slice(0, 200)
                : fallbackSubject,
            facts: Array.isArray(parsed.facts) ? parsed.facts.filter(isValidExtractedFact) : [],
        };
    } catch {
        return { subject: fallbackSubject, facts: [] };
    }
}

// ── DB helper ─────────────────────────────────────────────────────────────────

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
}

const AUTO_SUPERSEDE_KEYS = ['budget_updated', 'timeline_updated'] as const;
type AutoSupersedeKey = typeof AUTO_SUPERSEDE_KEYS[number];

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

    const { borrower_id, message } = body as { borrower_id: string; message: string };

    if (!borrower_id || !message?.trim()) {
        return NextResponse.json({ error: 'borrower_id and message required' }, { status: 400 });
    }

    const supabase = db();

    // Ownership check
    const { data: borrower } = await supabase
        .from('borrowers')
        .select('id, loan_officer_id, agent_id')
        .eq('id', borrower_id)
        .maybeSingle();

    if (!borrower) return NextResponse.json({ error: 'Borrower not found' }, { status: 404 });

    const [loRow, agentRow] = await Promise.all([
        supabase.from('loan_officers').select('id').eq('user_id', userId).maybeSingle(),
        supabase.from('agents').select('id').eq('user_id', userId).maybeSingle(),
    ]);
    const loId    = loRow.data?.id    ?? null;
    const agentId = agentRow.data?.id ?? null;

    if (!(loId && borrower.loan_officer_id === loId) &&
        !(agentId && borrower.agent_id === agentId)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Decision 7: blocklist check on raw message.
    // ClassifierUnavailableError → 503 (fail closed — never pass unclassified content through).
    let rawHit: Awaited<ReturnType<typeof checkFairLendingBlocklist>>;
    try {
        rawHit = await checkFairLendingBlocklist([{ field: 'message', value: message }]);
    } catch (err) {
        if (err instanceof ClassifierUnavailableError) {
            return NextResponse.json({
                error:     'Compliance check temporarily unavailable. Please try again in a moment.',
                retryable: true,
            }, { status: 503 });
        }
        throw err;
    }
    if (rawHit.blocked) {
        supabase.from('compliance_events').insert({
            event_type:       'blocklist_triggered',
            lo_user_id:       userId,
            borrower_id,
            blocked_field:    rawHit.field,
            matched_term:     rawHit.label,
            matched_category: rawHit.category,
            truncated_value:  rawHit.truncatedValue,
        }).then(({ error }) => { if (error) console.error('[D7]', error.message); });
        console.warn(`[D7 BLOCK/person-message] lo=${userId} borrower=${borrower_id} matched="${rawHit.label}" category=${rawHit.category}`);
        return NextResponse.json({
            error: `This message cannot be sent. It contains language that may reference a protected characteristic (${rawHit.category.replace(/_/g, ' ')}). Please rephrase to focus on the borrower's mortgage scenario, timeline, or property preferences.`,
            blocked_field:    rawHit.field,
            matched_category: rawHit.category,
        }, { status: 422 });
    }

    // Async extraction — fire after response is sent so the blocklist decision is immediate
    void (async () => {
        const { subject, facts } = await extractFromMessage(message.trim());

        // Second blocklist pass on extracted freeform strings
        const extractedFields = extractFreeformFields('', facts as CrmKeyFact[]);
        const extractedHit    = await checkFairLendingBlocklist(extractedFields);
        if (extractedHit.blocked) {
            supabase.from('compliance_events').insert({
                event_type:       'blocklist_triggered',
                lo_user_id:       userId,
                borrower_id,
                blocked_field:    `extracted:${extractedHit.field}`,
                matched_term:     extractedHit.label,
                matched_category: extractedHit.category,
                truncated_value:  extractedHit.truncatedValue,
            }).then(({ error }) => { if (error) console.error('[D7]', error.message); });
            console.warn(`[D7 BLOCK/extract] lo=${userId} borrower=${borrower_id} field=${extractedHit.field} matched="${extractedHit.label}"`);
            // Extraction blocked — store raw note only, no structured facts
            await supabase.from('person_activity').insert({
                borrower_id,
                lo_user_id:      userId,
                touchpoint_type: 'in_app_message',
                touchpoint_date: new Date().toISOString(),
                subject:         message.slice(0, 120).split('\n')[0]?.trim() ?? 'Chat message',
                key_facts:       [{ key: 'note', text: message.trim() }],
                is_superseded:   false,
                superseded_by:   null,
            });
            return;
        }

        const keyFacts: CrmKeyFact[] = [
            { key: 'note', text: message.trim() },
            ...(facts as CrmKeyFact[]),
        ];

        // Auto-supersede prior budget_updated / timeline_updated records
        const incomingAutoKeys = facts
            .map(f => f.key)
            .filter((k): k is AutoSupersedeKey =>
                (AUTO_SUPERSEDE_KEYS as readonly string[]).includes(k),
            );

        let supersededIds: string[] = [];
        if (incomingAutoKeys.length > 0) {
            const { data: priorActive } = await supabase
                .from('person_activity')
                .select('id, key_facts')
                .eq('borrower_id', borrower_id)
                .eq('lo_user_id', userId)
                .eq('is_superseded', false);

            if (priorActive) {
                for (const prior of priorActive) {
                    const pFacts = (prior.key_facts ?? []) as CrmKeyFact[];
                    if (pFacts.some(f => (AUTO_SUPERSEDE_KEYS as readonly string[]).includes(f.key))) {
                        supersededIds.push(prior.id);
                    }
                }
            }
        }

        const { data: inserted } = await supabase
            .from('person_activity')
            .insert({
                borrower_id,
                lo_user_id:      userId,
                touchpoint_type: 'in_app_message',
                touchpoint_date: new Date().toISOString(),
                subject,
                key_facts:       keyFacts,
                is_superseded:   false,
                superseded_by:   null,
            })
            .select('id')
            .single();

        if (inserted && supersededIds.length > 0) {
            await supabase
                .from('person_activity')
                .update({ is_superseded: true, superseded_by: inserted.id })
                .in('id', supersededIds);
        }
    })();

    return NextResponse.json({ ok: true });
}
