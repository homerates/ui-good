import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AMI_SIZE_FACTORS } from '@/amiSizeFactors';
import { checkFfiecEligibility } from '@/ffiecEligibility';
import { geocodeAddress, geocodeCoordinates } from '@/censusGeocoder';
import { HIGH_COST_COUNTIES, NATIONAL_CONFORMING_BASELINE } from '@/loanLimitsNational2026';
import { CA_LOAN_LIMITS_2026 } from '@/loanLimits2026';

export interface ConformingLimits {
  units1: number; units2: number; units3: number; units4: number;
  isHighBalance: boolean;
}

// Two-pass county name matching — HUD stores bare names ("Ventura"),
// national limits may use " COUNTY" suffix ("KING COUNTY") or bare ("ALAMEDA").
function resolveConformingLimits(state: string, county: string): ConformingLimits {
  const raw      = county.toUpperCase().trim();
  const stripped = raw.replace(/\s+(COUNTY|PARISH|BOROUGH|MUNICIPALITY|CENSUS AREA)$/i, '').trim();
  const baseline = NATIONAL_CONFORMING_BASELINE;

  if (state === 'CA') {
    const ca = CA_LOAN_LIMITS_2026.find(c => c.county === stripped || c.county === raw);
    if (ca) return { ...ca.conforming, isHighBalance: ca.isHighBalance };
    return { ...baseline, isHighBalance: false };
  }

  const list = HIGH_COST_COUNTIES[state] ?? [];
  const exact = list.find(c => c.county === raw);
  if (exact) return { ...exact.conforming, isHighBalance: exact.isHighBalance };
  const suffixed = list.find(c => c.county === stripped + ' COUNTY');
  if (suffixed) return { ...suffixed.conforming, isHighBalance: suffixed.isHighBalance };
  return { ...baseline, isHighBalance: false };
}

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

function extractZip(input: string): string | null {
  // Use the LAST 5-digit sequence — house numbers like "12104" appear first;
  // the actual ZIP is always at or near the end of a US address string.
  const all = [...input.matchAll(/\b(\d{5})\b/g)];
  return all.length > 0 ? all[all.length - 1][1] : null;
}

function parseCountyInput(input: string): { name: string; state: string | null } | null {
  if (!/county/i.test(input)) return null;
  const stateM = input.match(/,\s*([A-Z]{2})\s*$/i);
  const state = stateM ? stateM[1].toUpperCase() : null;
  const raw = (stateM ? input.slice(0, stateM.index) : input).trim();
  // hud_features stores bare names ("Ventura", not "Ventura County") — strip administrative suffix
  const name = raw.replace(/\s+(county|parish|borough|census area|municipality)\s*$/i, '').trim();
  return name ? { name, state } : null;
}

function amiForSize(ami4: number, size: number): number {
  const factor = AMI_SIZE_FACTORS[Math.max(1, Math.min(8, size))] ?? 1.00;
  return Math.round(ami4 * factor);
}

