// lib/propertyDiscovery.ts
//
// Option 1 — automated web signal discovery. Its ONLY job is finding
// likely currently-For-Sale property ADDRESSES. It must never be asked to
// produce AVMs, comps, financing, or any other intelligence field -- that
// stays the job of the existing enrichment pipeline (/api/property/lookup,
// /api/beta/grok-property), triggered afterward via
// lib/propertyAcquisition.ts's processAcquisitionCandidates().
//
// Provider choice: Tavily, reused directly via the already-installed
// @tavily/core SDK (already used this way in app/api/answers/route.ts) --
// not the internal /api/tavily proxy (an unnecessary self-HTTP round trip
// for a server-side cron) and not a hand-rolled fetch (every other Tavily
// call site in this repo hand-rolls its own; this is the one new module,
// so it uses the real SDK). search_depth:'basic' matches the codebase's
// established default for this kind of exploratory search (content/cron,
// grok-property's deep-mode searches, etc. all use 'basic'; 'advanced' is
// rare and reserved for cases needing deeper page content).
//
// No LLM call is used for extraction. Every real-estate listing site
// (Redfin, Zillow, Realtor.com, Homes.com, Trulia) puts the full street
// address directly in its page <title>, which Tavily returns verbatim --
// a regex against title+content is a deterministic, zero-marginal-cost
// extraction pass. A second-pass LLM verifier was deliberately NOT added
// for this first test (see the implementation report) to keep this
// workstream's own instruction -- "do not automatically call Tavily + Grok
// + OpenAI for every query" -- literally true; add one later only if real
// test results show regex extraction is insufficient.

import { tavily } from '@tavily/core';
import type { PropertyCandidate } from './propertyAcquisition';

const ADDRESS_RE = /\b(\d{1,6}[A-Za-z]?\s+(?:[NSEW]\.?\s+)?[A-Za-z0-9.'#-]+(?:\s+[A-Za-z0-9.'#-]+){0,4}),\s*([A-Za-z .'-]+),\s*([A-Z]{2})\s*(\d{5})\b/;
const PRICE_RE = /\$\s?([\d]{2,3}(?:,\d{3})+|\d{5,8})/;
const LISTING_DOMAINS = ['redfin.com', 'zillow.com', 'realtor.com', 'homes.com', 'trulia.com'];

export interface DiscoveryQueryLogEntry {
  geography: string;
  query: string;
  provider: 'tavily';
  resultsReturned: number;
}

export interface DiscoveryCandidateLogEntry {
  query: string;
  providerUrl: string | null;
  extractedAddress: string | null;
  statusSignal: string | null;
  accepted: boolean;
  rejectionReason?: string;
}

export interface DiscoveryRunResult {
  candidates: PropertyCandidate[];
  queryLog: DiscoveryQueryLogEntry[];
  candidateLog: DiscoveryCandidateLogEntry[];
}

function queryTemplatesFor(geography: string): string[] {
  return [
    `new listings for sale in ${geography}`,
    `recently listed homes for sale ${geography}`,
  ];
}

function looksLikeSoldOrOffMarket(text: string): boolean {
  return /\bsold\b|\boff[- ]market\b|\bwithdrawn\b|\bpending\b/i.test(text);
}

function looksLikeNoiseArticle(title: string, url: string): boolean {
  // Market reports / neighborhood guides / news articles typically have no
  // single street address in the title and often carry these words.
  const noisyWords = /\bmarket report\b|\bguide to\b|\bneighborhood\b|\btrends\b|\bforecast\b|\bhousing market\b/i;
  return noisyWords.test(title) && !ADDRESS_RE.test(title);
}

export async function discoverForSaleCandidates(
  geographies: string[],
  perGeographyCap: number,
): Promise<DiscoveryRunResult> {
  const apiKey = process.env.TAVILY_API_KEY;
  const queryLog: DiscoveryQueryLogEntry[] = [];
  const candidateLog: DiscoveryCandidateLogEntry[] = [];
  const candidates: PropertyCandidate[] = [];
  if (!apiKey) return { candidates, queryLog, candidateLog };

  const client = tavily({ apiKey });
  const seenAddresses = new Set<string>();

  for (const geography of geographies) {
    let acceptedForThisGeography = 0;
    for (const query of queryTemplatesFor(geography)) {
      if (acceptedForThisGeography >= perGeographyCap) break;
      let response;
      try {
        response = await client.search(query, { searchDepth: 'basic', maxResults: 5, includeAnswer: false });
      } catch {
        queryLog.push({ geography, query, provider: 'tavily', resultsReturned: 0 });
        continue;
      }
      const rawResults = response?.results ?? [];
      queryLog.push({ geography, query, provider: 'tavily', resultsReturned: rawResults.length });

      for (const r of rawResults) {
        if (acceptedForThisGeography >= perGeographyCap) break;
        const title: string = r.title ?? '';
        const content: string = r.content ?? '';
        const url: string = r.url ?? '';

        if (looksLikeNoiseArticle(title, url)) {
          candidateLog.push({ query, providerUrl: url, extractedAddress: null, statusSignal: null, accepted: false, rejectionReason: 'Looks like a market-report/news article, not a listing.' });
          continue;
        }

        const match = ADDRESS_RE.exec(title) ?? ADDRESS_RE.exec(content);
        if (!match) {
          candidateLog.push({ query, providerUrl: url, extractedAddress: null, statusSignal: null, accepted: false, rejectionReason: 'No resolvable street address found in title or content.' });
          continue;
        }
        const [, street, city, state, zip] = match;
        const fullAddress = `${street.trim()}, ${city.trim()}, ${state} ${zip}`;
        const key = fullAddress.toLowerCase();

        if (seenAddresses.has(key)) {
          candidateLog.push({ query, providerUrl: url, extractedAddress: fullAddress, statusSignal: null, accepted: false, rejectionReason: 'Duplicate within this discovery run.' });
          continue;
        }

        const combinedText = `${title} ${content}`;
        if (looksLikeSoldOrOffMarket(combinedText)) {
          candidateLog.push({ query, providerUrl: url, extractedAddress: fullAddress, statusSignal: 'sold_or_pending', accepted: false, rejectionReason: 'Content signals sold/pending/off-market/withdrawn, not an active new listing.' });
          continue;
        }

        const isListingDomain = LISTING_DOMAINS.some(d => url.includes(d));
        const priceMatch = PRICE_RE.exec(combinedText);
        const observedPrice = priceMatch ? parseInt(priceMatch[1].replace(/,/g, ''), 10) : null;

        seenAddresses.add(key);
        acceptedForThisGeography++;
        candidates.push({
          address: fullAddress,
          city: city.trim(),
          state,
          zip,
          observed_status: isListingDomain ? 'FOR_SALE' : 'FOR_SALE (unconfirmed source)',
          observed_price: observedPrice,
          source_url: url || null,
          source_type: 'web_signal',
          observed_at: new Date().toISOString(),
        });
        candidateLog.push({ query, providerUrl: url, extractedAddress: fullAddress, statusSignal: isListingDomain ? 'FOR_SALE' : 'FOR_SALE (unconfirmed source)', accepted: true });
      }
    }
  }

  return { candidates, queryLog, candidateLog };
}
