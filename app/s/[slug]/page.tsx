// app/s/[slug]/page.tsx
// Loads shared thread data and passes it to main app via query param

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

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

export default async function ShortRedirectPage(props: any) {
    const params = (await props.params) as { slug?: string } | undefined;
    const slug = params?.slug ?? '';

    if (!slug || !supabase) {
        redirect('/');
    }

    // Check shared_threads first (full thread share)
    const { data: sharedThread } = await supabase
        .from('shared_threads')
        .select('slug, messages')
        .eq('slug', slug)
        .maybeSingle();

    if (sharedThread?.slug) {
        // Redirect to main app with shared param - app will load the thread
        redirect(`/?shared=${slug}`);
    }

    // Fallback: check short_links table (legacy single Q&A share)
    const { data: shortLink } = await supabase
        .from('short_links')
        .select('target_url')
        .eq('slug', slug)
        .maybeSingle();

    if (shortLink?.target_url) {
        redirect(shortLink.target_url);
    }

    // Nothing found - go home
    redirect('/');
}
