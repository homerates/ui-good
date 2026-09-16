-- 089_seed_107_oxford_publication.sql
-- Seeds the FIRST reviewed property_publications entry: 107 Oxford #34,
-- Irvine, CA -- the one property in this repository with a genuine,
-- pre-existing human-reviewed provenance (not derived from
-- listIndexEligiblePropertyIds() or any other automated heuristic).
--
-- NOT APPLIED BY THIS SESSION. Run manually in the Supabase SQL Editor,
-- AFTER 088_property_publications.sql, and only once you've independently
-- confirmed the property_id below still resolves to 107 Oxford #34 in your
-- own environment (see the verification query at the bottom of this file --
-- run it FIRST and compare the result before running the INSERT).
--
-- Provenance of this property_id (09ae496e-14be-4b74-b680-65e2b6b9c94d):
-- it is not guessed or invented here. It is the exact value already
-- hardcoded, reviewed, and linked from this repository's own marketing copy
-- as "a small pilot set of already-analyzed properties" --
-- app/property-intelligence/page.tsx (committed a819247d,
-- "feat(property-intelligence): canonical Property Intelligence pilot",
-- 2026-08-24) and this task's own homepage work (app/page.tsx). The route
-- app/property-intelligence/[id]/page.tsx resolves this exact URL segment
-- 1:1 against properties.id via getPropertyIntelligenceData(id) ->
-- assembleRaw(propertyId) -> .eq('id', propertyId) on the properties table
-- (lib/propertyIntelligence.ts) -- confirmed by direct code read, and
-- confirmed live by fetching https://chat.homerates.ai/property-intelligence/
-- 09ae496e-14be-4b74-b680-65e2b6b9c94d and receiving the real, correct
-- "107 Oxford #34, Irvine, CA 92612" record.
--
-- approved_at is today's date (when this registry entry was actually
-- created), not backdated to the August pilot commit -- no discrete
-- "approval" event was ever formally logged before this registry existed,
-- so backdating would overstate what is actually known. approval_reason
-- states the real provenance (the August pilot, cited above) instead.
--
-- Safe to re-run: ON CONFLICT DO NOTHING makes it idempotent against the
-- property_id UNIQUE constraint. Rollback: DELETE FROM property_publications
-- WHERE property_id = '09ae496e-14be-4b74-b680-65e2b6b9c94d';

-- ── Run this FIRST and verify the address before running the INSERT below ──
-- SELECT id, address_full FROM properties WHERE id = '09ae496e-14be-4b74-b680-65e2b6b9c94d';
-- Expected: address_full contains "107 Oxford" / "Irvine" / "92612".
-- If this returns no row, or a different address, DO NOT run the INSERT --
-- report back instead of guessing a corrected ID.

INSERT INTO property_publications (
  property_id,
  publication_status,
  approved_at,
  approved_by,
  approval_reason,
  is_homepage_featured,
  featured_at
) VALUES (
  '09ae496e-14be-4b74-b680-65e2b6b9c94d',
  'published',
  now(),
  'user_35xDE51bR0NTaKEpwZMbHtn752O', -- Rayaan — Production bootstrap admin (lib/adminAuth.ts)
  'Originally established as HomeRates.ai''s reviewed Property Intelligence pilot example, hardcoded and linked from marketing copy in commit a819247d ("feat(property-intelligence): canonical Property Intelligence pilot", 2026-08-24). Formally recorded in the property_publications registry on 2026-09-16 as part of the shadow-mode publication-registry build.',
  true,
  now()
)
ON CONFLICT (property_id) DO NOTHING;
