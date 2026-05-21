// lib/digest/emailTemplate.ts
// Premium dark homeowner intelligence digest email — no shared shell, fully self-contained.
// 6 sections: Alerts · Value & Equity · Mortgage Intelligence · HELOC Power · Economy Snapshot · Equity Milestones

export interface NearbySale {
  address: string;
  price: number;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  soldDate: string;
}

export interface DigestEmailData {
  // Identity
  borrowerName:    string;
  address:         string;
  loName:          string;
  loEmail:         string | null;

  // LO branding (present when digest is sent by an LO, not HomeRates-direct)
  loPhoto?:        string | null;
  loPhone?:        string | null;
  loTitle?:        string | null;
  loLender?:       string | null;
  loNmls?:         string | null;

  // Shareable report URL (auto-generated when LO attached)
  reportUrl?:      string | null;

  // Property / AVM
  estimatedValue:      number | null;
  estimatedValueLow:   number | null;
  estimatedValueHigh:  number | null;
  estimatedBalance:    number | null;
  estimatedEquity:     number | null;
  purchaseRate:        number | null;
  lastSaleDate:        string | null;
  lastSalePrice:       number | null;

  // Deltas (vs last month)
  valueDelta:  number | null;
  equityDelta: number | null;

  // Live market
  liveRate: number;

  // Optional extras (populated when available)
  fedFundsRate?:      number | null;
  valueHistory?:      { date: string; value: number }[];
  rentEstimate?:      number | null;

  // Nearby sold comps
  nearbySales?:       NearbySale[];

  // Rate alert mode — set true when digest is triggered by a rate move
  isRateAlert?:       boolean;
  rateDelta?:         number | null;
}

// ── Format helpers ─────────────────────────────────────────────────────────────

function fmtDollar(n: number, decimals = 0): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(decimals === 0 ? 2 : decimals).replace(/\.?0+$/, '')}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
}

function fmtRate(r: number | null | undefined): string {
  if (!r || !Number.isFinite(r)) return '—';
  return r.toFixed(2) + '%';
}

function fmtDelta(n: number | null, type: 'dollar' | 'pct' = 'dollar'): string {
  if (n === null) return '';
  const abs = Math.abs(n);
  const sign = n >= 0 ? '+' : '−';
  const color = n >= 0 ? '#00e87a' : '#f97066';
  const val = type === 'dollar' ? fmtDollar(abs) : abs.toFixed(1) + '%';
  return `<span style="color:${color};font-size:11px;">${sign}${val} this month</span>`;
}

function monthLabel(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ── Layout primitives ──────────────────────────────────────────────────────────

const BG      = '#0d1117';
const CARD    = '#161b22';
const BORDER  = 'rgba(255,255,255,0.07)';
const GREEN   = '#00e87a';
const GREEN_DIM = '#008a48';
const TXT     = '#e6edf3';
const TXT2    = '#8b949e';
const BASE    = process.env.NEXT_PUBLIC_APP_BASE_URL ?? 'https://chat.homerates.ai';
const PHYSICAL_ADDRESS = process.env.BUSINESS_MAILING_ADDRESS ?? '548 Market St PMB 12345, San Francisco, CA 94104';

function card(inner: string, extraStyle = ''): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:${CARD};border:1px solid ${BORDER};border-radius:14px;margin-bottom:16px;${extraStyle}"><tr><td style="padding:20px 22px;">${inner}</td></tr></table>`;
}

function eyebrow(txt: string): string {
  return `<p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${GREEN};">${txt}</p>`;
}

function sectionTitle(txt: string): string {
  return `<p style="margin:0 0 14px;font-size:14px;font-weight:700;color:${TXT};">${txt}</p>`;
}

function divider(): string {
  return `<div style="border-top:1px solid ${BORDER};margin:16px 0;"></div>`;
}

// ── Bar visualisation (email-safe, table-based) ────────────────────────────────

function progressBar(pct: number, color = GREEN, bg = 'rgba(255,255,255,0.07)', height = 6): string {
  const clamped = Math.max(0, Math.min(100, pct));
  return `
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="background:${bg};border-radius:999px;height:${height}px;overflow:hidden;">
        <table width="${clamped}%" cellpadding="0" cellspacing="0"><tr>
          <td style="background:${color};border-radius:999px;height:${height}px;line-height:${height}px;">&nbsp;</td>
        </tr></table>
      </td>
    </tr></table>`;
}

