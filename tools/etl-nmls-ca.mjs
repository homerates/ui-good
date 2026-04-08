/**
 * ETL: NMLS Consumer Access — California Professionals
 *
 * Seeds pro_directory with California-licensed mortgage companies and
 * individual loan originators from NMLS public data.
 *
 * ── HOW TO GET THE DATA FILES ────────────────────────────────────────────
 *
 * 1. Go to: https://www.nmlsconsumeraccess.org/IndustryAccess.aspx
 * 2. Register for free Industry Access (takes ~1 business day to approve)
 * 3. Once approved, download the "State Snapshot" files:
 *      - NMLS_IndividualLicensee.csv   (individual LOs)
 *      - NMLS_CompanyLicensee.csv      (companies / brokerages)
 * 4. Place both files in: tools/data/nmls/
 *
 * Alternatively, the CFPB maintains a searchable version at:
 *   https://www.consumerfinance.gov/data-research/hmda/
 * (historical data only — not real-time profiles)
 *
 * ── RUN ──────────────────────────────────────────────────────────────────
 *   node tools/etl-nmls-ca.mjs
 *   node tools/etl-nmls-ca.mjs --type individuals
 *   node tools/etl-nmls-ca.mjs --type companies
 *   node tools/etl-nmls-ca.mjs --dry-run   (print counts, no DB writes)
 * ─────────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js';
import { createReadStream, existsSync } from 'fs';
import { createInterface } from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL       = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN            = process.argv.includes('--dry-run');
const TYPE_FILTER        = process.argv.includes('--type')
  ? process.argv[process.argv.indexOf('--type') + 1]
  : 'all'; // 'individuals' | 'companies' | 'all'

const DATA_DIR = path.join(__dirname, 'data', 'nmls');
const INDIVIDUALS_FILE = path.join(DATA_DIR, 'NMLS_IndividualLicensee.csv');
const COMPANIES_FILE   = path.join(DATA_DIR, 'NMLS_CompanyLicensee.csv');

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const BATCH_SIZE = 500;

// ── CSV parser ────────────────────────────────────────────────────────────
// Handles quoted fields with commas inside them
function parseCSVLine(line) {
  const result = [];
  let current  = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

async function readCSV(filePath, rowCallback) {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
    let headers = null;
    let rowCount = 0;

    rl.on('line', line => {
      if (!line.trim()) return;
      const cols = parseCSVLine(line);
      if (!headers) {
        headers = cols.map(h => h.replace(/^\uFEFF/, '')); // strip BOM
        return;
      }
      const row = {};
      headers.forEach((h, i) => { row[h] = cols[i] ?? ''; });
      rowCallback(row);
      rowCount++;
    });

    rl.on('close', () => resolve(rowCount));
    rl.on('error', reject);
  });
}

// ── Upsert batch into pro_directory ──────────────────────────────────────
async function upsertBatch(batch) {
  if (DRY_RUN) return;
  const { error } = await sb
    .from('pro_directory')
    .upsert(batch, { onConflict: 'source,source_id', ignoreDuplicates: false });
  if (error) throw new Error(`Upsert error: ${error.message}`);
}

// ── Process INDIVIDUALS file ──────────────────────────────────────────────
// NMLS individual CSV columns (may vary slightly by snapshot date):
//   Ind_NMLS_ID, First_Name, Last_Name, Company_NMLS_ID, Company_Name,
//   Office_Street_Address, Office_City, Office_State, Office_Postal_Code,
//   License_Type, License_Regulator, License_Number, License_Status,
//   License_Status_Date, Issued_Date, Renewed_Date
async function processIndividuals() {
  if (!existsSync(INDIVIDUALS_FILE)) {
    console.warn(`⚠️  Individuals file not found: ${INDIVIDUALS_FILE}`);
    console.warn('   Download NMLS_IndividualLicensee.csv and place in tools/data/nmls/');
    return;
  }

  console.log('\n── Individuals ─────────────────────────────────────────');
  let total = 0, skipped = 0, batch = [];

  const flush = async () => {
    if (batch.length) { await upsertBatch(batch); batch = []; }
  };

  await readCSV(INDIVIDUALS_FILE, async row => {
    // Filter to California active licenses only
    const state  = (row['Office_State'] ?? '').trim().toUpperCase();
    const status = (row['License_Status'] ?? '').trim();
    if (state !== 'CA') { skipped++; return; }
    if (!['Active', 'Approved', 'Approved-Active'].includes(status)) { skipped++; return; }

    const nmlsId = (row['Ind_NMLS_ID'] ?? '').trim();
    if (!nmlsId) { skipped++; return; }

    const firstName = (row['First_Name'] ?? '').trim();
    const lastName  = (row['Last_Name']  ?? '').trim();
    const name      = [firstName, lastName].filter(Boolean).join(' ') || `NMLS #${nmlsId}`;

    batch.push({
      source:         'nmls',
      source_id:      nmlsId,
      pro_type:       'lo',
      name,
      company_name:   (row['Company_Name'] ?? '').trim() || null,
      city:           (row['Office_City']  ?? '').trim() || null,
      state:          'CA',
      zip:            (row['Office_Postal_Code'] ?? '').trim().slice(0, 5) || null,
      license_type:   (row['License_Type']   ?? '').trim() || null,
      license_status: status,
    });

    total++;
    if (batch.length >= BATCH_SIZE) {
      process.stdout.write(`  ↑ ${total} upserted...\r`);
      await flush();
    }
  });

  await flush();
  console.log(`  ✓ ${total} individuals upserted (${skipped} skipped — non-CA or inactive)`);
}

// ── Process COMPANIES file ────────────────────────────────────────────────
// NMLS company CSV columns:
//   Company_NMLS_ID, Company_Name, Office_Street_Address, Office_City,
//   Office_State, Office_Postal_Code, License_Type, License_Regulator,
//   License_Number, License_Status, License_Status_Date, Issued_Date
async function processCompanies() {
  if (!existsSync(COMPANIES_FILE)) {
    console.warn(`⚠️  Companies file not found: ${COMPANIES_FILE}`);
    console.warn('   Download NMLS_CompanyLicensee.csv and place in tools/data/nmls/');
    return;
  }

  console.log('\n── Companies ───────────────────────────────────────────');
  let total = 0, skipped = 0, batch = [];

  const flush = async () => {
    if (batch.length) { await upsertBatch(batch); batch = []; }
  };

  await readCSV(COMPANIES_FILE, async row => {
    const state  = (row['Office_State'] ?? '').trim().toUpperCase();
    const status = (row['License_Status'] ?? '').trim();
    if (state !== 'CA') { skipped++; return; }
    if (!['Active', 'Approved', 'Approved-Active'].includes(status)) { skipped++; return; }

    const nmlsId = (row['Company_NMLS_ID'] ?? '').trim();
    const name   = (row['Company_Name']    ?? '').trim();
    if (!nmlsId || !name) { skipped++; return; }

    batch.push({
      source:         'nmls',
      source_id:      `co_${nmlsId}`, // prefix to avoid collision with individual IDs
      pro_type:       'lo_company',
      name,
      company_name:   null, // they ARE the company
      city:           (row['Office_City']  ?? '').trim() || null,
      state:          'CA',
      zip:            (row['Office_Postal_Code'] ?? '').trim().slice(0, 5) || null,
      license_type:   (row['License_Type']   ?? '').trim() || null,
      license_status: status,
    });

    total++;
    if (batch.length >= BATCH_SIZE) {
      process.stdout.write(`  ↑ ${total} upserted...\r`);
      await flush();
    }
  });

  await flush();
  console.log(`  ✓ ${total} companies upserted (${skipped} skipped — non-CA or inactive)`);
}

// ── Main ──────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n🏦  NMLS CA Seed  ${DRY_RUN ? '[DRY RUN — no DB writes]' : ''}`);
  console.log(`    Data dir: ${DATA_DIR}`);

  if (TYPE_FILTER === 'all' || TYPE_FILTER === 'individuals') await processIndividuals();
  if (TYPE_FILTER === 'all' || TYPE_FILTER === 'companies')   await processCompanies();

  console.log('\n✅  Done.\n');
})().catch(err => { console.error('Fatal:', err); process.exit(1); });
