// app/api/rate-marketplace/opt-in/route.ts
// Records a borrower's explicit opt-in to connect with a specific lender.
// Only the scenario snapshot (no behavioral data, no exact FICO) is stored.
// This is the billing trigger event — one flat fee per confirmed opt-in.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function creditBand(score: number): string {
  if (score >= 760) return '760+';
  if (score >= 740) return '740–759';
  if (score >= 720) return '720–739';
  if (score >= 700) return '700–719';
  if (score >= 680) return '680–699';
  if (score >= 660) return '660–679';
  if (score >= 640) return '640–659';
  if (score >= 620) return '620–639';
  return '<620';
}

export async function POST(req: NextRequest) {
  let body: {
    lenderId: string;
    scenario: Record<string, unknown>;
    contactName: string;
    contactEmail: string;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { lenderId, scenario, contactName, contactEmail } = body;

  if (!lenderId || typeof lenderId !== 'string') {
    return NextResponse.json({ error: 'Missing lenderId' }, { status: 400 });
  }
  if (!contactName?.trim() || !contactEmail?.trim()) {
    return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
  }
  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
  }

  // Build privacy-safe scenario snapshot:
  // Send credit score BAND, not exact score. No address, no behavioral history.
  const snapshot = {
    ltv:            scenario.ltv,
    loanAmount:     scenario.loanAmount,
    creditScoreBand: creditBand(Number(scenario.creditScore ?? 720)),
    loanType:       scenario.loanType,
    occupancy:      scenario.occupancy,
    loanPurpose:    scenario.loanPurpose,
    lockDays:       scenario.lockDays,
    state:          scenario.state,
    // Borrower-provided contact (the only PII we store)
    contactName:    contactName.trim(),
    contactEmail:   contactEmail.trim().toLowerCase(),
  };

  const { data, error } = await db()
    .from('marketplace_opt_ins')
    .insert({
      lender_id:         lenderId,
      scenario_snapshot: snapshot,
      fee_charged:       false,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[opt-in] insert error:', error.message);
    return NextResponse.json({ error: 'Failed to record opt-in' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, optInId: data.id });
}
