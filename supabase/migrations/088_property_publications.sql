-- 088_property_publications.sql
-- Authoritative Property Intelligence publication registry -- SHADOW MODE.
--
-- NOT APPLIED BY THIS SESSION. Drafted and statically reviewed only, per
-- CLAUDE.md / DEPLOY_WORKFLOW.md: Rayaan applies every migration manually in
-- the Supabase SQL Editor after review. This migration also does not flip
-- any production behavior on its own -- app/property-intelligence/[id]/page.tsx,
-- the sitemap, listIndexEligiblePropertyIds(), and the daily backfill cron
-- are all untouched by this change and keep working exactly as they do
-- today. See lib/propertyPublication.ts for the shadow-mode repository
-- helpers this table backs, and ARCHITECTURE_DECISIONS.md's corresponding
-- entry for the full cutover plan this migration is step one of.
--
-- Additive and safe: creates one new table only, touches no existing
-- table, rewrites no existing row, and (per the RLS policy below) is
-- readable/writable only by the service-role client this repo already uses
-- server-side -- no new client-facing surface is created by this file
-- alone. Rollback, safe at any time before other code depends on this
-- table (i.e. throughout shadow mode): `DROP TABLE IF EXISTS
-- property_publications;` -- nothing else references it yet, so dropping
-- it cannot orphan or corrupt any other table's data.
--
-- WHY THIS TABLE EXISTS, AND WHY IT IS SEPARATE FROM `properties` (real,
-- live finding, not speculative): `properties` is populated by BOTH public/
-- pilot corpus-building activity AND private per-user flows that write into
-- the exact same shared, address-keyed rows with no distinguishing column --
-- confirmed directly: app/api/homeowner/analysis/route.ts (the private "My
-- Home" own-residence wealth tool) upserts into `properties` the same way
-- any public lookup does, and app/api/cron/property-intelligence-publish/
-- route.ts's own header comment states plainly that it anchors a
-- `properties` row from ANY organic user activity (a real user's property
-- lookup or Decision Score run) with no review step, and that "eligibility
-- itself is computed live by listIndexEligiblePropertyIds() ... this job
-- does not decide or persist INDEX/NOINDEX." The one column that would have
-- represented deliberate curation, featured_properties.is_featured ("curated
-- /pinned on discovery pages"), is defined in migration 050 but is never
-- written by any code path in this repository (confirmed by a full-repo
-- search) -- it is dead, not an active mechanism. There is today no
-- explicit, enforceable distinction between "a property that technically
-- meets a data-completeness/listing-status heuristic" and "a property a
-- human deliberately reviewed and approved to represent HomeRates publicly."
-- This table IS that missing distinction, kept entirely separate from
-- `properties` so that: (a) publication approval can never be inferred from
-- property data alone, (b) withdrawing a publication never requires
-- deleting or mutating the underlying property intelligence, and (c) the
-- approval itself carries its own provenance and audit trail rather than
-- being one more denormalized flag bolted onto a table two different
-- privacy-sensitive workflows already write into.

CREATE TABLE IF NOT EXISTS property_publications (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- One publication record per property. ON DELETE CASCADE matches this
  -- repo's existing precedent for a child-of-property record (e.g.
  -- dpa_programs -> marketplace_lenders in migration 059) -- properties
  -- rows are not deleted in normal operation, but if one ever were, an
  -- orphaned publication record would be meaningless.
  property_id         uuid        NOT NULL UNIQUE REFERENCES properties(id) ON DELETE CASCADE,

  -- Unpublished (draft) by default -- publication invariant #1. Nothing
  -- about inserting a row here implies approval; a row can and will exist
  -- in 'draft' state, e.g. once the corpus audit (Phase 3 of this task)
  -- back-fills a draft row for every existing property so the registry has
  -- a complete, queryable picture of the whole corpus from day one.
  publication_status  text        NOT NULL DEFAULT 'draft'
                                  CHECK (publication_status IN ('draft', 'published', 'withdrawn')),

  -- Set only by an admin approval action (app/api/admin/property-publications
  -- route, requireAdmin()-gated) or an explicit, reviewed migration/manifest
  -- -- never by organic user activity, the daily backfill cron, or
  -- listIndexEligiblePropertyIds(). approved_by stores the Clerk user ID
  -- (text, matching lib/adminAuth.ts's isAdminId(userId: string) and
  -- admin_users.clerk_user_id) of the admin who approved it -- never a
  -- session ID, borrower ID, or any other user-identifying value tied to
  -- the person who happened to trigger the underlying property lookup.
  approved_at         timestamptz,
  approved_by         text,
  approval_reason     text,       -- provenance: why/how this was approved

  withdrawn_at        timestamptz,
  withdrawal_reason   text,

  -- Homepage/discovery promotion is a distinct, narrower state layered on
  -- top of publication -- publication invariants #5/#6 (a featured property
  -- must also be published; a withdrawn property cannot remain featured)
  -- are enforced below as a CHECK constraint, not left to application code
  -- alone to remember.
  is_homepage_featured boolean    NOT NULL DEFAULT false,
  featured_at         timestamptz,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT property_publications_featured_requires_published
    CHECK (NOT (is_homepage_featured AND publication_status <> 'published'))
);

CREATE INDEX IF NOT EXISTS property_publications_status_idx
  ON property_publications (publication_status);
CREATE INDEX IF NOT EXISTS property_publications_featured_idx
  ON property_publications (is_homepage_featured)
  WHERE is_homepage_featured = true;

-- RLS -- service-role only, matching the corrected pattern this repo
-- settled on in 082/083/084/087 (not the older unscoped "service_role_all"
-- pattern in 079_aerial_view_cache.sql, which relies on Postgres's
-- PUBLIC-applies-when-no-TO-clause default and is NOT actually restricted
-- to service_role). Deliberately no anon/authenticated SELECT policy yet,
-- even for published rows: nothing in this codebase reads this table today
-- (shadow mode -- see this file's header), every current and near-term
-- reader is trusted server-side code via lib/supabaseServer.ts's service-
-- role client, and adding a public-read policy before there is an actual
-- public-facing reader to justify it would be exposing a new surface for
-- no present benefit. Add a narrowly-scoped "published rows only" SELECT
-- policy for anon/authenticated at the point of the future cutover
-- (app/property-intelligence/[id]/page.tsx switching to read this table),
-- not before.
ALTER TABLE property_publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON property_publications
  FOR ALL TO service_role USING (true) WITH CHECK (true);
