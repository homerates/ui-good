/**
 * geoFeatures.ts
 *
 * Resolves geographic intelligence for a given ZIP code.
 * Returns a compact, prompt-ready feature object combining:
 *   - HUD Income Limits (AMI thresholds, DPA eligibility signal)
 *   - HUD Fair Market Rents (rent benchmarks for DSCR context)
 *   - FEMA National Risk Index (composite + hazard + insurance pressure)
 *
 * Designed for prompt injection — returns only relevant, formatted facts.
 * All data is pre-computed in Supabase; no live API calls at query time.
 */

import { createClient } from '@supabase/supabase-js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface GeoFeatures {
  zip: string;
  county_fips: string | null;
  county_name: string | null;
  state_abbr: string | null;
  cbsa_name: string | null;

  // HUD Income Limits
  ami_4person: number | null;         // Area Median Income (4-person household)
  ami_80pct: number | null;           // Low Income limit
  ami_50pct: number | null;           // Very Low Income limit
  ami_120pct: number | null;          // Moderate income ceiling (many DPA programs)
  ami_pct_of_income: number | null;   // borrower income / AMI_4person
  dpa_likely: boolean;                // income < 120% AMI → DPA programs probable
  dpa_tier: 'very_low' | 'low' | 'moderate' | 'above_moderate' | null;

  // HUD Fair Market Rents
  fmr_1br: number | null;
  fmr_2br: number | null;
  fmr_3br: number | null;
  fmr_4br: number | null;

  // FEMA Risk
  fema_composite: number | null;
  fema_risk_label: string | null;
  fema_dominant_hazard: string | null;
  insurance_pressure: string | null;  // 'low' | 'moderate' | 'elevated' | 'high' | 'very_high'
  insurance_est_low: number | null;   // monthly delta $ vs national avg (low end)
  insurance_est_high: number | null;  // monthly delta $ vs national avg (high end)

  // Prompt-ready summary (injected directly into system prompt)
  promptBlock: string | null;
}

export interface GeoFeaturesOptions {
  annualIncome?: number;     // borrower income for AMI% calculation
  householdSize?: number;    // 1–8, defaults to 4 for AMI comparison
  bedroomCount?: number;     // for FMR selection
}

// ── Supabase client (server-side only) ──────────────────────────────────────

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function amiPct(income: number, ami: number): number {
  return Math.round((income / ami) * 100);
}

function dpaTier(pct: number | null): GeoFeatures['dpa_tier'] {
  if (pct === null) return null;
  if (pct <= 50) return 'very_low';
  if (pct <= 80) return 'low';
  if (pct <= 120) return 'moderate';
  return 'above_moderate';
}

function fmtMoney(n: number | null): string {
  if (n === null) return 'N/A';
  return `$${n.toLocaleString()}`;
}

function fmtInsuranceDelta(low: number | null, high: number | null): string {
  if (low === null || high === null) return '';
  if (low === 0 && high <= 50) return 'near national average';
  return `+$${low}–$${high}/mo above national average`;
}

function hazardLabel(h: string | null): string {
  if (!h) return '';
  const map: Record<string, string> = {
    hurricane: 'Hurricane',
    wildfire: 'Wildfire',
    flood: 'Flood',
    coastal_flood: 'Coastal Flood',
    earthquake: 'Earthquake',
    tornado: 'Tornado',
    hail: 'Hail',
    winter: 'Winter Weather',
    drought: 'Drought',
    heat: 'Extreme Heat',
  };
  return map[h] ?? h;
}

function pressureEmoji(pressure: string | null): string {
  const map: Record<string, string> = {
    low: '🟢',
    moderate: '🟡',
    elevated: '🟠',
    high: '🔴',
    very_high: '🔴',
  };
  return pressure ? (map[pressure] ?? '') : '';
}

// ── AMI by household size ────────────────────────────────────────────────────
// HUD adjusts AMI by household size. We store 4-person as baseline.
// Standard HUD adjustment factors:
const AMI_SIZE_FACTORS: Record<number, number> = {
  1: 0.70, 2: 0.80, 3: 0.90, 4: 1.00,
  5: 1.08, 6: 1.16, 7: 1.24, 8: 1.32,
};

function amiForHouseholdSize(ami4: number, size: number): number {
  const factor = AMI_SIZE_FACTORS[Math.max(1, Math.min(8, size))] ?? 1.0;
  return Math.round(ami4 * factor);
}

// ── Main resolver ────────────────────────────────────────────────────────────

