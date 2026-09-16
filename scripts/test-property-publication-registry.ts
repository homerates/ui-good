// scripts/test-property-publication-registry.ts
//
// Shadow-mode verification for the property_publications registry
// (supabase/migrations/088_property_publications.sql, lib/propertyPublication.ts,
// app/api/admin/property-publications/route.ts). Two kinds of checks:
//
//   A. STATIC checks against the migration/route source text -- these run
//      regardless of whether the migration has been applied to any real
//      database, since this whole task is shadow mode (migration NOT yet
//      applied per CLAUDE.md's manual-review workflow).
//   B. A guarded LIVE check that only confirms whether the table exists yet
//      -- a harmless read, never a write. This script deliberately does NOT
//      insert, update, or delete any row in a real database: doing so
//      would mean writing to the single shared production Supabase project
//      before the migration itself has been reviewed and applied, which
//      this task's guardrails explicitly do not authorize. Once Rayaan
//      applies migration 088 (and optionally the 089 seed), the admin route
//      itself (app/api/admin/property-publications) is the correct place to
//      exercise real approve/withdraw/feature/unfeature transitions by hand
//      or via a follow-up authorized test -- not this script.
//
// Run with: npx tsx scripts/test-property-publication-registry.ts

import fs from 'fs';
import path from 'path';
import { getSupabase } from '../lib/supabaseServer';

type Status = 'PASS' | 'FAIL' | 'SKIP';
const results: { name: string; status: Status; evidence: string }[] = [];
function record(name: string, status: Status, evidence: string) {
  results.push({ name, status, evidence });
  console.log(`[${status}] ${name} -- ${evidence}`);
}

const MIGRATION_PATH = path.resolve(process.cwd(), 'supabase/migrations/088_property_publications.sql');
const ADMIN_ROUTE_PATH = path.resolve(process.cwd(), 'app/api/admin/property-publications/route.ts');
const HELPERS_PATH = path.resolve(process.cwd(), 'lib/propertyPublication.ts');

// Files that produce `properties` rows via organic user activity or
// automated backfill -- none of these may ever reference the new registry,
// per publication invariants #2/#3 ("organic user activity" and "the daily
// backfill cron... cannot create publication approval").
const ORGANIC_WRITE_PATHS = [
  'app/api/homeowner/analysis/route.ts',
  'app/api/property/lookup/route.ts',
  'app/api/property/enrich/route.ts',
  'app/api/cron/property-intelligence-publish/route.ts',
  'app/api/featured-properties/route.ts',
];

