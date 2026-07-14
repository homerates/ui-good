// app/api/crm/notes/route.ts
// Freeform note → AI extraction → crm_touchpoints insert.
//
// The LO pastes or types raw notes; this route runs AI extraction server-side
// (Grok/JSON, same pattern as /api/borrowers/parse) to pull structured facts
// automatically. The LO never manually categorises anything.
//
// Storage: raw note is stored as NoteFact (excluded from AI generation by
// Decision 2 / CrmGenerationFact). Extracted structured facts are stored as
// the rest of key_facts. touchpoint_type is always 'manual_note'.
//
// COMPLIANCE (see COMPLIANCE_DECISIONS.md):
//   Decision 1:  Extraction prompt explicitly excludes income/credit/DTI fields.
//   Decision 2:  Raw note → NoteFact → excluded from generation by construction.
//   Decision 4:  Ownership check (borrower.loan_officer_id or agent_id) enforced
//                before extraction or write.
//   Decision 7:  Blocklist runs on raw note before extraction and on extracted
//                freeform strings after. Both passes log to crm_compliance_events
//                and return 422 with a clear user-facing error.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { auth } from '@clerk/nextjs/server';
import type { CrmKeyFact } from '../../../../lib/crm/types';
import { checkFairLendingBlocklist, extractFreeformFields } from '../../../../lib/crm/blocklist';

export const runtime    = 'nodejs';
export const maxDuration = 45;

// ── AI extraction ─────────────────────────────────────────────────────────────

// Extractable fact shapes — mirrors CrmKeyFact union minus NoteFact
type ExtractedFact =
    | { key: 'budget_updated';       from: number;        to: number }
    | { key: 'timeline_updated';     from_months: number; to_months: number }
    | { key: 'concern_raised';       concern: string }
    | { key: 'concern_resolved';     concern: string }
    | { key: 'life_event';           event: string }
    | { key: 'preference_expressed'; preference: string }
    | { key: 'property_of_interest'; address: string }
    | { key: 'competitor_mentioned'; competitor: string };

interface ExtractionResult {
    subject: string;
    facts:   ExtractedFact[];
}

const EXTRACTION_SYSTEM_PROMPT = `You are an AI assistant that extracts structured facts from loan officer notes about borrowers.

Given raw notes (from a call, email, or other interaction), extract:
1. A one-sentence "subject" summarising what the note is about (e.g., "Budget increased to $550K after pre-approval discussion")
2. A "facts" array of structured facts found in the note

Extractable fact types — use exact key names:
- budget_updated:       { "key": "budget_updated", "from": <number>, "to": <number> } — purchase price/budget change. Dollar amounts, no $ or commas. E.g., "$550k" → 550000.
- timeline_updated:     { "key": "timeline_updated", "from_months": <number>, "to_months": <number> } — buying timeline change in months.
- concern_raised:       { "key": "concern_raised", "concern": "<string>" } — a financing or transaction concern the borrower expressed.
- concern_resolved:     { "key": "concern_resolved", "concern": "<string>" } — how a concern was addressed or resolved.
- life_event:           { "key": "life_event", "event": "<string>" } — a home-search milestone (e.g., "Listed existing home", "Received job offer"). Do NOT record personal health, family composition, or relationship status.
- preference_expressed: { "key": "preference_expressed", "preference": "<string>" } — a property or loan feature preference the borrower stated.
- property_of_interest: { "key": "property_of_interest", "address": "<string>" } — a specific property address the borrower mentioned.
- competitor_mentioned: { "key": "competitor_mentioned", "competitor": "<string>" } — another lender or broker the borrower mentioned.

Rules:
- Extract only what is clearly stated in the text. Do not infer or fabricate.
- You may extract multiple facts of the same type if distinct instances appear.
- Do NOT extract income amounts, credit scores, or debt ratios under any key name.
- Do NOT extract personal characteristics (age, race, religion, national origin, family status, disability, marital status, sex).
- Return an empty facts array if nothing structured is clearly extractable.
- Return valid JSON only — no markdown, no explanation, no code fences.

Output: { "subject": "string", "facts": [...] }`;

