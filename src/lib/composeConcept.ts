// src/lib/composeConcept.ts
export type Mode = "borrower" | "public";

export type ConceptOut = {
  path: "concept";
  usedFRED: false;
  tldr: string[];
  answer: string;                 // one-line takeaway + compact bullets (no headings)
  borrowerSummary: string | null; // 1–2 borrower-facing bullets
  watchNext?: string[];
  confidence?: "low" | "med" | "high";
};

function bullets(lines: string[]) {
  // join into "• " bullets without markdown headings
  const cleaned = lines.map(s => s.trim()).filter(Boolean);
  return cleaned.length ? "• " + cleaned.join("\n• ") : "";
}

/** Formats DTI, PMI, FHA, etc. into borrower-first copy: one-liner + 3 bullets + 2 next steps. */
export function composeConcept(questionLower: string, mode: Mode): ConceptOut {
  // Very lightweight matcher; expand as you add concepts
  if (/\bdti\b|debt[-\s]?to[-\s]?income/i.test(questionLower)) {
    const tldr = [
      "DTI = monthly debts ÷ gross monthly income.",
      "Lower DTI = easier approval and better pricing.",
      "Typical conforming cap is ~43% (program-dependent).",
    ];

    const answerLines = [
      "DTI is your monthly debt load compared to your gross income. Lenders use it to gauge payment capacity.",
      "How it’s calculated:",
      "— Add mortgage (projected), car, cards, student loans, etc.",
      "— Divide by your gross monthly income.",
      "Why it matters: lower DTI gives you more lender options and cost flexibility."
    ];

    const borrowerBits =
      mode === "borrower"
        ? bullets([
            "If DTI is tight, lower debts or increase down payment to reduce the new housing payment.",
            "Compare rate + points + payment (total cost), not just the headline rate."
          ])
        : null;

    return {
      path: "concept",
      usedFRED: false,
      tldr,
      answer: [
        // One-liner takeaway
        "Takeaway: DTI shows how much payment you can safely carry.",
        "",
        // Compact bullets (no markdown headings)
        bullets([
          "DTI = monthly debts ÷ gross income.",
          "Lower is better for approval and pricing.",
          "Program limits vary; ~43% is common for conforming.",
        ]),
        "",
        bullets(answerLines.slice(1)), // skip the duplicate first line
        "",
        // Next steps (2 items)
        bullets([
          "Next: Gather income docs and list all monthly debts to estimate your current DTI.",
          "Then: Adjust the target payment (or down payment) until DTI lands in a comfortable range.",
        ])
      ].join("\n"),
      borrowerSummary: borrowerBits,
      watchNext: ["Underwriting guidelines", "Compensating factors", "Loan program overlays"],
      confidence: "high",
    };
  }

  // Fannie/Freddie explainer as a useful generic fallback
  if (/fannie|freddie/i.test(questionLower)) {
    const tldr = [
      "They buy mortgages from lenders to keep money flowing.",
      "They pool loans into MBS and guarantee payments to investors.",
      "Result: liquidity, stability, and broader access to credit.",
    ];

    const borrowerBits =
      mode === "borrower"
        ? bullets([
            "Predictable guidelines help with approval consistency.",
            "Liquidity supports steady offerings across lenders and markets.",
          ])
        : null;

    return {
      path: "concept",
      usedFRED: false,
      tldr,
      answer: [
        "Takeaway: Fannie Mae and Freddie Mac keep mortgage money moving.",
        "",
        bullets([
          "They buy loans from lenders and package them into securities.",
          "They guarantee investor payments to stabilize the market.",
          "This supports affordability and wider access to credit."
        ]),
        "",
        bullets([
          "Next: Match your scenario to conforming guidelines (credit, DTI, LTV).",
          "Then: Compare total cost (rate + points + payment) across a few lenders."
        ])
      ].join("\n"),
      borrowerSummary: borrowerBits,
      watchNext: ["Conforming loan limits", "LLPA / pricing grids", "Private MI vs FHA"],
      confidence: "high",
    };
  }

  // Generic concept fallback (keeps the same structure)
  const tldr = [
    "Core idea explained simply.",
    "Avoids live rates/market data.",
    "Action steps you can use today.",
  ];
  return {
    path: "concept",
    usedFRED: false,
    tldr,
    answer: [
      "Takeaway: here’s the concept in plain English.",
      "",
      bullets([
        "Short definition in one sentence.",
        "Why lenders care and how it shows up in pricing/approval.",
        "Common pitfalls and how to avoid them."
      ]),
      "",
      bullets([
        "Next: gather docs and run a quick pre-qual to see where you stand.",
        "Then: compare total cost (rate + points + payment) for 2–3 options."
      ])
    ].join("\n"),
    borrowerSummary: mode === "borrower" ? bullets([
      "Make decisions using total cost, not just rate.",
      "Ask how changes to DTI/LTV/points shift approval and payment."
    ]) : null,
    watchNext: ["Program rules", "Overlays", "Compensating factors"],
    confidence: "med",
  };
}
