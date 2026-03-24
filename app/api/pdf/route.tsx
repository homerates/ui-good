// app/api/pdf/route.tsx
// Generates PDF reports for HomeRates.ai slider cards
// POST /api/pdf — requires Clerk authentication
// Body: { type: 'refi' | 'conventional' | 'fha' | 'affordability' | 'dscr', params: {...} }

import { auth } from '@clerk/nextjs/server';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import {
    RefiPDF,
    ConvFhaPDF,
    AffordabilityPDF,
    DscrPDF,
    type RefiPdfParams,
    type ConvFhaPdfParams,
    type AffordabilityPdfParams,
    type DscrPdfParams,
} from '../../../lib/pdf/HomePDF';

export const runtime = 'nodejs';

const FILENAMES: Record<string, string> = {
    refi:         'homerates-refi-analysis.pdf',
    conventional: 'homerates-conventional-analysis.pdf',
    fha:          'homerates-fha-analysis.pdf',
    affordability:'homerates-affordability-analysis.pdf',
    dscr:         'homerates-dscr-analysis.pdf',
};

export async function POST(req: Request) {
    // Auth gate — PDF export requires a registered account
    const { userId } = await auth();
    if (!userId) {
        return Response.json({ error: 'Authentication required. Create a free account to download PDFs.' }, { status: 401 });
    }

    let body: { type: string; params: Record<string, unknown> };
    try {
        body = await req.json();
    } catch {
        return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { type, params } = body;
    if (!type || !params) {
        return Response.json({ error: 'Missing type or params' }, { status: 400 });
    }

    let doc: React.ReactElement;
    try {
        if (type === 'refi') {
            doc = <RefiPDF {...(params as unknown as RefiPdfParams)} />;
        } else if (type === 'conventional' || type === 'fha') {
            doc = <ConvFhaPDF {...(params as unknown as ConvFhaPdfParams)} />;
        } else if (type === 'affordability') {
            doc = <AffordabilityPDF {...(params as unknown as AffordabilityPdfParams)} />;
        } else if (type === 'dscr') {
            doc = <DscrPDF {...(params as unknown as DscrPdfParams)} />;
        } else {
            return Response.json({ error: `Unknown PDF type: ${type}` }, { status: 400 });
        }

        const buffer = await renderToBuffer(doc);
        const filename = FILENAMES[type] ?? `homerates-analysis.pdf`;

        return new Response(new Uint8Array(buffer), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (err) {
        console.error('[/api/pdf] render error:', err);
        return Response.json({ error: 'PDF generation failed' }, { status: 500 });
    }
}
