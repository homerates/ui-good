// lib/crm/link-borrower-account.ts
// Sets borrowers.user_id when a consumer's Clerk account can be tied to
// borrower row(s) by verified email.
//
// This is IDENTITY LINKING ONLY — it records "this borrower row corresponds
// to this Clerk account." It does not surface any consumer data to any
// professional. Read-side visibility is governed by COMPLIANCE_DECISIONS.md
// Decision 10 (consumer-initiated share only): the link exists so that when
// a consumer chooses to share an artifact, the platform can resolve which
// professional relationships (borrower rows) they can share into.
//
// Matches ALL borrower rows with the email (a consumer may appear in several
// professionals' books — one row per relationship) and only fills user_id
// where it is currently null. Never overwrites an existing link.

import type { SupabaseClient } from '@supabase/supabase-js';

export async function linkBorrowerAccount(
    sb: SupabaseClient,
    consumerUserId: string,
    email: string,
): Promise<void> {
    const clean = email.trim();
    if (!clean) return;
    try {
        await sb
            .from('borrowers')
            .update({ user_id: consumerUserId })
            .ilike('email', clean)
            .is('user_id', null);
    } catch (err) {
        // Non-fatal — linking retries on the next lifecycle event
        console.error('[link-borrower-account]', (err as Error)?.message ?? err);
    }
}
