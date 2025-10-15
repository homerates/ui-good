// src/lib/llm.ts
type Mode = "borrower" | "public";

type LLMOpts = {
  model?: string;
  timeoutMs?: number;
  forbidLiveData?: boolean;
};

function stripLiveBits(txt: string) {
  return String(txt ?? "")
    .replace(/\b\d{1,2}\.\d{1,3}%\b/g, "")
    .replace(/\b10[-\s]?year\b/gi, "")
    .replace(/\btreasury\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export async function callLLM(
  question: string,
  mode: Mode,
  opts?: LLMOpts
): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Missing OPENAI_API_KEY");

  const model = opts?.model ?? "gpt-4o-mini";
  const timeout = opts?.timeoutMs ?? 12000;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout);

  const system = [
    "You are a mortgage specialist. Be clear, concise, compliant.",
    "Do NOT include live rates/yields/spreads/dates unless the user explicitly asks for current market data.",
    "NO markdown headings. Keep it plain text.",
    "Start with ONE LINE takeaway. Then up to 5 bullets. Then exactly 2 'Next:' steps.",
    "Prefer short sentences. Avoid jargon.",
    mode === "borrower"
      ? "Make it practical for borrowers; call out tradeoffs and next steps."
      : "Keep it neutral for public mode; avoid personalized directives."
  ].join(" ");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: question },
      ],
    }),
  }).finally(() => clearTimeout(t));

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`LLM HTTP ${res.status}: ${txt.substring(0, 200)}`);
  }

  const json = await res.json();
  let out: string =
    json?.choices?.[0]?.message?.content ?? "I couldn’t generate an answer.";
  if (opts?.forbidLiveData) out = stripLiveBits(out);
  return out;
}

export async function generateDynamicAnswer(
  question: string,
  mode: Mode
): Promise<string> {
  const forbid = !/\b(rate|rates|10[-\s]?year|treasury|spread|today|latest|current|now)\b/i.test(
    question
  );
  return callLLM(question, mode, { forbidLiveData: forbid });
}

export async function generateConceptAnswer(
  question: string,
  mode: Mode
): Promise<string> {
  return callLLM(
    "Answer conceptually. Do NOT include any live rates, Treasury yields, spreads, or dates. " +
      "Plain text only. No headings. Start with one-line takeaway. Then up to 5 bullets. Then exactly 2 Next: steps.\n" +
      "Question: " + question,
    mode,
    { forbidLiveData: true }
  );
}
