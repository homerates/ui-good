// app/api/crm/touchpoints/route.ts
// CRM touchpoints API — Sprint 1 (memory engine, no generation, no consent gate).
//
// COMPLIANCE (see COMPLIANCE_DECISIONS.md):
//   Decision 1:  Denylist — income/credit/debt fields are barred at the type level (lib/crm/types.ts).
//                This route accepts key_facts as submitted; the TypeScript discriminated union is the
//                enforcement layer — no additional runtime filter needed for the denylist.
//   Decision 2:  toGenerationTouchpoint() strips NoteFact before any generation context is built.
//                This route does NOT build generation context — it only stores and retrieves.
//   Decision 4:  GLBA row-level restriction — every query filters by lo_user_id = clerk userId.
//                Cross-LO visibility is impossible by construction in this route.
//   Decision 7:  Server-side fair-lending blocklist applied before any write. Freeform string fields
//                (subject, life_event.event, preference_expressed.preference, concern_raised.concern,
//                concern_resolved.concern, note.text) are scanned for protected-characteristic terms.
//                Blocked saves are logged to crm_compliance_events. The UI guidance in brief/page.tsx
//                is the first layer; this is defense in depth.
//
// Endpoints:
//   GET  /api/crm/touchpoints?borrower_id=<id>             — active (non-superseded) touchpoints
//   GET  /api/crm/touchpoints?borrower_id=<id>&all=true    — all touchpoints including superseded
//   POST /api/crm/touchpoints                               — create new touchpoint
//   PATCH /api/crm/touchpoints                              — supersede an existing touchpoint
//                                                             (sets is_superseded only; no content edit → no blocklist needed)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { auth } from '@clerk/nextjs/server';
import type { CrmKeyFact, TouchpointType } from '../../../../lib/crm/types';
import { checkFairLendingBlocklist, extractFreeformFields } from '../../../../lib/crm/blocklist';

