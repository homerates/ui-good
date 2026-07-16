// lib/crm/platform-capture.ts
// Phase 2: auto-capture of consumer platform events into person_activity.
//
// Called when a consumer (identified by their Clerk userId) completes a
// meaningful platform action: AMI qualifier run, property view, affordability
// scenario. Writes a person_activity row scoped to their linked LO so the LO
// can see it in the brief page.
//
// Skip-silently contract: if the consumer has no borrower record linked to an LO,
// this function returns without writing anything. No error is thrown.
//
// Identity resolution — two-pass:
//   1. Fast path: borrowers WHERE user_id = consumerUserId
//   2. Email fallback: if fast path finds nothing AND consumerEmail is provided,
//      match borrowers WHERE email = consumerEmail (case-insensitive).
//      On match, lazily sets user_id so future fast-path lookups succeed.
//      Needed because borrower/onboard creates rows before the consumer signs up.
//
// D7 blocklist: NOT applied here — these are structured platform events, not
// free-form human text about protected characteristics.
// D1 denylist: enforced at the TypeScript type level in CrmKeyFact.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrmKeyFact } from './types';

export async function emitPlatformEvent(
    sb: SupabaseClient,
    consumerUserId: string,
    consumerEmail: string | null,
    subject: string,
    facts: CrmKeyFact[],
): Promise<void> {
    try {
        // ── Pass 1: fast lookup by user_id ─────────────────────────────────────
        let { data: borrowers } = await sb
            .from('borrowers')
            .select('id, loan_officer_id, agent_id')
            .eq('user_id', consumerUserId);

        // ── Pass 2: email fallback (borrower/onboard never sets user_id) ───────
        if ((!borrowers?.length) && consumerEmail?.trim()) {
            const { data: emailMatches } = await sb
                .from('borrowers')
                .select('id, loan_officer_id, agent_id')
                .ilike('email', consumerEmail.trim())
                .or('loan_officer_id.not.is.null,agent_id.not.is.null');

            if (emailMatches?.length) {
                borrowers = emailMatches;
                // Lazily set user_id so future lookups hit the fast path
                await sb
                    .from('borrowers')
                    .update({ user_id: consumerUserId })
                    .in('id', emailMatches.map(b => b.id))
                    .is('user_id', null);
            }
        }

        if (!borrowers?.length) return;

        // ── Resolve each borrower's LO Clerk user_id ──────────────────────────
        const records: { borrower_id: string; lo_user_id: string }[] = [];

        await Promise.all(borrowers.map(async b => {
            if (b.loan_officer_id) {
                const { data: lo } = await sb
                    .from('loan_officers')
                    .select('user_id')
                    .eq('id', b.loan_officer_id)
                    .maybeSingle();
                if (lo?.user_id) records.push({ borrower_id: b.id, lo_user_id: lo.user_id });
            } else if (b.agent_id) {
                const { data: ag } = await sb
                    .from('agents')
                    .select('user_id')
                    .eq('id', b.agent_id)
                    .maybeSingle();
                if (ag?.user_id) records.push({ borrower_id: b.id, lo_user_id: ag.user_id });
            }
        }));

        if (!records.length) return;

        const now = new Date().toISOString();
        await sb.from('person_activity').insert(
            records.map(r => ({
                ...r,
                touchpoint_type: 'platform_event',
                touchpoint_date: now,
                subject,
                key_facts:     facts,
                is_superseded: false,
                superseded_by: null,
            })),
        );
    } catch (err) {
        // Fire-and-forget — never let capture failures surface to the user
        console.error('[auto-capture]', (err as Error)?.message ?? err);
    }
}
