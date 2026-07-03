#!/usr/bin/env node
// tools/etl-ffiec.mjs
//
// FFIEC Census Tract ETL — annual refresh (three passes).
//
// URL investigation (2026-07-02): ffiec.gov blocks all programmatic HTTP access (403 on
// every endpoint). Files must be downloaded manually in a browser:
//   • Census Flat File:       https://www.ffiec.gov/data/census/flat-files
//     Comma-delimited CSV, no header row, 1212 columns, ~87k rows.
//     2025 data (latest as of 2026-07-02) released 2025-07-10.
//   • Distressed/Underserved: https://www.ffiec.gov/data/cra/distressed
//     Available as .xls — SAVE AS CSV from Excel before passing to this script.
//     The D&U list is a subset of nonmetro middle-income tracts.
//   • MFI data: embedded in the census flat file (column 14, index 13) — no separate download.
//
// USAGE:
//   node --env-file=.env.local tools/etl-ffiec.mjs \
//     --tracts  /path/to/CensusFlatFile2025.csv \
//     --distressed /path/to/DistressedUnderservedTracts.csv \
//     [--year 2025]
//
// Passes:
//   1: Census Flat File  → ffiec_census_tracts (distressed_underserved = false initially)
//   2: D&U CSV          → UPDATE ffiec_census_tracts SET distressed_underserved = true
//   3: Census Flat File  → ffiec_mfi  (one row per MSA/MD, aggregated from tract rows)

import { createClient } from '@supabase/supabase-js';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

// ── Census Flat File column positions (0-indexed, confirmed from 2025 file) ─────
const C = {
  YEAR:          0,   // Activity year
  MSA_MD:        1,   // MSA/MD code (5-digit numeric string; blank = nonmetro)
  STATE_FIPS:    2,   // State FIPS (2-digit string)
  COUNTY_3:      3,   // County FIPS, 3-digit (no state prefix)
  TRACT_6:       4,   // Census tract, 6-digit (no decimal, e.g. "020100" = tract 0201.00)
  TRACT_MFI_PCT: 12,  // Tract MFI as % of area MFI (float)
  AREA_MFI:      13,  // Area (MSA/MD or statewide nonmetro) median family income ($)
  INCOME_TIER:   14,  // Numeric tier: 1=Low 2=Moderate 3=Middle 4=Upper 0=N/A
};

// ── D&U CSV column positions (0-indexed, from Excel Save-As CSV) ─────────────
const DU = {
  DISTRESSED:   6,   // "X" if distressed designation; blank otherwise
  UNDERSERVED:  7,   // "X" if underserved designation; blank otherwise
  STATE_CODE:   8,   // Numeric state FIPS (e.g., 1 for Alabama)
  COUNTY_CODE:  9,   // Numeric county FIPS (e.g., 5 for Barbour, AL)
  TRACT_CODE:   10,  // Numeric tract code, may have decimal (e.g., 9522.01)
};

const INCOME_TIER_MAP = { '1': 'Low', '2': 'Moderate', '3': 'Middle', '4': 'Upper' };
const BATCH_SIZE = 500;
const DATA_YEAR = parseInt(process.argv[process.argv.indexOf('--year') + 1] || '2025');
const TRACTS_FILE = process.argv[process.argv.indexOf('--tracts') + 1];
const DU_FILE = process.argv[process.argv.indexOf('--distressed') + 1] || null;

if (!TRACTS_FILE) {
  console.error('Usage: node --env-file=.env.local tools/etl-ffiec.mjs \\\n' +
    '         --tracts /path/to/CensusFlatFile2025.csv \\\n' +
    '         --distressed /path/to/DistressedUnderservedTracts.csv \\\n' +
    '         [--year 2025]');
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── helpers ──────────────────────────────────────────────────────────────────
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function upsertBatch(table, rows, conflict) {
  if (!rows.length) return;
  const { error } = await sb.from(table).upsert(rows, { onConflict: conflict });
  if (error) throw error;
}

async function* readCsvLines(filePath) {
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) yield line;
}

