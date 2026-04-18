// app/api/report/[token]/route.ts
// GET — fetch all data needed to render a borrower report page (public, no auth)

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { clerkClient } from '@clerk/nextjs/server';

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
}

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ token: string }> },
) {
    const { token } = await params;
    if (!token) return NextResponse.json({ error: 'Invalid token' }, { status: 400 });

    const supabase = db();

    const { data: report } = await supabase
        .from('borrower_reports')
        .select('borrower_id, lo_id')
        .eq('token', token)
        .single();
    if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

    // Fetch borrower
    const { data: borrower } = await supabase
        .from('borrowers')
        .select('id, name, email, property_address, actual_balance, actual_rate, actual_purchase_price, actual_purchase_date')
        .eq('id', report.borrower_id)
        .single();
    if (!borrower) return NextResponse.json({ error: 'Borrower not found' }, { status: 404 });

    // Fetch LO profile
    const { data: lo } = await supabase
        .from('loan_officers')
        .select('id, user_id, lender, nmls, company_nmls, title, phone, website, office_address')
        .eq('id', report.lo_id)
        .single();
    if (!lo) return NextResponse.json({ error: 'LO not found' }, { status: 404 });

    // Fetch LO name + photo from Clerk
    let loName = 'Your Loan Officer';
    let loEmail = '';
    let loPhoto = '';
    try {
        const clerk = await clerkClient();
        const clerkUser = await clerk.users.getUser(lo.user_id);
        loName  = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || loName;
        loEmail = clerkUser.emailAddresses?.[0]?.emailAddress ?? '';
        loPhoto = clerkUser.imageUrl ?? '';
    } catch {}

    return NextResponse.json({
        ok: true,
        borrower: {
            name:                 borrower.name,
            property_address:     borrower.property_address,
            actual_balance:       borrower.actual_balance,
            actual_rate:          borrower.actual_rate,
            actual_purchase_price: borrower.actual_purchase_price,
            actual_purchase_date: borrower.actual_purchase_date,
        },
        lo: {
            name:           loName,
            email:          loEmail,
            photo:          loPhoto,
            lender:         lo.lender,
            nmls:           lo.nmls,
            company_nmls:   lo.company_nmls,
            title:          lo.title,
            phone:          lo.phone,
            website:        lo.website,
            office_address: lo.office_address,
        },
    });
}
