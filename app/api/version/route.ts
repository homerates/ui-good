// app/api/version/route.ts
export const runtime = 'nodejs';

import { VERSION, COMMIT } from "@/lib/version";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function GET() {
  return json({ version: VERSION, commit: COMMIT, node: process.version, time: new Date().toISOString() });
}
