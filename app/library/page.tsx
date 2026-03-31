// app/library/page.tsx  — server shell: fetch data, pass to client component
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import type { Metadata } from 'next';
import VaultClient from './VaultClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'My Vault',
    description: 'Your saved mortgage analyses and downloaded PDFs.',
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getSupabase() {
    if (!SUPABASE_URL || !SERVICE_KEY) return null;
    return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

function labelFromPath(name: string) {
    const base = name.replace(/\.pdf$/, '').replace(/-\d+$/, '');
    return base.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) + ' Analysis';
}

export default async function VaultPage() {
    const { userId } = await auth();
    if (!userId) redirect('/sign-in?redirect_url=/library');

    const supabase = getSupabase();

    const qaPromise = supabase
        ? supabase
            .from('library_events')
            .select('id, created_at, question, answer, answer_summary, tool_id')
            .eq('clerk_user_id', userId)
            .or('tool_id.is.null,tool_id.neq.library_route')
            .order('created_at', { ascending: false })
            .limit(100)
        : Promise.resolve({ data: null, error: null });

    const pdfListPromise = supabase
        ? supabase.storage.from('user-vault').list(userId, {
              sortBy: { column: 'created_at', order: 'desc' },
          })
        : Promise.resolve({ data: null, error: null });

    const [{ data: qaRows }, { data: pdfObjects }] = await Promise.all([qaPromise, pdfListPromise]);

    let pdfs: Array<{ name: string; label: string; created_at: string; signedUrl: string | null }> = [];
    if (supabase && pdfObjects && pdfObjects.length > 0) {
        const paths = pdfObjects.map((o) => `${userId}/${o.name}`);
        const { data: signed } = await supabase.storage.from('user-vault').createSignedUrls(paths, 3600);
        pdfs = pdfObjects.map((o, i) => ({
            name: o.name,
            label: labelFromPath(o.name),
            created_at: o.created_at ?? '',
            signedUrl: signed?.[i]?.signedUrl ?? null,
        }));
    }

    const answers = (qaRows ?? []).map((r: any) => ({
        id: r.id,
        created_at: r.created_at,
        question: r.question ?? '',
        answerText:
            typeof r.answer === 'string'
                ? r.answer
                : r.answer?.answer ?? r.answer?.message ?? r.answer_summary ?? '',
    }));

    return <VaultClient answers={answers} pdfs={pdfs} />;
}
