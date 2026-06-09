// app/api/portfolio/[id]/route.ts
// GET    /api/portfolio/[id]  — return single item including messages (for Resume restore)
// PATCH  /api/portfolio/[id]  — update a specific item's data / stage
// DELETE /api/portfolio/[id]  — remove an item

export const runtime = 'nodejs';

import { NextResponse }  from 'next/server';
import { auth }          from '@clerk/nextjs/server';
import { getSupabase }   from '../../../../lib/supabaseServer';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 503 });

  const { id } = await params;
  const { data, error } = await sb
    .from('portfolio_items')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
  return NextResponse.json({ ok: true, item: data });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 503 });

  const { id } = await params;
  const body = await req.json();
  const now = new Date().toISOString();

  // If body.data is provided, merge with existing data rather than replace
  if (body.data) {
    const { data: current } = await sb
      .from('portfolio_items')
      .select('data')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    if (current) {
      body.data = { ...(current.data as Record<string, unknown>), ...body.data };
    }
  }

  const { data, error } = await sb
    .from('portfolio_items')
    .update({ ...body, updated_at: now, last_accessed_at: now })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 503 });

  const { id } = await params;
  const { error } = await sb
    .from('portfolio_items')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