export async function POST(req: NextRequest) {
  try {
    const { location, annualIncome, householdSize = 4, lat, lng } = await req.json();

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

    let countyFips: string | null = null;
    let countyName: string | null = null;
    let stateAbbr: string | null = null;
    let resolvedZip: string | null = null;
    let resolvedFrom: 'zip' | 'address' | 'county' = 'address';

    // ── Strategy 0: trusted coordinates (e.g. a Google Places selection) ──────
    // Runs before all text-based strategies when the caller supplies lat/lng —
    // this is the fix for bare city-name inputs like "Menifee, CA" whose city
    // name doesn't match its county name (strategy 3 below only catches the
    // lucky subset of CA cities where city name == county name). Reverse-geocodes
    // via the Census "coordinates" endpoint (direct spatial join, not text matching),
    // so it resolves correctly regardless of city/county name relationship.
    // Purely additive — does not reorder or change strategies 1-4 below.
    const latNum = typeof lat === 'number' ? lat : Number(lat);
    const lngNum = typeof lng === 'number' ? lng : Number(lng);
    if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
      try {
        const geo = await geocodeCoordinates(latNum, lngNum);
        if (geo) {
          const derivedFips = geo.censusTractGeoid.slice(0, 5);
          const { data: hudGeo } = await sb
            .from('hud_features')
            .select('county_fips, county_name, state_abbr')
            .eq('county_fips', derivedFips)
            .order('fiscal_year', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (hudGeo) {
            resolvedFrom = 'address';
            countyFips = hudGeo.county_fips as string;
            countyName = hudGeo.county_name as string;
            stateAbbr  = hudGeo.state_abbr  as string;
          }
        }
      } catch {
        // geocoder errors are non-fatal — fall through to text-based strategies
      }
    }

    // ── Strategy 1: ZIP present in input ──────────────────────────────────────
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
        countyFips = xw.county_fips as string;
        countyName = xw.county_name as string;
        stateAbbr  = xw.state_abbr  as string;
      }
    }

    // ── Strategy 2: County name ────────────────────────────────────────────────
    if (!countyFips) {
      const parsed = parseCountyInput(loc);
      if (parsed) {
        resolvedFrom = 'county';
        let q = sb
          .from('hud_features')
          .select('county_fips, county_name, state_abbr')
          .ilike('county_name', `%${parsed.name}%`)
          .order('fiscal_year', { ascending: false })
          .limit(1);
        if (parsed.state) q = (q as any).eq('state_abbr', parsed.state);
        const { data } = await (q as any).maybeSingle();
        if (data) {
          countyFips = data.county_fips as string;
          countyName = data.county_name as string;
          stateAbbr  = data.state_abbr  as string;
        }
      }
    }

    // ── Strategy 3: City + state from full address or bare "City, ST" input ──
    // Two-comma form: "10951 Lotta Ct, San Diego, CA 92126" → city=San Diego, state=CA
    // One-comma form: "Ventura, CA" → only works when city name = county name in hud_features
    if (!countyFips) {
      const cityStateM =
        loc.match(/,\s*([^,\d]+?)\s*,\s*([A-Z]{2})\s*(?:\d{5})?$/i) ??
        loc.match(/^([^,\d][^,]*?)\s*,\s*([A-Z]{2})\s*(?:\d{5})?$/i);
      if (cityStateM) {
        const city  = cityStateM[1].trim();
        const state = cityStateM[2].toUpperCase();
        const { data: cityData } = await sb
          .from('hud_features')
          .select('county_fips, county_name, state_abbr')
          .eq('state_abbr', state)
          .ilike('county_name', `%${city}%`)
          .order('fiscal_year', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cityData) {
          resolvedFrom = 'address';
          countyFips = cityData.county_fips as string;
          countyName = cityData.county_name as string;
          stateAbbr  = cityData.state_abbr  as string;
        }
      }
    }

    // ── Strategy 4: full-address geocoder → derive county from GEOID ─────────
    // Last-resort for addresses whose ZIP is not in geo_crosswalk and whose
    // city name doesn't match any county name in hud_features.
    // Pattern: input starts with a house number (digit then letter) = full street address.
    if (!countyFips && /^\d+\s+[A-Za-z]/.test(loc)) {
      try {
        const geo = await geocodeAddress(loc);
        if (geo) {
          // GEOID = SSCCCTTTTTT — first 5 chars are state+county FIPS
          const derivedFips = geo.censusTractGeoid.slice(0, 5);
          const { data: hudGeo } = await sb
            .from('hud_features')
            .select('county_fips, county_name, state_abbr')
            .eq('county_fips', derivedFips)
            .order('fiscal_year', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (hudGeo) {
            resolvedFrom = 'address';
            countyFips = hudGeo.county_fips as string;
            countyName = hudGeo.county_name as string;
            stateAbbr  = hudGeo.state_abbr  as string;
          }
        }
      } catch {
        // geocoder errors are non-fatal for county resolution — fall through to 404
      }
    }

    if (!countyFips) {
      return NextResponse.json({
        ok: false,
        error: 'No AMI data found for this location. Try a 5-digit ZIP code (e.g. 92679) or county name (e.g. San Diego County, CA).',
      }, { status: 404 });
    }

    // ── Fetch GSE AMI, HUD AMI, and active DPA programs in parallel ──────────────
    const [gseRes, hudRes, dpaProgramsRes] = await Promise.all([
      sb.from('gse_ami')
        .select('ami_fhfa, fiscal_year')
        .eq('county_fips', countyFips)
        .maybeSingle(),
      sb.from('hud_features')
        .select('ami_4person, ami_50pct, ami_120pct, fiscal_year, county_name, state_abbr')
        .eq('county_fips', countyFips)
        .order('fiscal_year', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // All active DPA programs (small set — filter in JS by geography)
      sb.from('dpa_programs')
        .select('id, lender_id, coverage_type, eligible_states, eligible_county_fips, income_limit')
        .eq('active', true),
    ]);

    const gse = gseRes.data;
    const hud = hudRes.data;

    if (!gse && (!hud || !hud.ami_4person)) {
      return NextResponse.json({
        ok: false,
        error: 'No AMI data found for this location. Try a 5-digit ZIP code (e.g. 92679) or county name (e.g. Orange County, CA).',
      }, { status: 404 });
    }

    // Override county name/state from HUD if more complete
    if (hud) {
      countyName = (hud.county_name as string) ?? countyName;
      stateAbbr  = (hud.state_abbr  as string) ?? stateAbbr;
    }

    // ── AMI for HomeReady / Home Possible: FHFA (GSE) source if available ─────
    // This is the accurate agency figure used by DU/LPA. Falls back to HUD.
    const gseAmi4   = gse ? Number(gse.ami_fhfa) : null;
    const hudAmi4   = hud?.ami_4person ? Number(hud.ami_4person) : null;
    const ami4      = gseAmi4 ?? hudAmi4 ?? 0;
    const dataSource: 'FHFA' | 'HUD' = gseAmi4 ? 'FHFA' : 'HUD';

    if (!ami4) {
      return NextResponse.json({ ok: false, error: 'AMI data unavailable for this location.' }, { status: 404 });
    }

    // GSE 80% limit — always direct calculation, no hold-harmless adjustment
    const ami80 = Math.round(ami4 * 0.80);

    // HUD household-size adjusted thresholds (for DPA / Section 8 programs)
    const hudBase   = hudAmi4 ?? ami4;
    const amiForHH  = Math.round(hudBase * (AMI_SIZE_FACTORS[Math.max(1, Math.min(8, size))] ?? 1.00));
    // ami50 is computed but NOT displayed in the UI.
    // Flat ami4×0.50 has no backing program rule (HUD VLI is size-adjusted per il50_p1-p8).
    // TODO: replace with real HUD Section 8 / VLI ingestion (Priority 3 architectural decision).
    const ami50     = Math.round(ami4 * 0.50);
    const hudAmi120 = hud?.ami_120pct ? Number(hud.ami_120pct) : Math.round(amiForHH * 1.20);
    const hudAmi120Final = size === 4 ? hudAmi120 : Math.round(amiForHH * 1.20);

    // Compare income against household-size-adjusted AMI for the display bar.
    // FNMA HomeReady / HP eligibility still uses the unadjusted ami80 (agency rule).
    const incomeAsPct = Math.round((income / amiForHH) * 100);
    const fiscalYear  = gse ? Number(gse.fiscal_year) : (hud ? Number(hud.fiscal_year) : 2026);

    // ── DPA program matching ───────────────────────────────────────────────────
    // Match programs by geography + income limit, then filter to active lenders
    let dpaMatchCount = 0;
    let dpaGeoMatchedCount = 0;
    const allDpaPrograms = dpaProgramsRes.data ?? [];
    if (allDpaPrograms.length > 0) {
      const geoMatched = allDpaPrograms.filter(p => {
        if (p.coverage_type === 'nationwide') return true;
        if (p.coverage_type === 'state' && stateAbbr && (p.eligible_states as string[]).includes(stateAbbr)) return true;
        if (p.coverage_type === 'county' && countyFips && (p.eligible_county_fips as string[]).includes(countyFips)) return true;
        return false;
      }).filter(p => {
        if (p.income_limit && income > Number(p.income_limit)) return false;
        return true;
      });

      dpaGeoMatchedCount = geoMatched.length;

      if (geoMatched.length > 0) {
        const lenderIds = [...new Set(geoMatched.map(p => p.lender_id))];
        const { data: activeLenders } = await sb
          .from('marketplace_lenders')
          .select('id')
          .eq('status', 'active')
          .in('id', lenderIds);
        const activeSet = new Set((activeLenders ?? []).map((l: { id: string }) => l.id));
        dpaMatchCount = geoMatched.filter(p => activeSet.has(p.lender_id)).length;
      }
    }

    let ffiecResult = null;
    try {
      ffiecResult = await checkFfiecEligibility({
        address: loc,
        county_fips: countyFips,
        income,
        household_size: size,
      });
    } catch {
      // ffiec enrichment failure must never break the existing qualifier response
    }

    const householdSizeFactor = AMI_SIZE_FACTORS[Math.max(1, Math.min(8, size))] ?? 1.00;
    const _debug = {
      geocodeAttempted: ffiecResult?.geocode_attempted ?? false,
      geocodeFailureReason: ffiecResult?.geocode_failure_reason ?? 'not_attempted',
      ffiecMethod: ffiecResult?.method ?? null,
      householdSizeFactor,
      dpaQueryCriteria: {
        stateAbbr: stateAbbr ?? null,
        countyFips: countyFips ?? null,
        incomeChecked: income,
        dpaUiThreshold: hudAmi120Final,
        totalProgramsFromDB: allDpaPrograms.length,
        geoMatchedAndIncomeQualified: dpaGeoMatchedCount,
        activeOnPlatform: dpaMatchCount,
      },
      dataVintages: {
        primarySource: dataSource,
        gseFiscalYear: gse?.fiscal_year ?? null,
        hudFiscalYear: hud?.fiscal_year ?? null,
        ffiecTractDataYear: ffiecResult?.ffiec_tract_data_year ?? null,
        ffiecMfiDataYear: ffiecResult?.ffiec_mfi_data_year ?? null,
        geocodeVintageUsed: ffiecResult?.geocode_vintage_used ?? null,
      },
      _notes: {
        ffiecTractDataYear: ffiecResult?.method === 'county_fallback'
          ? 'null by design — county_fallback reads ffiec_mfi only; check ffiecMfiDataYear instead'
          : 'populated when method=geocoded and GEOID found in ffiec_census_tracts',
        geocodeVintageUsed: 'Current_Current = most recent TIGER data; ACS202X = fallback vintage used when current had no match',
      },
    };

    const conformingLimits: ConformingLimits | null =
      stateAbbr && countyName
        ? resolveConformingLimits(stateAbbr, countyName)
        : null;

    return NextResponse.json({
      ok: true,
      ffiec: ffiecResult,
      _debug,
      result: {
        resolvedFrom,
        county: countyName ?? 'Unknown County',
        state:  stateAbbr  ?? '',
        zip:    resolvedZip ?? undefined,
        countyFips: countyFips ?? undefined,
        conformingLimits: conformingLimits ?? undefined,

        // Primary AMI — FHFA if available, HUD fallback
        ami4Person:          ami4,
        amiForHouseholdSize: amiForHH,

        // HomeReady / Home Possible: 80% of FHFA area AMI (no household adjustment)
        ami80pct: ami80,

        // Flat 50% of FHFA AMI (reference benchmark, same base as ami80pct)
        ami50pct:  ami50,
        // HUD household-adjusted DPA/CRA threshold
        ami120pct: hudAmi120Final,

        annualIncome:     income,
        householdSize:    size,
        incomeAsPctOfAmi: incomeAsPct,

        programs: {
          homeReady:    income <= ami80,
          homePossible: income <= ami80,
          dpa:          income <= hudAmi120Final,
        },

        fiscalYear,
        dataSource,
        dpaMatchCount,
      },
    });

  } catch (err) {
    console.error('[ami-qualifier]', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
