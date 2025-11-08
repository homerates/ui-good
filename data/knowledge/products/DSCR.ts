export const DSCR = {
  name: "Advantage FLEX DSCR",
  type: "Non-QM / Investor",
  highlights: [
    "Qualifies using subject property cash flow (DSCR  1.0 typical; some products allow < 1.0).",
    "No personal DTI in many cases.",
    "Interest-only and ARM options often available."
  ],
  keyParams: {
    minFICO: 660,
    maxLTV: 80,
    propertyTypes: ["SFR", "2-4 Units", "Condo", "Townhome"],
    purpose: ["Purchase", "R&T", "Cash-Out"],
  }
} as const;
