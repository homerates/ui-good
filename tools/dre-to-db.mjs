#!/usr/bin/env node
// tools/dre-to-db.mjs
//
// Takes the filtered DRE broker CSV (output of filter-dre-csv.mjs) and
// converts it to JSON ready for Supabase upsert into pro_directory.
//
// Usage:
//   node tools/dre-to-db.mjs [input.csv] [output.json]
//
// Example:
//   node tools/dre-to-db.mjs tools/dre-brokers.csv tools/dre-brokers-import.json
//
// The JSON output is an array of objects matching the pro_directory schema.
// You can then import via Supabase dashboard → Table editor → Import, or
// pipe to the ETL upsert script.

import fs from 'fs';
import path from 'path';
import readline from 'readline';

const [,, inputArg, outputArg] = process.argv;
const inputPath  = path.resolve(inputArg  ?? 'tools/dre-brokers.csv');
const outputPath = path.resolve(outputArg ?? 'tools/dre-brokers-import.json');

if (!fs.existsSync(inputPath)) {
  console.error(`File not found: ${inputPath}`);
  process.exit(1);
}

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

// Build full name from parts
function buildName(last, first, suffix) {
  const parts = [first?.trim(), last?.trim(), suffix?.trim()].filter(Boolean);
  return parts.join(' ');
}

// Normalize license type → pro_type
function toProType(licType) {
  if (licType === 'Broker')      return 'agent_broker';
  if (licType === 'Corporation') return 'agent_broker'; // DRE corps are brokerages
  return 'agent';
}

// Normalize license type → human label
function toLicenseType(licType) {
  if (licType === 'Corporation') return 'Real Estate Corporation';
  return 'Real Estate Broker';
}

const records = [];
let headers = null;
let colIndex = {};

const rl = readline.createInterface({ input: fs.createReadStream(inputPath), crlfDelay: Infinity });

rl.on('line', (line) => {
  if (!line.trim()) return;

  if (!headers) {
    headers = parseCSVLine(line);
    headers.forEach((h, i) => { colIndex[h] = i; });
    return;
  }

  const f = parseCSVLine(line);
  const get = (col) => f[colIndex[col]]?.trim() ?? '';

  const licNumber = get('lic_number');
  const licType   = get('lic_type');
  const licStatus = get('lic_status');
  const city      = get('city');
  const state     = get('state');
  const zip       = get('zip_code');
  const county    = get('county_name');
  const addr1     = get('address_1');
  const addr2     = get('address_2');

  // Corp: name is in lastname_primary, no first name
  // Broker: name = firstname + lastname
  const isCorp = licType === 'Corporation';
  let name;
  if (isCorp) {
    name = get('lastname_primary'); // corp name stored in lastname field
  } else {
    name = buildName(get('lastname_primary'), get('firstname_secondary'), get('name_suffix'));
  }

  if (!name || !licNumber) return; // skip malformed rows

  // For corps, the related officer is the broker of record
  const officerName = get('related_firstname_secondary') && get('related_lastname_primary')
    ? buildName(get('related_lastname_primary'), get('related_firstname_secondary'), get('related_name_suffix'))
    : null;

  records.push({
    source:          'ca_dre',
    source_id:       licNumber,
    pro_type:        toProType(licType),
    name,
    company_name:    isCorp ? officerName : null, // for corps, officer name goes in company_name field is reversed
    city:            city || null,
    state:           state || 'CA',
    zip:             zip ? zip.slice(0, 5) : null,
    county_name:     county || null,
    license_type:    toLicenseType(licType),
    license_status:  licStatus || null,
    address_line1:   addr1 || null,
    address_line2:   addr2 || null,
    // Null until claimed
    claimed_by:      null,
    claimed_at:      null,
    bio:             null,
    phone:           null,
    website:         null,
    photo_url:       null,
  });
});

rl.on('close', () => {
  fs.writeFileSync(outputPath, JSON.stringify(records, null, 2));
  console.log(`Converted ${records.length.toLocaleString()} records → ${outputPath}`);
  const kb = (fs.statSync(outputPath).size / 1024).toFixed(0);
  console.log(`Output file size: ${kb} KB`);

  // Quick county breakdown (top 10)
  const countyCounts = {};
  for (const r of records) {
    const c = r.county_name || 'Unknown';
    countyCounts[c] = (countyCounts[c] ?? 0) + 1;
  }
  const top = Object.entries(countyCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log('\nTop 10 counties:');
  top.forEach(([county, n]) => console.log(`  ${county.padEnd(20)} ${n.toLocaleString()}`));
});
