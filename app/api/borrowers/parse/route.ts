// app/api/borrowers/parse/route.ts
// POST — extract structured borrower data from any freeform text using Grok.
// Auth: Clerk LO session (same as /api/borrowers)

export const runtime = 'nodejs';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_MODEL   = 'grok-4-1-fast-non-reasoning';

export type ParsedBorrower = {
    name:             string;
    email:            string | null;
    property_address: string | null;
    purchase_price:   number | null;
    loan_amount:      number | null;
    interest_rate:    number | null; // e.g. 5.99 (not 0.0599)
    close_date:       string | null; // ISO date YYYY-MM-DD or null
    notes:            string | null;
    confidence:       'high' | 'medium' | 'low';
};

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
}

export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    // Verify LO or agent profile
    const supabase = db();
    const [loRes, agentRes] = await Promise.all([
        supabase.from('loan_officers').select('id').eq('user_id', userId).maybeSingle(),
        supabase.from('agents').select('id').eq('user_id', userId).maybeSingle(),
    ]);
    if (!loRes.data && !agentRes.data) return NextResponse.json({ error: 'Professional profile not found' }, { status: 400 });

    const body = await req.json().catch(() => null);
    const text: string = body?.text ?? '';
    if (!text.trim()) return NextResponse.json({ error: 'text is required' }, { status: 400 });
    if (text.length > 8000) return NextResponse.json({ error: 'Input too long (max 8,000 characters)' }, { status: 400 });

    if (!XAI_API_KEY) return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });

    const today = new Date().toISOString().slice(0, 10);

    const prompt = `You are a data extraction assistant for a real estate and mortgage platform. Extract all client/prospect records from the text below.

The text may come from a loan officer OR a real estate agent. It may be: a forwarded email, spreadsheet rows, handwritten notes, a CRM export, MLS data, or any other format.

TODAY: ${today}

TEXT TO PARSE:
"""
${text}
"""

Extract every distinct person who appears to be a client/borrower/buyer/seller/prospect. For each person return:
- name: full name (required — skip if no name found)
- email: email address or null
- property_address: full property address including city/state/zip if present, or null
- purchase_price: purchase/sale/list price as a number (no $ or commas) or null. "$980k" = 980000, "$1.2M" = 1200000
- loan_amount: loan/mortgage amount as a number if explicitly stated, or null (often absent for agent data)
- interest_rate: mortgage rate as a decimal number (e.g. "5.99%" → 5.99) or null. Look for: "rate", "at X%", "locked at"
- close_date: closing/sold/settlement date as YYYY-MM-DD or null. "4/7/2026" → "2026-04-07", "June 2026" → "2026-06-01", "Feb 2018" → "2018-02-01"
- notes: any remaining relevant details (property type, buyer/seller side, listing status, bedrooms) as a short string, or null
- confidence: "high" (clear explicit data), "medium" (some ambiguity), or "low" (guessed)

Rules:
- Only include records where you found a name
- If the same person appears multiple times, merge into one record
- Do NOT invent data — if a field is not present, use null
- For agent data: focus on extracting address, sale price, and close date — loan fields will often be null

Return valid JSON only:
{"borrowers": [...]}`;

    try {
        const res = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${XAI_API_KEY}` },
            body: JSON.stringify({
                model: XAI_MODEL,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                max_tokens: 3000,
                response_format: { type: 'json_object' },
            }),
            signal: AbortSignal.timeout(20_000),
        });

        if (!res.ok) return NextResponse.json({ error: 'AI service error' }, { status: 502 });

        const json  = await res.json();
        const raw   = json.choices?.[0]?.message?.content;
        if (!raw)   return NextResponse.json({ error: 'No response from AI' }, { status: 502 });

        const parsed = JSON.parse(raw);
        const borrowers: ParsedBorrower[] = (parsed.borrowers ?? []).filter(
            (b: any) => typeof b.name === 'string' && b.name.trim().length > 0,
        );

        return NextResponse.json({ ok: true, borrowers });
    } catch (e) {
        console.error('[borrowers/parse]', e);
        return NextResponse.json({ error: 'Parse failed' }, { status: 500 });
    }
}
