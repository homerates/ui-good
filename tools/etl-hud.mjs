/**
 * ETL: HUD Income Limits + Fair Market Rents + ZIP Crosswalk
 *
 * Endpoints (confirmed working 2026):
 *   County list:  GET /hudapi/public/fmr/listCounties/{stateCode}
 *   FMR data:     GET /hudapi/public/fmr/data/{entityId}
 *   IL data:      GET /hudapi/public/il/data/{entityId}
 *   ZIP crosswalk: GET /hudapi/public/usps?type=4&query={stateCode}&year=2024&quarter=4
 *
 * Requires: HUD_TOKEN env var — register free at https://www.huduser.gov/hudapi/public/register
 * Run: node tools/etl-hud.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HUD_TOKEN = process.env.HUD_TOKEN;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.error('Missing Supabase env vars'); process.exit(1); }
if (!HUD_TOKEN) { console.error('Missing HUD_TOKEN'); process.exit(1); }

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const HUD_BASE = 'https://www.huduser.gov/hudapi/public';

const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL',
  'IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE',
  'NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD',
  'TN','TX','UT','VT','VA','WA','WV','WI','WY','PR',
];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function hudGet(path, retries = 3) {
  const url = `${HUD_BASE}${path}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${HUD_TOKEN}` } });
    if (res.status === 429) {
      const wait = 12000 * (attempt + 1); // 12s, 24s, 36s back-off
      process.stdout.write(` [rate-limited, waiting ${wait/1000}s]`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`HUD ${res.status} for ${path}`);
    return res.json();
  }
  throw new Error(`HUD 429 rate limit exhausted for ${path}`);
}

// HUD entity FIPS codes are 10 chars like '0600199999'
// Standard 5-digit FIPS = first 5 chars
function toStdFips(entityCode) {
  const s = String(entityCode ?? '');
  // If it's 10 chars, take chars 0-4 (state+county)
  if (s.length === 10) return s.slice(0, 5);
  return s.padStart(5, '0').slice(0, 5);
}

async function processState(stateAbbr) {
  // Step 1: Get county list for state
  const counties = await hudGet(`/fmr/listCounties/${stateAbbr}`);
  if (!Array.isArray(counties) || !counties.length) return { hudRows: [], xwRows: [] };

  const hudRows = [];

  // Step 2: Fetch FMR + IL for each county (rate-limited)
  for (const county of counties) {
    const entityId = county.fips_code;
    const countyFips = toStdFips(entityId);
    if (!countyFips || countyFips.length !== 5) continue;

    let fmr = null, il = null;
    try {
      const fmrRes = await hudGet(`/fmr/data/${entityId}`);
      fmr = fmrRes?.data?.basicdata ?? null;
    } catch { /* skip */ }

    try {
      const ilRes = await hudGet(`/il/data/${entityId}`);
      il = ilRes?.data ?? null;
    } catch { /* skip */ }

    if (!fmr && !il) continue;

    const ami4 = il?.median_income ?? null;
    hudRows.push({
      county_fips:  countyFips,
      fiscal_year:  2026,
      county_name:  county.county_name?.replace(/ County.*$/, '') ?? null,
      state_abbr:   stateAbbr,
      cbsa_code:    null,
      // Income limits by person count
      ami_1person:  il?.low?.il80_p1 ? Math.round(il.low.il80_p1 / 0.8) : null,
      ami_2person:  il?.low?.il80_p2 ? Math.round(il.low.il80_p2 / 0.8) : null,
      ami_3person:  il?.low?.il80_p3 ? Math.round(il.low.il80_p3 / 0.8) : null,
      ami_4person:  ami4,
      ami_5person:  il?.low?.il80_p5 ? Math.round(il.low.il80_p5 / 0.8) : null,
      // AMI thresholds
      ami_80pct:    il?.low?.il80_p4 ?? null,
      ami_50pct:    il?.very_low?.il50_p4 ?? null,
      ami_120pct:   ami4 ? Math.round(ami4 * 1.2) : null,
      // Fair Market Rents
      fmr_0br:      fmr?.Efficiency ?? null,
      fmr_1br:      fmr?.['One-Bedroom'] ?? null,
      fmr_2br:      fmr?.['Two-Bedroom'] ?? null,
      fmr_3br:      fmr?.['Three-Bedroom'] ?? null,
      fmr_4br:      fmr?.['Four-Bedroom'] ?? null,
      updated_at:   new Date().toISOString(),
    });

    // Polite rate limit — HUD API: ~120 req/min free tier
    await sleep(600);
  }

  // Step 3: ZIP crosswalk
  let xwRows = [];
  try {
    const xw = await hudGet(`/usps?type=2&query=${stateAbbr}&year=2025&quarter=4`);
    const results = xw?.data?.results ?? [];
    xwRows = results.map(row => {
      const zip = String(row.zip ?? '').padStart(5, '0');
      const fips = String(row.geoid ?? row.county ?? '').slice(0, 5).padStart(5, '0');
      if (!zip || !fips || zip.length !== 5 || fips.length !== 5 || zip === '00000') return null;
      return {
        zip,
        county_fips: fips,
        state_fips:  fips.slice(0, 2),
        cbsa_code:   null,
        cbsa_name:   null,
        county_name: null,
        state_abbr:  stateAbbr,
        res_ratio:   row.res_ratio ?? null,
        updated_at:  new Date().toISOString(),
      };
    }).filter(Boolean);
  } catch { /* skip crosswalk if fails */ }

  return { hudRows, xwRows };
}

async function upsertBatch(table, rows, conflict) {
  if (!rows.length) return;
  // Deduplicate by conflict key to avoid "cannot affect row a second time" errors
  const keys = conflict.split(',');
  const seen = new Set();
  const deduped = rows.filter(r => {
    const k = keys.map(k => r[k.trim()]).join('|');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const { error } = await sb.from(table).upsert(deduped, { onConflict: conflict });
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function run() {
  console.log('\n🏠 HUD ETL — FY2025\n');

  let totalHud = 0, totalXw = 0, errors = 0;

  for (const state of STATES) {
    process.stdout.write(`  ${state} ...`);
    try {
      const { hudRows, xwRows } = await processState(state);

      if (hudRows.length) {
        await upsertBatch('hud_features', hudRows, 'county_fips,fiscal_year');
        totalHud += hudRows.length;
      }
      if (xwRows.length) {
        await upsertBatch('geo_crosswalk', xwRows, 'zip,county_fips');
        totalXw += xwRows.length;
      }

      console.log(` ✓ ${hudRows.length} counties, ${xwRows.length} ZIP mappings`);
    } catch (err) {
      errors++;
      console.log(` ✗ ${err.message.slice(0, 80)}`);
    }

    await sleep(3000); // 3s between states to stay well under rate limit
  }

  console.log(`\n📊 Done`);
  console.log(`   hud_features: ${totalHud} counties`);
  console.log(`   geo_crosswalk: ${totalXw} ZIP mappings`);
  console.log(`   Errors: ${errors}/${STATES.length}\n`);
}

run().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
