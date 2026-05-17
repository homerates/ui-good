// tools/import-borrower-prospects.mjs
// One-time script: import Rayaan Borrower Prospects into Loops + Resend Audiences
// Run: node tools/import-borrower-prospects.mjs

import fs from 'fs';
import path from 'path';

const LOOPS_API_KEY  = '885c8ac830f097be1ced44956ba0e8ee';
const RESEND_API_KEY = 're_i5eSsJpA_CaL55m4TWBUWN35GZG1nFW4f';
const CSV_PATH       = 'C:/Users/rayaa/Downloads/Rayaan Borrower Prospects.csv';
const AUDIENCE_NAME  = 'Rayaan Borrower Prospects';
const LOOPS_GROUP    = 'Borrower Prospect';

// ── Parse CSV ────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const fields = [];
    let cur = '', inQ = false;
    for (const c of line) {
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
      else { cur += c; }
    }
    fields.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = (fields[i] || '').trim());
    return obj;
  }).filter(r => r['Email'] && r['Email'].includes('@'));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Resend: create or find audience ─────────────────────────────────────────
async function getOrCreateResendAudience() {
  // List existing audiences
  const listRes = await fetch('https://api.resend.com/audiences', {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  });
  const listData = await listRes.json();
  const existing = (listData.data || []).find(a => a.name === AUDIENCE_NAME);
  if (existing) {
    console.log(`✓ Resend audience exists: "${AUDIENCE_NAME}" (${existing.id})`);
    return existing.id;
  }
  // Create new audience
  const createRes = await fetch('https://api.resend.com/audiences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: AUDIENCE_NAME }),
  });
  const created = await createRes.json();
  console.log(`✓ Resend audience created: "${AUDIENCE_NAME}" (${created.id})`);
  return created.id;
}

async function addToResendAudience(audienceId, firstName, lastName, email) {
  const res = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, first_name: firstName, last_name: lastName, unsubscribed: false }),
  });
  return res.ok;
}

// ── Loops: add contact ───────────────────────────────────────────────────────
async function addToLoops(firstName, lastName, email) {
  const res = await fetch('https://app.loops.so/api/v1/contacts/create', {
    method: 'POST',
    headers: { Authorization: `Bearer ${LOOPS_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, firstName, lastName, userGroup: LOOPS_GROUP, source: 'rayaan-prospect-import' }),
  });
  return res.ok || res.status === 409; // 409 = already exists, treat as success
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Reading CSV…');
  const contacts = parseCSV(fs.readFileSync(CSV_PATH, 'utf8'));
  console.log(`Loaded ${contacts.length} contacts\n`);

  // Create Resend audience
  const audienceId = await getOrCreateResendAudience();

  let loopsOk = 0, loopsFail = 0, resendOk = 0, resendFail = 0;
  const startTime = Date.now();

  for (let i = 0; i < contacts.length; i++) {
    const { 'First Name': first, 'Last Name': last, 'Email': email } = contacts[i];

    const [lOk, rOk] = await Promise.all([
      addToLoops(first, last, email),
      addToResendAudience(audienceId, first, last, email),
    ]);

    if (lOk) loopsOk++;  else loopsFail++;
    if (rOk) resendOk++; else resendFail++;

    // Progress every 50
    if ((i + 1) % 50 === 0 || i === contacts.length - 1) {
      const pct  = Math.round(((i + 1) / contacts.length) * 100);
      const secs = Math.round((Date.now() - startTime) / 1000);
      const eta  = Math.round((secs / (i + 1)) * (contacts.length - i - 1));
      process.stdout.write(`\r[${pct}%] ${i + 1}/${contacts.length} — Loops: ${loopsOk}✓ ${loopsFail}✗ | Resend: ${resendOk}✓ ${resendFail}✗ | ETA: ${eta}s   `);
    }

    await sleep(110); // ~9 req/s — safe for both APIs
  }

  console.log('\n\n── Final Results ──────────────────────────');
  console.log(`Loops:  ${loopsOk} added, ${loopsFail} failed`);
  console.log(`Resend: ${resendOk} added to "${AUDIENCE_NAME}", ${resendFail} failed`);
  console.log('Done.');
}

main().catch(console.error);
