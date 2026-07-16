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
// D7 blocklist: NOT applied here — these are structured platform events, not
// free-form human text about protected characteristics.
// D1 denylist: enforced at the TypeScript type level in CrmKeyFact.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrmKeyFact } from './types';

export async function emitPlatformEvent(
    sb: SupabaseClient,
    consumerUserId: string,
    subject: string,
    facts: CrmKeyFact[],
): Promise<void> {
    try {
        // Find all borrower records linked to this consumer
        const { data: borrowers } = await sb
            .from('borrowers')
            .select('id, loan_officer_id, agent_id')
            .eq('user_id', consumerUserId);

        if (!borrowers?.length) return;

        // Resolve the LO's Clerk user_id for each borrower.
        // person_activity.lo_user_id must be the LO's user_id for their queries to find it.
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
