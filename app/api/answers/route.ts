// app/api/answers/route.ts
export const runtime = 'nodejs';

import { getFredSnapshot } from "@/lib/fred";
import { composeMarket, type ComposedAnswer as MarketOut } from "@/lib/composeMarket";
import { composeConcept } from "@/lib/composeConcept";
import { generateDynamicAnswer, generateConceptAnswer } from "@/lib/llm";
import { normalizeConceptAnswer } from "@/lib/normalize";

type Mode = "borrower" | "public";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET() {
  return json({ ok: true, expects: "POST { question, mode }" });
}

export async function POST(req: Request) {
  try {
    const txt = await req.text();
    let body: any = {};
    try { body = txt ? JSON.parse(txt) : {}; } catch { body = { __raw: txt }; }

    const question = String(body?.question ?? "").trim();
    const mode: Mode = body?.mode === "public" ? "public" : "borrower";
    const q = question.toLowerCase();

    const mentionsConcept = /(fannie|freddie|fha|va|usda|dti|pmi|ltv|amortization|dscr|pre[- ]?approval|underwriting|escrow|points?)/i.test(q);
    const mentionsMarket  = /(rate|rates|10[- ]?year|treasury|spread|today|latest|current|now|pricing|yield)/i.test(q);

    // --- Concept (strict; no live data) ------------------------------------
    if (mentionsConcept && !mentionsMarket) {
      try {
        const base = composeConcept(q, mode); // gives TL;DR + borrowerSummary scaffold
        const llm = process.env.DYNAMIC_ENABLED === "true"
          ? await generateConceptAnswer(question, mode)
          : null;

        const answer = llm ? normalizeConceptAnswer(llm) : base.answer;

        return json({ ...base, answer });
      } catch (e: any) {
        return json({
          path: "error",
          usedFRED: false,
          tldr: ["Concept path failed."],
          answer: `Concept error: ${String(e?.message || e)}`.slice(0, 300),
          borrowerSummary: null,
          confidence: "low"
        }, 200);
      }
    }

    // --- Market (FRED + guidance) ------------------------------------------
    if (mentionsMarket) {
      const fred = await getFredSnapshot({ maxAgeDays: 7, timeoutMs: 6000 });
      const out: MarketOut = composeMarket(fred, mode, {
        defaultLoan: 500_000,
        recentTenYearChange: null,
        volatility: "med",
      });
      return json(out);
    }

    // --- Dynamic (LLM) ------------------------------------------------------
    if (process.env.DYNAMIC_ENABLED === "true") {
      try {
        const answer = await generateDynamicAnswer(question, mode);
        return json({
          path: "dynamic",
          usedFRED: false,
          tldr: [
            "Contextual explanation tailored to your question.",
            "No live data included unless asked.",
            "Actionable next steps where appropriate."
          ],
          answer,
          borrowerSummary:
            mode === "borrower"
              ? "If timing is tight, focus on payment stability and total cost (rate + points). If flexible, get pre-underwritten."
              : null,
          confidence: "med"
        });
      } catch (e: any) {
        return json({
          path: "error",
          usedFRED: false,
          tldr: ["Dynamic path failed."],
          answer: `Dynamic error: ${String(e?.message || e)}`.slice(0, 300),
          borrowerSummary: null,
          confidence: "low"
        }, 200);
      }
    }

    // Fallback
    return json({
      path: "error",
      usedFRED: false,
      tldr: ["We didn’t match this to concept or market."],
      answer: "Rephrase with either a concept (e.g., DTI, PMI, FHA) or a market request (rates vs 10-year).",
      borrowerSummary: null,
      confidence: "low"
    });
  } catch {
    return json({
      path: "error",
      usedFRED: false,
      tldr: ["We hit a snag."],
      answer: "Mortgage rates tend to move with the 10-year; spreads reflect risk and liquidity.",
      borrowerSummary: null,
      confidence: "low"
    });
  }
}
