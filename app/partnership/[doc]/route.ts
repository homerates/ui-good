// app/partnership/[doc]/route.ts
// Serves the partnership documents (embedded as iframes by /partnership)
// only behind the server-side document gate. Files live in
// private-docs/partnership/, never in public/.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { DOC_COOKIE, serveGatedDoc } from '../../../lib/docAccess';

const ALLOWED = new Set([
  'consumer-prototype.html',
  'lo-partner.html',
  'consumer-mockup.html',
  'framework.html',
]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  if (!ALLOWED.has(doc)) return new Response('Not found', { status: 404 });
  return serveGatedDoc({
    cookieValue: req.cookies.get(DOC_COOKIE)?.value,
    denied: req.nextUrl.searchParams.get('denied') === '1',
    requestPath: `/partnership/${doc}`,
    gateTitle: 'Partnership Materials',
    docPath: `partnership/${doc}`,
  });
}
