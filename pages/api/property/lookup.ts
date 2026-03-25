// pages/api/property/lookup.ts
// POST /api/property/lookup
// Body: { url: string }
// Returns: PropertyLookupResult
//
// Auth: intentionally none — property lookup works for anonymous users.
// This pre-fills the mortgage calculator before sign-up.
// Lives in pages/api/ (not app/api/) consistent with other routes here.

import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchPropertyData } from '../../../lib/property/fetch';
import type { PropertyLookupResult } from '../../../lib/property/schema';

const MAX_URL_LEN = 2048;

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<PropertyLookupResult>,
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const { url } = req.body as { url?: unknown };

    if (!url || typeof url !== 'string' || !url.trim()) {
        return res.status(400).json({ ok: false, error: 'Missing url in request body' });
    }
    if (url.length > MAX_URL_LEN) {
        return res.status(400).json({ ok: false, error: 'URL too long' });
    }

    try {
        const result = await fetchPropertyData(url.trim());
        if (!result.ok) {
            // 422 = valid request, but couldn't extract data from the listing
            return res.status(422).json(result);
        }
        // Cache briefly — listings don't change by the second, but can relist
        res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
        return res.status(200).json(result);
    } catch (err) {
        console.error('[/api/property/lookup]', err);
        return res.status(500).json({ ok: false, error: 'Internal server error' });
    }
}
