// lib/addressIdentity.ts
//
// Deterministic property-IDENTITY comparison -- built 2026-09-08 to close a
// real data-integrity gap surfaced by the demand-driven external resolution
// workstream (commit 564164fb): app/api/property/lookup/route.ts's
// broadSearchFallback() accepted the FIRST Tavily result matching any
// recognized real-estate domain (redfin/zillow/realtor/trulia/homes/movoto),
// with zero check that the candidate is actually the SAME property the
// caller asked about. Confirmed live: the identical requested address
// produced one RESOLUTION_FAILED and one successful (but unverified)
// persisted result on retry -- proof the underlying search is
// non-deterministic and can silently attach the wrong home to a requested
// address. Now that an external AI caller can trigger this path on demand,
// a wrong match is no longer a lookup-quality nuisance -- it is a corpus
// data-integrity issue.
//
// This is a pure comparison module -- no I/O, no network, no DB call.
// Deliberately NOT semantic/LLM-based: identity is decided by component-wise,
// deterministic rules only (house number, normalized street name, city,
// state, ZIP) -- never a similarity score, never a model's judgment.
//
// Existing normalizers already in this codebase --
// lib/addressNormalize.ts's addressesMatchLoosely(), lib/propertyIntelligence.ts's
// normAddr()/normAddrStrict(), app/api/beta/grok-property/route.ts's
// normalizeAddressStrict() -- are all whole-string punctuation/case
// normalizers built for DEDUPING two renderings of the SAME source-formatted
// address string. None tolerate the street-type abbreviation variance that
// legitimately differs between providers (Google Places "Ct" vs a scraped
// page's "Court"), and none reject a genuinely different street or house
// number the way identity verification requires -- confirmed by reading all
// three before writing this file. This is a new, narrower, purpose-built
// comparator, not a replacement for any of them.

// Only the street-TYPE and directional words this task's spec explicitly
// allows as controlled normalization -- adding to this list is a deliberate,
// reviewable change, not something identity validation should grow silently.
const STREET_TYPE_MAP: Record<string, string> = {
  street: 'st', st: 'st',
  road: 'rd', rd: 'rd',
  avenue: 'ave', ave: 'ave', av: 'ave',
  court: 'ct', ct: 'ct',
  boulevard: 'blvd', blvd: 'blvd',
  drive: 'dr', dr: 'dr',
  lane: 'ln', ln: 'ln',
  place: 'pl', pl: 'pl',
  circle: 'cir', cir: 'cir',
  highway: 'hwy', hwy: 'hwy',
};

const DIRECTIONAL_MAP: Record<string, string> = {
  north: 'n', n: 'n',
  south: 's', s: 's',
  east: 'e', e: 'e',
  west: 'w', w: 'w',
  northeast: 'ne', ne: 'ne',
  northwest: 'nw', nw: 'nw',
  southeast: 'se', se: 'se',
  southwest: 'sw', sw: 'sw',
};

export interface AddressComponents {
  houseNumber: string;
  street: string;
  city: string | null;
  state: string | null;
  zip: string | null;
}

/** Parses a "123 Main St[, City][, ST [12345]]" shaped string into components.
 *  Tolerant of a trailing ", USA" / ", United States" and of a missing
 *  city/state/zip. Returns null when no house-number + street can be found --
 *  the minimum needed to compare any two addresses at all (fail-closed input). */
export function parseAddressComponents(raw: string | null | undefined): AddressComponents | null {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/,?\s*USA\s*$/i, '')
    .replace(/,?\s*United States\s*$/i, '')
    .trim();
  if (!cleaned) return null;

  const parts = cleaned.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const streetMatch = parts[0].match(/^(\d+)\s+(.+)$/);
  if (!streetMatch) return null;
  const [, houseNumber, street] = streetMatch;

  let city: string | null = null;
  let state: string | null = null;
  let zip: string | null = null;

  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1];
    const stateZipMatch = lastPart.match(/^([A-Za-z]{2})\s*(\d{5})?/);
    if (stateZipMatch) {
      state = stateZipMatch[1].toUpperCase();
      zip = stateZipMatch[2] ?? null;
      // "street, city, ST [zip]" -- the middle part is the city.
      if (parts.length >= 3) city = parts[1];
    } else {
      // No recognizable "ST [zip]" tail -- treat the second part as city.
      city = lastPart;
    }
  }

  return { houseNumber, street: street.trim(), city, state, zip };
}

function normalizeStreetToken(token: string): string {
  const clean = token.toLowerCase().replace(/[.,]/g, '');
  return STREET_TYPE_MAP[clean] ?? DIRECTIONAL_MAP[clean] ?? clean;
}

/** Reduces a street string to a canonical, comparison-safe form: lowercased,
 *  punctuation stripped, and ONLY the controlled suffix/directional synonyms
 *  above collapsed to one spelling. A genuinely different street name never
 *  collapses to the same value -- this is not fuzzy matching. */
