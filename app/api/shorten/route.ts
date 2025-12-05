// app/api/shorten/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const supabase =
    SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
        ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false },
        })
        : null;

function randomSlug(length = 7): string {
    const chars =
        'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let out = '';
    for (let i = 0; i < length; i++) {
        out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
}

export async function POST(req: NextRequest) {
    if (!supabase) {
        return NextResponse.json(
            { ok: false, error: 'Supabase not configured' },
            { status: 500 }
        );
    }

    let body: any = {};
    try {
        body = await req.json();
    } catch {
        body = {};
    }

    const longUrl = (body?.url ?? '').toString().trim();
    if (!longUrl) {
        return NextResponse.json(
            { ok: false, error: 'Missing url' },
            { status: 400 }
        );
    }

    // Try a few times in case of slug collisions
    let slug: string | null = null;

    for (let i = 0; i < 5; i++) {
        const candidate = randomSlug();
        const { error } = await supabase
            .from('short_links')
            .insert({
                slug: candidate,
                target_url: longUrl,
            })
            .select('slug')
            .single();

        if (!error) {
            slug = candidate;
            break;
        }

        // If it's clearly a duplicate key, try again, otherwise bail out
        const msg = (error as any)?.message || '';
        if (!msg.toLowerCase().includes('duplicate key')) {
            console.error('[shorten] insert error:', error);
            return NextResponse.json(
                { ok: false, error: 'Failed to create short link' },
                { status: 500 }
            );
        }
    }

    if (!slug) {
        return NextResponse.json(
            { ok: false, error: 'Could not generate unique slug' },
            { status: 500 }
        );
    }

    const baseFromEnv = process.env.NEXT_PUBLIC_APP_BASE_URL || '';
    const origin =
        baseFromEnv ||
        req.headers.get('origin') ||
        'https://chat.homerates.ai';

    const shortUrl = new URL(`/s/${slug}`, origin).toString();

    return NextResponse.json({
        ok: true,
        slug,
        shortUrl,
    });
}
