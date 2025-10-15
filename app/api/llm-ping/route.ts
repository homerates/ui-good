// app/api/llm-ping/route.ts
export const runtime = 'nodejs';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ ok: false, error: "Missing OPENAI_API_KEY" }, 500);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          { role: "system", content: "Reply with the single word: pong" },
          { role: "user", content: "ping" }
        ]
      })
    });

    const text = await res.text();
    return json({ ok: res.ok, status: res.status, body: text.slice(0, 300) });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e).slice(0, 300) }, 500);
  }
}
