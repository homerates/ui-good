// src/lib/composeConcept.ts
export type Mode = "borrower" | "public";
export type Intent = "purchase" | "refi" | "investor";

export type ConceptOut = {
  path: "concept";
  usedFRED: false;
  tldr: string[];
  answer: string;
  borrowerSummary: string | null;
  watchNext?: string[];
  confidence?: "low" | "med" | "high";
};

function bullets(lines: string[]) {
  const cleaned = lines.map(s => s.trim()).filter(Boolean);
  return cleaned.length ? "• " + cleaned.join("\n• ") : "";
}

function intentBullets(intent?: Intent) {
  if (!intent) return [];
  if (intent === "purchase") return [
    "Price your comfort payment first; let that set home price and down payment.",
  ];
  if (intent === "refi") return [
    "Check breakeven: (cost / monthly savings) in months before you commit.",
  ];
  return [
    "For DSCR loans, verify rents and expense ratios early to avoid surprises.",
  ];
}

/** 3-arg signature: (questionLower, mode, intent?) */
export function composeConcept(questionLower: string, mode: Mode, intent?: Intent): ConceptOut {
  if (/\bdti\b|debt[-\s]?to[-\s]?income/i.test(questionLower)) {
    const tldr = [
      "DTI = monthly debts ÷ gross monthly income.",
      "Lower DTI = easier approval and better pricing.",
      "Typical conforming cap is ~43% (program-dependent).",
    ];

    const borrowerBits =
      mode === "borrower"
        ? bullets([
            "If DTI is tight, lower debts or increase down payment to reduce the new housing payment.",
            "Compare rate + points + payment (total cost), not just the headline rate.",
            ...intentBullets(intent),
          ])
        : null;

    return {
      path: "concept",
      usedFRED: false,
      tldr,
      answer: [
        "Takeaway: DTI shows how much payment you can safely carry.",
        "",
        bullets([
          "DTI = monthly debts ÷ gross income.",
          "Lower is better for approval and pricing.",
          "Program limits vary; ~43% is common for conforming.",
        ]),
        "",
        bullets([
          "Next: Gather income docs + monthly debts to estimate your DTI.",
          "Next: Adjust target payment or down payment until DTI lands in a comfortable range.",
        ]),
      ].join("\n"),
      borrowerSummary: borrowerBits,
      watchNext: ["Underwriting guidelines", "Compensating factors", "Loan program overlays"],
      confidence: "high",
    };
  }

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
            ...intentBullets(intent),
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
          "This supports affordability and wider access to credit.",
        ]),
        "",
        bullets([
          "Next: Match your scenario to conforming guidelines (credit, DTI, LTV).",
          "Next: Compare total cost (rate + points + payment) across a few lenders.",
        ]),
      ].join("\n"),
      borrowerSummary: borrowerBits,
      watchNext: ["Conforming loan limits", "LLPA / pricing grids", "Private MI vs FHA"],
      confidence: "high",
    };
  }

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
        "Common pitfalls and how to avoid them.",
      ]),
      "",
      bullets([
        "Next: gather docs and run a quick pre-qual to see where you stand.",
        "Next: compare total cost (rate + points + payment) for 2–3 options.",
      ]),
    ].join("\n"),
    borrowerSummary: mode === "borrower" ? bullets([
      "Make decisions using total cost, not just rate.",
      "Ask how changes to DTI/LTV/points shift approval and payment.",
      ...intentBullets(intent),
    ]) : null,
    watchNext: ["Program rules", "Overlays", "Compensating factors"],
    confidence: "med",
  };
}