// Convert numeric tract value from D&U Excel (e.g. 9522.01 or 9502) to 6-digit string
function tractNumToCode(v) {
  return String(Math.round(v * 100)).padStart(6, '0');
}

// ── pass 1: census flat file → ffiec_census_tracts ───────────────────────────
async function pass1() {
  console.log('\n── Pass 1: Census Flat File → ffiec_census_tracts ──');
  let rows = [];
  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  let lineNum = 0;

  for await (const line of readCsvLines(TRACTS_FILE)) {
    lineNum++;
    if (!line.trim()) continue;
    const cols = line.split(',');

    const incomeTierRaw = cols[C.INCOME_TIER]?.trim();
    if (!incomeTierRaw || incomeTierRaw === '0') { skipped++; continue; } // unclassifiable tracts

    const stateFips = cols[C.STATE_FIPS]?.trim().padStart(2, '0');
    const county3   = cols[C.COUNTY_3]?.trim().padStart(3, '0');
    const tract6    = cols[C.TRACT_6]?.trim().padStart(6, '0');
    if (!stateFips || !county3 || !tract6) { skipped++; continue; }

    const geoid      = stateFips + county3 + tract6;
    const countyFips = stateFips + county3;
    const msaMd      = cols[C.MSA_MD]?.trim() || null;
    const mfiPct     = parseFloat(cols[C.TRACT_MFI_PCT]) || null;
    const incomeLevel = INCOME_TIER_MAP[incomeTierRaw] ?? incomeTierRaw;

    rows.push({
      census_tract_geoid:    geoid,
      state_fips:            stateFips,
      county_fips:           countyFips,
      msa_md:                msaMd,
      tract_income_level:    incomeLevel,
      tract_mfi_pct:         mfiPct,
      distressed_underserved: false,
      data_year:             DATA_YEAR,
      updated_at:            new Date().toISOString(),
    });

    if (rows.length >= BATCH_SIZE) {
      try {
        await upsertBatch('ffiec_census_tracts', rows, 'census_tract_geoid');
        inserted += rows.length;
        process.stdout.write(`\r  ${inserted.toLocaleString()} rows upserted...`);
      } catch (e) {
        console.error(`\n✗ Batch error near row ${lineNum}: ${e.message}`);
        errors++;
      }
      rows = [];
    }
  }

  if (rows.length) {
    try {
      await upsertBatch('ffiec_census_tracts', rows, 'census_tract_geoid');
      inserted += rows.length;
    } catch (e) {
      console.error(`\n✗ Final batch error: ${e.message}`);
      errors++;
    }
  }

  console.log(`\n  ✓ ${inserted.toLocaleString()} tracts upserted, ${skipped} skipped (unclassifiable), ${errors} errors`);
}

