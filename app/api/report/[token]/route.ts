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
        .select('borrower_id, lo_id, agent_id')
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

    // Fetch pro profile — LO or agent
    let proUserId = '';
    let proLender: string | null = null;
    let proNmls: string | null = null;
    let proCompanyNmls: string | null = null;
    let proTitle: string | null = null;
    let proPhone: string | null = null;
    let proWebsite: string | null = null;
    let proOffice: string | null = null;

    if (report.lo_id) {
        const { data: lo } = await supabase
            .from('loan_officers')
            .select('user_id, lender, nmls, company_nmls, title, phone, website, office_address')
            .eq('id', report.lo_id)
            .single();
        if (!lo) return NextResponse.json({ error: 'LO not found' }, { status: 404 });
        proUserId = lo.user_id;
        proLender = lo.lender; proNmls = lo.nmls; proCompanyNmls = lo.company_nmls;
        proTitle = lo.title; proPhone = lo.phone; proWebsite = lo.website; proOffice = lo.office_address;
    } else if (report.agent_id) {
        const { data: agent } = await supabase
            .from('agents')
            .select('user_id, brokerage, license, title, phone, website, office_address')
            .eq('id', report.agent_id)
            .single();
        if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
        proUserId = agent.user_id;
        proLender = agent.brokerage; proNmls = agent.license;
        proTitle = agent.title; proPhone = agent.phone; proWebsite = agent.website; proOffice = agent.office_address;
    } else {
        return NextResponse.json({ error: 'Report has no owner' }, { status: 404 });
    }

    // Fetch name + photo from Clerk
    let loName = 'Your Agent';
    let loEmail = '';
    let loPhoto = '';
    try {
        const clerk = await clerkClient();
        const clerkUser = await clerk.users.getUser(proUserId);
        const clerkName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ');
        if (clerkName) loName = clerkName;
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
            lender:         proLender,
            nmls:           proNmls,
            company_nmls:   proCompanyNmls,
            title:          proTitle,
            phone:          proPhone,
            website:        proWebsite,
            office_address: proOffice,
        },
    });
}
