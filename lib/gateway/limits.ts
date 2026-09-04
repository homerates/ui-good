// lib/gateway/limits.ts
//
// PROVISIONAL V1 PILOT VALUES. NOT A FINAL BUSINESS DECISION.
//
// The locked architecture doc (section 11) explicitly left exact numeric
// limits open -- these are conservative starting values for controlled
// pilot validation, not a researched or commercially-optimized conclusion.
// Centralized here so changing them later is a config change, not an
// architecture change -- nothing else in lib/gateway/ should hardcode a
// limit number outside this file.

export const PILOT_LIMITS = {
  credentialPerMinute: 10,
  partnerPerMinute: 30,
  ipPerMinute: 10,
  credentialPerDay: 500,
  credentialPerMonth: 5000,
} as const;
