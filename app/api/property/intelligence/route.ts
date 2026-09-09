// app/api/property/intelligence/route.ts
//
// Canonical Property Intelligence Consistency Workstream, Stage E (2026-09-08).
//
// First-party-only, read-only endpoint so app/chat/page.tsx's property_lookup
// branch can consume the SAME canonical valuation/financing/ownership-cost
// figures the external MCP Gateway already does, instead of re-deriving them
// client-side with its own inline math + hardcoded constants (the exact
// first-party/external drift the canonical-consistency audit found).
//
// Deliberately address-keyed, not id-keyed: /api/property/lookup's response
// contract was left untouched (no properties.id added to it) -- this route
// calls the SAME resolvePropertyId(address) the rest of the Gateway already
// relies on, so the client only ever needs the address string it already has
// (from /api/property/lookup's own response) to fetch this. No second ID
// invented, no change to any other route's contract.
//
// This is NOT the external MCP contract -- no OAuth, no Gateway auth, no
// rate limits, no kill switch. Deliberately so: this is an ordinary
// same-origin first-party page fetch, identical in kind to /api/ticker or
// /api/rate-intelligence-engine, not a new external-facing surface. Nothing
// about the Gateway's security posture is relevant here, changed, or
// bypassed -- this route never reads the `properties` table on the
// external caller's behalf; it has no relationship to the MCP tool at all.
//
// Response is a narrow, explicit allowlist -- never the full canonical
// object. Omits propertyId, decisionIntelligence (L2/L3/L4/methodologyVersion/
// source), rateIntelligence (Rate Intelligence stays on its own existing
// /api/rate-intelligence-engine fetch, untouched by this workstream), and
// provenance internals. Same "explicit allowed fields, never spread the raw
// object" discipline lib/gateway/outputShaping.ts already uses, applied here
// for a first-party consumer instead of an external one.
//
// Read-only: calls buildCanonicalPropertyIntelligence(), which itself only
// ever reads already-enriched data (see that file's own header) -- no
// Tavily/Grok/GPT-4o call, no acquisition, no write.

import { NextRequest, NextResponse } from 'next/server';
import { resolvePropertyId } from '../../../../lib/gateway/intelligenceGateway';
import { buildCanonicalPropertyIntelligence } from '../../../../lib/canonicalPropertyIntelligence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ADDRESS_LENGTH = 300;

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')?.trim();
  if (!address || address.length === 0 || address.length > MAX_ADDRESS_LENGTH) {
    return NextResponse.json({ ok: false, error: 'address is required and must be 1-300 characters.' }, { status: 400 });
  }

  try {
    const propertyId = await resolvePropertyId(address);
    if (!propertyId) {
      return NextResponse.json({ ok: false, error: 'No canonical property record for this address.' }, { status: 404 });
    }

    const canonical = await buildCanonicalPropertyIntelligence(propertyId);
    if (!canonical) {
      return NextResponse.json({ ok: false, error: 'No canonical property record for this address.' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        valuation: {
          pointEstimate: canonical.valuation.pointEstimate,
          asOf: canonical.valuation.asOf,
        },
        financing: canonical.financing
          ? {
              propertyMarketRate: {
                rate: canonical.financing.propertyMarketRate.rate,
                label: canonical.financing.propertyMarketRate.label,
              },
              principalInterestMonthly: canonical.financing.principalInterestMonthly,
              loanAmount: canonical.financing.loanAmount,
            }
          : null,
        ownershipCosts: canonical.ownershipCosts
          ? {
              monthlyTaxes: canonical.ownershipCosts.monthlyTaxes,
              taxRateEffective: canonical.ownershipCosts.taxRateEffective.rate,
              monthlyInsurance: canonical.ownershipCosts.monthlyInsurance,
              insuranceAssumption: canonical.ownershipCosts.insuranceAssumption,
              hoaMonthly: canonical.ownershipCosts.hoaMonthly,
              hoaConfirmed: canonical.ownershipCosts.hoaConfirmed,
              pitiMonthly: canonical.ownershipCosts.pitiMonthly,
              pitiaMonthly: canonical.ownershipCosts.pitiaMonthly,
            }
          : null,
      },
    });
  } catch (e: unknown) {
    console.error('[property/intelligence] uncaught error', { error: (e as Error)?.message });
    return NextResponse.json({ ok: false, error: 'An internal error occurred.' }, { status: 500 });
  }
}
