// app/api/debug/route.ts
export const runtime = 'nodejs';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET() {
  return json({
    dynamicEnabled: process.env.DYNAMIC_ENABLED,
    hasOpenAIKey: !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 20,
    nodeVersion: process.version
  });
}

