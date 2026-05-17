// tools/send-direct-emails.mjs — send consumer outreach via Resend /emails (no Broadcasts/Audiences)
import fs from 'fs';

const RESEND_API_KEY = 're_PoRAvFDh_C1fvPkJ7BYEE3joZhKaiPbRp'; // email-send key
const CSV_PATH       = 'C:/Users/rayaa/Downloads/Rayaan Borrower Prospects.csv';
const FROM           = 'HomeRates.ai <digest@mail.homerates.ai>';
const SUBJECT        = '3 things homebuyers are wondering right now';
const BASE           = 'https://chat.homerates.ai';
const PHYSICAL_ADDR  = '548 Market St PMB 12345, San Francisco, CA 94104';

const QUESTIONS = [
  {
    label: 'What can I afford with my income?',
    sq: 'Based on my income, what home price can I afford and what would my monthly payment look like?',
  },
  {
    label: 'Should I buy now or wait for rates to drop?',
    sq: 'Should I buy a home now or wait for mortgage rates to drop?',
  },
  {
    label: 'What would my payment be on a $500k home?',
    sq: 'What would my monthly payment be on a $500,000 home with 10% down?',
  },
];

const _BG   = '#0d1117';
const _CARD = '#161b22';
const _TXT2 = '#8b949e';

function buildHtml(firstName) {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
  const questionRows = QUESTIONS.map((q, i) => `
    <tr><td style="padding:0 0 14px;">
      <table cellpadding="0" cellspacing="0" width="100%"><tr>
        <td width="28" style="vertical-align:top;padding-top:2px;">
          <span style="font-size:15px;font-weight:800;color:#00e87a;">${i + 1}.</span>
        </td>
        <td>
          <a href="${BASE}/chat?sq=${encodeURIComponent(q.sq)}"
             style="font-size:14px;color:#e6edf3;text-decoration:underline;text-underline-offset:2px;line-height:1.5;">
            ${q.label}
          </a>
        </td>
      </tr></table>
    </td></tr>`).join('');

  return `<!DOCTYPE html><html><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
</head>
<body style="margin:0;padding:0;background-color:${_BG};font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="${_BG}" style="background-color:${_BG};padding:32px 16px;">
<tr><td bgcolor="${_BG}" align="center" style="background-color:${_BG};">
<table width="520" cellpadding="0" cellspacing="0" bgcolor="${_CARD}"
       style="max-width:520px;width:100%;background-color:${_CARD};border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.07);">
  <tr><td bgcolor="${_BG}" style="background-color:${_BG};padding:22px 32px;border-bottom:1px solid rgba(255,255,255,0.07);">
    <img src="${BASE}/assets/homerates-email-logo.png" alt="HomeRates.ai"
         style="height:32px;display:block;" onerror="this.style.display='none'">
  </td></tr>
  <tr><td bgcolor="${_CARD}" style="background-color:${_CARD};padding:32px;color:#e6edf3;">
    <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#00e87a;">Mortgage Intelligence</p>
    <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#e6edf3;line-height:1.2;">${greeting}</p>
    <p style="margin:0 0 24px;font-size:15px;color:#8b949e;line-height:1.6;">
      Here are 3 questions homebuyers like you are asking right now — click any for an instant answer:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#1c2433;border:1px solid rgba(255,255,255,0.07);border-radius:12px;margin-bottom:28px;">
      <tr><td style="padding:20px 24px;">${questionRows}</td></tr>
    </table>
    <a href="${BASE}/chat"
       style="display:block;text-align:center;background:#00e87a;color:#07100f;font-size:15px;font-weight:700;
              padding:14px 20px;border-radius:999px;text-decoration:none;margin-bottom:20px;">
      Try HomeRates.ai →
    </a>
    <p style="margin:0;text-align:center;font-size:13px;color:#8b949e;line-height:1.6;">
      Free AI mortgage assistant — ask anything about buying, rates, or affordability.
    </p>
  </td></tr>
  <tr><td bgcolor="${_BG}" style="background-color:${_BG};padding:20px 32px;border-top:1px solid rgba(255,255,255,0.07);border-radius:0 0 16px 16px;">
    <p style="margin:0;font-size:11px;color:${_TXT2};line-height:1.6;">
      HomeRates.ai · homerates.ai<br>${PHYSICAL_ADDR}
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

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

async function sendEmail(to, firstName) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to,
      subject: SUBJECT,
      html: buildHtml(firstName),
    }),
  });
  return res.ok;
}

async function main() {
  console.log('Reading CSV…');
  const contacts = parseCSV(fs.readFileSync(CSV_PATH, 'utf8'));
  console.log(`Loaded ${contacts.length} contacts\n`);

  let ok = 0, fail = 0;
  const startTime = Date.now();
  const errors = [];

  for (let i = 0; i < contacts.length; i++) {
    const { 'First Name': first, 'Email': email } = contacts[i];
    const sent = await sendEmail(email, first);

    if (sent) { ok++; } else { fail++; if (errors.length < 5) errors.push(email); }

    if ((i + 1) % 50 === 0 || i === contacts.length - 1) {
      const pct  = Math.round(((i + 1) / contacts.length) * 100);
      const secs = Math.round((Date.now() - startTime) / 1000);
      const eta  = Math.round((secs / (i + 1)) * (contacts.length - i - 1));
      process.stdout.write(`\r[${pct}%] ${i + 1}/${contacts.length} — ✓ ${ok} ✗ ${fail} | ETA: ${eta}s   `);
    }

    await sleep(125); // ~8 req/s — within Resend rate limits
  }

  console.log('\n\n── Final Results ──────────────────────────');
  console.log(`Sent: ${ok} | Failed: ${fail}`);
  if (errors.length) console.log('Sample failures:', errors);
  console.log('Done.');
}

main().catch(console.error);
