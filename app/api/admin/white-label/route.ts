// app/api/admin/white-label/route.ts
// Admin CRUD for white-label partner configurations.
// GET  → list all partners
// POST → create partner
// PATCH?slug= → update partner
// DELETE?slug= → delete partner
//
// Public GET /api/admin/white-label?slug=<slug> (no auth) → fetch single partner for branding

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAdminId } from '../../../../lib/adminAuth';
import { auth } from '@clerk/nextjs/server';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function ensureTable() {
  try {
    await db().rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS white_label_partners (
          id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          slug        text UNIQUE NOT NULL,
          name        text NOT NULL,
          logo_url    text,
          tagline     text,
          accent_color text DEFAULT '#00e87a',
          contact_email text,
          active      boolean DEFAULT true,
          created_at  timestamptz DEFAULT now(),
          updated_at  timestamptz DEFAULT now()
        );
      `,
    });
  } catch { /* table may already exist */ }
}

// ── Hardcoded demo partners — work before DB table is created ─────────────────
const DEMO_PARTNERS: Record<string, { slug: string; name: string; logo_url: string | null; tagline: string | null; accent_color: string; contact_email: string | null }> = {
  'groves-capital': {
    slug: 'groves-capital',
    name: 'Groves Capital',
    logo_url: 'https://grovescapital.com/wp-content/uploads/2023/01/Groves-Capital-Logo.png',
    tagline: 'Let Us Welcome You Home',
    accent_color: '#7c5cbf',
    contact_email: 'support@grovescapital.com',
  },
};

// ── Public: fetch single partner by slug ─────────────────────────────────────
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (slug) {
    // Try DB first; fall back to hardcoded demo config if table missing
    try {
      const { data, error } = await db()
        .from('white_label_partners')
        .select('slug, name, logo_url, tagline, accent_color, contact_email')
        .eq('slug', slug)
        .eq('active', true)
        .maybeSingle();
      if (!error && data) return NextResponse.json({ ok: true, partner: data });
    } catch { /* table not yet created */ }
    // Fallback to hardcoded demo config
    const demo = DEMO_PARTNERS[slug];
    if (demo) return NextResponse.json({ ok: true, partner: demo });
    return NextResponse.json({ ok: false, error: 'Partner not found' }, { status: 404 });
  }

  // Admin: list all
  const { userId } = await auth();
  if (!await isAdminId(userId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { data } = await db()
      .from('white_label_partners')
      .select('*')
      .order('created_at', { ascending: false });
    return NextResponse.json({ ok: true, partners: data ?? [] });
  } catch {
    // Table not yet created — return hardcoded demos so admin page still loads
    return NextResponse.json({ ok: true, partners: Object.values(DEMO_PARTNERS).map(p => ({ ...p, id: p.slug, active: true, created_at: new Date().toISOString() })) });
  }
}

// ── Admin: create ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!await isAdminId(userId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await ensureTable();
  const body = await req.json();
  const { slug, name, logo_url, tagline, accent_color, contact_email } = body;
  if (!slug || !name) return NextResponse.json({ error: 'slug and name required' }, { status: 400 });
  const { data, error } = await db()
    .from('white_label_partners')
    .insert({ slug, name, logo_url, tagline, accent_color: accent_color ?? '#00e87a', contact_email })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, partner: data });
}

// ── Admin: update ─────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!await isAdminId(userId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug param required' }, { status: 400 });
  const body = await req.json();
  const { data, error } = await db()
    .from('white_label_partners')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('slug', slug)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, partner: data });
}

// ── Admin: delete ─────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!await isAdminId(userId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug param required' }, { status: 400 });
  await db().from('white_label_partners').delete().eq('slug', slug);
  return NextResponse.json({ ok: true });
}
