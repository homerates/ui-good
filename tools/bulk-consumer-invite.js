// tools/bulk-consumer-invite.js
// One-time script: read CSV → deduplicate → insert into consumer_invites + send Resend email
// Usage:  node tools/bulk-consumer-invite.js          (live run)
//         node tools/bulk-consumer-invite.js --dry    (dry run — no DB writes, no emails)

'use strict';
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { Resend }       = require('resend');

const DRY = process.argv.includes('--dry');
if (DRY) console.log('[DRY RUN — no emails will be sent, no DB rows written]\n');

// ── Load .env.local ──────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env.local');
const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq === -1) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  env[k] = v;
}

const SUPABASE_URL         = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY       = env.RESEND_API_KEY;
const FROM_EMAIL           = env.RESEND_FROM_EMAIL || 'digest@mail.homerates.ai';
const BASE                 = env.NEXT_PUBLIC_APP_BASE_URL || 'https://chat.homerates.ai';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE env vars. Check .env.local'); process.exit(1);
}
if (!RESEND_API_KEY) {
  console.error('Missing RESEND_API_KEY. Check .env.local'); process.exit(1);
}

const sb     = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const resend = new Resend(RESEND_API_KEY);

// ── Config ───────────────────────────────────────────────────────────────────
const CREDITS       = 25;
const SENDER_NAME   = 'Rayaan';
const PERSONAL_NOTE = "I'd love for you to try HomeRates — your own AI mortgage and home intelligence platform, on me.";
const EXPIRES_HOURS = 7 * 24;
const DELAY_MS      = 120; // ~8/sec — well within Resend limits
const CSV_PATH      = 'C:/Users/rayaa/Downloads/parsed_contacts_name_phone_email.csv';

// ── Parse CSV ────────────────────────────────────────────────────────────────
const contacts = [];
const seenInCsv = new Set();
const csvLines = fs.readFileSync(CSV_PATH, 'utf8').split('\n').slice(1);

for (const line of csvLines) {
  if (!line.trim()) continue;
  const parts = line.split(',');
  const name  = (parts[0] || '').trim();
  const phone = (parts[1] || '').trim() || null;
  const email = (parts[2] || '').trim().toLowerCase();
  if (!email || !email.includes('@') || !email.includes('.')) continue;
  if (seenInCsv.has(email)) continue;
  seenInCsv.add(email);
  contacts.push({ name: name || email, email, phone });
}

console.log(`CSV parsed: ${contacts.length} unique valid contacts`);

// ── Email template ───────────────────────────────────────────────────────────
function buildEmail(firstName, inviteUrl) {
  const noteBlock = `<div style="background:#1c2433;border-left:3px solid #00e87a;border-radius:0 8px 8px 0;padding:14px 16px;margin:0 0 24px;font-size:14px;color:#e6edf3;line-height:1.6;">${PERSONAL_NOTE}</div>`;
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1117;padding:40px 20px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#161b22;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:32px;">
      <tr><td>
        <img src="https://chat.homerates.ai/assets/email-logo.png" alt="HomeRates.ai" style="height:32px;margin-bottom:32px;display:block;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00e87a;">Personal Invite</p>
        <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#e6edf3;line-height:1.2;">Hi ${firstName} — you're invited.</p>
        <p style="margin:0 0 20px;font-size:15px;color:#8b949e;line-height:1.6;">
          <strong style="color:#e6edf3;">${SENDER_NAME}</strong> has given you private access to <strong style="color:#e6edf3;">HomeRates.ai</strong> — real mortgage intelligence, live market data, and property analysis. No forms. No sales calls.
        </p>
        ${noteBlock}
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#1c2433;border:1px solid rgba(0,232,122,0.18);border-radius:12px;padding:16px 20px;">
          <tr><td>
            <p style="margin:0 0 4px;font-size:12px;color:#8b949e;text-transform:uppercase;letter-spacing:0.08em;">Your credit balance</p>
            <p style="margin:0;font-size:28px;font-weight:800;color:#00e87a;line-height:1;">${CREDITS} <span style="font-size:14px;font-weight:500;color:#8b949e;">free credits</span></p>
            <p style="margin:6px 0 0;font-size:12px;color:#8b949e;">Pre-loaded on your account — use them to run any scenario or property lookup.</p>
          </td></tr>
        </table>
        <a href="${inviteUrl}" style="display:block;text-align:center;background:#00e87a;color:#07100f;font-weight:700;font-size:15px;padding:14px 20px;border-radius:999px;text-decoration:none;margin-bottom:20px;">
          Claim your access →
        </a>
        <p style="margin:0;font-size:12px;color:#8b949e;text-align:center;line-height:1.6;">
          No account required to explore — sign in when you're ready to save your scenarios.
        </p>
        <hr style="border:none;border-top:1px solid rgba(255,255,255,0.07);margin:24px 0;">
        <p style="margin:0;font-size:11px;color:rgba(139,148,158,0.6);text-align:center;line-height:1.6;">
          Sent by ${SENDER_NAME} via HomeRates.ai · Educational tool only, not financial advice.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Fetch already-invited emails
  const { data: existing, error: fetchErr } = await sb
    .from('consumer_invites')
    .select('email');
  if (fetchErr) { console.error('Supabase fetch failed:', fetchErr.message); process.exit(1); }

  const alreadyInvited = new Set((existing || []).map(r => r.email.toLowerCase()));
  const toProcess = contacts.filter(c => !alreadyInvited.has(c.email));

  console.log(`Already in DB:   ${alreadyInvited.size}`);
  console.log(`New to process:  ${toProcess.length}`);
  if (DRY) { console.log('\nDry run complete — nothing written.'); return; }
  console.log('\nStarting sends…\n');

  let sent = 0, failed = 0, dbErr = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const contact = toProcess[i];
    const token     = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + EXPIRES_HOURS * 3_600_000).toISOString();
    const inviteUrl = `${BASE}/chat?invite=${token}`;
    const firstName = contact.name.split(/\s+/)[0].replace(/[^a-zA-Z]/g, '') || 'there';

    // DB insert
    const { error: insertErr } = await sb.from('consumer_invites').insert({
      email:         contact.email,
      full_name:     contact.name,
      phone:         contact.phone || null,
      token,
      credits:       CREDITS,
      personal_note: PERSONAL_NOTE,
      status:        'pending',
      expires_at:    expiresAt,
    });
    if (insertErr) {
      console.error(`[${i+1}/${toProcess.length}] DB ERR ${contact.email}: ${insertErr.message}`);
      dbErr++;
      continue;
    }

    // Email send
    try {
      await resend.emails.send({
        from:    `HomeRates.ai <${FROM_EMAIL}>`,
        to:      contact.email,
        subject: `${SENDER_NAME} invited you to HomeRates.ai`,
        html:    buildEmail(firstName, inviteUrl),
      });
      sent++;
    } catch (err) {
      console.error(`[${i+1}/${toProcess.length}] EMAIL ERR ${contact.email}: ${err.message}`);
      failed++;
    }

    if ((sent + failed + dbErr) % 100 === 0) {
      console.log(`  … ${i+1}/${toProcess.length} processed — sent:${sent} email_err:${failed} db_err:${dbErr}`);
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log('\n════════════════════════════════');
  console.log(`DONE`);
  console.log(`Sent successfully:  ${sent}`);
  console.log(`Email failures:     ${failed}`);
  console.log(`DB insert errors:   ${dbErr}`);
  console.log(`Already existed:    ${alreadyInvited.size}`);
  console.log('════════════════════════════════');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
