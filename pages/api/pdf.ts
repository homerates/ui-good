// pages/api/pdf.ts
// Generates PDF reports for HomeRates.ai slider cards
// POST /api/pdf — requires Clerk authentication
// Body: { type: 'refi' | 'conventional' | 'fha' | 'affordability' | 'dscr', params: {...} }
//
// NOTE: This lives in pages/api/ (not app/api/) deliberately.
// Next.js 15 App Router applies the "react-server" export condition to route handlers,
// which strips React internals that @react-pdf/reconciler requires, causing error #31.
// Pages Router API routes do NOT apply this condition and work correctly.

import { getAuth } from '@clerk/nextjs/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createClient } from '@supabase/supabase-js';
import React from 'react';
import type { NextApiRequest, NextApiResponse } from 'next';
import {
    RefiPDF,
    ConvFhaPDF,
    AffordabilityPDF,
    DscrPDF,
    type RefiPdfParams,
    type ConvFhaPdfParams,
    type AffordabilityPdfParams,
    type DscrPdfParams,
} from '../../lib/pdf/HomePDF';

function buildFilename(type: string, params: Record<string, unknown>): string {
    const fmt$ = (n: unknown) => n ? `$${Math.round(Number(n)).toLocaleString()}` : '';
    const fmtPct = (n: unknown) => n ? `${Number(n).toFixed(2)}pct` : '';
    switch (type) {
        case 'conventional': return `homerates-conventional-${fmt$(params.price)}-${fmtPct(params.rate)}-${params.downPct ?? ''}pctdown.pdf`;
        case 'fha':          return `homerates-fha-${fmt$(params.price)}-${fmtPct(params.rate)}-3.5pctdown.pdf`;
        case 'va':           return `homerates-va-${fmt$(params.price)}-${fmtPct(params.rate)}.pdf`;
        case 'jumbo':        return `homerates-jumbo-${fmt$(params.price)}-${fmtPct(params.rate)}.pdf`;
        case 'refi':         return `homerates-refi-${fmt$(params.balance)}-${fmtPct(params.currentRate)}to${fmtPct(params.newRate)}.pdf`;
        case 'affordability':return `homerates-affordability-${fmt$(params.annualIncome)}-income-${fmtPct(params.rate)}.pdf`;
        case 'dscr':         return `homerates-dscr-${fmt$(params.price)}-${fmt$(params.rent)}rent-${fmtPct(params.rate)}.pdf`;
        default:             return `homerates-${type}-analysis.pdf`;
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Auth gate — PDF export requires a registered account
    const { userId } = getAuth(req);
    if (!userId) {
        return res.status(401).json({ error: 'Authentication required. Create a free account to download PDFs.' });
    }

    const { type, params } = req.body as { type: string; params: Record<string, unknown> };
    if (!type || !params) {
        return res.status(400).json({ error: 'Missing type or params' });
    }

    try {
        let doc: React.ReactElement;
        if (type === 'refi') {
            doc = React.createElement(RefiPDF, params as unknown as RefiPdfParams);
        } else if (type === 'conventional' || type === 'fha') {
            doc = React.createElement(ConvFhaPDF, params as unknown as ConvFhaPdfParams);
        } else if (type === 'affordability') {
            doc = React.createElement(AffordabilityPDF, params as unknown as AffordabilityPdfParams);
        } else if (type === 'dscr') {
            doc = React.createElement(DscrPDF, params as unknown as DscrPdfParams);
        } else {
            return res.status(400).json({ error: `Unknown PDF type: ${type}` });
        }

        const buffer = await renderToBuffer(doc);
        const filename = buildFilename(type, params);

        // Upload to vault in background — never block the download
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
        const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        if (supabaseUrl && serviceKey) {
            const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
            const vaultPath = `${userId}/${type}-${Date.now()}.pdf`;
            sb.storage.from('user-vault').upload(vaultPath, Buffer.from(buffer), {
                contentType: 'application/pdf',
                upsert: false,
            }).then(({ error }) => {
                if (error) console.warn('[pdf vault upload]', error.message);
            });
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-store');
        res.send(Buffer.from(buffer));
    } catch (err) {
        console.error('[/api/pdf] render error:', err);
        if (err instanceof Error) {
            console.error('[/api/pdf] stack:', err.stack);
        }
        res.status(500).json({ error: 'PDF generation failed' });
    }
}
