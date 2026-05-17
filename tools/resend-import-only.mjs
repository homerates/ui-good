// tools/resend-import-only.mjs — Resend-only re-run (Loops already complete)
import fs from 'fs';

const RESEND_API_KEY = 're_i5eSsJpA_CaL55m4TWBUWN35GZG1nFW4f';
const CSV_PATH       = 'C:/Users/rayaa/Downloads/Rayaan Borrower Prospects.csv';
const AUDIENCE_NAME  = 'Rayaan Borrower Prospects';

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

async function getOrCreateResendAudience() {
  const listRes = await fetch('https://api.resend.com/audiences', {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  });
  const listData = await listRes.json();
  if (!listRes.ok) { console.error('List error:', JSON.stringify(listData)); process.exit(1); }

  const existing = (listData.data || []).find(a => a.name === AUDIENCE_NAME);
  if (existing) {
    console.log(`✓ Audience exists: "${AUDIENCE_NAME}" (${existing.id})`);
    return existing.id;
  }

  const createRes = await fetch('https://api.resend.com/audiences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: AUDIENCE_NAME }),
  });
  const created = await createRes.json();
  if (!createRes.ok) { console.error('Create error:', JSON.stringify(created)); process.exit(1); }

  // Resend wraps response in { data: { id } } for some endpoints
  const id = created.data?.id ?? created.id;
  console.log(`✓ Audience created: "${AUDIENCE_NAME}" (${id})`);
  console.log('  Raw response:', JSON.stringify(created));
  return id;
}

async function addContact(audienceId, firstName, lastName, email) {
  const res = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, first_name: firstName, last_name: lastName, unsubscribed: false }),
  });
  if (!res.ok && res.status !== 409) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, status: res.status, body };
  }
  return { ok: true };
}

async function main() {
  console.log('Reading CSV…');
  const contacts = parseCSV(fs.readFileSync(CSV_PATH, 'utf8'));
  console.log(`Loaded ${contacts.length} contacts\n`);

  const audienceId = await getOrCreateResendAudience();
  if (!audienceId) { console.error('No audience ID — aborting'); process.exit(1); }

  let ok = 0, fail = 0;
  const startTime = Date.now();
  const errors = [];

  for (let i = 0; i < contacts.length; i++) {
    const { 'First Name': first, 'Last Name': last, 'Email': email } = contacts[i];
    const result = await addContact(audienceId, first, last, email);

    if (result.ok) { ok++; } else {
      fail++;
      if (errors.length < 5) errors.push({ email, status: result.status, body: result.body });
    }

    if ((i + 1) % 50 === 0 || i === contacts.length - 1) {
      const pct = Math.round(((i + 1) / contacts.length) * 100);
      const secs = Math.round((Date.now() - startTime) / 1000);
      const eta  = Math.round((secs / (i + 1)) * (contacts.length - i - 1));
      process.stdout.write(`\r[${pct}%] ${i + 1}/${contacts.length} — ✓ ${ok} ✗ ${fail} | ETA: ${eta}s   `);
    }

    await sleep(110);
  }

  console.log('\n\n── Final Results ──────────────────────────');
  console.log(`Resend: ${ok} added, ${fail} failed`);
  if (errors.length > 0) {
    console.log('\nSample errors:');
    errors.forEach(e => console.log(`  ${e.email} → ${e.status}: ${JSON.stringify(e.body)}`));
  }
  console.log('Done.');
}

main().catch(console.error);
