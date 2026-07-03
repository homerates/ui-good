// HUD standard household size adjustment factors relative to 4-person AMI.
// Source: app/api/ami-qualifier/route.ts — extracted here so ffiecEligibility
// can import the same values without duplication.
export const AMI_SIZE_FACTORS: Record<number, number> = {
  1: 0.70, 2: 0.80, 3: 0.90, 4: 1.00,
  5: 1.08, 6: 1.16, 7: 1.24, 8: 1.32,
};
