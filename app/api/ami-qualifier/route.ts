import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// HUD standard household size adjustment factors (relative to 4-person AMI)
const AMI_SIZE_FACTORS: Record<number, number> = {
  1: 0.70, 2: 0.80, 3: 0.90, 4: 1.00,
  5: 1.08, 6: 1.16, 7: 1.24, 8: 1.32,
};

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

function extractZip(input: string): string | null {
  const m = input.match(/\b(\d{5})\b/);
  return m ? m[1] : null;
}

// Detects "Orange County, CA" or "Los Angeles County" style inputs
function parseCountyInput(input: string): { name: string; state: string | null } | null {
  if (!/county/i.test(input)) return null;
  const stateM = input.match(/,\s*([A-Z]{2})\s*$/i);
  const state = stateM ? stateM[1].toUpperCase() : null;
  const name = (stateM ? input.slice(0, stateM.index) : input).trim();
  return name ? { name, state } : null;
}

function amiForSize(ami4: number, size: number): number {
  const factor = AMI_SIZE_FACTORS[Math.max(1, Math.min(8, size))] ?? 1.00;
  return Math.round(ami4 * factor);
}

function computeThresholds(ami4: number, size: number, stored80?: number | null, stored50?: number | null, stored120?: number | null) {
  const amiForHH = amiForSize(ami4, size);
  // GSE programs (HomeReady, Home Possible) always use the 4-person area AMI — no household
  // size adjustment. Stored HUD il80_p4 is the authoritative 4-person figure.
  const ami80  = stored80 ?? Math.round(ami4 * 0.80);
  // HUD / DPA thresholds are household-size adjusted
  const ami50  = size === 4 && stored50  ? stored50  : Math.round(amiForHH * 0.50);
  const ami120 = size === 4 && stored120 ? stored120 : Math.round(amiForHH * 1.20);
  return { amiForHH, ami80, ami50, ami120 };
}

export async function POST(req: NextRequest) {
  try {
    const { location, annualIncome, householdSize = 4 } = await req.json();

    if (!location?.trim()) {
      return NextResponse.json({ ok: false, error: 'Location is required' }, { status: 400 });
    }
    if (!annualIncome || Number(annualIncome) <= 0) {
      return NextResponse.json({ ok: false, error: 'Annual income is required' }, { status: 400 });
    }

    const sb = db();
    const income = Number(annualIncome);
    const size = Math.max(1, Math.min(8, Number(householdSize) || 4));
    const loc = location.trim();

    let hud: Record<string, number | string | null> | null = null;
    let countyName: string | null = null;
    let stateAbbr: string | null = null;
    let resolvedZip: string | null = null;
    let resolvedFrom: 'zip' | 'address' | 'county' = 'address';

    // ── Strategy 1: ZIP present in input (bare ZIP or address containing ZIP) ──
    const zip = extractZip(loc);
    if (zip) {
      resolvedZip = zip;
      resolvedFrom = /^\d{5}$/.test(loc) ? 'zip' : 'address';

      const { data: xw } = await sb
        .from('geo_crosswalk')
        .select('county_fips, county_name, state_abbr')
        .eq('zip', zip)
        .order('res_ratio', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (xw) {
        countyName = xw.county_name as string;
        stateAbbr = xw.state_abbr as string;

        const { data } = await sb
          .from('hud_features')
          .select('ami_4person, ami_80pct, ami_50pct, ami_120pct, fiscal_year, county_name, state_abbr')
          .eq('county_fips', xw.county_fips)
          .order('fiscal_year', { ascending: false })
          .limit(1)
          .maybeSingle();

        hud = data;
        if (hud) {
          countyName = (hud.county_name as string) ?? countyName;
          stateAbbr  = (hud.state_abbr  as string) ?? stateAbbr;
        }
      }
    }

    // ── Strategy 2: County name (e.g. "Orange County, CA") ──────────────────
    if (!hud) {
      const parsed = parseCountyInput(loc);
      if (parsed) {
        resolvedFrom = 'county';
        let q = sb
          .from('hud_features')
          .select('ami_4person, ami_80pct, ami_50pct, ami_120pct, fiscal_year, county_name, state_abbr')
          .ilike('county_name', `%${parsed.name}%`)
          .order('fiscal_year', { ascending: false })
          .limit(1);
        if (parsed.state) q = (q as any).eq('state_abbr', parsed.state);

        const { data } = await (q as any).maybeSingle();
        hud = data;
        if (hud) {
          countyName = hud.county_name as string;
          stateAbbr  = hud.state_abbr  as string;
        }
      }
    }

    if (!hud || !hud.ami_4person) {
      return NextResponse.json({
        ok: false,
        error: 'No AMI data found for this location. Try a 5-digit ZIP code (e.g. 92679) or county name (e.g. Orange County, CA).',
      }, { status: 404 });
    }

    const ami4 = Number(hud.ami_4person);
    const { amiForHH, ami80, ami50, ami120 } = computeThresholds(
      ami4, size,
      hud.ami_80pct  ? Number(hud.ami_80pct)  : null,
      hud.ami_50pct  ? Number(hud.ami_50pct)  : null,
      hud.ami_120pct ? Number(hud.ami_120pct) : null,
    );

    // Primary metric: income vs 4-person area AMI (GSE basis used by HomeReady/Home Possible)
    const incomeAsPct = Math.round((income / ami4) * 100);

    return NextResponse.json({
      ok: true,
      result: {
        resolvedFrom,
        county:   countyName ?? 'Unknown County',
        state:    stateAbbr  ?? '',
        zip:      resolvedZip ?? undefined,

        // AMI baselines
        ami4Person:          ami4,
        amiForHouseholdSize: amiForHH,
        ami80pct:            ami80,
        ami50pct:            ami50,
        ami120pct:           ami120,

        // Borrower position
        annualIncome:     income,
        householdSize:    size,
        incomeAsPctOfAmi: incomeAsPct,

        // Program qualification
        programs: {
          homeReady:    income <= ami80,
          homePossible: income <= ami80,
          dpa:          income <= ami120,
        },

        fiscalYear:  Number(hud.fiscal_year) || 2025,
        dataSource:  'HUD Income Limits — huduser.gov (publicly available)',
      },
    });

  } catch (err) {
    console.error('[ami-qualifier]', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
