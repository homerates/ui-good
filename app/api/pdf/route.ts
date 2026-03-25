// app/api/pdf/route.ts
// Generates PDF reports for HomeRates.ai slider cards
// POST /api/pdf — requires Clerk authentication
// Body: { type: 'refi' | 'conventional' | 'fha' | 'affordability' | 'dscr', params: {...} }

import { auth } from '@clerk/nextjs/server';

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

    try {
        // Dynamic imports ensure all react-pdf modules load from the same runtime
        // instance, avoiding React error #31 (dual-instance reconciler conflict)
        const React = (await import('react')).default;
        const { renderToBuffer } = await import('@react-pdf/renderer');
        const HomePDF = await import('../../../lib/pdf/HomePDF');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let doc: any;
        if (type === 'refi') {
            doc = React.createElement(HomePDF.RefiPDF, params as HomePDF.RefiPdfParams);
        } else if (type === 'conventional' || type === 'fha') {
            doc = React.createElement(HomePDF.ConvFhaPDF, params as HomePDF.ConvFhaPdfParams);
        } else if (type === 'affordability') {
            doc = React.createElement(HomePDF.AffordabilityPDF, params as HomePDF.AffordabilityPdfParams);
        } else if (type === 'dscr') {
            doc = React.createElement(HomePDF.DscrPDF, params as HomePDF.DscrPdfParams);
        } else {
            return Response.json({ error: `Unknown PDF type: ${type}` }, { status: 400 });
        }

        const buffer = await renderToBuffer(doc);
        const filename = FILENAMES[type] ?? 'homerates-analysis.pdf';

        return new Response(new Uint8Array(buffer), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (err) {
        console.error('[/api/pdf] render error:', err);
        if (err instanceof Error) {
            console.error('[/api/pdf] stack:', err.stack);
        }
        return Response.json({ error: 'PDF generation failed' }, { status: 500 });
    }
}
