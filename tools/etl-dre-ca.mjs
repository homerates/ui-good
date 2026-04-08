/**
 * ETL: California Department of Real Estate (DRE) — Licensee Data
 *
 * Seeds pro_directory with California-licensed real estate agents
 * and brokers from the CA DRE public licensee data file.
 *
 * ── HOW TO GET THE DATA FILE ─────────────────────────────────────────────
 *
 * 1. Go to: https://www.dre.ca.gov/Licensees/DataFiles.html
 * 2. Download the "Licensees" data file (CSV format)
 *    — typically named something like: re256_YYYYMMDD.csv or RealEstateLicensees.csv
 * 3. Place the file in: tools/data/dre/
 *    and name it: ca_dre_licensees.csv
 *
 * The file is public record, no registration required.
 * Updated quarterly by the DRE.
 *
 * ── COLUMN FORMAT ────────────────────────────────────────────────────────
 * The DRE file uses these columns (may vary slightly by export date):
 *   LicenseType       — SA (Salesperson) | BR (Broker) | CO (Corporation)
 *   LicenseStatus     — Licensed | Suspended | Expired | etc.
 *   ExpirationDate
 *   LicenseNumber
 *   BusinessName      — for corporations/brokerages
 *   FirstName
 *   LastName
 *   AddressLine1
 *   City
 *   State
 *   ZipCode
 *
 * ── RUN ──────────────────────────────────────────────────────────────────
 *   node tools/etl-dre-ca.mjs
 *   node tools/etl-dre-ca.mjs --dry-run   (print counts, no DB writes)
 *   node tools/etl-dre-ca.mjs --file path/to/custom.csv
 * ─────────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js';
import { createReadStream, existsSync } from 'fs';
import { createInterface } from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL        = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN             = process.argv.includes('--dry-run');

const customFile = process.argv.includes('--file')
  ? process.argv[process.argv.indexOf('--file') + 1]
  : null;

const DATA_FILE = customFile
  ?? path.join(__dirname, 'data', 'dre', 'ca_dre_licensees.csv');

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!existsSync(DATA_FILE)) {
  console.error(`❌  Data file not found: ${DATA_FILE}`);
  console.error('   Download from: https://www.dre.ca.gov/Licensees/DataFiles.html');
  console.error('   Place at: tools/data/dre/ca_dre_licensees.csv');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const BATCH_SIZE = 500;

// ── CSV parser (handles quoted fields) ───────────────────────────────────
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

// ── Normalize column names ────────────────────────────────────────────────
// DRE files have changed column naming across exports. We try multiple known variants.
function getCol(row, ...keys) {
  for (const k of keys) {
    const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()];
    if (v !== undefined && v !== null && v !== '') return v.trim();
  }
  return '';
}

// ── Map DRE license type code to pro_type ────────────────────────────────
function mapProType(typeCode) {
  const t = (typeCode ?? '').toUpperCase().trim();
  if (t === 'SA' || t === 'SALESPERSON') return 'agent';
  if (t === 'BR' || t === 'BROKER')      return 'agent_broker';
  if (t === 'CO' || t === 'CORPORATION') return 'agent_broker'; // brokerage entity
  return 'agent'; // default
}

// ── Map DRE license type to readable label ────────────────────────────────
function mapLicenseType(typeCode) {
  const t = (typeCode ?? '').toUpperCase().trim();
  if (t === 'SA') return 'Real Estate Salesperson';
  if (t === 'BR') return 'Real Estate Broker';
  if (t === 'CO') return 'Real Estate Broker — Corporation';
  return typeCode;
}

// ── Upsert batch ──────────────────────────────────────────────────────────
async function upsertBatch(batch) {
  if (DRY_RUN) return;
  const { error } = await sb
    .from('pro_directory')
    .upsert(batch, { onConflict: 'source,source_id', ignoreDuplicates: false });
  if (error) throw new Error(`Upsert error: ${error.message}`);
}

// ── Main ──────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n🏡  CA DRE Seed  ${DRY_RUN ? '[DRY RUN — no DB writes]' : ''}`);
  console.log(`    File: ${DATA_FILE}`);

  let headers   = null;
  let total     = 0;
  let skipped   = 0;
  let batch     = [];

  const flush = async () => {
    if (batch.length) { await upsertBatch(batch); batch = []; }
  };

  await new Promise((resolve, reject) => {
    const rl = createInterface({ input: createReadStream(DATA_FILE), crlfDelay: Infinity });

    rl.on('line', async line => {
      if (!line.trim()) return;
      const cols = parseCSVLine(line);

      if (!headers) {
        headers = cols.map(h => h.replace(/^\uFEFF/, '')); // strip BOM
        console.log(`    Columns detected: ${headers.join(', ')}`);
        return;
      }

      const row = {};
      headers.forEach((h, i) => { row[h] = cols[i] ?? ''; });

      // License status filter — only active/licensed
      const status = getCol(row,
        'LicenseStatus', 'License_Status', 'STATUS', 'LicStatus'
      ).toLowerCase();
      if (!status.includes('licensed') && !status.includes('active')) {
        skipped++;
        return;
      }

      const licenseNo = getCol(row,
        'LicenseNumber', 'License_Number', 'LICENSE_NUMBER', 'LicNo', 'LICENSE'
      );
      if (!licenseNo) { skipped++; return; }

      const typeCode = getCol(row,
        'LicenseType', 'License_Type', 'LICENSE_TYPE', 'LicType', 'TYPE'
      );

      // Build name — individuals have first/last, corporations have business name
      const firstName   = getCol(row, 'FirstName',    'First_Name',    'FIRST_NAME');
      const lastName    = getCol(row, 'LastName',     'Last_Name',     'LAST_NAME');
      const bizName     = getCol(row, 'BusinessName', 'Business_Name', 'BUSINESS_NAME', 'Name');
      const name        = bizName || [firstName, lastName].filter(Boolean).join(' ') || `DRE #${licenseNo}`;

      if (!name || name.trim() === '') { skipped++; return; }

      const city = getCol(row, 'City', 'CITY', 'OfficCity');
      const zip  = getCol(row, 'ZipCode', 'Zip_Code', 'ZIP', 'PostalCode').slice(0, 5);

      batch.push({
        source:         'ca_dre',
        source_id:      licenseNo,
        pro_type:       mapProType(typeCode),
        name:           name.substring(0, 200),
        company_name:   null, // individual's brokerage not in DRE file; added after claim
        city:           city || null,
        state:          'CA',
        zip:            zip || null,
        license_type:   mapLicenseType(typeCode),
        license_status: 'Active',
      });

      total++;
      if (batch.length >= BATCH_SIZE) {
        process.stdout.write(`  ↑ ${total} upserted...\r`);
        await flush();
      }
    });

    rl.on('close', () => resolve());
    rl.on('error', reject);
  });

  await flush();

  console.log(`\n  ✓ ${total} licensees upserted`);
  console.log(`  ✗ ${skipped} skipped (inactive / missing data)`);
  console.log('\n✅  Done.\n');
})().catch(err => { console.error('Fatal:', err); process.exit(1); });
