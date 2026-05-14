// Fire-and-forget background Grok call so the Property Intelligence Card
// renders instantly (from cache) when the user opens it.
// The stream must be drained to completion so the server-side code reaches
// [DONE] and writes the cache entry.
export function prefetchGrokProperty(address: string): void {
  if (!address?.trim()) return;
  void fetch('/api/beta/grok-property', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: address.trim() }),
  }).then(async res => {
    if (!res.ok || !res.body) return;
    const reader = res.body.getReader();
    // Drain silently — no rendering needed, just let server reach [DONE]
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
  }).catch(() => {
    // Background call — silently ignore failures
  });
}