function isValidExtractedFact(f: unknown): f is ExtractedFact {
    if (!f || typeof f !== 'object' || !('key' in f)) return false;
    const o = f as Record<string, unknown>;
    switch (o.key) {
        case 'budget_updated':
            return typeof o.from === 'number' && typeof o.to === 'number';
        case 'timeline_updated':
            return typeof o.from_months === 'number' && typeof o.to_months === 'number';
        case 'concern_raised':
        case 'concern_resolved':
            return typeof o.concern === 'string' && (o.concern as string).trim().length > 0;
        case 'life_event':
            return typeof o.event === 'string' && (o.event as string).trim().length > 0;
        case 'preference_expressed':
            return typeof o.preference === 'string' && (o.preference as string).trim().length > 0;
        case 'property_of_interest':
            return typeof o.address === 'string' && (o.address as string).trim().length > 0;
        case 'competitor_mentioned':
            return typeof o.competitor === 'string' && (o.competitor as string).trim().length > 0;
        default:
            return false;
    }
}

async function extractFromNote(rawNote: string): Promise<ExtractionResult> {
    // Fallback subject: first non-empty line, capped at 120 chars
    const fallbackSubject = rawNote.slice(0, 200).split('\n').find(l => l.trim())?.trim().slice(0, 120) ?? 'Note';

    try {
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
            method:  'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
            },
            body: JSON.stringify({
                model:           'grok-4-1-fast-non-reasoning',
                temperature:     0.1,
                max_tokens:      1200,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
                    { role: 'user',   content: rawNote.slice(0, 8000) },
                ],
            }),
            signal: AbortSignal.timeout(25_000),
        });

        if (!response.ok) throw new Error(`xAI ${response.status}`);

        const json   = await response.json();
        const text   = (json.choices?.[0]?.message?.content ?? '{}') as string;
        const parsed = JSON.parse(text) as Partial<ExtractionResult>;

        return {
            subject: typeof parsed.subject === 'string' && parsed.subject.trim()
                ? parsed.subject.trim().slice(0, 200)
                : fallbackSubject,
            facts: Array.isArray(parsed.facts)
                ? parsed.facts.filter(isValidExtractedFact)
                : [],
        };
    } catch {
        // Extraction failure is non-fatal — raw note is always preserved.
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

    const { borrower_id, raw_note, note_date } = body as {
        borrower_id: string;
        raw_note:    string;
        note_date?:  string;
    };

    if (!borrower_id || !raw_note?.trim()) {
        return NextResponse.json({ error: 'borrower_id and raw_note required' }, { status: 400 });
    }

    const noteDate = note_date ?? new Date().toISOString();
    const supabase = db();

    // Decision 4: verify the borrower belongs to this LO or agent before any processing.
    // Also select user_id so the unified consumer identity is available for future enrichment.
    const { data: borrower } = await supabase
        .from('borrowers')
        .select('id, loan_officer_id, agent_id, user_id')
        .eq('id', borrower_id)
        .maybeSingle();

    if (!borrower) return NextResponse.json({ error: 'Borrower not found' }, { status: 404 });

    const [loRow, agentRow] = await Promise.all([
        supabase.from('loan_officers').select('id').eq('user_id', userId).maybeSingle(),
        supabase.from('agents').select('id').eq('user_id', userId).maybeSingle(),
    ]);
    const loId    = loRow.data?.id    ?? null;
    const agentId = agentRow.data?.id ?? null;

    const ownsViaLo    = loId    && borrower.loan_officer_id === loId;
    const ownsViaAgent = agentId && borrower.agent_id        === agentId;

    if (!ownsViaLo && !ownsViaAgent) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Decision 7: first pass — blocklist check on the raw note text itself.
    const rawHit = checkFairLendingBlocklist([{ field: 'raw_note', value: raw_note }]);
    if (rawHit.blocked) {
        supabase.from('crm_compliance_events').insert({
            event_type:       'blocklist_triggered',
            lo_user_id:       userId,
            borrower_id,
            blocked_field:    rawHit.field,
            matched_term:     rawHit.label,
            matched_category: rawHit.category,
            truncated_value:  rawHit.truncatedValue,
        }).then(({ error }) => { if (error) console.error('[CRM D7]', error.message); });
        console.warn(`[CRM D7 BLOCK/note] lo=${userId} borrower=${borrower_id} matched="${rawHit.label}" category=${rawHit.category}`);
        return NextResponse.json({
            error: `This note cannot be saved. It contains language that may reference a protected characteristic (${rawHit.category.replace(/_/g, ' ')}). Please rephrase to focus on the borrower's mortgage scenario, timeline, or property preferences.`,
            blocked_field:    rawHit.field,
            matched_category: rawHit.category,
        }, { status: 422 });
    }

    // AI extraction — runs after the raw-note blocklist passes.
    const { subject, facts } = await extractFromNote(raw_note);

    // Decision 7: second pass — blocklist check on extracted freeform strings.
    // The extraction prompt instructs the AI to exclude protected-characteristic content,
    // but this is an independent defense-in-depth check.
    const extractedFields = extractFreeformFields('', facts as CrmKeyFact[]);
    const extractedHit    = checkFairLendingBlocklist(extractedFields);
    if (extractedHit.blocked) {
        supabase.from('crm_compliance_events').insert({
            event_type:       'blocklist_triggered',
            lo_user_id:       userId,
            borrower_id,
            blocked_field:    `extracted:${extractedHit.field}`,
            matched_term:     extractedHit.label,
            matched_category: extractedHit.category,
            truncated_value:  extractedHit.truncatedValue,
        }).then(({ error }) => { if (error) console.error('[CRM D7]', error.message); });
        console.warn(`[CRM D7 BLOCK/extract] lo=${userId} borrower=${borrower_id} field=${extractedHit.field} matched="${extractedHit.label}"`);
        return NextResponse.json({
            error: `The note was processed but extracted content triggered a compliance check (${extractedHit.category.replace(/_/g, ' ')}). Please rephrase the relevant section of your note.`,
            blocked_field:    extractedHit.field,
            matched_category: extractedHit.category,
        }, { status: 422 });
    }

    // Build key_facts: raw note as NoteFact (excluded from generation by Decision 2)
    // followed by AI-extracted structured facts.
    const keyFacts: CrmKeyFact[] = [
        { key: 'note', text: raw_note.trim() },
        ...(facts as CrmKeyFact[]),
    ];

    // Auto-supersede prior budget_updated / timeline_updated touchpoints for this borrower.
    const incomingAutoKeys = facts
        .map(f => f.key)
        .filter((k): k is AutoSupersedeKey =>
            (AUTO_SUPERSEDE_KEYS as readonly string[]).includes(k),
        );

    let supersededIds: string[] = [];
    if (incomingAutoKeys.length > 0) {
        const { data: priorActive } = await supabase
            .from('crm_touchpoints')
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

    // Insert — touchpoint_type is always 'manual_note' for LO-entered notes.
    const { data: inserted, error: insertErr } = await supabase
        .from('crm_touchpoints')
        .insert({
            borrower_id,
            lo_user_id:      userId,
            touchpoint_type: 'manual_note',
            touchpoint_date: noteDate,
            subject,
            key_facts:       keyFacts,
            is_superseded:   false,
            superseded_by:   null,
        })
        .select()
        .single();

    if (insertErr || !inserted) {
        return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 });
    }

    if (supersededIds.length > 0) {
        await supabase
            .from('crm_touchpoints')
            .update({ is_superseded: true, superseded_by: inserted.id })
            .in('id', supersededIds);
    }

    return NextResponse.json({
        touchpoint:      inserted,
        extracted_facts: facts,
        superseded_count: supersededIds.length,
    }, { status: 201 });
}
