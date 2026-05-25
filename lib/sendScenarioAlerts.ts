// lib/sendScenarioAlerts.ts
// Shared LO alert sender — used by both /api/scenarios (standard) and /api/track5/match.
// Resolves emails via DB first, Clerk fallback for any LO missing from users table.

import { clerkClient } from '@clerk/nextjs/server';
import { Resend }       from 'resend';
import { createClient } from '@supabase/supabase-js';
import { emailShell }   from './sendEmail';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── Standard scenario alert email ─────────────────────────────────────────────

function standardAlertHtml(opts: {
  loName: string;
  loanType: string;
  state: string;
  priceRange: string;
  creditTier: string;
  timeline: string;
  boardUrl: string;
  isPrivate: boolean;
}): string {
  const tagBg    = opts.isPrivate ? '#0a1525' : '#091a10';
  const tagColor = opts.isPrivate ? '#60a5fa' : '#00e87a';
  const tagText  = opts.isPrivate ? 'YOUR REFERRAL' : 'NEW ON BOARD';
  const greeting = opts.isPrivate
    ? 'A borrower you referred just posted a scenario and is waiting for your response.'
    : 'A new borrower scenario matching your state just posted to the board.';
  const CARD = '#1c2433';
  const SEP  = '#2a3444';
  const row  = (label: string, value: string) => `
    <tr><td bgcolor="${CARD}" style="background-color:${CARD};padding:10px 0;border-bottom:1px solid ${SEP}">
      <span style="display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#8b949e;margin-bottom:3px">${label}</span>
      <span style="font-size:15px;font-weight:600;color:#e6edf3">${value}</span>
    </td></tr>`;

  return emailShell(`
    <span style="display:inline-block;background-color:${tagBg};color:${tagColor};font-size:11px;font-weight:700;padding:4px 10px;border-radius:4px;letter-spacing:.08em">${tagText}</span>
    <div style="font-size:22px;font-weight:700;color:#e6edf3;margin-top:14px">Hi ${opts.loName},</div>
    <div style="font-size:14px;color:#8b949e;margin-top:6px;margin-bottom:24px;line-height:1.5">${greeting}</div>
    <table width="100%" cellpadding="0" cellspacing="0" bgcolor="${CARD}" style="background-color:${CARD};border:1px solid ${SEP};border-radius:12px;margin-bottom:24px">
      <tr><td bgcolor="${CARD}" style="background-color:${CARD};padding:4px 20px 0">
        <table width="100%" cellpadding="0" cellspacing="0" bgcolor="${CARD}" style="background-color:${CARD};">
          ${row('Loan type',   opts.loanType)}
          ${row('Price range', opts.priceRange)}
          ${row('Credit',      opts.creditTier)}
          ${row('State',       opts.state)}
          ${row('Timeline',    opts.timeline)}
        </table>
      </td></tr>
    </table>
    <a href="${opts.boardUrl}" style="display:block;text-align:center;background:#00e87a;color:#07100f;font-size:15px;font-weight:700;padding:15px 20px;border-radius:999px;text-decoration:none">
      View &amp; Respond on Board →
    </a>
  `, 'HomeRates.ai · Borrower identities are kept anonymous until contact is shared.');
}

// ── Track5 alert email ────────────────────────────────────────────────────────

