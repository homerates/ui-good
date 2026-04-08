#!/usr/bin/env node
/**
 * ETL: CA DRE Brokers + Corporations → pro_directory
 *
 * Reads the filtered DRE CSV (output of filter-dre-csv.mjs) and upserts
 * Licensed Brokers and Corporations into pro_directory via Supabase.
 *
 * ── PREREQUISITES ────────────────────────────────────────────────────────────
 *   1. Run the filter script first:
 *      node tools/filter-dre-csv.mjs "C:/Users/rayaa/Downloads/CurrList/CurrList.csv" tools/dre-brokers.csv
 *
 *   2. Env vars must be set (already in .env.local):
 *      NEXT_PUBLIC_SUPABASE_URL
 *      SUPABASE_SERVICE_ROLE_KEY
 *
 * ── RUN ──────────────────────────────────────────────────────────────────────
 *   node --env-file=.env.local tools/etl-dre-brokers.mjs
 *   node --env-file=.env.local tools/etl-dre-brokers.mjs --dry-run
 *   node --env-file=.env.local tools/etl-dre-brokers.mjs --ca-only     (skip out-of-state)
 *   node --env-file=.env.local tools/etl-dre-brokers.mjs --county "LOS ANGELES"
 *   node --env-file=.env.local tools/etl-dre-brokers.mjs --limit 1000  (test with first N)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient }   from '@supabase/supabase-js';
import { createReadStream, existsSync } from 'fs';
import { createInterface } from 'readline';
import path               from 'path';
import { fileURLToPath }  from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Args ──────────────────────────────────────────────────────────────────────
const DRY_RUN   = process.argv.includes('--dry-run');
const CA_ONLY   = process.argv.includes('--ca-only');
const LIMIT     = process.argv.includes('--limit')
  ? parseInt(process.argv[process.argv.indexOf('--limit') + 1], 10)
  : Infinity;
const COUNTY_FILTER = process.argv.includes('--county')
  ? process.argv[process.argv.indexOf('--county') + 1]?.toUpperCase()
  : null;

const INPUT_CSV = path.resolve(__dirname, 'dre-brokers.csv');

// ── Supabase ──────────────────────────────────────────────────────────────────
const SUPABASE_URL       = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.error('    Run with: node --env-file=.env.local tools/etl-dre-brokers.mjs');
  process.exit(1);
}

if (!existsSync(INPUT_CSV)) {
  console.error(`❌  Input not found: ${INPUT_CSV}`);
  console.error('    Run first: node tools/filter-dre-csv.mjs "C:/Users/rayaa/Downloads/CurrList/CurrList.csv" tools/dre-brokers.csv');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const BATCH_SIZE = 500;

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseCSVLine(line) {
  const result = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(field.trim());
      field = '';
    } else {
      field += ch;
    }
  }
  result.push(field.trim());
  return result;
}

function buildName(last, first, suffix) {
  return [first, last, suffix].map(s => s?.trim()).filter(Boolean).join(' ');
}

function toProType(licType) {
  return 'agent_broker'; // both Broker and Corporation → agent_broker
}

function toLicenseType(licType) {
  return licType === 'Corporation' ? 'Real Estate Corporation' : 'Real Estate Broker';
}

// ── Upsert batch ──────────────────────────────────────────────────────────────
async function upsertBatch(rows, attempt = 1) {
  if (DRY_RUN) return { error: null };
  const { error } = await sb
    .from('pro_directory')
    .upsert(rows, {
      onConflict: 'source,source_id',
      ignoreDuplicates: false,          // update existing rows
    });
  if (error && attempt < 3) {
    await new Promise(r => setTimeout(r, 1000 * attempt));
    return upsertBatch(rows, attempt + 1);
  }
  return { error };
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log(`\n📂  Input:   ${INPUT_CSV}`);
console.log(`🗄️  Target:  pro_directory (Supabase)`);
if (DRY_RUN)      console.log('🔍  DRY RUN — no DB writes');
if (CA_ONLY)      console.log('🌁  CA only — skipping out-of-state addresses');
if (COUNTY_FILTER) console.log(`📍  County filter: ${COUNTY_FILTER}`);
if (LIMIT < Infinity) console.log(`⚡  Limit: ${LIMIT} records`);
console.log('');

let headers    = null;
let colIndex   = {};
let batch      = [];
let totalRead  = 0;
let totalSent  = 0;
let totalError = 0;
let skipped    = 0;

const STATS = { Broker: 0, Corporation: 0 };

async function flushBatch() {
  if (batch.length === 0) return;
  const toSend = [...batch];
  batch = [];
  const { error } = await upsertBatch(toSend);
  if (error) {
    console.error(`  ❌  Batch error: ${error.message}`);
    totalError += toSend.length;
  } else {
    totalSent += toSend.length;
    process.stdout.write(`\r  ✓  ${totalSent.toLocaleString()} upserted${DRY_RUN ? ' (dry)' : ''}...`);
  }
}

const rl = createInterface({ input: createReadStream(INPUT_CSV), crlfDelay: Infinity });

const lines = [];
for await (const line of rl) {
  if (!line.trim()) continue;

  if (!headers) {
    headers = parseCSVLine(line);
    headers.forEach((h, i) => { colIndex[h] = i; });
    continue;
  }

  if (totalRead >= LIMIT) break;
  totalRead++;

  const f   = parseCSVLine(line);
  const get = (col) => f[colIndex[col]]?.trim() ?? '';

  const licNumber = get('lic_number');
  const licType   = get('lic_type');
  const licStatus = get('lic_status');
  const city      = get('city');
  const state     = get('state');
  const zip       = get('zip_code');
  const county    = get('county_name');

  // CA-only filter
  if (CA_ONLY && state !== 'CA') { skipped++; continue; }
  // County filter
  if (COUNTY_FILTER && county?.toUpperCase() !== COUNTY_FILTER) { skipped++; continue; }

  const isCorp = licType === 'Corporation';

  // Corp: name is the company name (stored in lastname_primary by DRE)
  // Broker: full name from first + last + suffix
  let name, companyName;
  if (isCorp) {
    name        = get('lastname_primary');
    // Officer = broker of record for the corp
    const offFirst = get('related_firstname_secondary');
    const offLast  = get('related_lastname_primary');
    const offSuf   = get('related_name_suffix');
    companyName = offFirst || offLast ? buildName(offLast, offFirst, offSuf) : null;
  } else {
    name        = buildName(get('lastname_primary'), get('firstname_secondary'), get('name_suffix'));
    companyName = null;
  }

  if (!name || !licNumber) { skipped++; continue; }

  STATS[licType] = (STATS[licType] ?? 0) + 1;

  batch.push({
    source:         'ca_dre',
    source_id:      licNumber,
    pro_type:       toProType(licType),
    name,
    company_name:   companyName,
    city:           city || null,
    state:          state || 'CA',
    zip:            zip ? zip.slice(0, 5) : null,
    license_type:   toLicenseType(licType),
    license_status: licStatus || null,
    // Never overwrite claimed profiles — use upsert with ignoreDuplicates=false
    // but don't touch claimed_by / claimed_at / bio / phone / website / photo_url
    // Those are set by the user; upsert only updates the seed fields
  });

  if (batch.length >= BATCH_SIZE) {
    await flushBatch();
  }
}

// Final batch
await flushBatch();

console.log('\n');
console.log('─────────────────────────────────────────');
console.log(`Total rows read:     ${totalRead.toLocaleString()}`);
console.log(`  Brokers:           ${(STATS.Broker ?? 0).toLocaleString()}`);
console.log(`  Corporations:      ${(STATS.Corporation ?? 0).toLocaleString()}`);
if (skipped) console.log(`Skipped (filtered):  ${skipped.toLocaleString()}`);
if (DRY_RUN) {
  console.log(`Would upsert:        ${totalRead.toLocaleString()} records`);
} else {
  console.log(`Upserted to DB:      ${totalSent.toLocaleString()}`);
  if (totalError) console.log(`Errors:              ${totalError.toLocaleString()}`);
}
console.log('─────────────────────────────────────────');
console.log(DRY_RUN ? '✓  Dry run complete — no DB changes made' : '✓  Done');
