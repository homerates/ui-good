// app/api/answers/route.ts
export const runtime = "nodejs";

import { getFredSnapshot } from "@/lib/fred";
import { composeMarket, type ComposedAnswer as MarketOut } from "@/lib/composeMarket";
import { composeConcept } from "@/lib/composeConcept";
import { generateDynamicAnswer, generateConceptAnswer } from "@/lib/llm";
import { normalizeConceptAnswer } from "@/lib/normalize";
import { AnswerReq } from "@/lib/schema";
import { z } from "zod";

type Mode = "borrower" | "public";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * RELAXED BODY SCHEMA
 * - `mode` is now OPTIONAL and defaults to "public" when omitted.
 */
const AnswerReqLoose = AnswerReq.extend({
  mode: z.enum(["borrower", "public"]).optional().default("public"),
});

export async function GET() {
  // Updated to reflect that `mode` is not required anymore
  return json({ ok: true, expects: "POST { question, intent?, loanAmount? }" });
}

export async function POST(req: Request) {
  try {
    const txt = await req.text();
    let parsed: unknown = {};
    try {
      parsed = txt ? (JSON.parse(txt) as unknown) : {};
    } catch {
      parsed = { __raw: txt } as const;
    }

    // Use the relaxed schema (instead of AnswerReq) so missing `mode` wont 400
    const body = AnswerReqLoose.safeParse(parsed);
    if (!body.success) {
      return json(
        { path: "error", usedFRED: false, tldr: ["Bad request"], answer: body.error.flatten() },
        400
      );
    }

    // Pull fields; ensure `mode` default applies consistently
    const { question, mode: rawMode, intent, loanAmount } = body.data;
    const mode = (rawMode ?? "public") as Mode;
    const q = question.toLowerCase();

    const mentionsConcept =
      /(fannie|freddie|fha|va|usda|dti|pmi|ltv|amortization|dscr|pre[- ]?approval|underwriting|escrow|points?)/i.test(q);
    const mentionsMarket =
      /(rate|rates|10[- ]?year|treasury|spread|today|latest|current|now|pricing|yield)/i.test(q);

    // --- Concept ------------------------------------------------------------
    if (mentionsConcept && !mentionsMarket) {
      try {
        const base = composeConcept(q, mode as Mode, intent);
        const llm =
          process.env.DYNAMIC_ENABLED === "true"
            ? await generateConceptAnswer(question, mode as Mode)
            : null;

        const answer = llm ? normalizeConceptAnswer(llm) : base.answer;
        return json({ ...base, answer });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return json(
          {
            path: "error",
            usedFRED: false,
            tldr: ["Concept path failed."],
            answer: msg.slice(0, 300),
            borrowerSummary: null,
            confidence: "low",
          },
          200
        );
      }
    }

    // --- Market -------------------------------------------------------------
    if (mentionsMarket) {
      const fred = await getFredSnapshot({ maxAgeDays: 7, timeoutMs: 6000 });
      const out: MarketOut = composeMarket(fred, mode as Mode, {
        defaultLoan: 500_000,
        loanAmount,
        intent,
        recentTenYearChange: null,
        volatility: "med",
      });
      return json(out);
    }

    // --- Dynamic ------------------------------------------------------------
    if (process.env.DYNAMIC_ENABLED === "true") {
      try {
        const answer = await generateDynamicAnswer(question, mode as Mode);
        return json({
          path: "dynamic",
          usedFRED: false,
          tldr: [
            "Contextual explanation tailored to your question.",
            "No live data included unless asked.",
            "Actionable next steps where appropriate.",
          ],
          answer,
          borrowerSummary:
            mode === "borrower"
              ? "If timing is tight, focus on payment stability and total cost (rate + points). If flexible, get pre-underwritten."
              : null,
          confidence: "med",
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return json(
          {
            path: "error",
            usedFRED: false,
            tldr: ["Dynamic path failed."],
            answer: msg.slice(0, 300),
            borrowerSummary: null,
            confidence: "low",
          },
          200
        );
      }
    }

    // Fallback
    return json({
      path: "error",
      usedFRED: false,
      tldr: ["We didnt match this to concept or market."],
      answer: "Rephrase with a concept (DTI, PMI, FHA) or market (rates vs 10-year).",
      borrowerSummary: null,
      confidence: "low",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({
      path: "error",
      usedFRED: false,
      tldr: ["We hit a snag."],
      answer:
        msg ||
        "Mortgage rates tend to move with the 10-year; spreads reflect risk and liquidity.",
      borrowerSummary: null,
      confidence: "low",
    });
  }
}
