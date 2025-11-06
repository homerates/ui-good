export const FannieMaeUW = {
  name: "Fannie Mae (Conventional)",
  bankruptcy: {
    chapter7: { waitYears: 4 },
    chapter13: { waitYears: 2, from: "discharge/dismissal" }
  },
  reserves: "Varies by LTV/occupancy/units; see Selling Guide.",
  docs: ["Standard full doc; DU findings govern."],
} as const;
