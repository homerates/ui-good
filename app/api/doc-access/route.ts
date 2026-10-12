// app/api/doc-access/route.ts
// POST target for the server-side document gate (lib/docAccess.ts). Validates
// the submitted code against DOC_ACCESS_CODE and sets an HttpOnly cookie.
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { DOC_COOKIE, DOC_COOKIE_MAX_AGE, safeNextPath, tokenForSubmittedCode } from '../../../lib/docAccess';

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const code = String(form?.get('code') ?? '');
  const next = safeNextPath(String(form?.get('next') ?? '/'));

  const token = code ? tokenForSubmittedCode(code) : null;
  if (!token) {
    // Small fixed delay blunts rapid guessing without needing a rate-limit store.
    await new Promise(r => setTimeout(r, 750));
    const url = new URL(next, req.url);
    url.searchParams.set('denied', '1');
    return NextResponse.redirect(url, 303);
  }

  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(DOC_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DOC_COOKIE_MAX_AGE,
  });
  return res;
}
