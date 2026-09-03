// lib/gateway/corpusOnlyIntelligence.ts
//
// The Gateway's sole permitted entry point into existing HomeRates Property
// Intelligence. Per docs/HOMERATES_INTELLIGENCE_GATEWAY_V1_ARCHITECTURE.md
// section 13 (LOCKED): this wrapper's narrow implementation -- containing
// nothing but the one call below -- IS the runtime security boundary. It is
// not a convention enforced by code review; it is enforced by having no other
// code path in this function at all. The automated import-boundary check
// (see lib/gateway/checkImportBoundary.mjs) is additional defense against
// future drift, not a substitute for this.
//
// getPropertyIntelligenceData()'s full call graph was independently audited
// (not trusted from its own comments) during the Gateway architecture
// workstream and confirmed to contain zero writes and zero live/paid
// external calls anywhere in its dependency tree -- see
// docs/HOMERATES_INTELLIGENCE_GATEWAY_V1_ARCHITECTURE.md section 4 for the
// full traced graph. Nothing in lib/propertyIntelligence.ts is modified by
// this file.
//
// DO NOT add any other call target to this file. DO NOT import
// app/api/property/lookup, app/api/beta/grok-property, or any Tavily/Redfin
// client module here or anywhere else under lib/gateway/.

import { getPropertyIntelligenceData, type PropertyIntelligenceData, type FactLabel } from '../propertyIntelligence';

// Re-exported so the rest of lib/gateway/ never needs its own reference to
// '../propertyIntelligence' -- even a type-only one. This keeps the boundary
// simple to state and check: exactly one file in this directory mentions
// propertyIntelligence.ts, for any reason, at all.
export type { PropertyIntelligenceData, FactLabel };

export async function getPropertyIntelligenceCorpusOnly(
  propertyId: string,
): Promise<PropertyIntelligenceData | null> {
  return getPropertyIntelligenceData(propertyId);
}