// ── pass 2: D&U CSV → UPDATE distressed_underserved = true ───────────────────
async function pass2() {
  if (!DU_FILE) {
    console.log('\n── Pass 2: skipped (--distressed not provided)');
    return;
  }
  console.log('\n── Pass 2: Distressed/Underserved CSV → ffiec_census_tracts updates ──');

  const geoids = new Set();
  let headerFound = false;

  for await (const line of readCsvLines(DU_FILE)) {
    const cols = line.split(',').map(v => v.replace(/^"|"$/g, '').trim());

    // Find the data header row (contains "COUNTY NAME" and "TRACT CODE")
    if (!headerFound) {
      if (cols[0]?.toUpperCase() === 'COUNTY NAME' && cols[DU.TRACT_CODE]?.toUpperCase() === 'TRACT CODE') {
        headerFound = true;
      }
      continue;
    }

    const distressedFlag = cols[DU.DISTRESSED]?.trim().toUpperCase();
    const underservedFlag = cols[DU.UNDERSERVED]?.trim().toUpperCase();
    if (distressedFlag !== 'X' && underservedFlag !== 'X') continue;

    const stateNum  = parseFloat(cols[DU.STATE_CODE]);
    const countyNum = parseFloat(cols[DU.COUNTY_CODE]);
    const tractNum  = parseFloat(cols[DU.TRACT_CODE]);
    if (isNaN(stateNum) || isNaN(countyNum) || isNaN(tractNum)) continue;

    const stateFips = String(Math.round(stateNum)).padStart(2, '0');
    const county3   = String(Math.round(countyNum)).padStart(3, '0');
    const tract6    = tractNumToCode(tractNum);
    geoids.add(stateFips + county3 + tract6);
  }

  if (!headerFound) {
    console.warn('  ⚠ Header row not found in D&U file — check that file is CSV exported from the FFIEC Excel');
    return;
  }

  console.log(`  Found ${geoids.size} distressed/underserved tracts`);

  const geoidList = [...geoids];
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < geoidList.length; i += BATCH_SIZE) {
    const batch = geoidList.slice(i, i + BATCH_SIZE);
    try {
      const { error } = await sb
        .from('ffiec_census_tracts')
        .update({ distressed_underserved: true, updated_at: new Date().toISOString() })
        .in('census_tract_geoid', batch);
      if (error) throw error;
      updated += batch.length;
      process.stdout.write(`\r  ${updated.toLocaleString()} tracts marked D&U...`);
    } catch (e) {
      console.error(`\n✗ Update batch error: ${e.message}`);
      errors++;
    }
  }

  console.log(`\n  ✓ ${updated.toLocaleString()} tracts marked distressed/underserved, ${errors} errors`);
}

// ── pass 3: census flat file → ffiec_mfi ─────────────────────────────────────
async function pass3() {
  console.log('\n── Pass 3: Census Flat File → ffiec_mfi ──');

  // One MFI row per (msa_md, state_fips). Aggregate from tract rows (all tracts in same
  // MSA/MD share the same area MFI value — use first encountered as the canonical value).
  const seen = new Map(); // key = `${msa_md}|${state_fips}` → {msa_md, state_fips, mfi}

  for await (const line of readCsvLines(TRACTS_FILE)) {
    if (!line.trim()) continue;
    const cols = line.split(',');

    const incomeTierRaw = cols[C.INCOME_TIER]?.trim();
    if (!incomeTierRaw || incomeTierRaw === '0') continue;

    const stateFips = cols[C.STATE_FIPS]?.trim().padStart(2, '0');
    const msaMd     = cols[C.MSA_MD]?.trim() || null;
    const areaMfi   = parseFloat(cols[C.AREA_MFI]) || null;
    if (!stateFips || !areaMfi) continue;

    const key = `${msaMd ?? 'null'}|${stateFips}`;
    if (!seen.has(key)) {
      seen.set(key, {
        msa_md:       msaMd,
        state_fips:   stateFips,
        area_name:    msaMd ? `MSA/MD ${msaMd}` : `Statewide nonmetro (${stateFips})`,
        mfi_estimate: areaMfi,
        data_year:    DATA_YEAR,
      });
    }
  }

  const rows = [...seen.values()];
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    try {
      await upsertBatch('ffiec_mfi', batch, 'msa_md,state_fips,data_year');
      inserted += batch.length;
      process.stdout.write(`\r  ${inserted} / ${rows.length} MFI areas upserted...`);
    } catch (e) {
      console.error(`\n✗ MFI batch error: ${e.message}`);
      errors++;
    }
    await sleep(50);
  }

  console.log(`\n  ✓ ${inserted} MSA/MD MFI rows upserted, ${errors} errors`);
  console.log(`  (area_name is populated as "MSA/MD XXXXX" placeholder — enrich from OMB delineation file if needed)`);
}

// ── main ─────────────────────────────────────────────────────────────────────
console.log(`FFIEC Census ETL — data year ${DATA_YEAR}`);
console.log(`  Tracts file:     ${TRACTS_FILE}`);
console.log(`  D&U file:        ${DU_FILE ?? '(none — pass 2 will be skipped)'}`);

await pass1();
await pass2();
await pass3();

console.log('\nDone.');
