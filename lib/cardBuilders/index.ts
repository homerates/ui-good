// lib/cardBuilders/index.ts
// Barrel re-export — all external imports resolve unchanged.
// Each builder lives in its own sub-file; add new builders there.

export type { BuiltCard } from './types';

export { buildConventionalCard } from './conventional.builder';

export {
    buildFHACard,
    buildFHAEquityTimelineCard,
    buildFHANeedsInputCard,
    buildMIPDurationCard,
} from './fha.builder';

export {
    buildRefiCard,
    buildRefi20vs30Card,
    buildRefiEarlySaleCard,
    buildExtraPaymentCard,
    buildOneExtraPaymentPerYearCard,
    buildRefiNeedsInputCard,
} from './refi.builder';

export type { AffordabilityGeo } from './affordability.builder';
export {
    buildAffordabilityCard,
    buildAffordabilityNeedsInputCard,
} from './affordability.builder';

export type { DSCRGeo } from './dscr.builder';
export {
    buildDSCRCard,
    buildDSCRNeedsInputCard,
} from './dscr.builder';

export type { UWCardInput } from './uw.builder';
export {
    buildUWCard,
    buildUWStarterCard,
} from './uw.builder';

export {
    buildLabCard,
    buildAboutCard,
    buildAboutTrustCard,
    buildAboutDifferenceCard,
    buildAboutDataCard,
    buildAboutFounderCard,
    buildHowItWorksCard,
} from './about.builder';

export { getContextChips } from './context-chips';

export type { VACountyData } from './va.builder';
export {
    buildVACard,
    buildVAEntitlementCard,
    buildVAEntitlementNeedsInputCard,
    buildVANeedsInputCard,
} from './va.builder';

export type { LoanLimitsCardInput } from './jumbo.builder';
export {
    buildJumboCard,
    buildLoanLimitsCard,
    buildJumboAffordabilityCard,
} from './jumbo.builder';

export type { ScenarioComparisonCardInput } from './scenario.builder';
export {
    buildScenarioComparisonCard,
    buildBuydownCard,
    buildSellerCreditCard,
} from './scenario.builder';
