import type { RedfinFacts } from '../app/api/beta/grok-property/route';

export type { RedfinFacts };

const STATUS_MAP: Record<string, string> = {
  FOR_SALE:   'For Sale',
  PENDING:    'Pending',
  SOLD:       'Sold',
  OFF_MARKET: 'Off Market',
  UNKNOWN:    '',
};

export function normalizeListingStatus(s?: string | null): string | null {
  if (!s) return null;
  return STATUS_MAP[s] ?? s;
}

// Fire-and-forget background Grok call so the Property Intelligence Card
// renders instantly from cache when the user opens it.
// Redfin facts are injected so Grok focuses on intelligence, not fact-finding.
export function prefetchGrokProperty(address: string, redfin?: RedfinFacts): void {
  if (!address?.trim()) return;
  void fetch('/api/beta/grok-property', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: address.trim(), redfin: redfin ?? null }),
  }).then(async res => {
    if (!res.ok || !res.body) return;
    const reader = res.body.getReader();
    // Drain the SSE stream so the server reaches [DONE] and writes to cache
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
  }).catch(() => {});
}
