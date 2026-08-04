// Illustrative context for "what does this payment actually buy here" — deliberately NOT a
// property-shopping or listings surface. LocationContext describes ONE property/work-address
// pair the consumer already has in mind; it never lists or ranks alternative properties or
// neighborhoods.
export interface LocationContext {
  propertyAddress: string;
  workAddress: string;
  /** null = not yet computed/unavailable — never silently substitute a guessed number. */
  commuteMinutes: number | null;
  /** Effective annual property tax rate, as a percentage (e.g. 1.1 for 1.1%). */
  propertyTaxRate: number | null;
  /** 100 = national-average baseline. A single illustrative index, not a neighborhood ranking. */
  costOfLivingIndex: number | null;
  /**
   * MUST always be populated, even when everything above is mock — this is the field the UI's
   * DataProvenanceBadge reads to honestly label data to the consumer. Never leave this blank
   * "to fix later"; an unlabeled mock number is indistinguishable from a real one to a consumer.
   */
  dataSource: string;
}

/**
 * Swappable abstraction — a MockLocationDataSource implements this today with static numbers.
 * A real implementation plugs in here without any component change:
 * // DATA SOURCE TODO: commute time  → a geospatial/routing API (e.g. a mapping provider's
 *    distance-matrix endpoint)
 * // DATA SOURCE TODO: property tax rate → a public tax-assessor data feed, keyed by address/parcel
 * // DATA SOURCE TODO: cost-of-living index → a licensed COL index provider (e.g. C2ER, BEA
 *    regional price parities) — must be a general regional index, never reframed as "is this a
 *    good/bad place to live."
 */
export interface LocationDataSource {
  getContext(propertyAddress: string, workAddress: string): Promise<LocationContext>;
}