// Sparkline bars from value history — 12 cells, proportional heights
function sparkline(history: { date: string; value: number }[]): string {
  if (!history || history.length < 2) return '';
  const vals = history.slice(-12).map(h => h.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const bars = vals.map((v, i) => {
    const h = Math.max(4, Math.round(((v - min) / range) * 40));
    const isLast = i === vals.length - 1;
    const color = isLast ? GREEN : 'rgba(0,232,122,0.3)';
    return `<td style="vertical-align:bottom;padding:0 1px;"><div style="width:14px;height:${h}px;background:${color};border-radius:2px 2px 0 0;"></div></td>`;
  }).join('');
  const label0 = history.slice(-12)[0]?.date?.slice(0, 7) ?? '';
  const labelN = history.at(-1)?.date?.slice(0, 7) ?? '';
  return `
    <table cellpadding="0" cellspacing="0" style="width:100%;margin-top:8px;"><tr>${bars}</tr></table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;"><tr>
      <td style="font-size:9px;color:${TXT2};">${label0}</td>
      <td style="font-size:9px;color:${TXT2};text-align:right;">${labelN}</td>
    </tr></table>`;
}

// ── Computed finance helpers ───────────────────────────────────────────────────

function monthlyPayment(principal: number, annualRate: number, months = 360): number {
  const r = annualRate / 100 / 12;
  if (r === 0) return Math.round(principal / months);
  return Math.round((principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1));
}

function remainingMonths(balance: number, rate: number, pmt: number): number {
  const r = rate / 100 / 12;
  if (r === 0 || pmt <= 0) return 360;
  // n = -ln(1 - r*P/M) / ln(1+r)
  const arg = 1 - (r * balance) / pmt;
  if (arg <= 0) return 360;
  return Math.ceil(-Math.log(arg) / Math.log(1 + r));
}

function payoffYear(balance: number, rate: number, originalBalance: number): number {
  if (!balance || !rate) return new Date().getFullYear() + 30;
  const origTerm = 360;
  const pmt = monthlyPayment(originalBalance, rate, origTerm);
  const rem = remainingMonths(balance, rate, pmt);
  return new Date().getFullYear() + Math.ceil(rem / 12);
}

function helocMax(value: number, balance: number, cltv = 0.85): number {
  return Math.max(0, Math.round(value * cltv - balance));
}

function helocPayment(draw: number, rate: number): number {
  // HELOC interest-only monthly
  return Math.round((draw * (rate / 100)) / 12);
}

// Prime rate approximation: fed funds + 3
function primeRate(fedFunds: number | null | undefined): number {
  return (fedFunds ?? 4.25) + 3;
}

// ── Section renderers ──────────────────────────────────────────────────────────

function sectionAlerts(data: DigestEmailData): string {
  const alerts: string[] = [];
  const { estimatedBalance, estimatedValue, estimatedEquity, purchaseRate, liveRate, fedFundsRate } = data;

  // Refi opportunity
  if (purchaseRate && estimatedBalance && purchaseRate - liveRate >= 0.5) {
    const saving = purchaseRate - liveRate;
    const newPmt = monthlyPayment(estimatedBalance, liveRate);
    const oldPmt = monthlyPayment(estimatedBalance, purchaseRate);
    const mo = Math.abs(oldPmt - newPmt);
    const closingCosts = Math.round(estimatedBalance * 0.02);
    const breakEven = mo > 0 ? Math.round(closingCosts / mo) : null;
    const link = `${BASE}/chat?sq=${encodeURIComponent(`I have a $${Math.round(estimatedBalance).toLocaleString('en-US')} balance at ${purchaseRate.toFixed(2)}%, market rate is ${liveRate.toFixed(2)}%. Should I refinance? Show monthly savings and break-even.`)}`;
    alerts.push(`
      <tr><td style="padding:0 0 10px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(0,232,122,0.06);border:1px solid rgba(0,232,122,0.2);border-radius:10px;">
          <tr><td style="padding:14px 16px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="width:20px;font-size:14px;padding-right:10px;vertical-align:top;">●</td>
              <td>
                <div style="font-size:12px;font-weight:700;color:${GREEN};margin-bottom:3px;">Refi opportunity — save ~${fmtDollar(mo)}/mo</div>
                <div style="font-size:12px;color:${TXT2};line-height:1.5;">
                  At ${fmtRate(liveRate)} market rate vs. your ${fmtRate(purchaseRate)}, refinancing your ${fmtDollar(estimatedBalance)} balance
                  could save ~${fmtDollar(mo * 12)}/yr.${breakEven ? ` Break-even in ${breakEven} months.` : ''}
                  <a href="${link}" style="color:${GREEN};text-decoration:none;margin-left:6px;">Run the numbers →</a>
                </div>
              </td>
            </tr></table>
          </td></tr>
        </table>
      </td></tr>`);
  }

  // HELOC window
  if (estimatedValue && estimatedBalance && estimatedEquity) {
    const ltv = estimatedBalance / estimatedValue;
    const maxHELOC = helocMax(estimatedValue, estimatedBalance);
    if (ltv < 0.8 && maxHELOC > 50_000) {
      const helRate = primeRate(fedFundsRate) + 0.5;
      const ioPmt = helocPayment(Math.round(maxHELOC * 0.5), helRate);
      alerts.push(`
        <tr><td style="padding:0 0 10px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(234,179,8,0.06);border:1px solid rgba(234,179,8,0.2);border-radius:10px;">
            <tr><td style="padding:14px 16px;">
              <table width="100%" cellpadding="0" cellspacing="0"><tr>
                <td style="width:20px;font-size:14px;padding-right:10px;vertical-align:top;color:#eab308;">●</td>
                <td>
                  <div style="font-size:12px;font-weight:700;color:#eab308;margin-bottom:3px;">HELOC window is favorable right now</div>
                  <div style="font-size:12px;color:${TXT2};line-height:1.5;">
                    With ${Math.round((1 - ltv) * 100)}% equity and HELOC rates at ${fmtRate(helRate)}, you could access up to
                    ${fmtDollar(maxHELOC)} in credit. A 50% draw is ~${fmtDollar(ioPmt)}/mo interest-only.
                  </div>
                </td>
              </tr></table>
            </td></tr>
          </table>
        </td></tr>`);
    }
  }

  if (alerts.length === 0) return '';

  return card(`
    ${eyebrow('Your Alerts')}
    <table width="100%" cellpadding="0" cellspacing="0">
      ${alerts.join('')}
    </table>
  `);
}

function sectionValueEquity(data: DigestEmailData): string {
  const { estimatedValue, estimatedEquity, estimatedBalance, estimatedValueLow, estimatedValueHigh,
          valueDelta, equityDelta, lastSalePrice, lastSaleDate, valueHistory } = data;

  const ltv = (estimatedValue && estimatedBalance) ? Math.round((estimatedBalance / estimatedValue) * 100) : null;
  const equityPct = (estimatedValue && estimatedEquity) ? Math.round((estimatedEquity / estimatedValue) * 100) : null;

  // Appreciation from purchase
  let apprecStr = '';
  if (lastSalePrice && estimatedValue && lastSalePrice > 0) {
    const gain = estimatedValue - lastSalePrice;
    const gainPct = (gain / lastSalePrice) * 100;
    apprecStr = `<span style="color:${gain >= 0 ? GREEN : '#f97066'};">${gain >= 0 ? '+' : ''}${gainPct.toFixed(1)}% since purchase</span>`;
  }

  return card(`
    ${eyebrow('Home Value & Equity')}
    <!-- 3 stat cards -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <td width="31%" style="padding:12px;background:rgba(255,255,255,0.04);border:1px solid ${BORDER};border-radius:10px;vertical-align:top;">
          <div style="font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${TXT2};margin-bottom:5px;">Est. Value</div>
          <div style="font-size:18px;font-weight:800;color:${TXT};">${estimatedValue ? fmtDollar(estimatedValue) : '—'}</div>
          <div style="margin-top:3px;">${fmtDelta(valueDelta)}</div>
        </td>
        <td width="2%"></td>
        <td width="31%" style="padding:12px;background:rgba(255,255,255,0.04);border:1px solid ${BORDER};border-radius:10px;vertical-align:top;">
          <div style="font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${TXT2};margin-bottom:5px;">Est. Equity</div>
          <div style="font-size:18px;font-weight:800;color:${TXT};">${estimatedEquity ? fmtDollar(estimatedEquity) : '—'}</div>
          <div style="margin-top:3px;">${equityPct !== null ? `<span style="font-size:11px;color:${TXT2};">${equityPct}% of value</span>` : ''}</div>
        </td>
        <td width="2%"></td>
        <td width="31%" style="padding:12px;background:rgba(255,255,255,0.04);border:1px solid ${BORDER};border-radius:10px;vertical-align:top;">
          <div style="font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${TXT2};margin-bottom:5px;">LTV Ratio</div>
          <div style="font-size:18px;font-weight:800;color:${TXT};">${ltv !== null ? ltv + '%' : '—'}</div>
          <div style="margin-top:3px;">${estimatedBalance ? `<span style="font-size:11px;color:${TXT2};">${fmtDollar(estimatedBalance)} balance</span>` : ''}</div>
        </td>
      </tr>
    </table>

    <!-- Equity bar -->
    ${(estimatedEquity && estimatedBalance && equityPct !== null) ? `
    <div style="margin-bottom:4px;"><span style="font-size:11px;color:${TXT2};">Equity breakdown</span></div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:4px;"><tr>
      <td style="width:${equityPct}%;background:${GREEN};border-radius:4px 0 0 4px;height:8px;"></td>
      <td style="background:rgba(255,255,255,0.1);border-radius:0 4px 4px 0;height:8px;"></td>
    </tr></table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr>
      <td style="font-size:10px;color:${GREEN};">${fmtDollar(estimatedEquity)} equity (${equityPct}%)</td>
      <td style="font-size:10px;color:${TXT2};text-align:right;">${fmtDollar(estimatedBalance!)} remaining</td>
    </tr></table>` : ''}

    <!-- Value range + appreciation -->
    ${(estimatedValueLow && estimatedValueHigh) ? `
    <div style="font-size:11px;color:${TXT2};margin-bottom:8px;">
      Range: ${fmtDollar(estimatedValueLow)} – ${fmtDollar(estimatedValueHigh)}
      ${apprecStr ? ' · ' + apprecStr : ''}
    </div>` : (apprecStr ? `<div style="font-size:11px;margin-bottom:8px;">${apprecStr}</div>` : '')}

    <!-- Sparkline if we have history -->
    ${valueHistory && valueHistory.length >= 2 ? `
    ${divider()}
    <div style="font-size:11px;color:${TXT2};margin-bottom:2px;">12-month value trend</div>
    ${sparkline(valueHistory)}` : ''}
  `);
}

function sectionMortgage(data: DigestEmailData): string {
  const { estimatedBalance, purchaseRate, liveRate, lastSalePrice, lastSaleDate } = data;
  if (!estimatedBalance || !purchaseRate) return '';

  const origBalance = lastSalePrice ? lastSalePrice * 0.8 : estimatedBalance;
  const paidOff = origBalance - estimatedBalance;
  const paidOffPct = origBalance > 0 ? Math.round((paidOff / origBalance) * 100) : 0;

  // Interest paid estimate (rough): payments made × avg monthly interest
  const purchaseYear = lastSaleDate ? new Date(lastSaleDate).getFullYear() : null;
  const yearsElapsed = purchaseYear ? new Date().getFullYear() - purchaseYear : null;
  const monthsElapsed = yearsElapsed ? yearsElapsed * 12 : null;
  const origPmt = monthlyPayment(origBalance, purchaseRate);
  const totalPaid = monthsElapsed ? origPmt * monthsElapsed : null;
  const interestPaid = totalPaid ? Math.round(totalPaid - paidOff) : null;

  // Refi savings if applicable
  const rateGap = purchaseRate - liveRate;
  const newPmt = monthlyPayment(estimatedBalance, liveRate);
  const oldPmt = monthlyPayment(estimatedBalance, purchaseRate);
  const monthlySaving = rateGap >= 0.25 ? Math.abs(newPmt - oldPmt) : 0;

  // Max value range for the rate comparison bar
  const rateMax = Math.max(purchaseRate, liveRate) + 1;
  const purchasePct = Math.round((purchaseRate / rateMax) * 100);
  const livePct = Math.round((liveRate / rateMax) * 100);

  return card(`
    ${eyebrow('Mortgage Intelligence')}

    <!-- Rate comparison -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;background:rgba(255,255,255,0.03);border-radius:10px;">
      <tr><td style="padding:14px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="width:50%;padding-right:8px;border-right:1px solid ${BORDER};">
              <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${TXT2};margin-bottom:6px;">Your Rate</div>
              <div style="font-size:22px;font-weight:800;color:${TXT};">${fmtRate(purchaseRate)}</div>
              ${progressBar(purchasePct, 'rgba(139,148,158,0.5)')}
            </td>
            <td style="width:50%;padding-left:8px;">
              <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${TXT2};margin-bottom:6px;">Market Today</div>
              <div style="font-size:22px;font-weight:800;color:${liveRate < purchaseRate ? GREEN : '#f97066'};">${fmtRate(liveRate)}</div>
              ${progressBar(livePct, liveRate < purchaseRate ? GREEN : '#f97066')}
            </td>
          </tr>
        </table>
      </td></tr>
    </table>

    <!-- Loan progress -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr>
      <td style="width:50%;padding-right:6px;">
        <div style="font-size:10px;color:${TXT2};margin-bottom:4px;">Loan payoff progress</div>
        ${progressBar(paidOffPct, GREEN)}
        <div style="font-size:10px;color:${TXT2};margin-top:3px;">${paidOffPct}% paid — ${fmtDollar(estimatedBalance)} remaining</div>
      </td>
      ${interestPaid ? `
      <td style="width:50%;padding-left:6px;">
        <div style="font-size:10px;color:${TXT2};margin-bottom:4px;">Est. interest paid to date</div>
        <div style="font-size:15px;font-weight:700;color:${TXT};">${fmtDollar(interestPaid)}</div>
        ${yearsElapsed ? `<div style="font-size:10px;color:${TXT2};">over ~${yearsElapsed} years</div>` : ''}
      </td>` : '<td></td>'}
    </tr></table>

    <!-- Refi savings if meaningful -->
    ${monthlySaving > 50 ? `
    ${divider()}
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td>
        <div style="font-size:10px;color:${TXT2};margin-bottom:2px;">Potential refi savings</div>
        <div style="font-size:16px;font-weight:700;color:${GREEN};">${fmtDollar(monthlySaving)}/mo · ${fmtDollar(monthlySaving * 12)}/yr</div>
      </td>
      <td style="text-align:right;vertical-align:middle;">
        <a href="${BASE}/chat?sq=${encodeURIComponent(`I have a $${Math.round(estimatedBalance).toLocaleString('en-US')} balance at ${purchaseRate.toFixed(2)}%, market rate is ${liveRate.toFixed(2)}%. Should I refinance? Show monthly savings and break-even.`)}"
           style="display:inline-block;padding:8px 16px;background:${GREEN};color:#07100f;font-size:12px;font-weight:700;border-radius:999px;text-decoration:none;">
          Run numbers →
        </a>
      </td>
    </tr></table>` : ''}
  `);
}

function sectionHELOC(data: DigestEmailData): string {
  const { estimatedValue, estimatedBalance, fedFundsRate } = data;
  if (!estimatedValue || !estimatedBalance) return '';

  const max = helocMax(estimatedValue, estimatedBalance);
  if (max < 10_000) return ''; // not enough equity

  const prime = primeRate(fedFundsRate);
  const helRate = prime + 0.5;
  const cashOutMax = Math.max(0, Math.round(estimatedValue * 0.80 - estimatedBalance));

  const draws: { label: string; amount: number }[] = [
    { label: '25% draw', amount: Math.round(max * 0.25) },
    { label: '50% draw', amount: Math.round(max * 0.50) },
    { label: 'Full draw', amount: max },
  ];

  const drawRows = draws.map(d => {
    const io = helocPayment(d.amount, helRate);
    const fullPmt = monthlyPayment(d.amount, helRate, 240); // 20yr repayment
    return `
      <tr>
        <td style="font-size:12px;color:${TXT2};padding:8px 0;border-bottom:1px solid ${BORDER};">${d.label}</td>
        <td style="font-size:12px;color:${TXT};text-align:right;padding:8px 0;border-bottom:1px solid ${BORDER};">${fmtDollar(d.amount)}</td>
        <td style="font-size:12px;color:${TXT2};text-align:right;padding:8px 0;border-bottom:1px solid ${BORDER};">${fmtDollar(io)}/mo I/O</td>
        <td style="font-size:12px;color:${TXT2};text-align:right;padding:8px 0;border-bottom:1px solid ${BORDER};">${fmtDollar(fullPmt)}/mo full</td>
      </tr>`;
  }).join('');

  return card(`
    ${eyebrow('HELOC & Borrowing Power')}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;"><tr>
      <td style="width:50%;padding-right:8px;border-right:1px solid ${BORDER};">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${TXT2};margin-bottom:5px;">Max HELOC Available</div>
        <div style="font-size:22px;font-weight:800;color:${GREEN};">${fmtDollar(max)}</div>
        <div style="font-size:10px;color:${TXT2};margin-top:3px;">Available today at 85% CLTV</div>
      </td>
      <td style="width:50%;padding-left:8px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${TXT2};margin-bottom:5px;">HELOC Rate</div>
        <div style="font-size:22px;font-weight:800;color:${TXT};">${fmtRate(helRate)}</div>
        <div style="font-size:10px;color:${TXT2};margin-top:3px;">Prime ${fmtRate(prime)} + 0.50%</div>
      </td>
    </tr></table>

    ${cashOutMax > 10_000 ? `
    <div style="font-size:11px;color:${TXT2};margin-bottom:12px;">
      Cash-out refi alternative: up to <strong style="color:${TXT};">${fmtDollar(cashOutMax)}</strong> at 80% LTV
    </div>` : ''}

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${TXT2};padding-bottom:6px;">Draw scenario</td>
        <td style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${TXT2};text-align:right;padding-bottom:6px;">Amount</td>
        <td style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${TXT2};text-align:right;padding-bottom:6px;">Interest only</td>
        <td style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${TXT2};text-align:right;padding-bottom:6px;">Amortizing</td>
      </tr>
      ${drawRows}
    </table>

    <div style="margin-top:10px;font-size:10px;color:${TXT2};line-height:1.5;">
      Rate shown is estimated Prime + 0.50% variable. Actual rates vary by lender, credit, and CLTV.
      <a href="${BASE}/messages" style="color:${GREEN};text-decoration:none;">Message my LO →</a>
    </div>
  `);
}

function sectionEconomy(data: DigestEmailData): string {
  const { liveRate, fedFundsRate, rentEstimate, estimatedValue, estimatedBalance } = data;

  // Monthly cost of owning (P&I + rough taxes/insurance)
  const piti = (estimatedBalance && data.purchaseRate)
    ? monthlyPayment(estimatedBalance, data.purchaseRate) + Math.round((estimatedValue ?? 0) * 0.015 / 12)
    : null;

  const rentMonthly = rentEstimate ?? (estimatedValue ? Math.round(estimatedValue * 0.0055) : null);
  const rentVsOwn = (piti && rentMonthly) ? rentMonthly - piti : null;

  return card(`
    ${eyebrow('Home Economy Snapshot')}
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="width:31%;padding:12px;background:rgba(255,255,255,0.03);border:1px solid ${BORDER};border-radius:10px;vertical-align:top;">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${TXT2};margin-bottom:5px;">30yr Rate</div>
          <div style="font-size:18px;font-weight:700;color:${TXT};">${fmtRate(liveRate)}</div>
          <div style="font-size:10px;color:${TXT2};margin-top:2px;">Freddie Mac avg</div>
        </td>
        <td width="2%"></td>
        <td style="width:31%;padding:12px;background:rgba(255,255,255,0.03);border:1px solid ${BORDER};border-radius:10px;vertical-align:top;">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${TXT2};margin-bottom:5px;">Fed Funds</div>
          <div style="font-size:18px;font-weight:700;color:${TXT};">${fedFundsRate ? fmtRate(fedFundsRate) : '4.25–4.50%'}</div>
          <div style="font-size:10px;color:${TXT2};margin-top:2px;">Held steady</div>
        </td>
        <td width="2%"></td>
        <td style="width:31%;padding:12px;background:rgba(255,255,255,0.03);border:1px solid ${BORDER};border-radius:10px;vertical-align:top;">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${TXT2};margin-bottom:5px;">Spread</div>
          <div style="font-size:18px;font-weight:700;color:${TXT};">${(liveRate - (fedFundsRate ?? 4.375)).toFixed(2)}%</div>
          <div style="font-size:10px;color:${TXT2};margin-top:2px;">30yr vs Fed Funds</div>
        </td>
      </tr>
    </table>

    ${(piti && rentMonthly) ? `
    ${divider()}
    <div style="font-size:11px;font-weight:700;color:${TXT};margin-bottom:8px;">Rent vs. own — your area</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:12px;color:${TXT2};padding:5px 0;">Est. monthly rent equiv.</td>
        <td style="font-size:12px;color:${TXT};text-align:right;padding:5px 0;">${fmtDollar(rentMonthly)}/mo</td>
      </tr>
      <tr>
        <td style="font-size:12px;color:${TXT2};padding:5px 0;">Your est. P&I + taxes/ins.</td>
        <td style="font-size:12px;color:${TXT};text-align:right;padding:5px 0;">${fmtDollar(piti)}/mo</td>
      </tr>
      ${rentVsOwn !== null ? `
      <tr>
        <td style="font-size:12px;font-weight:700;color:${rentVsOwn > 0 ? GREEN : '#f97066'};padding:5px 0;border-top:1px solid ${BORDER};">Owning ${rentVsOwn > 0 ? 'saves' : 'costs'}</td>
        <td style="font-size:12px;font-weight:700;color:${rentVsOwn > 0 ? GREEN : '#f97066'};text-align:right;padding:5px 0;border-top:1px solid ${BORDER};">
          ${fmtDollar(Math.abs(rentVsOwn))}/mo vs. renting
        </td>
      </tr>` : ''}
    </table>` : ''}
  `);
}

function sectionMilestones(data: DigestEmailData): string {
  const { estimatedValue, estimatedEquity, estimatedBalance, purchaseRate, lastSalePrice, lastSaleDate } = data;
  if (!estimatedValue || !estimatedBalance) return '';

  const milestones: { icon: string; color: string; label: string; detail: string; done: boolean }[] = [];
  const origBalance = lastSalePrice ? lastSalePrice * 0.8 : estimatedBalance * 1.5;

  // Milestone 1: crossed $X in equity
  if (estimatedEquity && estimatedEquity > 100_000) {
    const roundedEquity = Math.floor(estimatedEquity / 100_000) * 100_000;
    milestones.push({
      done: true, icon: '●', color: GREEN,
      label: `Reached ${fmtDollar(roundedEquity)} equity`,
      detail: `Currently at ${fmtDollar(estimatedEquity)} — ${Math.round((estimatedEquity / estimatedValue) * 100)}% of home value`,
    });
  }

  // Milestone 2: payoff year
  if (purchaseRate) {
    const yr = payoffYear(estimatedBalance, purchaseRate, origBalance);
    const yearsLeft = yr - new Date().getFullYear();
    milestones.push({
      done: false, icon: '○', color: '#eab308',
      label: `Pay off mortgage`,
      detail: `${yr} · ${yearsLeft} years remaining at current rate`,
    });
  }

  // Milestone 3: next round-number value target
  const nextTarget = Math.ceil(estimatedValue / 250_000) * 250_000;
  const appreciationRate = 0.042; // 4.2% annual national avg
  const yearsToTarget = Math.ceil(Math.log(nextTarget / estimatedValue) / Math.log(1 + appreciationRate));
  const targetYear = new Date().getFullYear() + yearsToTarget;
  if (yearsToTarget > 0 && yearsToTarget <= 15) {
    milestones.push({
      done: false, icon: '○', color: TXT2,
      label: `Reach ${fmtDollar(nextTarget)} value`,
      detail: `~${targetYear} at 4.2% annual appreciation`,
    });
  }

  if (milestones.length === 0) return '';

  const rows = milestones.map(m => `
    <tr>
      <td style="width:20px;padding:10px 12px 10px 0;vertical-align:top;">
        <span style="font-size:10px;color:${m.color};">${m.icon}</span>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid ${BORDER};vertical-align:top;">
        <div style="font-size:12px;font-weight:700;color:${m.done ? GREEN : TXT};">
          ${m.label}
          ${m.done ? `<span style="font-size:10px;font-weight:400;color:${GREEN};margin-left:8px;">Done</span>` : ''}
        </div>
        <div style="font-size:11px;color:${TXT2};margin-top:2px;">${m.detail}</div>
      </td>
    </tr>`).join('');

  return card(`
    ${eyebrow('Equity Milestones')}
    <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
  `);
}

// ── Nearby sales section ───────────────────────────────────────────────────────
function sectionNearbySales(data: DigestEmailData): string {
  if (!data.nearbySales?.length) return '';
  const rows = data.nearbySales.map(s => {
    const details = [s.beds ? `${s.beds}bd` : null, s.baths ? `${s.baths}ba` : null, s.sqft ? `${s.sqft.toLocaleString()} sqft` : null].filter(Boolean).join(' · ');
    return `
      <tr><td style="padding-bottom:10px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid ${BORDER};border-radius:10px;">
          <tr><td style="padding:12px 16px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="vertical-align:middle;">
                <div style="font-size:12px;font-weight:700;color:${TXT};">${fmtDollar(s.price)}</div>
                <div style="font-size:11px;color:${TXT2};margin-top:2px;">${s.address}</div>
                ${details ? `<div style="font-size:10px;color:${TXT2};margin-top:1px;">${details}</div>` : ''}
              </td>
              <td style="text-align:right;vertical-align:middle;white-space:nowrap;padding-left:12px;">
                <div style="font-size:10px;color:${GREEN};font-weight:700;">SOLD</div>
                <div style="font-size:10px;color:${TXT2};">${s.soldDate}</div>
              </td>
            </tr></table>
          </td></tr>
        </table>
      </td></tr>`;
  }).join('');
  return card(`
    ${eyebrow('Recent Nearby Sales')}
    <p style="margin:0 0 12px;font-size:12px;color:${TXT2};">Homes recently sold near ${data.address.split(',')[0]}</p>
    <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
  `);
}

// ── Main export ────────────────────────────────────────────────────────────────

export function digestEmailHtml(data: DigestEmailData): string {
  const firstName = data.borrowerName.split(' ')[0];
  const isLoBranded = !!(data.loPhoto || (data.loName && data.loName !== 'HomeRates.ai'));
  const unsubscribeLink = data.loEmail
    ? `<a href="${BASE}/api/unsubscribe?email=${encodeURIComponent(data.loEmail)}" style="color:${TXT2};text-decoration:underline;">Unsubscribe</a>`
    : '';

  const sections = [
    sectionAlerts(data),
    sectionValueEquity(data),
    sectionMortgage(data),
    sectionHELOC(data),
    sectionEconomy(data),
    sectionMilestones(data),
    sectionNearbySales(data),
  ].filter(Boolean).join('');

  // ── Primary CTAs: Run My Numbers + View Full Report ──────────────────────────
  const chatQueryParts: string[] = [];
  if (data.estimatedValue)   chatQueryParts.push(`My home at ${data.address} is estimated at $${Math.round(data.estimatedValue).toLocaleString('en-US')}.`);
  if (data.estimatedBalance) chatQueryParts.push(`Current loan balance: $${Math.round(data.estimatedBalance).toLocaleString('en-US')}.`);
  if (data.purchaseRate)     chatQueryParts.push(`My rate is ${data.purchaseRate.toFixed(2)}%.`);
  if (data.estimatedEquity && data.estimatedEquity > 0) chatQueryParts.push(`Equity: $${Math.round(data.estimatedEquity).toLocaleString('en-US')}.`);
  chatQueryParts.push(`Live market rate is ${data.liveRate.toFixed(2)}%. Show me refinance savings, break-even, and equity options. Use these exact figures.`);
  const chatUrl  = `${BASE}/chat?sq=${encodeURIComponent(chatQueryParts.join(' '))}`;
  const reportLink = data.reportUrl ?? `${BASE}/my-home`;
  const primaryCta = `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0d1f14,#0f2a1a);border:1px solid rgba(0,232,122,0.2);border-radius:14px;margin-bottom:16px;">
      <tr><td style="padding:20px 22px;">
        <p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${GREEN};">Your Home — Live Intelligence</p>
        <p style="margin:0 0 16px;font-size:13px;color:#c8d8c8;">What's your home worth today? Run updated numbers or view your full report.</p>
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="padding-right:10px;">
            <a href="${chatUrl}" style="display:inline-block;padding:11px 22px;background:${GREEN};color:#07100f;font-size:13px;font-weight:800;border-radius:999px;text-decoration:none;">Run My Numbers →</a>
          </td>
          <td>
            <a href="${reportLink}" style="display:inline-block;padding:11px 22px;background:rgba(0,232,122,0.1);color:${GREEN};border:1px solid rgba(0,232,122,0.3);font-size:13px;font-weight:700;border-radius:999px;text-decoration:none;">View Full Report</a>
          </td>
        </tr></table>
      </td></tr>
    </table>`;

  // ── 5-card personalized CTAs ──────────────────────────────────────────────────
  const ctaCards: string[] = [];

  // 1. Equity & Value
  if (data.estimatedEquity && data.estimatedEquity > 0) {
    ctaCards.push(`
      <tr><td style="padding-bottom:10px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:${CARD};border:1px solid ${BORDER};border-radius:12px;">
          <tr><td style="padding:16px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="vertical-align:middle;">
                <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:${GREEN};margin-bottom:3px;">Equity & Value</div>
                <div style="font-size:13px;color:#e6edf3;">Your home is worth <strong>${fmtDollar(data.estimatedValue ?? data.estimatedEquity + (data.estimatedBalance ?? 0))}</strong> with <strong>${fmtDollar(data.estimatedEquity)}</strong> in equity</div>
              </td>
              <td style="text-align:right;white-space:nowrap;padding-left:12px;vertical-align:middle;">
                <a href="${BASE}/my-home?chip=equity" style="display:inline-block;padding:9px 18px;background:${GREEN};color:#07100f;font-size:12px;font-weight:700;border-radius:999px;text-decoration:none;">
                  See equity →
                </a>
              </td>
            </tr></table>
          </td></tr>
        </table>
      </td></tr>`);
  }

  // 2. HELOC Power
  if (data.estimatedValue && data.estimatedBalance) {
    const ctaHelocMax = helocMax(data.estimatedValue, data.estimatedBalance);
    if (ctaHelocMax >= 10_000) {
      ctaCards.push(`
        <tr><td style="padding-bottom:10px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:${CARD};border:1px solid ${BORDER};border-radius:12px;">
            <tr><td style="padding:16px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0"><tr>
                <td style="vertical-align:middle;">
                  <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:${GREEN};margin-bottom:3px;">HELOC Power</div>
                  <div style="font-size:13px;color:#e6edf3;">You could access up to <strong>${fmtDollar(ctaHelocMax)}</strong> via a HELOC today</div>
                </td>
                <td style="text-align:right;white-space:nowrap;padding-left:12px;vertical-align:middle;">
                  <a href="${BASE}/my-home?chip=heloc" style="display:inline-block;padding:9px 18px;background:${GREEN};color:#07100f;font-size:12px;font-weight:700;border-radius:999px;text-decoration:none;">
                    Explore HELOC →
                  </a>
                </td>
              </tr></table>
            </td></tr>
          </table>
        </td></tr>`);
    }
  }

  // 3. Refi Math (only if rate gap ≥ 0.25%)
  if (data.purchaseRate && data.estimatedBalance && data.purchaseRate - data.liveRate >= 0.25) {
    const ctaNewPmt  = monthlyPayment(data.estimatedBalance, data.liveRate);
    const ctaOldPmt  = monthlyPayment(data.estimatedBalance, data.purchaseRate);
    const ctaSaving  = Math.abs(ctaOldPmt - ctaNewPmt);
    if (ctaSaving > 0) {
      ctaCards.push(`
        <tr><td style="padding-bottom:10px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:${CARD};border:1px solid ${BORDER};border-radius:12px;">
            <tr><td style="padding:16px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0"><tr>
                <td style="vertical-align:middle;">
                  <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:${GREEN};margin-bottom:3px;">Refi Math</div>
                  <div style="font-size:13px;color:#e6edf3;">Refinancing could save you <strong>${fmtDollar(ctaSaving)}/mo</strong> at today's ${data.liveRate.toFixed(2)}% rate</div>
                </td>
                <td style="text-align:right;white-space:nowrap;padding-left:12px;vertical-align:middle;">
                  <a href="${BASE}/my-home?chip=refi" style="display:inline-block;padding:9px 18px;background:${GREEN};color:#07100f;font-size:12px;font-weight:700;border-radius:999px;text-decoration:none;">
                    Run numbers →
                  </a>
                </td>
              </tr></table>
            </td></tr>
          </table>
        </td></tr>`);
    }
  }

  // 4. Economy
  ctaCards.push(`
    <tr><td style="padding-bottom:10px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:${CARD};border:1px solid ${BORDER};border-radius:12px;">
        <tr><td style="padding:16px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:${GREEN};margin-bottom:3px;">Economy Snapshot</div>
              <div style="font-size:13px;color:#e6edf3;">30yr fixed at <strong>${data.liveRate.toFixed(2)}%</strong>${data.fedFundsRate ? ` · Fed funds at <strong>${data.fedFundsRate.toFixed(2)}%</strong>` : ''} — see what it means for you</div>
            </td>
            <td style="text-align:right;white-space:nowrap;padding-left:12px;vertical-align:middle;">
              <a href="${BASE}/my-home?chip=economy" style="display:inline-block;padding:9px 18px;background:rgba(0,232,122,0.12);color:${GREEN};border:1px solid rgba(0,232,122,0.3);font-size:12px;font-weight:700;border-radius:999px;text-decoration:none;">
                View economy →
              </a>
            </td>
          </tr></table>
        </td></tr>
      </table>
    </td></tr>`);

  // 5. Milestones
  if (data.estimatedBalance && data.purchaseRate) {
    const origBal = data.lastSalePrice ? data.lastSalePrice * 0.8 : data.estimatedBalance;
    const ctaPayoffYr = payoffYear(data.estimatedBalance, data.purchaseRate, origBal);
    ctaCards.push(`
      <tr><td style="padding-bottom:0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:${CARD};border:1px solid ${BORDER};border-radius:12px;">
          <tr><td style="padding:16px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="vertical-align:middle;">
                <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:${GREEN};margin-bottom:3px;">Milestones</div>
                <div style="font-size:13px;color:#e6edf3;">You're on track to pay off your home in <strong>${ctaPayoffYr}</strong> — track your progress</div>
              </td>
              <td style="text-align:right;white-space:nowrap;padding-left:12px;vertical-align:middle;">
                <a href="${BASE}/my-home?chip=milestones" style="display:inline-block;padding:9px 18px;background:rgba(0,232,122,0.12);color:${GREEN};border:1px solid rgba(0,232,122,0.3);font-size:12px;font-weight:700;border-radius:999px;text-decoration:none;">
                  See milestones →
                </a>
              </td>
            </tr></table>
          </td></tr>
        </table>
      </td></tr>`);
  }

  const cta = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;">
      <tr><td>${primaryCta}</td></tr>
      ${ctaCards.join('')}
    </table>`;

  const footer = `
    <p style="margin:20px 0 4px;font-size:11px;color:${TXT2};line-height:1.6;text-align:center;">
      Sent by <a href="${BASE}" style="color:${TXT2};">HomeRates.ai</a>${data.loEmail ? ` · Reply to reach your loan officer` : ''}.
      Values are estimates based on public data — not an appraisal or guaranteed offer.
      HomeRates.ai is an educational tool, not a mortgage lender. Comp data from MLS public records.
    </p>
    ${unsubscribeLink ? `<p style="margin:0;font-size:10px;color:${TXT2};text-align:center;">${unsubscribeLink} · ${PHYSICAL_ADDRESS}</p>` : `<p style="margin:0;font-size:10px;color:${TXT2};text-align:center;">${PHYSICAL_ADDRESS}</p>`}`;

  // LO-branded header block (when LO is attached)
  const loHeader = isLoBranded ? `
  <tr><td style="padding:0 0 16px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border:1px solid rgba(0,232,122,0.15);border-radius:14px;overflow:hidden;">
      <tr><td style="height:3px;background:linear-gradient(90deg,${GREEN},#00b459);font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:16px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;">
            <table cellpadding="0" cellspacing="0"><tr>
              ${data.loPhoto ? `<td style="padding-right:12px;vertical-align:middle;"><img src="${data.loPhoto}" alt="${data.loName}" width="44" height="44" style="border-radius:50%;display:block;object-fit:cover;"></td>` : ''}
              <td style="vertical-align:middle;">
                <div style="font-size:13px;font-weight:800;color:#f1f5f9;">${data.loName}</div>
                <div style="font-size:11px;color:#eaf8f7;margin-top:2px;">${[data.loTitle, data.loLender].filter(Boolean).join(' · ')}</div>
                ${data.loNmls ? `<div style="font-size:10px;color:#eaf8f7;margin-top:1px;">NMLS# ${data.loNmls}</div>` : ''}
              </td>
            </tr></table>
          </td>
          <td style="text-align:right;vertical-align:middle;">
            ${data.loPhone ? `<a href="tel:${data.loPhone}" style="display:inline-block;padding:8px 16px;background:${GREEN};color:#07100f;font-size:11px;font-weight:800;border-radius:999px;text-decoration:none;margin-bottom:6px;">${data.loPhone}</a><br>` : ''}
            ${data.loEmail ? `<a href="mailto:${data.loEmail}" style="display:inline-block;padding:7px 14px;border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.6);font-size:11px;font-weight:600;border-radius:999px;text-decoration:none;">Email Me</a>` : ''}
          </td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>` : '';

  // Rate alert banner (shown when digest triggered by a rate move)
  const rateAlertBanner = data.isRateAlert ? `
  <tr><td style="padding:0 0 16px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,165,0,0.08);border:1px solid rgba(255,165,0,0.25);border-radius:12px;">
      <tr><td style="padding:14px 18px;">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="padding-right:10px;font-size:18px;">📊</td>
          <td>
            <div style="font-size:12px;font-weight:800;color:#fbbf24;margin-bottom:2px;">RATE ALERT</div>
            <div style="font-size:12px;color:#e6edf3;">Mortgage rates just moved ${data.rateDelta != null ? (data.rateDelta > 0 ? `up ${data.rateDelta.toFixed(2)}%` : `down ${Math.abs(data.rateDelta).toFixed(2)}%`) : ''} — now at <strong>${data.liveRate.toFixed(2)}%</strong>. See how this affects your home.</div>
          </td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>` : '';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG};font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 16px 40px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

  <!-- Header -->
  <tr><td style="padding:0 0 20px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td>
        <img src="${BASE}/assets/homerates-email-logo.png" alt="HomeRates.ai" style="height:32px;display:block;" onerror="this.style.display='none'">
      </td>
      <td style="text-align:right;font-size:11px;color:${TXT2};">${monthLabel()} · ${data.isRateAlert ? '🔔 Rate Alert' : 'Weekly Home Update'}</td>
    </tr></table>
  </td></tr>

  <!-- LO branding (when sent by LO) -->
  ${loHeader}

  <!-- Rate alert banner -->
  ${rateAlertBanner}

  <!-- Greeting -->
  <tr><td style="padding:0 0 20px;">
    <p style="margin:0 0 4px;font-size:24px;font-weight:800;color:${TXT};">Hi ${firstName},</p>
    <p style="margin:0;font-size:13px;color:${TXT2};">${data.address}</p>
  </td></tr>

  <!-- Sections -->
  <tr><td>${sections}</td></tr>

  <!-- CTA -->
  <tr><td style="padding-top:4px;">${cta}</td></tr>

  <!-- Footer -->
  <tr><td>${footer}</td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}
