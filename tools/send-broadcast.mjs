// tools/send-broadcast.mjs — send consumer outreach broadcast via Resend Broadcasts API
// Targets the existing "Rayaan Borrower Prospects" audience (already populated)

const RESEND_API_KEY = 're_i5eSsJpA_CaL55m4TWBUWN35GZG1nFW4f';
const AUDIENCE_ID    = '829ecb50-52fc-4e65-8773-430cf34e51c0';
const BASE           = 'https://chat.homerates.ai';
const FROM           = 'HomeRates.ai <digest@mail.homerates.ai>';
const SUBJECT        = '3 things homebuyers are wondering right now';
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

const _BG     = '#0d1117';
const _CARD   = '#161b22';
const _BORDER = 'rgba(255,255,255,0.07)';
const _TXT    = '#e6edf3';
const _TXT2   = '#8b949e';

function buildHtml() {
  const questionRows = QUESTIONS.map((q, i) => `
    <tr>
      <td style="padding:0 0 14px;">
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td width="28" style="vertical-align:top;padding-top:2px;">
              <span style="font-size:15px;font-weight:800;color:#00e87a;">${i + 1}.</span>
            </td>
            <td>
              <a href="${BASE}/chat?sq=${encodeURIComponent(q.sq)}"
                 style="font-size:14px;color:#e6edf3;text-decoration:underline;text-underline-offset:2px;line-height:1.5;">
                ${q.label}
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`).join('');

  const body = `
    <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#00e87a;">
      Mortgage Intelligence
    </p>
    <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#e6edf3;line-height:1.2;">
      Hi {{contact.first_name}},
    </p>
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
  `;

  return `<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="dark">
    <meta name="supported-color-schemes" content="dark">
  </head>
  <body style="margin:0;padding:0;background-color:${_BG};font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" bgcolor="${_BG}" style="background-color:${_BG};padding:32px 16px;">
  <tr><td bgcolor="${_BG}" align="center" style="background-color:${_BG};">
  <table width="520" cellpadding="0" cellspacing="0" bgcolor="${_CARD}"
         style="max-width:520px;width:100%;background-color:${_CARD};border-radius:16px;overflow:hidden;border:1px solid ${_BORDER};">
    <tr><td bgcolor="${_BG}" style="background-color:${_BG};padding:22px 32px;border-bottom:1px solid ${_BORDER};">
      <img src="${BASE}/assets/homerates-email-logo.png" alt="HomeRates.ai"
           style="height:32px;display:block;" onerror="this.style.display='none'">
    </td></tr>
    <tr><td bgcolor="${_CARD}" style="background-color:${_CARD};padding:32px;color:${_TXT};">
      ${body}
    </td></tr>
    <tr><td bgcolor="${_BG}" style="background-color:${_BG};padding:20px 32px;border-top:1px solid ${_BORDER};border-radius:0 0 16px 16px;">
      <p style="margin:0;font-size:11px;color:${_TXT2};line-height:1.6;">
        HomeRates.ai · homerates.ai<br>
        <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:${_TXT2};">Unsubscribe</a> · ${PHYSICAL_ADDR}
      </p>
    </td></tr>
  </table>
  </td></tr>
  </table>
  </body></html>`;
}

async function api(method, path, body) {
  const res = await fetch(`https://api.resend.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  console.log('Creating broadcast…');
  const created = await api('POST', '/broadcasts', {
    name: `Rayaan Borrower Prospects — Consumer Outreach ${new Date().toISOString().slice(0, 10)}`,
    audience_id: AUDIENCE_ID,
    from: FROM,
    subject: SUBJECT,
    html: buildHtml(),
  });

  const broadcastId = created.data?.id ?? created.id;
  console.log(`✓ Broadcast created: ${broadcastId}`);

  console.log('Sending…');
  await api('POST', `/broadcasts/${broadcastId}/send`, {});
  console.log('✓ Broadcast sent to Rayaan Borrower Prospects (1,754 contacts)');
  console.log(`  Subject: "${SUBJECT}"`);
  console.log(`  From:    ${FROM}`);
}

main().catch(e => { console.error('✗', e.message); process.exit(1); });
