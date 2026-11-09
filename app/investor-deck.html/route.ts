// app/investor-deck.html/route.ts
// Serves the investor deck only behind the server-side document gate.
// The HTML lives in private-docs/, not public/, so it is never reachable
// as a static file. URL stays /investor-deck.html so existing links work.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { DOC_COOKIE, serveGatedDoc } from '../../lib/docAccess';

export async function GET(req: NextRequest) {
  return serveGatedDoc({
    cookieValue: req.cookies.get(DOC_COOKIE)?.value,
    denied: req.nextUrl.searchParams.get('denied') === '1',
    requestPath: '/investor-deck.html',
    gateTitle: 'Investor Deck',
    docPath: 'investor-deck.html',
  });
}
