// ==== REPLACE ENTIRE FILE: app/api/answers/route.ts ====
import { NextRequest, NextResponse } from "next/server";

function noStore(): ResponseInit {
  return { headers: { "Cache-Control": "no-store" } };
}

// Very simple calc signal detector
const calcSignal = (q: string) =>
  /\d/.test(q) ||
  /\b(loan|price|down|rate|interest|term|year|years|payment|p&i|piti|hoa|insurance|zip)\b/i.test(q) ||
  /[@%]/.test(q) ||
  /\byr\b/i.test(q);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();

  if (!q) {
    return NextResponse.json(
      { ok: false, kind: "answer", answer: "Ask a question." },
      { ...noStore(), status: 400 }
    );
  }

  // HARD GUARD: refuse calc-like prompts so they can't leak here
  if (calcSignal(q)) {
    return NextResponse.json(
      {
        ok: false,
        kind: "answer",
        answer:
          "Calc-like prompt blocked on /api/answers. This route is only for non-calc questions. Use /api/chat.",
      },
      {
        ...noStore(),
        status: 400,
        headers: { "X-Answers-Guard": "blocked-calc-like-query" },
      }
    );
  }

  // === your existing knowledge layer fetch can stay below (or return a stub) ===
  // Replace with your actual implementation if you have one.
  return NextResponse.json(
    {
      ok: true,
      kind: "answer",
      answer:
        "Knowledge answer stub. (If you see this for calc prompts, something routed here incorrectly.)",
      results: [],
    },
    noStore()
  );
}
// ==== END FILE ====
