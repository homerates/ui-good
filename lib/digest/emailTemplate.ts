// lib/digest/emailTemplate.ts
// Monthly home intelligence digest email — uses shared emailShell() for consistent branding

import { emailShell } from "../sendEmail";

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

function refiBlock(data: DigestEmailData): string {
    const { purchaseRate, liveRate, estimatedBalance } = data;
    if (!purchaseRate || !estimatedBalance) return '';

    const saving = purchaseRate - liveRate;
    if (saving < 0.5) return '';

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
    <div style="background:#f4f6f9;border-left:3px solid #00e87a;border-radius:0 8px 8px 0;padding:16px 18px;margin:0 0 24px">
      <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#008a48;margin-bottom:6px">Refi Opportunity</div>
      <div style="font-size:14px;color:#1a2530;line-height:1.6">
        Rates have dropped <strong style="color:#008a48">${saving.toFixed(2)}%</strong> since you purchased.
        Refinancing could save approximately <strong style="color:#008a48">$${monthlySaving.toLocaleString()}/mo</strong>.
      </div>
      <div style="margin-top:12px">
        <a href="https://chat.homerates.ai/chat?sq=${encodeURIComponent(`Refi from ${purchaseRate.toFixed(2)}% to ${liveRate.toFixed(2)}% on ${fmt(estimatedBalance)} balance`)}"
           style="display:inline-block;background:#00e87a;color:#07100f;font-weight:700;font-size:13px;padding:9px 18px;border-radius:999px;text-decoration:none">
          Run the numbers →
        </a>
      </div>
    </div>`;
}

export function digestEmailHtml(data: DigestEmailData): string {
    const month = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const firstName = data.borrowerName.split(' ')[0];

    const equityPct = (data.estimatedValue && data.estimatedEquity)
        ? Math.round((data.estimatedEquity / data.estimatedValue) * 100) : null;

    const body = `
      <!-- Eyebrow + greeting -->
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00e87a;">${month} Home Update</p>
      <p style="margin:0 0 6px;font-size:22px;font-weight:800;color:#080c12;line-height:1.2;">Hi ${firstName},</p>
      <p style="margin:0 0 24px;font-size:14px;color:#6b7a8d;">${data.address}</p>

      <!-- Stats row — 3 cards side by side -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
        <tr>
          <!-- Est. Value -->
          <td width="32%" style="padding:14px;background:#f4f6f9;border:1px solid #e2e8f0;border-radius:10px;vertical-align:top">
            <div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;margin-bottom:6px">Est. Value</div>
            <div style="font-size:20px;font-weight:700;color:#080c12">${data.estimatedValue ? fmt(data.estimatedValue) : '—'}</div>
            ${data.valueDelta !== null ? `<div style="font-size:11px;margin-top:3px;color:${data.valueDelta >= 0 ? '#008a48' : '#dc2626'}">${data.valueDelta >= 0 ? '▲' : '▼'} ${fmt(Math.abs(data.valueDelta))}</div>` : ''}
          </td>
          <td width="2%"></td>
          <!-- Equity -->
          <td width="32%" style="padding:14px;background:#f4f6f9;border:1px solid #e2e8f0;border-radius:10px;vertical-align:top">
            <div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;margin-bottom:6px">Est. Equity</div>
            <div style="font-size:20px;font-weight:700;color:#080c12">${data.estimatedEquity ? fmt(data.estimatedEquity) : '—'}</div>
            ${equityPct !== null ? `<div style="font-size:11px;margin-top:3px;color:#6b7a8d">${equityPct}% of value</div>` : ''}
          </td>
          <td width="2%"></td>
          <!-- 30Y Rate -->
          <td width="32%" style="padding:14px;background:#f4f6f9;border:1px solid #e2e8f0;border-radius:10px;vertical-align:top">
            <div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;margin-bottom:6px">30Y Rate</div>
            <div style="font-size:20px;font-weight:700;color:#080c12">${data.liveRate.toFixed(2)}%</div>
            ${data.purchaseRate ? `<div style="font-size:11px;margin-top:3px;color:#6b7a8d">Yours ~${data.purchaseRate.toFixed(2)}%</div>` : ''}
          </td>
        </tr>
      </table>

      <!-- Refi block (conditional) -->
      ${refiBlock(data)}

      <!-- CTA -->
      <a href="https://chat.homerates.ai/chat?sq=${encodeURIComponent(`Property analysis for ${data.address}`)}"
         style="display:block;text-align:center;background:#00e87a;color:#07100f;font-size:14px;font-weight:700;padding:14px 20px;border-radius:999px;text-decoration:none;margin:0 0 8px">
        Ask a mortgage question about your home →
      </a>
    `;

    const footer = `Sent by <strong>${data.loName}</strong> via HomeRates.ai${data.loEmail ? ` · Reply to reach your loan officer` : ''}. Values are estimates based on public data — not an appraisal. HomeRates.ai is an educational tool, not a mortgage lender or broker.`;

    return emailShell(body, footer);
}