async function main() {
  const migrationSrc = fs.readFileSync(MIGRATION_PATH, 'utf-8');
  const adminRouteSrc = fs.readFileSync(ADMIN_ROUTE_PATH, 'utf-8');
  const helpersSrc = fs.readFileSync(HELPERS_PATH, 'utf-8');

  // A1. Draft-by-default (invariant #1).
  record('A1. publication_status defaults to draft',
    /publication_status\s+text\s+NOT NULL\s+DEFAULT 'draft'/.test(migrationSrc) ? 'PASS' : 'FAIL',
    'checked DEFAULT clause on publication_status column');

  // A2. Featured requires published (invariants #5/#6), enforced at the DB level.
  record('A2. DB-level CHECK constraint: featured implies published',
    /CHECK\s*\(NOT\s*\(is_homepage_featured AND publication_status <> 'published'\)\)/.test(migrationSrc) ? 'PASS' : 'FAIL',
    'checked property_publications_featured_requires_published CHECK constraint');

  // A3. Only service_role has any access -- no public/authenticated INSERT or UPDATE policy exists.
  const hasServiceRoleAllPolicy = /CREATE POLICY "service_role_all" ON property_publications\s*\n\s*FOR ALL TO service_role/.test(migrationSrc);
  const hasAnyOtherRolePolicy = /CREATE POLICY[^;]*TO\s+(public|authenticated|anon)/i.test(migrationSrc);
  record('A3. RLS: service_role-only, no public/authenticated/anon policy',
    hasServiceRoleAllPolicy && !hasAnyOtherRolePolicy ? 'PASS' : 'FAIL',
    JSON.stringify({ hasServiceRoleAllPolicy, hasAnyOtherRolePolicy }));

  // A4. No borrower/session/financial identifier columns -- only the
  // approving ADMIN's identifier (approved_by) is present, which is
  // expected and required, not a violation.
  const forbiddenColumnPatterns = [/\bsession_id\b/i, /\bchat_id\b/i, /\bdeal_room_id\b/i, /\bborrower_id\b/i, /\bbuyer_id\b/i, /\bannual_income\b/i, /\bcredit_score\b/i, /\bdti\b/i];
  const foundForbidden = forbiddenColumnPatterns.filter((re) => re.test(migrationSrc)).map((re) => re.source);
  record('A4. No borrower/session/financial identifier columns in the registry',
    foundForbidden.length === 0 ? 'PASS' : 'FAIL',
    JSON.stringify(foundForbidden));

  // A5. Organic/backfill/cron code has no write path to publication approval.
  const offendingFiles: string[] = [];
  for (const rel of ORGANIC_WRITE_PATHS) {
    const full = path.resolve(process.cwd(), rel);
    if (!fs.existsSync(full)) continue;
    const src = fs.readFileSync(full, 'utf-8');
    if (/property_publications/.test(src)) offendingFiles.push(rel);
  }
  record('A5. No organic-activity/backfill-cron file references property_publications',
    offendingFiles.length === 0 ? 'PASS' : 'FAIL',
    JSON.stringify(offendingFiles));

  // A6. The admin mutation route is gated by requireAdmin() on every handler.
  const handlerBlocks = adminRouteSrc.split(/export async function (GET|POST)/).slice(1);
  const handlerCount = handlerBlocks.length / 2;
  const requireAdminCount = (adminRouteSrc.match(/requireAdmin\(\)/g) ?? []).length;
  record('A6. Every exported handler in the admin route calls requireAdmin()',
    requireAdminCount >= handlerCount && handlerCount >= 2 ? 'PASS' : 'FAIL',
    JSON.stringify({ handlerCount, requireAdminCount }));

  // A7. 'approve' requires a non-empty reason; 'withdraw' always clears featured state.
  const withdrawBlockMatch = adminRouteSrc.match(/if \(action === 'withdraw'\) \{([\s\S]*?)\n  \}/);
  const withdrawBlock = withdrawBlockMatch?.[1] ?? '';
  const withdrawClearsFeatured = /is_homepage_featured:\s*false/.test(withdrawBlock) && /featured_at:\s*null/.test(withdrawBlock);
  record("A7. approve requires a reason; withdraw always clears is_homepage_featured/featured_at",
    /reason required to approve/.test(adminRouteSrc) && withdrawClearsFeatured ? 'PASS' : 'FAIL',
    JSON.stringify({ hasReasonGuard: /reason required to approve/.test(adminRouteSrc), withdrawClearsFeatured }));

  // A8. 'feature' rejects a non-published record.
  record("A8. feature rejects a record whose publication_status isn't 'published'",
    /cannot feature a property that is not published/.test(adminRouteSrc) ? 'PASS' : 'FAIL',
    'checked feature-action guard clause');

  // A9. Repository helpers never read/return a user or session identifier.
  const helperForbidden = [/session_id/i, /clerk_user_id.*subject/i, /borrower/i].filter((re) => re.test(helpersSrc));
  record('A9. lib/propertyPublication.ts helpers carry no user/session-identifying fields',
    helperForbidden.length === 0 ? 'PASS' : 'FAIL',
    JSON.stringify(helperForbidden.map((r) => r.source)));

  // A10. listIndexEligiblePropertyIds() and listPublishedPropertyIds() are
  // never treated as interchangeable -- the helpers file's own header must
  // document the distinction (this is a documentation/discipline check, not
  // a runtime one, since nothing wires them together yet).
  record('A10. Helpers file documents listIndexEligiblePropertyIds vs listPublishedPropertyIds distinction',
    /Do not confuse these three functions/.test(helpersSrc) ? 'PASS' : 'FAIL',
    'checked header comment');

  // B1. Homepage files unchanged by this task (git-diff-based, not content-based,
  // since this script doesn't shell out to git -- verified separately in the
  // session's own report via `git status`/`git diff --stat`). Included here as
  // a reminder marker only.
  record('B1. (see final report) homepage files confirmed unchanged via git status/diff', 'SKIP', 'verified via git, not this script');

  // B2. Live check: does property_publications exist yet? Read-only --
  // never a write. Expected to be MISSING right now (shadow mode, migration
  // not yet applied) -- that is a PASS for this task, not a failure.
  //
  // Deliberately NOT using { head: true, count: 'exact' } here -- confirmed
  // directly that a head-only request against a genuinely missing table
  // can come back as { error: null, status: 204 } instead of surfacing
  // PostgREST's real "table not found" error, which would have made this
  // check silently lie. A normal row-returning select surfaces the real
  // PGRST205 error code unambiguously.
  const sb = getSupabase();
  if (!sb) {
    record('B2. property_publications live-existence check', 'SKIP', 'Supabase not configured in this environment');
  } else {
    const { error } = await sb.from('property_publications').select('id').limit(1);
    const tableMissing = error?.code === 'PGRST205' || /could not find the table/i.test(error?.message ?? '');
    if (tableMissing) {
      record('B2. property_publications live-existence check', 'PASS', 'table does not exist yet -- correct for shadow mode, migration not applied');
    } else if (!error) {
      record('B2. property_publications live-existence check', 'PASS', 'table exists (migration already applied) -- live mutation tests are the admin route\'s job, not this script');
    } else {
      record('B2. property_publications live-existence check', 'FAIL', `unexpected error: ${JSON.stringify(error)}`);
    }
  }

  console.log('\n=== FINAL RESULTS ===');
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const skip = results.filter((r) => r.status === 'SKIP').length;
  console.log(`PASS=${pass} FAIL=${fail} SKIP=${skip} TOTAL=${results.length}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