function track5AlertHtml(opts: {
  loName: string;
  composite: number;
  verdict: string;
  zip: string;
  state: string;
  loanType: string;
  priceRange: string;
  dpPct: number | null;
  boardUrl: string;
}): string {
  const CARD = '#1c2433';
  const SEP  = '#2a3444';
  const row  = (label: string, value: string) => `
    <tr><td bgcolor="${CARD}" style="background-color:${CARD};padding:10px 0;border-bottom:1px solid ${SEP}">
      <span style="display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#8b949e;margin-bottom:3px">${label}</span>
      <span style="font-size:15px;font-weight:600;color:#e6edf3">${value}</span>
    </td></tr>`;

  return emailShell(`
    <span style="display:inline-block;background-color:#091a10;color:#00e87a;font-size:11px;font-weight:700;padding:4px 10px;border-radius:4px;letter-spacing:.08em">TRACK 5 MATCH</span>
    <div style="font-size:22px;font-weight:700;color:#e6edf3;margin-top:14px">Hi ${opts.loName},</div>
    <div style="font-size:14px;color:#8b949e;margin-top:6px;margin-bottom:24px;line-height:1.5">
      A buyer with a completed Track 5 Decision Score is looking for a loan officer in their area.
      Their score and scenario are below — identity is anonymous until they accept your response.
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" bgcolor="${CARD}" style="background-color:${CARD};border:1px solid #2a3444;border-radius:12px;margin-bottom:24px">
      <tr><td bgcolor="${CARD}" style="background-color:${CARD};padding:4px 20px 0">
        <table width="100%" cellpadding="0" cellspacing="0" bgcolor="${CARD}" style="background-color:${CARD};">
          ${row('Decision Score', `${opts.composite} · ${opts.verdict}`)}
          ${opts.zip ? row('ZIP Code', opts.zip) : ''}
          ${row('State',          opts.state)}
          ${row('Loan type',      opts.loanType)}
          ${row('Price range',    opts.priceRange)}
          ${opts.dpPct != null ? row('Down payment', `${opts.dpPct}%`) : ''}
          <tr><td bgcolor="${CARD}" style="background-color:${CARD};padding:10px 0">
            <span style="display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#8b949e;margin-bottom:3px">Identity</span>
            <span style="font-size:15px;font-weight:600;color:#8b949e">🔒 Anonymous — revealed when buyer accepts</span>
          </td></tr>
        </table>
      </td></tr>
    </table>
    <a href="${opts.boardUrl}" style="display:block;text-align:center;background:#00e87a;color:#07100f;font-size:15px;font-weight:700;padding:15px 20px;border-radius:999px;text-decoration:none">
      View &amp; Respond on Board →
    </a>
  `, 'HomeRates.ai · Track 5 · Borrower identity is kept private until mutual acceptance.');
}

// ── Email resolver (DB → Clerk fallback) ─────────────────────────────────────

async function resolveEmails(userIds: string[]): Promise<Record<string, string>> {
  const supabase = db();
  const emailMap: Record<string, string> = {};

  const { data: userRows } = await supabase
    .from('users').select('id, email').in('id', userIds);
  for (const u of userRows ?? []) { if (u.email) emailMap[u.id] = u.email; }

  const missing = userIds.filter(id => !emailMap[id]);
  if (missing.length > 0) {
    try {
      const clerk = await clerkClient();
      const clerkUsers = await clerk.users.getUserList({ userId: missing, limit: 100 });
      for (const u of clerkUsers.data) {
        const e = u.emailAddresses[0]?.emailAddress;
        if (e) emailMap[u.id] = e;
      }
    } catch (e) {
      console.error('[scenario-alert] Clerk email fallback failed:', e);
    }
  }

  return emailMap;
}

// ── Standard scenario alert (used by /api/scenarios POST) ────────────────────

