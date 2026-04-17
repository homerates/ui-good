// lib/foundingMilestone.ts
// Fires the founding urgency blast when joined count hits 450 or 490.
// Deduped via system_flags — INSERT fails on duplicate key, so only the first caller fires.
// Call non-blocking (fire-and-forget) from waitlist/claim.

import { getSupabase } from './supabaseServer';
import { clerkClient } from '@clerk/nextjs/server';
import { emailFoundingUrgency } from './sendEmail';

const FOUNDING_CAP = 500;
const MILESTONES   = [450, 490];

export async function checkFoundingMilestone(foundingNumber: number): Promise<void> {
  const milestone = MILESTONES.find(m => foundingNumber === m);
  if (!milestone) return;

  const sb = getSupabase();
  if (!sb) return;

  // Atomic dedup: INSERT fails with unique violation if already fired
  const { error } = await sb
    .from('system_flags')
    .insert({ key: `founding_blast_${milestone}`, value: new Date().toISOString() });
  if (error) return; // already fired — skip

  const [{ count: loCount }, { count: agentCount }] = await Promise.all([
    sb.from('loan_officers').select('user_id', { count: 'exact', head: true }),
    sb.from('agents').select('user_id', { count: 'exact', head: true }),
  ]);
  const claimed   = (loCount ?? 0) + (agentCount ?? 0);
  const remaining = Math.max(FOUNDING_CAP - claimed, 0);

  const [{ data: loRows }, { data: agentRows }] = await Promise.all([
    sb.from('loan_officers').select('user_id').eq('is_founding_member', true),
    sb.from('agents').select('user_id').eq('is_founding_member', true),
  ]);

  const userIds = [
    ...(loRows  ?? []).map(r => r.user_id),
    ...(agentRows ?? []).map(r => r.user_id),
  ];
  if (userIds.length === 0) return;

  const clerk = await clerkClient();
  for (let i = 0; i < userIds.length; i += 10) {
    const batch = userIds.slice(i, i + 10);
    await Promise.all(batch.map(async (uid) => {
      try {
        const u          = await clerk.users.getUser(uid);
        const email      = u.emailAddresses[0]?.emailAddress;
        const firstName  = u.firstName ?? null;
        if (!email) return;
        await emailFoundingUrgency({ toEmail: email, firstName, claimed, remaining });
      } catch { /* skip individual failure */ }
    }));
  }

  console.log(`[FoundingMilestone] Blast fired at ${milestone} — sent to ${userIds.length} members, ${remaining} spots left`);
}