export async function resolveGeoFeatures(
  zip: string,
  opts: GeoFeaturesOptions = {}
): Promise<GeoFeatures | null> {
  if (!zip || !/^\d{5}$/.test(zip.trim())) return null;

  const sb = getServiceClient();
  const { annualIncome, householdSize = 4, bedroomCount = 2 } = opts;

  // Step 1: ZIP → county FIPS (pick highest residential ratio if multiple)
  const { data: xwRows, error: xwErr } = await sb
    .from('geo_crosswalk')
    .select('county_fips, county_name, state_abbr, cbsa_name, res_ratio')
    .eq('zip', zip.trim())
    .order('res_ratio', { ascending: false })
    .limit(3);

  if (xwErr || !xwRows?.length) return null;

  const xw = xwRows[0];
  const countyFips = xw.county_fips;

  // Step 2: HUD features + FEMA risk in parallel
  const [hudRes, femaRes] = await Promise.all([
    sb.from('hud_features')
      .select('ami_1person,ami_2person,ami_3person,ami_4person,ami_5person,ami_80pct,ami_50pct,ami_120pct,fmr_1br,fmr_2br,fmr_3br,fmr_4br,state_abbr,county_name,cbsa_code')
      .eq('county_fips', countyFips)
      .order('fiscal_year', { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb.from('fema_risk')
      .select('composite_score,risk_label,dominant_hazard,insurance_pressure,insurance_est_low,insurance_est_high,hurricane_score,wildfire_score,flood_score')
      .eq('county_fips', countyFips)
      .maybeSingle(),
  ]);

  const hud = hudRes.data;
  const fema = femaRes.data;

  // Step 3: Compute AMI-based signals
  const ami4 = hud?.ami_4person ?? null;
  const amiForSize = ami4 && householdSize !== 4
    ? amiForHouseholdSize(ami4, householdSize)
    : ami4;

  const pct = annualIncome && amiForSize ? amiPct(annualIncome, amiForSize) : null;
  const tier = dpaTier(pct);
  const dpaLikely = pct !== null ? pct <= 120 : false;

  // Step 4: Pick the right FMR bedroom
  const br = Math.max(1, Math.min(4, bedroomCount));
  const fmrForBr = hud
    ? ([null, hud.fmr_1br, hud.fmr_2br, hud.fmr_3br, hud.fmr_4br][br] ?? hud.fmr_2br)
    : null;

  // Step 5: Build prompt block
  const countyLabel = xw.county_name
    ? `${xw.county_name}, ${xw.state_abbr}`
    : (xw.state_abbr ?? 'Unknown area');

  const lines: string[] = [
    `[GEO INTELLIGENCE — ZIP ${zip} → ${countyLabel}]`,
  ];

  if (ami4) {
    lines.push(`AMI (4-person, FY2025): ${fmtMoney(ami4)}`);
    if (hud?.ami_80pct) lines.push(`Low Income limit (80% AMI): ${fmtMoney(hud.ami_80pct)}`);
    if (hud?.ami_120pct) lines.push(`Moderate Income ceiling (120% AMI): ${fmtMoney(hud.ami_120pct)}`);
    if (pct !== null) {
      lines.push(`Borrower at ${pct}% of AMI${householdSize !== 4 ? ` (${householdSize}-person HH)` : ''}`);
      if (dpaLikely) {
        lines.push(`DPA SIGNAL: Likely eligible — income below 120% AMI. Check state/county DPA programs.`);
      }
    }
  }

  if (hud?.fmr_2br) {
    const fmrLabel = br !== 2 ? `${br}BR FMR` : '2BR FMR';
    lines.push(`HUD Fair Market Rent: 1BR ${fmtMoney(hud.fmr_1br)} | 2BR ${fmtMoney(hud.fmr_2br)} | 3BR ${fmtMoney(hud.fmr_3br)}`);
  }

  if (fema?.composite_score !== null && fema?.composite_score !== undefined) {
    const pe = pressureEmoji(fema.insurance_pressure);
    lines.push(`FEMA Risk: ${fema.risk_label ?? ''} (score ${fema.composite_score}/100) | Dominant hazard: ${hazardLabel(fema.dominant_hazard)}`);
    lines.push(`Insurance pressure: ${pe} ${(fema.insurance_pressure ?? '').replace('_', ' ').toUpperCase()} — est. ${fmtInsuranceDelta(fema.insurance_est_low, fema.insurance_est_high)}`);
  }

  lines.push(`Source: HUD FY2025 Income Limits & FMR, FEMA NRI 2024`);

  const promptBlock = lines.join('\n');

  return {
    zip,
    county_fips: countyFips,
    county_name: xw.county_name ?? hud?.county_name ?? null,
    state_abbr: xw.state_abbr ?? hud?.state_abbr ?? null,
    cbsa_name: xw.cbsa_name ?? null,

    ami_4person: ami4,
    ami_80pct: hud?.ami_80pct ?? null,
    ami_50pct: hud?.ami_50pct ?? null,
    ami_120pct: hud?.ami_120pct ?? null,
    ami_pct_of_income: pct,
    dpa_likely: dpaLikely,
    dpa_tier: tier,

    fmr_1br: hud?.fmr_1br ?? null,
    fmr_2br: hud?.fmr_2br ?? null,
    fmr_3br: hud?.fmr_3br ?? null,
    fmr_4br: hud?.fmr_4br ?? null,

    fema_composite: fema?.composite_score ?? null,
    fema_risk_label: fema?.risk_label ?? null,
    fema_dominant_hazard: fema?.dominant_hazard ?? null,
    insurance_pressure: fema?.insurance_pressure ?? null,
    insurance_est_low: fema?.insurance_est_low ?? null,
    insurance_est_high: fema?.insurance_est_high ?? null,

    promptBlock,
  };
}

// ── ZIP extractor (used by answers route) ───────────────────────────────────

/**
 * Extracts the first 5-digit ZIP code from a question string.
 * Returns null if none found.
 */
export function extractZip(text: string): string | null {
  const match = text.match(/\b(\d{5})\b/);
  return match?.[1] ?? null;
}

/**
 * Extracts annual income from a question string.
 * Handles: "$120k", "$120,000", "120k salary", "make $95k"
 */
export function extractIncome(text: string): number | null {
  // "$120k" or "$120,000"
  const m = text.match(/\$\s*([\d,]+)\s*k?\b/i);
  if (!m) return null;
  const raw = parseFloat(m[1].replace(/,/g, ''));
  if (isNaN(raw)) return null;
  // If number is small (< 1000), it's in thousands
  return raw < 1000 ? raw * 1000 : raw;
}
