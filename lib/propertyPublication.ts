// lib/propertyPublication.ts
//
// SHADOW MODE (see supabase/migrations/088_property_publications.sql and
// ARCHITECTURE_DECISIONS.md for the full context). These helpers read/write
// the NEW property_publications registry -- the authoritative "was this
// property deliberately approved for public display" record -- but nothing
// in the app calls them yet. app/property-intelligence/[id]/page.tsx, the
// sitemap, and the homepage all still run on the pre-existing eligibility
// path. This file exists so the registry has a safe, reviewed access layer
// ready for a later, separate cutover task -- it does not perform that
// cutover itself.
//
// ── Do not confuse these three functions. They answer different questions
// and must never be treated as interchangeable: ──
//
//   listIndexEligiblePropertyIds()  (lib/propertyIntelligence.ts)
//     "Is there enough DATA on this property, and is its listing currently
//     active/pending, for a search engine to index its canonical page?"
//     A technical completeness heuristic. Computed live, on every sitemap
//     regeneration, from properties/property_snapshots/grok_property_cache/
//     featured_properties -- tables that organic user activity (public
//     lookups AND some private flows) can populate with zero human review.
//     This function's output has never meant "a human approved this."
//
//   listPublishedPropertyIds()  (this file)
//     "Did a HomeRates admin (or an explicit, reviewed migration/manifest)
//     deliberately approve this specific property to be a publicly
//     retrievable HomeRates.ai record?" Deliberate, reviewed, and durable --
//     set once by an admin action, not recomputed from corpus data on every
//     request. This is the only correct source for "is this genuinely
//     public" once the cutover happens.
//
//   listFeaturedPublishedProperties()  (this file)
//     "Of the properties that are already published, which ones should
//     additionally be promoted on the homepage or other discovery
//     surfaces?" A strict subset of published -- see the
//     property_publications_featured_requires_published CHECK constraint,
//     enforced at the database level, not just in this file's queries.
//
// No user identifier, session identifier, or financial input is ever read,
// stored, or returned by anything in this file -- publication_status is
// keyed purely on properties.id.

import { getSupabase } from './supabaseServer';

export type PublicationStatus = 'draft' | 'published' | 'withdrawn';

export interface PropertyPublication {
  id: string;
  propertyId: string;
  publicationStatus: PublicationStatus;
  approvedAt: string | null;
  approvedBy: string | null;
  approvalReason: string | null;
  withdrawnAt: string | null;
  withdrawalReason: string | null;
  isHomepageFeatured: boolean;
  featuredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: Record<string, unknown>): PropertyPublication {
  return {
    id: row.id as string,
    propertyId: row.property_id as string,
    publicationStatus: row.publication_status as PublicationStatus,
    approvedAt: (row.approved_at as string | null) ?? null,
    approvedBy: (row.approved_by as string | null) ?? null,
    approvalReason: (row.approval_reason as string | null) ?? null,
    withdrawnAt: (row.withdrawn_at as string | null) ?? null,
    withdrawalReason: (row.withdrawal_reason as string | null) ?? null,
    isHomepageFeatured: (row.is_homepage_featured as boolean) ?? false,
    featuredAt: (row.featured_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

const SELECT_COLUMNS =
  'id, property_id, publication_status, approved_at, approved_by, approval_reason, withdrawn_at, withdrawal_reason, is_homepage_featured, featured_at, created_at, updated_at';

/** Reads the full publication record for one property, or null if none exists yet (implicitly draft/unpublished). */
export async function getPropertyPublication(propertyId: string): Promise<PropertyPublication | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from('property_publications')
    .select(SELECT_COLUMNS)
    .eq('property_id', propertyId)
    .maybeSingle();
  return data ? mapRow(data) : null;
}

/** True only when a property_publications row exists AND is explicitly 'published'. No row = not published, same as 'draft'. */
export async function isPropertyPublished(propertyId: string): Promise<boolean> {
  const pub = await getPropertyPublication(propertyId);
  return pub?.publicationStatus === 'published';
}

/**
 * The authoritative public-record list -- every property_id with
 * publication_status = 'published'. This is the ONLY list a future public
 * route, sitemap, or homepage cutover should treat as "safe to show
 * publicly" -- see this file's header for why it is not interchangeable
 * with listIndexEligiblePropertyIds().
 */
export async function listPublishedPropertyIds(): Promise<{ propertyId: string; publishedAt: string | null }[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from('property_publications')
    .select('property_id, approved_at')
    .eq('publication_status', 'published');
  return (data ?? []).map((r) => ({ propertyId: r.property_id as string, publishedAt: (r.approved_at as string | null) ?? null }));
}

/**
 * Published properties additionally promoted for the homepage/discovery
 * surfaces. Ordered by featured_at (most recently featured first) so a
 * future caller gets a stable, deliberate ordering -- never search_count,
 * recency-of-lookup, or any other organic-activity signal.
 */
export async function listFeaturedPublishedProperties(): Promise<PropertyPublication[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from('property_publications')
    .select(SELECT_COLUMNS)
    .eq('publication_status', 'published')
    .eq('is_homepage_featured', true)
    .order('featured_at', { ascending: false, nullsFirst: false });
  return (data ?? []).map(mapRow);
}
