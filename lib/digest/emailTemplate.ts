// lib/digest/emailTemplate.ts
// Monthly home intelligence digest email — clean, dark-friendly, mobile-first

export interface DigestEmailData {
    borrowerName:    string;
    address:         string;
    liveRate:        number;
    estimatedValue:  number | null;
    estimatedValueLow:  number | null;
    estimatedValueHigh: number | null;
    estimatedBalance:   number | null;
    estimatedEquity:    number | null;
    purchaseRate:       number | null;
    lastSaleDate:       string | null;
    lastSalePrice:      number | null;
    valueDelta:         number | null;  // vs last month
    equityDelta:        number | null;  // vs last month
    loName:  string;
    loEmail: string | null;
}

function fmt(n: number): string {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
    if (n >= 1_000)     return `$${Math.round(n / 1_000)}k`;
    return `$${n.toLocaleString()}`;
}

function delta(n: number | null, label: string): string {
    if (n === null) return '';
    const sign  = n >= 0 ? '+' : '';
    const color = n >= 0 ? '#00c46a' : '#ff6b6b';
    return `<span style="color:${color};font-size:12px;margin-left:6px">${sign}${fmt(Math.abs(n))} ${label}</span>`;
}

function refiBlock(data: DigestEmailData): string {
    const { purchaseRate, liveRate, estimatedBalance } = data;
    if (!purchaseRate || !estimatedBalance) return '';

    const saving = purchaseRate - liveRate;
    if (saving < 0.5) return ''; // no meaningful window

    const r      = liveRate / 100 / 12;
    const n      = 360;
    const newPmt = r > 0
        ? Math.round((estimatedBalance * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1))
        : Math.round(estimatedBalance / n);
    const oldR   = purchaseRate / 100 / 12;
    const oldPmt = oldR > 0
        ? Math.round((estimatedBalance * oldR * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1))
        : Math.round(estimatedBalance / n);
    const monthlySaving = Math.abs(oldPmt - newPmt);

    return `
    <tr>
      <td style="padding:0 0 20px">
        <div style="background:#0d2a1a;border:1px solid #00c46a;border-radius:10px;padding:18px 20px">
          <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#00c46a;margin-bottom:8px">Refi Opportunity</div>
          <div style="font-size:15px;color:#e8f5ee;line-height:1.5">
            Rates have dropped <strong style="color:#00c46a">${saving.toFixed(2)}%</strong> since you purchased.
            Refinancing today could save approximately
            <strong style="color:#00c46a">$${monthlySaving.toLocaleString()}/mo</strong>.
          </div>
          <div style="margin-top:12px">
            <a href="https://chat.homerates.ai/chat?sq=${encodeURIComponent(`Refi from ${purchaseRate.toFixed(2)}% to ${liveRate.toFixed(2)}% on ${fmt(estimatedBalance)} balance`)}"
               style="display:inline-block;background:#00c46a;color:#07100f;font-weight:700;font-size:13px;padding:9px 18px;border-radius:8px;text-decoration:none">
              Run the numbers →
            </a>
          </div>
        </div>
      </td>
    </tr>`;
}

export function digestEmailHtml(data: DigestEmailData): string {
    const month = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const firstName = data.borrowerName.split(' ')[0];

    const equityPct = (data.estimatedValue && data.estimatedEquity)
        ? Math.round((data.estimatedEquity / data.estimatedValue) * 100) : null;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Your Home Update — ${month}</title>
</head>
<body style="margin:0;padding:0;background:#07100f;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#07100f;padding:32px 16px">
<tr><td align="center">
<table width="100%" style="max-width:560px" cellpadding="0" cellspacing="0">

  <!-- Header -->
  <tr>
    <td style="padding:0 0 28px">
      <img src="https://chat.homerates.ai/assets/HomeRates-Logo%20Green.png"
           alt="HomeRates.ai" height="22" style="display:block"/>
    </td>
  </tr>

  <!-- Greeting -->
  <tr>
    <td style="padding:0 0 24px">
      <div style="font-size:13px;color:rgba(160,192,168,.6);margin-bottom:4px">${month} Home Update</div>
      <div style="font-size:22px;font-weight:700;color:#e8f5ee">Hi ${firstName},</div>
      <div style="font-size:14px;color:rgba(160,192,168,.7);margin-top:6px">${data.address}</div>
    </td>
  </tr>

  <!-- Stats row -->
  <tr>
    <td style="padding:0 0 20px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <!-- Estimated value -->
          <td width="33%" style="padding:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:10px;vertical-align:top">
            <div style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:rgba(160,192,168,.5);margin-bottom:6px">Est. Value</div>
            <div style="font-size:20px;font-weight:700;color:#e8f5ee">${data.estimatedValue ? fmt(data.estimatedValue) : '—'}</div>
            ${data.valueDelta !== null ? `<div style="font-size:11px;margin-top:3px;color:${data.valueDelta >= 0 ? '#00c46a' : '#ff6b6b'}">${data.valueDelta >= 0 ? '▲' : '▼'} ${fmt(Math.abs(data.valueDelta))} this month</div>` : ''}
          </td>
          <td width="4px"></td>
          <!-- Equity -->
          <td width="33%" style="padding:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:10px;vertical-align:top">
            <div style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:rgba(160,192,168,.5);margin-bottom:6px">Est. Equity</div>
            <div style="font-size:20px;font-weight:700;color:#e8f5ee">${data.estimatedEquity ? fmt(data.estimatedEquity) : '—'}</div>
            ${equityPct !== null ? `<div style="font-size:11px;margin-top:3px;color:rgba(160,192,168,.5)">${equityPct}% of value</div>` : ''}
          </td>
          <td width="4px"></td>
          <!-- Rate -->
          <td width="33%" style="padding:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:10px;vertical-align:top">
            <div style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:rgba(160,192,168,.5);margin-bottom:6px">30Y Rate</div>
            <div style="font-size:20px;font-weight:700;color:#e8f5ee">${data.liveRate.toFixed(2)}%</div>
            ${data.purchaseRate ? `<div style="font-size:11px;margin-top:3px;color:rgba(160,192,168,.5)">You're at ~${data.purchaseRate.toFixed(2)}%</div>` : ''}
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Refi block (conditional) -->
  ${refiBlock(data)}

  <!-- CTA -->
  <tr>
    <td style="padding:0 0 28px">
      <a href="https://chat.homerates.ai/chat?sq=${encodeURIComponent(`Property analysis for ${data.address}`)}"
         style="display:block;text-align:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#e8f5ee;font-size:14px;font-weight:600;padding:14px 20px;border-radius:10px;text-decoration:none">
        Ask a mortgage question about your home →
      </a>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="border-top:1px solid rgba(255,255,255,.06);padding:20px 0 0">
      <div style="font-size:12px;color:rgba(160,192,168,.4);line-height:1.6">
        Sent by <strong style="color:rgba(160,192,168,.6)">${data.loName}</strong> via HomeRates.ai.
        ${data.loEmail ? `Reply to this email to reach your loan officer.` : ''}
        <br/>Values are estimates based on public data — not an appraisal or guaranteed offer.
        HomeRates.ai is an educational tool, not a mortgage lender.
      </div>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
