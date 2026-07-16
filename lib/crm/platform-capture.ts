// lib/crm/platform-capture.ts
// Platform Intelligence: auto-capture of consumer platform events.
//
// Writes to consumer_activity — the consumer's OWN activity log, keyed on
// their Clerk user id. No borrower or LO dependency: if the user is signed
// in, the event is captured. Period.
//
// This is deliberately NOT person_activity. person_activity records a specific
// professional relationship (one LO or agent ↔ one borrower row) and carries
// that relationship's privacy wall. Platform events belong to the consumer's
// direct relationship with HomeRates. Whether any professional relationship
// may READ these rows is a separate permission-layer decision enforced on the
// read side — never resolved here.
//
// D7 blocklist: NOT applied — these are structured platform events, not
// free-form human text about protected characteristics.
// D1 denylist: enforced at the TypeScript type level in CrmKeyFact.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrmKeyFact } from './types';

export type ConsumerEventType = 'ami_run' | 'affordability_run' | 'property_viewed';

export async function emitPlatformEvent(
    sb: SupabaseClient,
    consumerUserId: string,
    eventType: ConsumerEventType,
    subject: string,
    facts: CrmKeyFact[],
): Promise<void> {
    try {
        await sb.from('consumer_activity').insert({
            consumer_user_id: consumerUserId,
            event_type:       eventType,
            subject,
            key_facts:        facts,
        });
    } catch (err) {
        // Fire-and-forget — never let capture failures surface to the user
        console.error('[auto-capture]', (err as Error)?.message ?? err);
    }
}
