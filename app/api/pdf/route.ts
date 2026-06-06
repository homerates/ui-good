// app/api/pdf/route.ts
// Generates a scenario PDF and saves it to Supabase Storage user-vault bucket.
// Returns { ok: true, filename } — no local download, library-only.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createClient } from '@supabase/supabase-js';
import React from 'react';
import { buildPdfDoc, type PdfType } from '../../../lib/pdf/ScenarioPdf';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BUCKET       = 'user-vault';

const ALLOWED_TYPES = new Set<PdfType>([
    'conventional', 'highbal', 'fha', 'va', 'jumbo', 'affordability', 'dscr', 'refi',
]);

function getSupabase() {
    if (!SUPABASE_URL || !SERVICE_KEY) return null;
    return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    let body: { type?: string; params?: Record<string, unknown> };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const type   = (body.type ?? 'conventional') as PdfType;
    const params = body.params ?? {};

    if (!ALLOWED_TYPES.has(type)) {
        return NextResponse.json({ ok: false, error: 'Unknown PDF type' }, { status: 400 });
    }

    // ── Generate PDF buffer ───────────────────────────────────────────────────
    let buffer: Buffer;
    try {
        const doc = buildPdfDoc(type, params);
        buffer = await renderToBuffer(doc as React.ReactElement<any>);
    } catch (err: any) {
        console.error('[api/pdf] render error:', err?.message ?? err);
        return NextResponse.json({ ok: false, error: 'PDF render failed' }, { status: 500 });
    }

    // ── Upload to Supabase Storage ────────────────────────────────────────────
    const supabase = getSupabase();
    if (!supabase) {
        return NextResponse.json({ ok: false, error: 'Storage not configured' }, { status: 500 });
    }

    const filename = `${type}-${Date.now()}.pdf`;
    const path     = `${userId}/${filename}`;

    const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, {
            contentType: 'application/pdf',
            upsert: false,
        });

    if (uploadErr) {
        console.error('[api/pdf] upload error:', uploadErr.message);
        return NextResponse.json({ ok: false, error: uploadErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, filename, path });
}
