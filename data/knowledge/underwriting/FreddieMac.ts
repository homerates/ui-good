export const FreddieMacUW = {
  name: "Freddie Mac (Conventional)",
  bankruptcy: {
    chapter7: { waitYears: 4 },
    chapter13: { waitYears: 2 }
  },
  notes: "LP findings govern; check recent Bulletin updates.",
} as const;