export async function sendScenarioAlerts(scenario: {
  id: string;
  loan_type: string;
  state: string;
  price_range: string;
  credit_tier: string;
  timeline: string;
  visibility: string;
  referred_pro_id: string | null;
}): Promise<void> {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) { console.error('[scenario-alert] RESEND_API_KEY not set'); return; }

  const supabase = db();
  const boardUrl = 'https://chat.homerates.ai/lo/scenarios';

  interface LoRow { user_id: string; email: string; lender: string | null; }
  let targets: LoRow[] = [];

  if (scenario.visibility === 'private' && scenario.referred_pro_id) {
    const { data: loRow } = await supabase
      .from('loan_officers').select('user_id, lender')
      .eq('user_id', scenario.referred_pro_id).maybeSingle();
    const emailMap = await resolveEmails([scenario.referred_pro_id]);
    if (loRow && emailMap[scenario.referred_pro_id]) {
      targets = [{ user_id: loRow.user_id, email: emailMap[loRow.user_id], lender: loRow.lender }];
    }
  } else {
    const { data: loRows, error: loErr } = await supabase
      .from('loan_officers').select('user_id, lender').limit(50);
    console.log('[scenario-alert] public — loRows:', loRows?.length, 'loErr:', loErr);
    if (loRows?.length) {
      const emailMap = await resolveEmails(loRows.map(r => r.user_id));
      targets = loRows
        .filter(lo => emailMap[lo.user_id])
        .map(lo => ({ user_id: lo.user_id, email: emailMap[lo.user_id], lender: lo.lender }));
      console.log('[scenario-alert] targets:', targets.map(t => t.email));
    }
  }

  const resend = new Resend(RESEND_API_KEY);
  const FROM   = process.env.RESEND_FROM_EMAIL ?? 'digest@homerates.ai';

  await Promise.allSettled(targets.map(lo =>
    resend.emails.send({
      from:    `HomeRates.ai <${FROM}>`,
      to:      lo.email,
      subject: scenario.visibility === 'private'
        ? 'Your referral posted a scenario — respond now'
        : `New ${scenario.loan_type} scenario in ${scenario.state}`,
      html: standardAlertHtml({
        loName:     lo.lender ?? 'there',
        loanType:   scenario.loan_type,
        state:      scenario.state,
        priceRange: scenario.price_range,
        creditTier: scenario.credit_tier,
        timeline:   scenario.timeline,
        boardUrl,
        isPrivate:  scenario.visibility === 'private',
      }),
    }).then(r => console.log('[scenario-alert] sent to:', lo.email, 'id:', r.data?.id, 'err:', r.error))
      .catch(e => console.error('[scenario-alert] send failed:', lo.email, e))
  ));
}

// ── Track5 match alert (used by /api/track5/match POST) ──────────────────────

export async function sendTrack5Alerts(opts: {
  loanType: string;
  composite: number;
  verdict: string;
  zip: string | null;
  state: string;
  priceRange: string;
  dpPct: number | null;
}): Promise<void> {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) { console.error('[track5-alert] RESEND_API_KEY not set'); return; }

  const supabase  = db();
  const boardUrl  = 'https://chat.homerates.ai/lo/scenarios';

  const { data: loRows, error: loErr } = await supabase
    .from('loan_officers').select('user_id, lender').limit(50);
  console.log('[track5-alert] loRows:', loRows?.length, 'loErr:', loErr);
  if (!loRows?.length) return;

  const emailMap = await resolveEmails(loRows.map(r => r.user_id));
  const targets  = loRows.filter(lo => emailMap[lo.user_id]);
  console.log('[track5-alert] targets:', targets.map(t => emailMap[t.user_id]));

  const resend = new Resend(RESEND_API_KEY);
  const FROM   = process.env.RESEND_FROM_EMAIL ?? 'digest@homerates.ai';

  await Promise.allSettled(targets.map(lo =>
    resend.emails.send({
      from:    `HomeRates.ai <${FROM}>`,
      to:      emailMap[lo.user_id],
      subject: `Track 5 match — ${opts.loanType} buyer · ${opts.zip ? `ZIP ${opts.zip} · ` : ''}Score ${opts.composite}`,
      html: track5AlertHtml({
        loName:     lo.lender ?? 'there',
        composite:  opts.composite,
        verdict:    opts.verdict,
        zip:        opts.zip ?? 'Not available',
        state:      opts.state,
        loanType:   opts.loanType,
        priceRange: opts.priceRange,
        dpPct:      opts.dpPct,
        boardUrl,
      }),
    }).then(r => console.log('[track5-alert] sent to:', emailMap[lo.user_id], 'id:', r.data?.id, 'err:', r.error))
      .catch(e => console.error('[track5-alert] send failed:', emailMap[lo.user_id], e))
  ));
}
