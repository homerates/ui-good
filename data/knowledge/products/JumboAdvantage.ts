export const JumboAdvantage = {
  name: "Jumbo Advantage",
  type: "Jumbo",
  highlights: [
    "Standard full-doc jumbo with competitive pricing.",
    "Stricter DTI/reserves vs conforming.",
  ],
  keyParams: {
    minFICO: 700,
    maxLTV: 85,
    occupancy: ["Primary", "Second Home", "Investment (case by case)"]
  }
} as const;