// Keys that auto-supersede prior facts of the same key when a new touchpoint is posted.
// When any of these keys appear in the new touchpoint's key_facts, prior non-superseded
// touchpoints for the same borrower that contain a matching key are marked superseded.
const AUTO_SUPERSEDE_KEYS: CrmKeyFact['key'][] = ['budget_updated', 'timeline_updated'];

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const borrowerId = searchParams.get('borrower_id');
    if (!borrowerId) return NextResponse.json({ error: 'borrower_id required' }, { status: 400 });

    const includeAll = searchParams.get('all') === 'true';

    const supabase = db();

    // Decision 4: lo_user_id filter is not optional — every query must include it.
    let query = supabase
        .from('person_activity')
        .select('id, borrower_id, lo_user_id, touchpoint_type, touchpoint_date, subject, key_facts, is_superseded, superseded_by, created_at')
        .eq('borrower_id', borrowerId)
        .eq('lo_user_id', userId)
        .order('touchpoint_date', { ascending: false });

    if (!includeAll) {
        query = query.eq('is_superseded', false);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ touchpoints: data ?? [] });
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

    const { borrower_id, touchpoint_type, touchpoint_date, subject, key_facts } = body as {
        borrower_id:     string;
        touchpoint_type: TouchpointType;
        touchpoint_date: string;
        subject:         string;
        key_facts:       CrmKeyFact[];
    };

    if (!borrower_id || !touchpoint_type || !touchpoint_date || !subject) {
        return NextResponse.json({ error: 'borrower_id, touchpoint_type, touchpoint_date, subject required' }, { status: 400 });
    }

    const supabase = db();

    // Decision 4: confirm the borrower belongs to this LO before writing.
    // Agents use agent_id; LOs use loan_officer_id. We check both since the CRM
    // may be used by either, and lo_user_id tracks the Clerk user_id directly.
    const { data: borrower } = await supabase
        .from('borrowers')
        .select('id, loan_officer_id, agent_id')
        .eq('id', borrower_id)
        .maybeSingle();

    if (!borrower) {
        return NextResponse.json({ error: 'Borrower not found' }, { status: 404 });
    }

    // Verify ownership via either LO or agent profile
    const [loRow, agentRow] = await Promise.all([
        supabase.from('loan_officers').select('id').eq('user_id', userId).maybeSingle(),
        supabase.from('agents').select('id').eq('user_id', userId).maybeSingle(),
    ]);
    const loId    = loRow.data?.id ?? null;
    const agentId = agentRow.data?.id ?? null;

    const ownsViLo    = loId    && borrower.loan_officer_id === loId;
    const ownsViaAgent = agentId && borrower.agent_id       === agentId;

    if (!ownsViLo && !ownsViaAgent) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const facts: CrmKeyFact[] = Array.isArray(key_facts) ? key_facts : [];

    // Decision 7: fair-lending blocklist — run before any write.
    // Checks subject + all freeform key_fact string values against protected-characteristic patterns.
    const blocklistResult = checkFairLendingBlocklist(extractFreeformFields(subject, facts));
    if (blocklistResult.blocked) {
        // Log to crm_compliance_events for audit and blocklist review.
        // Fire-and-forget — don't await, don't let logging failure block the response.
        supabase.from('compliance_events').insert({
            event_type:       'blocklist_triggered',
            lo_user_id:       userId,
            borrower_id:      borrower_id,
            blocked_field:    blocklistResult.field,
            matched_term:     blocklistResult.label,
            matched_category: blocklistResult.category,
            truncated_value:  blocklistResult.truncatedValue,
        }).then(({ error }) => {
            if (error) console.error('[CRM D7] compliance event log failed:', error.message);
        });
        // Also emit to server log so Vercel captures it independently of DB availability.
        console.warn(`[CRM D7 BLOCK] lo=${userId} borrower=${borrower_id} field=${blocklistResult.field} matched="${blocklistResult.label}" category=${blocklistResult.category}`);
        return NextResponse.json({
            error: `This note cannot be saved. The field "${blocklistResult.field}" contains language that may reference a protected characteristic (${blocklistResult.category.replace(/_/g, ' ')}). Please rephrase to focus on the borrower's mortgage scenario, timeline, or property preferences. If this is a private note, use the Note field and avoid referencing protected personal information.`,
            blocked_field:    blocklistResult.field,
            matched_category: blocklistResult.category,
        }, { status: 422 });
    }

    // Auto-supersede: if the new touchpoint contains a budget_updated or timeline_updated
    // fact, mark all prior non-superseded touchpoints for this borrower that also contain
    // that key as superseded. This is the consolidation pattern described in the migration.
    const incomingAutoKeys = facts
        .map(f => f.key)
        .filter((k): k is typeof AUTO_SUPERSEDE_KEYS[number] => AUTO_SUPERSEDE_KEYS.includes(k as typeof AUTO_SUPERSEDE_KEYS[number]));

    let supersededIds: string[] = [];

    if (incomingAutoKeys.length > 0) {
        // Fetch all active touchpoints for this borrower under this LO
        const { data: priorActive } = await supabase
            .from('person_activity')
            .select('id, key_facts')
            .eq('borrower_id', borrower_id)
            .eq('lo_user_id', userId)
            .eq('is_superseded', false);

        if (priorActive) {
            for (const prior of priorActive) {
                const priorFacts = (prior.key_facts ?? []) as CrmKeyFact[];
                const hasMatchingKey = priorFacts.some(f => incomingAutoKeys.includes(f.key as typeof AUTO_SUPERSEDE_KEYS[number]));
                if (hasMatchingKey) {
                    supersededIds.push(prior.id);
                }
            }
        }
    }

    // Insert the new touchpoint first so we have its id for superseded_by
    const { data: inserted, error: insertErr } = await supabase
        .from('person_activity')
        .insert({
            borrower_id,
            lo_user_id:      userId,
            touchpoint_type,
            touchpoint_date,
            subject,
            key_facts:       facts,
            is_superseded:   false,
            superseded_by:   null,
        })
        .select()
        .single();

    if (insertErr || !inserted) {
        return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 });
    }

    // Now mark prior matching touchpoints as superseded, pointing to the new one
    if (supersededIds.length > 0) {
        await supabase
            .from('person_activity')
            .update({ is_superseded: true, superseded_by: inserted.id })
            .in('id', supersededIds);
    }

    return NextResponse.json({ touchpoint: inserted, superseded_count: supersededIds.length }, { status: 201 });
}

// ── PATCH ─────────────────────────────────────────────────────────────────────
// Manual supersede: LO explicitly marks a touchpoint as superseded.
// Body: { id: string, superseded_by?: string }

export async function PATCH(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json().catch(() => null);
    if (!body?.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const supabase = db();

    // Decision 4: lo_user_id filter ensures the LO can only supersede their own rows
    const { data, error } = await supabase
        .from('person_activity')
        .update({
            is_superseded: true,
            superseded_by: body.superseded_by ?? null,
        })
        .eq('id', body.id)
        .eq('lo_user_id', userId)
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 });

    return NextResponse.json({ touchpoint: data });
}
