/**
 * ETL retry — only the 11 states that failed in the full run
 * CT, ME, MA, MN, MS, MO, MT, NE, NH, RI, VT
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HUD_TOKEN = process.env.HUD_TOKEN;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.error('Missing Supabase env vars'); process.exit(1); }
if (!HUD_TOKEN) { console.error('Missing HUD_TOKEN'); process.exit(1); }

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const HUD_BASE = 'https://www.huduser.gov/hudapi/public';

const STATES = ['CT','ME','MA','MN','MS','MO','MT','NE','NH','RI','VT'];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function hudGet(path, retries = 3) {
  const url = `${HUD_BASE}${path}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${HUD_TOKEN}` } });
    if (res.status === 429) {
      const wait = 12000 * (attempt + 1);
      process.stdout.write(` [429, waiting ${wait/1000}s]`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`HUD ${res.status} for ${path}`);
    return res.json();
  }
  throw new Error(`HUD 429 rate limit exhausted for ${path}`);
}

function toStdFips(entityCode) {
  const s = String(entityCode ?? '');
  if (s.length === 10) return s.slice(0, 5);
  return s.padStart(5, '0').slice(0, 5);
}

async function upsertBatch(table, rows, conflict) {
  if (!rows.length) return;
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

async function processState(stateAbbr) {
  const counties = await hudGet(`/fmr/listCounties/${stateAbbr}`);
  if (!Array.isArray(counties) || !counties.length) return { hudRows: [], xwRows: [] };

  const hudRows = [];

  for (const county of counties) {
    const entityId = county.fips_code;
    const countyFips = toStdFips(entityId);
    if (!countyFips || countyFips.length !== 5) continue;

    let fmr = null, il = null;
    try { const r = await hudGet(`/fmr/data/${entityId}`); fmr = r?.data?.basicdata ?? null; } catch {}
    try { const r = await hudGet(`/il/data/${entityId}`); il = r?.data ?? null; } catch {}
    if (!fmr && !il) continue;

    const ami4 = il?.median_income ?? null;
    hudRows.push({
      county_fips: countyFips, fiscal_year: 2025,
      county_name: county.county_name?.replace(/ County.*$/, '') ?? null,
      state_abbr: stateAbbr, cbsa_code: null,
      ami_1person: il?.low?.il80_p1 ? Math.round(il.low.il80_p1 / 0.8) : null,
      ami_2person: il?.low?.il80_p2 ? Math.round(il.low.il80_p2 / 0.8) : null,
      ami_3person: il?.low?.il80_p3 ? Math.round(il.low.il80_p3 / 0.8) : null,
      ami_4person: ami4,
      ami_5person: il?.low?.il80_p5 ? Math.round(il.low.il80_p5 / 0.8) : null,
      ami_80pct: il?.low?.il80_p4 ?? null,
      ami_50pct: il?.very_low?.il50_p4 ?? null,
      ami_120pct: ami4 ? Math.round(ami4 * 1.2) : null,
      fmr_0br: fmr?.Efficiency ?? null,
      fmr_1br: fmr?.['One-Bedroom'] ?? null,
      fmr_2br: fmr?.['Two-Bedroom'] ?? null,
      fmr_3br: fmr?.['Three-Bedroom'] ?? null,
      fmr_4br: fmr?.['Four-Bedroom'] ?? null,
      updated_at: new Date().toISOString(),
    });
    await sleep(600);
  }

  let xwRows = [];
  try {
    const xw = await hudGet(`/usps?type=2&query=${stateAbbr}&year=2024&quarter=4`);
    const results = xw?.data?.results ?? [];
    xwRows = results.map(row => {
      const zip = String(row.zip ?? '').padStart(5, '0');
      const fips = String(row.geoid ?? row.county ?? '').slice(0, 5).padStart(5, '0');
      if (!zip || !fips || zip.length !== 5 || fips.length !== 5 || zip === '00000') return null;
      return { zip, county_fips: fips, state_fips: fips.slice(0, 2), cbsa_code: null, cbsa_name: null, county_name: null, state_abbr: stateAbbr, res_ratio: row.res_ratio ?? null, updated_at: new Date().toISOString() };
    }).filter(Boolean);
  } catch {}

  return { hudRows, xwRows };
}

async function run() {
  console.log('\n🔁 HUD ETL — retry 11 failed states\n');
  let totalHud = 0, totalXw = 0, errors = 0;

  for (const state of STATES) {
    process.stdout.write(`  ${state} ...`);
    try {
      const { hudRows, xwRows } = await processState(state);
      if (hudRows.length) { await upsertBatch('hud_features', hudRows, 'county_fips,fiscal_year'); totalHud += hudRows.length; }
      if (xwRows.length) { await upsertBatch('geo_crosswalk', xwRows, 'zip,county_fips'); totalXw += xwRows.length; }
      console.log(` ✓ ${hudRows.length} counties, ${xwRows.length} ZIP mappings`);
    } catch (err) {
      errors++;
      console.log(` ✗ ${err.message.slice(0, 80)}`);
    }
    await sleep(5000);
  }

  console.log(`\n📊 Retry done`);
  console.log(`   hud_features: ${totalHud} counties`);
  console.log(`   geo_crosswalk: ${totalXw} ZIP mappings`);
  console.log(`   Errors: ${errors}/${STATES.length}\n`);
}

run().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
