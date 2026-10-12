// app/api/debug/route.ts
// Admin-only: reports runtime configuration presence. Never public.
export const runtime = 'nodejs';

import { requireAdmin } from '../../../lib/adminAuth';

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  return Response.json({
    dynamicEnabled: process.env.DYNAMIC_ENABLED,
    hasOpenAIKey: !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 20,
    nodeVersion: process.version,
  });
}
