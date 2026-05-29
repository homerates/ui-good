// lib/disclosures.ts
// Canonical disclosure lines — used on ALL report surfaces, white-label or HomeRates-branded.
// These are data attribution requirements and educational disclaimers that travel with
// the content, not with the brand. Never strip these from white-label builds.

export const EDUCATIONAL_DISCLAIMER =
  'HomeRates.Ai is an independent educational tool — not a financial advisor, mortgage lender, or broker. ' +
  'All estimates (PITI, AVM, income thresholds, Decision Scores) are statistical models and may differ from actual outcomes. ' +
  'Not a loan offer, pre-approval, or commitment to lend.';

export const DATA_ATTRIBUTION =
  'Powered by FRED® Data — Federal Reserve Bank of St. Louis. ' +
  'Intelligence pipeline: multi-model AI orchestration — OpenAI · Grok by xAI · Claude by Anthropic.';

// Combined single line used in footers and disclosures sections
export const FULL_DISCLOSURE = `${EDUCATIONAL_DISCLAIMER} ${DATA_ATTRIBUTION}`;

// Short version for tight spaces (bottom of cards, small print)
export const SHORT_DISCLOSURE =
  'Educational estimates only — not financial advice or a commitment to lend. ' +
  'Powered by FRED® · OpenAI · Grok by xAI · Claude by Anthropic.';
