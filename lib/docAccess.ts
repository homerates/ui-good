// lib/docAccess.ts
// Server-side gate for confidential shareable documents (investor deck,
// partnership materials). Replaces the old client-side password checks, which
// shipped the code in page source and left the underlying static files
// reachable with no password at all.
//
// The access code lives only in the DOC_ACCESS_CODE env var (set in Vercel,
// never committed). The cookie holds an HMAC derived from the code, so
// rotating the code invalidates every existing session. Fails closed: if the
// env var is unset, nobody gets in.

import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { readFile } from 'fs/promises';
import path from 'path';

export const DOC_COOKIE = 'hr_doc_access';
export const DOC_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function accessCode(): string | null {
  const c = process.env.DOC_ACCESS_CODE?.trim();
  return c ? c : null;
}

function tokenFor(code: string): string {
  return createHmac('sha256', code.toLowerCase()).update('hr-doc-access-v1').digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Returns the cookie token if the submitted code is correct, otherwise null. */
export function tokenForSubmittedCode(input: string): string | null {
  const code = accessCode();
  if (!code) return null;
  return safeEqual(input.trim().toLowerCase(), code.toLowerCase()) ? tokenFor(code) : null;
}

export function hasDocAccess(cookieValue: string | undefined | null): boolean {
  const code = accessCode();
  if (!code || !cookieValue) return false;
  return safeEqual(cookieValue, tokenFor(code));
}

/** Only same-site relative paths — prevents using the gate as an open redirect. */
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  return next;
}

const PRIVATE_DIR = path.join(process.cwd(), 'private-docs');

export async function readPrivateDoc(relPath: string): Promise<string> {
  const resolved = path.resolve(PRIVATE_DIR, relPath);
  if (!resolved.startsWith(PRIVATE_DIR + path.sep)) throw new Error('invalid document path');
  return readFile(resolved, 'utf8');
}

const NO_INDEX_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}

export function gatePageHtml(opts: { title: string; next: string; denied: boolean }): string {
  const next = escapeHtml(safeNextPath(opts.next));
  const title = escapeHtml(opts.title);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${title} — HomeRates.Ai</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;background:#080c12;color:#f0f4ff;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;padding:24px}
.wrap{max-width:380px;width:100%;text-align:center}
.logo{display:flex;justify-content:center;margin-bottom:32px}.logo img{height:28px;width:auto}
.card{background:#0e1420;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:32px 28px}
.eyebrow{font-size:.65rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#8fa3b8;margin-bottom:8px}
h1{font-size:1.3rem;font-weight:800;letter-spacing:-.03em;margin-bottom:8px}
p{font-size:.8rem;color:#8fa3b8;line-height:1.6;margin-bottom:24px}
form{display:flex;flex-direction:column;gap:10px}
input{width:100%;padding:12px 14px;background:#141b28;border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#f0f4ff;font-size:.9rem;font-family:inherit;text-align:center}
input:focus{outline:2px solid #00e87a;outline-offset:1px}
input.err{border-color:rgba(255,95,95,0.5)}
.error{font-size:.72rem;color:#ff8a8a}
button{padding:12px;background:#00e87a;border:none;border-radius:10px;color:#000;font-size:.85rem;font-weight:700;cursor:pointer;font-family:inherit}
button:hover{background:#00ff8a}button:focus-visible{outline:2px solid #f0f4ff;outline-offset:2px}
.foot{margin-top:20px;font-size:.7rem;color:rgba(255,255,255,0.25)}
</style></head><body><div class="wrap">
<div class="logo"><img src="/assets/homerates-email-logo.png" alt="HomeRates.Ai"></div>
<div class="card"><div class="eyebrow">${title}</div><h1>Enter access code</h1>
<p>These documents are shared privately. Enter the access code provided by the HomeRates team.</p>
<form method="POST" action="/api/doc-access">
<input type="hidden" name="next" value="${next}">
<input type="password" name="code" placeholder="Access code" aria-label="Access code" autocomplete="off" required autofocus${opts.denied ? ' class="err"' : ''}>
${opts.denied ? '<div class="error" role="alert">Incorrect access code — please try again or contact the HomeRates team.</div>' : ''}
<button type="submit">Continue →</button></form></div>
<div class="foot">Confidential — HomeRates.Ai · For authorised review only</div>
</div></body></html>`;
}

/** Shared handler body for a gated static document route. */
export async function serveGatedDoc(opts: {
  cookieValue: string | undefined;
  denied: boolean;
  requestPath: string;
  gateTitle: string;
  docPath: string;
}): Promise<Response> {
  if (!hasDocAccess(opts.cookieValue)) {
    return new Response(gatePageHtml({ title: opts.gateTitle, next: opts.requestPath, denied: opts.denied }), {
      status: 401,
      headers: NO_INDEX_HEADERS,
    });
  }
  const html = await readPrivateDoc(opts.docPath);
  return new Response(html, { status: 200, headers: NO_INDEX_HEADERS });
}
