/**
 * ETL: HUD Income Limits + Fair Market Rents
 *
 * Sources:
 *   Income Limits: https://www.huduser.gov/hudapi/public/il
 *   Fair Market Rents: https://www.huduser.gov/hudapi/public/fmr
 *   ZIP crosswalk: https://www.huduser.gov/hudapi/public/usps
 *
 * Requires: HUD_TOKEN env var (free registration at huduser.gov/portal/datasets/api.html)
 * Run: node tools/etl-hud.mjs
 *
 * Upserts into: hud_features, geo_crosswalk
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HUD_TOKEN = process.env.HUD_TOKEN;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!HUD_TOKEN) {
  console.error('Missing HUD_TOKEN — register free at https://www.huduser.gov/portal/datasets/api.html');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const HUD_BASE = 'https://www.huduser.gov/hudapi/public';
const FISCAL_YEAR = 2025;

// All 50 states + DC + PR + territories
const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL',
  'IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE',
  'NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD',
  'TN','TX','UT','VT','VA','WA','WV','WI','WY','PR',
];

async function hudGet(path) {
  const url = `${HUD_BASE}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${HUD_TOKEN}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HUD API error ${res.status} for ${path}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ── Income Limits ────────────────────────────────────────────────────────────

async function fetchILForState(stateAbbr) {
  // Returns array of entities (counties/metros) with income limit data
  const data = await hudGet(`/il/il${FISCAL_YEAR}?stateId=${stateAbbr}&type=county`);
  return data?.data?.entities ?? [];
}

function parseILEntity(entity, stateAbbr) {
  const limits = entity.medianhouseholdincome
    ? {
        ami_4person: entity.medianhouseholdincome ?? null,
        ami_1person: entity.il_1 ?? null,
        ami_2person: entity.il_2 ?? null,
        ami_3person: entity.il_3 ?? null,
        ami_4person_check: entity.il_4 ?? null,
        ami_5person: entity.il_5 ?? null,
        ami_80pct: entity.l80_4 ?? null,
        ami_50pct: entity.l50_4 ?? null,
        ami_120pct: entity.m120_4 ?? entity.medianhouseholdincome
          ? Math.round((entity.medianhouseholdincome ?? 0) * 1.2)
          : null,
      }
    : {};

  // county_fips from geoid (5 chars) or from entity.fips2010
  const countyFips = entity.fips2010
    ? String(entity.fips2010).padStart(5, '0')
    : null;

  if (!countyFips) return null;

  return {
    county_fips: countyFips,
    fiscal_year: FISCAL_YEAR,
    county_name: entity.areaname ?? null,
    state_abbr: stateAbbr,
    cbsa_code: entity.cbsasub ?? entity.cbsa ?? null,
    ami_1person: entity.il_1 ?? null,
    ami_2person: entity.il_2 ?? null,
    ami_3person: entity.il_3 ?? null,
    ami_4person: entity.medianhouseholdincome ?? entity.il_4 ?? null,
    ami_5person: entity.il_5 ?? null,
    ami_80pct: entity.l80_4 ?? null,
    ami_50pct: entity.l50_4 ?? null,
    ami_120pct: entity.medianhouseholdincome
      ? Math.round(entity.medianhouseholdincome * 1.2)
      : null,
    updated_at: new Date().toISOString(),
  };
}

// ── Fair Market Rents ────────────────────────────────────────────────────────

async function fetchFMRForState(stateAbbr) {
  const data = await hudGet(`/fmr/statedata?state=${stateAbbr}&year=${FISCAL_YEAR}`);
  return data?.data?.counties ?? [];
}

function parseFMREntity(entity) {
  const fips = entity.fips_code
    ? String(entity.fips_code).padStart(5, '0')
    : null;
  if (!fips) return null;

  return {
    county_fips: fips,
    fmr_0br: entity.basic_studio ?? entity.Efficiency ?? null,
    fmr_1br: entity.basic_1br ?? entity.One_Bedroom ?? null,
    fmr_2br: entity.basic_2br ?? entity.Two_Bedroom ?? null,
    fmr_3br: entity.basic_3br ?? entity.Three_Bedroom ?? null,
    fmr_4br: entity.basic_4br ?? entity.Four_Bedroom ?? null,
  };
}

// ── ZIP Crosswalk ────────────────────────────────────────────────────────────

async function fetchCrosswalkForState(stateAbbr) {
  // HUD crosswalk: ZIP to county, Q4 of most recent year
  // type=4 = ZIP to county
  const data = await hudGet(`/usps?type=4&query=${stateAbbr}&year=${FISCAL_YEAR}&quarter=4`);
  return data?.data?.results ?? [];
}

function parseCrosswalkRow(row, stateAbbr) {
  const zip = String(row.zip ?? row.geoid ?? '').padStart(5, '0');
  const fips = String(row.county ?? row.county_fips ?? '').padStart(5, '0');
  if (!zip || !fips || zip.length !== 5 || fips.length !== 5) return null;

  return {
    zip,
    county_fips: fips,
    state_fips: fips.slice(0, 2),
    cbsa_code: row.cbsa ?? null,
    cbsa_name: row.cbsa_name ?? null,
    county_name: row.county_name ?? null,
    state_abbr: stateAbbr,
    res_ratio: row.res_ratio ?? null,
    updated_at: new Date().toISOString(),
  };
}

// ── Upsert helpers ───────────────────────────────────────────────────────────

async function upsertBatch(table, rows, conflictCols) {
  if (!rows.length) return;
  const { error } = await sb
    .from(table)
    .upsert(rows, { onConflict: conflictCols });
  if (error) throw new Error(`Upsert ${table}: ${error.message}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n🏠 HUD ETL — FY${FISCAL_YEAR}\n`);

  let ilTotal = 0, fmrTotal = 0, xwTotal = 0, errors = 0;

  for (const state of STATES) {
    process.stdout.write(`  ${state} ...`);
    try {
      // Income limits
      const ilEntities = await fetchILForState(state);
      const ilRows = ilEntities.map(e => parseILEntity(e, state)).filter(Boolean);

      // FMR
      const fmrEntities = await fetchFMRForState(state);
      const fmrRows = fmrEntities.map(parseFMREntity).filter(Boolean);

      // Merge FMR into IL rows by county_fips
      const fmrMap = Object.fromEntries(fmrRows.map(r => [r.county_fips, r]));
      const merged = ilRows.map(row => ({
        ...row,
        ...(fmrMap[row.county_fips]
          ? {
              fmr_0br: fmrMap[row.county_fips].fmr_0br,
              fmr_1br: fmrMap[row.county_fips].fmr_1br,
              fmr_2br: fmrMap[row.county_fips].fmr_2br,
              fmr_3br: fmrMap[row.county_fips].fmr_3br,
              fmr_4br: fmrMap[row.county_fips].fmr_4br,
            }
          : {}),
      }));

      if (merged.length) {
        await upsertBatch('hud_features', merged, 'county_fips,fiscal_year');
        ilTotal += merged.length;
      }

      // Crosswalk
      const xwRaw = await fetchCrosswalkForState(state);
      const xwRows = xwRaw.map(r => parseCrosswalkRow(r, state)).filter(Boolean);
      if (xwRows.length) {
        await upsertBatch('geo_crosswalk', xwRows, 'zip,county_fips');
        xwTotal += xwRows.length;
      }

      fmrTotal += fmrRows.length;
      console.log(` ✓ IL:${merged.length} FMR:${fmrRows.length} XW:${xwRows.length}`);
    } catch (err) {
      errors++;
      console.log(` ✗ ${err.message.slice(0, 100)}`);
    }

    // Polite rate limit — HUD API allows ~10 req/s
    await new Promise(r => setTimeout(r, 120));
  }

  console.log(`\n📊 Done`);
  console.log(`   hud_features rows: ${ilTotal}`);
  console.log(`   fmr rows merged:   ${fmrTotal}`);
  console.log(`   geo_crosswalk rows: ${xwTotal}`);
  console.log(`   States with errors: ${errors}/${STATES.length}\n`);
}

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