export function normalizeStreetName(street: string): string {
  return street
    .split(/\s+/)
    .map(normalizeStreetToken)
    .join(' ')
    .trim();
}

export type IdentityOutcomeCode = 'CANDIDATE_ADDRESS_MATCH' | 'CANDIDATE_ADDRESS_REJECTED' | 'NO_VERIFIABLE_CANDIDATE';

export interface IdentityValidationResult {
  ok: boolean;
  code: IdentityOutcomeCode;
  // Human-readable, MAY embed address fragments (house numbers, street
  // names) for tests/debugging -- never write this to a log line. Only
  // `code` is privacy-safe to log, per the existing Gateway logging
  // discipline (see lib/gateway/requestLog.ts).
  detail: string;
}

export interface CandidateAddressFields {
  address?: string | null; // street portion only, e.g. "1131 Mataro Ct" -- this codebase's existing parsers never embed city/state/zip in this field
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

/** The single gate a candidate property must pass before it may be persisted
 *  as the result of a requested address. Fails closed: any component that
 *  can't be verified on both sides is treated as a rejection, never a pass. */
export function validatePropertyIdentity(
  requestedAddress: string,
  candidate: CandidateAddressFields,
): IdentityValidationResult {
  const requested = parseAddressComponents(requestedAddress);
  if (!requested) {
    return { ok: false, code: 'NO_VERIFIABLE_CANDIDATE', detail: 'Requested address could not be parsed into house number + street.' };
  }

  const candidateStreet = parseAddressComponents(candidate.address);
  if (!candidateStreet) {
    return { ok: false, code: 'NO_VERIFIABLE_CANDIDATE', detail: 'Candidate has no parseable house number + street.' };
  }

  if (requested.houseNumber !== candidateStreet.houseNumber) {
    return {
      ok: false,
      code: 'CANDIDATE_ADDRESS_REJECTED',
      detail: `House number mismatch (requested ${requested.houseNumber}, candidate ${candidateStreet.houseNumber}).`,
    };
  }

  if (normalizeStreetName(requested.street) !== normalizeStreetName(candidateStreet.street)) {
    return {
      ok: false,
      code: 'CANDIDATE_ADDRESS_REJECTED',
      detail: `Street name mismatch (requested "${requested.street}", candidate "${candidateStreet.street}").`,
    };
  }

  const candidateState = candidate.state ?? candidateStreet.state;
  if (!requested.state || !candidateState) {
    return { ok: false, code: 'NO_VERIFIABLE_CANDIDATE', detail: 'State missing on requested or candidate address.' };
  }
  if (requested.state.toUpperCase() !== String(candidateState).toUpperCase()) {
    return {
      ok: false,
      code: 'CANDIDATE_ADDRESS_REJECTED',
      detail: `State mismatch (requested ${requested.state}, candidate ${candidateState}).`,
    };
  }

  // ZIP compared only when the REQUESTED address specified one -- a caller
  // can't be faulted for omitting it, but if they gave one, the candidate
  // must confirm it. The one documented normalization edge case: compare
  // only the first 5 digits, so a ZIP+4 candidate ("94566-1234") still
  // matches a plain 5-digit requested ZIP ("94566").
  const candidateZip = candidate.zip ?? candidateStreet.zip;
  if (requested.zip) {
    if (!candidateZip) {
      return { ok: false, code: 'NO_VERIFIABLE_CANDIDATE', detail: 'Candidate has no ZIP to verify against requested ZIP.' };
    }
    if (requested.zip.slice(0, 5) !== String(candidateZip).slice(0, 5)) {
      return {
        ok: false,
        code: 'CANDIDATE_ADDRESS_REJECTED',
        detail: `ZIP mismatch (requested ${requested.zip}, candidate ${candidateZip}).`,
      };
    }
  }

  // City: no known city/postal alias mechanism exists anywhere in this repo
  // (confirmed via audit) -- so, per spec, a city mismatch always fails.
  const candidateCity = candidate.city ?? candidateStreet.city;
  if (requested.city) {
    if (!candidateCity) {
      return { ok: false, code: 'NO_VERIFIABLE_CANDIDATE', detail: 'Candidate has no city to verify against requested city.' };
    }
    if (requested.city.trim().toLowerCase() !== String(candidateCity).trim().toLowerCase()) {
      return {
        ok: false,
        code: 'CANDIDATE_ADDRESS_REJECTED',
        detail: `City mismatch (requested "${requested.city}", candidate "${candidateCity}") -- no known alias mechanism in this repo.`,
      };
    }
  }

  return { ok: true, code: 'CANDIDATE_ADDRESS_MATCH', detail: 'Requested and candidate addresses agree on all verifiable components.' };
}
