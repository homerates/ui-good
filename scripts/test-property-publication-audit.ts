// scripts/test-property-publication-audit.ts
//
// Bounded, read-only corpus audit for the property_publications shadow-mode
// registry (supabase/migrations/088_property_publications.sql). Prints only
// AGGREGATE COUNTS -- never a raw address, property_id, or any user/session
// identifier -- per this task's explicit privacy requirement. If a human
// review list of specific properties is ever needed, that must go through
// an approved private-admin workflow (e.g. a requireAdmin()-gated route),
// not routine build output like this.
//
// This script performs NO writes and does not require
// property_publications to exist yet -- everything it counts comes from
// tables already live today (properties, property_snapshots,
// grok_property_cache, featured_properties), so it's safe to run before
// migration 088 is ever applied. It reuses listIndexEligiblePropertyIds()
// and lifecycleFromStatus() directly from lib/propertyIntelligence.ts
// rather than re-deriving the eligibility/lifecycle logic here.
//
// Run with: node --env-file=.env.local -r tsx/cjs scripts/test-property-publication-audit.ts
// or:       npx tsx scripts/test-property-publication-audit.ts (after `node --env-file=.env.local` exports are already in the shell env)

import { getSupabase } from '../lib/supabaseServer';
import { listIndexEligiblePropertyIds, lifecycleFromStatus } from '../lib/propertyIntelligence';

async function main() {
  const sb = getSupabase();
  if (!sb) {
    console.error('Supabase not configured (missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) -- cannot run audit.');
    process.exit(1);
  }

  // 1. Total properties record count.
  const { count: totalProperties, error: totalErr } = await sb
    .from('properties')
    .select('id', { count: 'exact', head: true });
  if (totalErr) { console.error('Failed to count properties:', totalErr.message); process.exit(1); }

  // 2. Index-eligible count -- reused directly, not re-derived.
  const indexEligible = await listIndexEligiblePropertyIds();

  // 3. Lifecycle status buckets -- reuses the canonical lifecycleFromStatus()
  // mapping so this audit can never silently drift from what
  // listIndexEligiblePropertyIds() itself considers active/pending.
  const { data: statusRows, error: statusErr } = await sb
    .from('properties')
    .select('latest_listing_status');
  if (statusErr) { console.error('Failed to read lifecycle statuses:', statusErr.message); process.exit(1); }

  const lifecycleCounts: Record<string, number> = { active: 0, pending: 0, sold: 0, off_market: 0, unknown: 0 };
  for (const row of statusRows ?? []) {
    const status = lifecycleFromStatus(row.latest_listing_status as string | null);
    lifecycleCounts[status] = (lifecycleCounts[status] ?? 0) + 1;
  }
  const activeOrPending = lifecycleCounts.active + lifecycleCounts.pending;

  // 4. Homeowner-analysis-path attribution -- HONEST FINDING, not a clean
  // count. app/api/homeowner/analysis/route.ts writes
  // enrichment_source='redfin_via_tavily' or 'tavily' when a property's
  // enrichment_source was previously null -- but the SAME literal values
  // are also written by app/api/property/lookup/route.ts and
  // app/api/property/enrich/route.ts (the public/buyer pipelines),
  // confirmed by direct grep across the repo. There is no column in
  // `properties` today that reliably distinguishes "this row's first
  // enrichment came from the private My Home flow" from "...came from a
  // public property lookup." The counts below are therefore reported as a
  // COMBINED ceiling (properties whose enrichment_source is one of the two
  // shared values), explicitly NOT a homeowner-specific count -- reporting
  // it as homeowner-specific would overstate what is actually knowable.
  const { count: sharedSourceCount, error: sharedErr } = await sb
    .from('properties')
    .select('id', { count: 'exact', head: true })
    .in('enrichment_source', ['redfin_via_tavily', 'tavily']);
  if (sharedErr) { console.error('Failed to count shared-enrichment-source properties:', sharedErr.message); process.exit(1); }

  console.log('=== Property Publication Shadow-Mode Corpus Audit ===');
  console.log(`Total properties records:                          ${totalProperties ?? 0}`);
  console.log(`Currently index-eligible (listIndexEligiblePropertyIds): ${indexEligible.length}`);
  console.log(`Lifecycle status breakdown:`);
  console.log(`  active:      ${lifecycleCounts.active}`);
  console.log(`  pending:     ${lifecycleCounts.pending}`);
  console.log(`  sold:        ${lifecycleCounts.sold}`);
  console.log(`  off_market:  ${lifecycleCounts.off_market}`);
  console.log(`  unknown:     ${lifecycleCounts.unknown}`);
  console.log(`Active + pending (the only lifecycle states listIndexEligiblePropertyIds ever indexes): ${activeOrPending}`);
  console.log('');
  console.log('Homeowner-analysis-path attribution (HONEST LIMITATION, not a clean count):');
  console.log(`  Properties whose enrichment_source is 'redfin_via_tavily' or 'tavily'`);
  console.log(`  (the two values app/api/homeowner/analysis/route.ts writes -- but which`);
  console.log(`  are ALSO written by the public property-lookup and enrich routes,`);
  console.log(`  confirmed by direct code read): ${sharedSourceCount ?? 0}`);
  console.log(`  This is a ceiling on "possibly touched by the private My Home flow,"`);
  console.log(`  NOT a homeowner-specific count -- no existing column can separate the two.`);
  console.log('');
  console.log('Under the new property_publications registry (not yet applied to this database):');
  console.log(`  Would be PUBLISHED today:  0  (no admin approval action has ever been taken -- by design, invariant #1/#2/#3)`);
  console.log(`  Would remain DRAFT today:  ${totalProperties ?? 0}  (every existing property, until an admin explicitly approves one)`);
  console.log(`  Cannot be safely classified beyond 'draft' without a human review pass: ${totalProperties ?? 0}`);
  console.log('');
  console.log('No raw address, property_id, or user/session identifier was printed by this audit.');
}

main().catch((e) => { console.error(e); process.exit(1); });
