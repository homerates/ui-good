// app/api/discover/session/[id]/route.ts
// PATCH /api/discover/session/:id — merge one domain's Finding into the
// session's findings JSONB. Atomic via the discover_merge_finding() Postgres
// function (081_discover_findings.sql) -- never a JS read-modify-write, so
// concurrent writes (a different domain, or this same domain's later
// AI-explanation update) can never clobber each other.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const VALID_DOMAINS = ['rate', 'costs', 'process', 'after-close'];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { domain, finding } = body;

    if (!domain || !VALID_DOMAINS.includes(domain)) {
      return NextResponse.json({ error: 'valid domain required' }, { status: 400 });
    }
    if (!finding || typeof finding !== 'object') {
      return NextResponse.json({ error: 'finding object required' }, { status: 400 });
    }

    const { error } = await db().rpc('discover_merge_finding', {
      p_session_id: id,
      p_domain: domain,
      p_finding: finding,
    });

    if (error) {
      console.error('[discover/session/[id] PATCH]', error);
      return NextResponse.json({ error: 'db error' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[discover/session/[id] PATCH]', err);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
