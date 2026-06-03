/**
 * lib/propertyLookup.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Abstraction layer for property data lookup.
 *
 * CURRENT STATE: thin wrappers that delegate to the /api/property/lookup HTTP
 * endpoint.  This is intentionally "wrong" — it documents the interface that
 * should exist and hides the HTTP self-call from callers (answers/route.ts).
 *
 * NEXT STEP (dedicated session, item 4 full migration):
 *   Move the ~870 lines of internal logic from app/api/property/lookup/route.ts
 *   into this file so callers import directly (no HTTP round-trip):
 *   - getCachedSnapshot()
 *   - findRedfinUrl()
 *   - handleUrl()
 *   - broadSearchFallback()
 *   - cachePropertyResult()
 *   The API route becomes a 10-line thin HTTP wrapper that calls these.
 *
 * Until then, this file ensures:
 *   1. The lookup interface is typed and named consistently
 *   2. All HTTP self-call patterns are in ONE place (here) not scattered
 *   3. Replacing the HTTP call with a direct import only requires changing this file
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface PropertyLookupResult {
    ok: boolean;
    data?: Record<string, unknown>;
    fromCache?: boolean;
    error?: string;
}

/** Resolve the app base URL from env (avoids hardcoded domain in 4+ places). */
function appBase(): string {
    return process.env.NEXT_PUBLIC_APP_BASE_URL ?? 'https://chat.homerates.ai';
}

/**
 * Look up a property by street address.
 *
 * TODO (item 4 full migration): replace with direct function call to
 * the extracted internal functions from property/lookup/route.ts
 */
export async function lookupByAddress(
    address: string,
    opts?: { timeoutMs?: number },
): Promise<PropertyLookupResult> {
    try {
        const res = await fetch(`${appBase()}/api/property/lookup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address }),
            signal: AbortSignal.timeout(opts?.timeoutMs ?? 20_000),
        });
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
        return await res.json() as PropertyLookupResult;
    } catch (e: unknown) {
        return { ok: false, error: (e as Error)?.message ?? 'Lookup failed' };
    }
}

/**
 * Look up a property by Redfin / Zillow URL.
 *
 * TODO (item 4 full migration): replace with direct handleUrl() call
 */
export async function lookupByUrl(
    url: string,
    opts?: { timeoutMs?: number },
): Promise<PropertyLookupResult> {
    try {
        const res = await fetch(`${appBase()}/api/property/lookup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
            signal: AbortSignal.timeout(opts?.timeoutMs ?? 20_000),
        });
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
        return await res.json() as PropertyLookupResult;
    } catch (e: unknown) {
        return { ok: false, error: (e as Error)?.message ?? 'Lookup failed' };
    }
}
