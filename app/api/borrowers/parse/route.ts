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

    // Verify LO profile
    const supabase = db();
    const { data: lo } = await supabase
        .from('loan_officers')
        .select('id')
        .eq('user_id', userId)
        .single();
    if (!lo) return NextResponse.json({ error: 'LO profile not found' }, { status: 400 });

    const body = await req.json().catch(() => null);
    const text: string = body?.text ?? '';
    if (!text.trim()) return NextResponse.json({ error: 'text is required' }, { status: 400 });
    if (text.length > 8000) return NextResponse.json({ error: 'Input too long (max 8,000 characters)' }, { status: 400 });

    if (!XAI_API_KEY) return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });

    const today = new Date().toISOString().slice(0, 10);

    const prompt = `You are a data extraction assistant for a mortgage platform. Extract all borrower/prospect records from the text below.

The text may be: a forwarded email, spreadsheet rows pasted as text, handwritten notes, a CRM export, or any other format.

TODAY: ${today}

TEXT TO PARSE:
"""
${text}
"""

Extract every distinct person who appears to be a borrower/prospect/client. For each person return:
- name: full name (required — skip if no name found)
- email: email address or null
- property_address: full property address including city/state/zip if present, or null
- purchase_price: purchase price as a number (no $ or commas) or null
- loan_amount: loan amount as a number if explicitly stated, or null
- close_date: closing/settlement date as YYYY-MM-DD if present, or null (convert "June 2026" → "2026-06-01", "Q2 2026" → "2026-04-01")
- notes: any other relevant notes (down payment %, credit score, rate mentioned) as a short string, or null
- confidence: "high" (clear data), "medium" (some ambiguity), or "low" (guessed)

Rules:
- Only include records where you found a name
- If the same person appears multiple times, merge into one record
- Do NOT invent data — if a field is not present, use null
- Dollar amounts: "750k" = 750000, "$1.2M" = 1200000

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
                max_tokens: 1500,
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
