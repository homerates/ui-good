// app/api/shorten/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { auth } from "@clerk/nextjs/server";
import { randomInt } from 'crypto';

// Open-redirect guard: short links may only target our own properties.
// A relative path ("/chat?...") is always allowed; absolute URLs must match an allowed host.
const ALLOWED_HOSTS = new Set([
    'chat.homerates.ai',
    'homerates.ai',
    'www.homerates.ai',
    'dev.homerates.ai',
    'dev.chat.homerates.ai',
]);

function isSafeTarget(raw: string): boolean {
    if (!raw) return false;
    // Relative path — same-origin by definition.
    if (raw.startsWith('/') && !raw.startsWith('//')) return true;
    try {
        const u = new URL(raw);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
        return ALLOWED_HOSTS.has(u.hostname.toLowerCase());
    } catch {
        return false;
    }
}

const SUPABASE_URL =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase =
    SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
        ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false },
        })
        : null;

function randomSlug(length = 7): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let out = '';
    for (let i = 0; i < length; i++) {
        out += chars[randomInt(chars.length)];
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

    const { userId } = await auth();
    let body: any = {};
    try {
        body = await req.json();
    } catch {
        body = {};
    }

    // Support both old format (url) and new format (messages)
    const messages = body?.messages;
    const longUrl = (body?.url ?? '').toString().trim();

    // If messages provided, save to shared_threads (new system)
    if (messages && Array.isArray(messages) && messages.length > 0) {
        let slug: string | null = null;

        for (let i = 0; i < 5; i++) {
            const candidate = randomSlug();
            const { error } = await supabase
                .from('shared_threads')
                .insert({
                    slug: candidate,
                    clerk_user_id: userId || 'anon',
                    messages,
                    created_at: new Date().toISOString(),
                })
                .select('slug')
                .single();

            if (!error) {
                slug = candidate;
                break;
            }
        }

        if (!slug) {
            return NextResponse.json(
                { ok: false, error: 'Could not generate unique slug' },
                { status: 500 }
            );
        }

        const base = process.env.NEXT_PUBLIC_APP_BASE_URL || 'https://chat.homerates.ai';
        const shortUrl = `${base}/s/${slug}`;

        console.log('[Shorten] Created shared thread:', shortUrl);
        return NextResponse.json({ ok: true, slug, shortUrl, url: shortUrl });
    }

    // Old behavior: save URL to short_links (for backwards compatibility)
    if (!longUrl) {
        return NextResponse.json(
            { ok: false, error: 'Missing url or messages' },
            { status: 400 }
        );
    }

    // Open-redirect guard — only allow same-origin / known HomeRates hosts.
    if (!isSafeTarget(longUrl)) {
        return NextResponse.json(
            { ok: false, error: 'Invalid target URL' },
            { status: 400 }
        );
    }

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
    }

    if (!slug) {
        return NextResponse.json(
            { ok: false, error: 'Could not generate unique slug' },
            { status: 500 }
        );
    }

    const base = process.env.NEXT_PUBLIC_APP_BASE_URL || 'https://chat.homerates.ai';
    const shortUrl = `${base}/s/${slug}`;

    console.log('[Shorten] Created short link:', shortUrl);
    return NextResponse.json({ ok: true, slug, shortUrl, url: shortUrl });
}