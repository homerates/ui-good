# CLAUDE.md
<!-- Last reviewed: 2026-07-08 — also check NAVIGATION_SPEC.md and DEPLOY_WORKFLOW.md for staleness each pass -->

## Branch & Deploy Rules

1. **All work on `dev`.** Never push or commit directly to `main` — `main` is
   production and is only updated via PR merge from `dev`.

2. **Validate on staging before merging.** Test every change at the Vercel
   preview URL (or `dev.chat.homerates.ai` once DNS propagates) before any
   merge to `main`.

3. **Supabase schema changes go to staging first.** Write a numbered migration
   SQL file in `supabase/migrations/`. Apply it to the staging Supabase project,
   validate, then apply to production. Never edit the production schema directly.
   All `CREATE TABLE` and `ADD COLUMN` statements must use `IF NOT EXISTS`.

4. **Secrets stay in Vercel, scoped to environment.** Env vars live in Vercel
   scoped to Preview or Production. Never write secrets into code, `.env` files,
   or commits. Never prefix a secret value with `NEXT_PUBLIC_` — that prefix
   exposes the value to the browser.

5. **Stripe environments must not mix.** Preview deployments use Stripe test
   mode keys and the test webhook endpoint. Production uses live keys and the
   live webhook. Never use a live Stripe key in a preview deployment.

6. **Full process is in `DEPLOY_WORKFLOW.md`.** Reference it for branch
   strategy, migration steps, env var table, and staging reset instructions.

7. **No "done" report without proof.** Never tell Rayaan something is committed,
   pushed, merged, or migrated without pasting the actual command output that
   shows it (`git log -1`, `git status`, `git push` result, the migration
   confirmation) in the same turn. A claim of "done" from an earlier turn or a
   prior session's summary is not verification — re-run the check fresh before
   repeating it. This was written after AD-11 Seam 1 was reported as "committed
   and pushed" when it was actually still untracked in the working tree.

## CRM Hard Rules

**Applies to every migration, API route, TypeScript type, and prompt-construction function
touching the CRM system (`borrowers` seed context, `crm_touchpoints`, `crm_outreach_consents`).**
Authoritative source: `COMPLIANCE_DECISIONS.md`. These rules summarise Decisions 1 and 2 for
in-session enforcement — do not shorten or paraphrase them away.

### Decision 1 — Permanent Denylist (income, credit, debt ratios)

These identifiers must never appear as column names, `key_facts` keys, TypeScript type
fields, or generation-prompt inputs — in any form, including bucketed / banded variants.
If you encounter a request that would require adding one, STOP and flag it explicitly.

| Category | Barred identifiers |
|---|---|
| Income | `annual_income`, `monthly_income`, `gross_income`, `net_income`, `income`, `household_income`, `stated_income` |
| Credit | `credit_score`, `fico_score`, `fico`, `credit_range`, `credit_bucket`, `credit_band`, `vantage_score`, `credit_score_range` |
| Debt ratios | `dti`, `debt_to_income`, `front_end_dti`, `back_end_dti`, `monthly_debt`, `total_debt` |

`credit_score_range` was proposed in the CRM design doc and explicitly rejected — no bucketed
or banded credit form is permitted either.

### Decision 2 — note fact excluded from generation (ECOA)

`NoteFact` (`key: 'note'`) in `CrmKeyFact` is visible to the LO in the pre-call brief but
must never reach the generation prompt. The exclusion is structurally enforced via
`CrmGenerationFact = Exclude<CrmKeyFact, NoteFact>` in `lib/crm/types.ts`. Every API route
that builds generation context must call `toGenerationTouchpoint()` — never pass raw
`CrmTouchpoint.key_facts` to a prompt directly.

### Decision 2 — Prohibited key_facts keys (ECOA / fair lending)

These keys must never be added to the `CrmKeyFact` discriminated union. If an LO needs to
note something that touches a protected characteristic, the only path is the freeform `note`
fact (which is excluded from AI generation): `family_status`, `familial_status`, `children`,
`marital_status`, `religion`, `national_origin`, `race`, `ethnicity`, `age`, `disability`,
`public_assistance`.

### Decision 8 — Platform-level hard stops (RESPA / GLBA / TRID)

These apply **everywhere in the codebase**, not just the CRM. If you encounter a feature request that would require any of the following, STOP and flag it explicitly — do not implement without explicit compliance review.

1. **No SSN field, ever.** Not in any table, form, API payload, or variable. The messaging route already blocks SSN patterns in chat input — that guard must never be removed.
2. **No credit bureau API.** No Equifax / Experian / TransUnion integration. Self-reported user-entered credit score estimates are permitted; bureau-pulled credit reports are not.
3. **No person-committed locked rate.** Rate outputs must remain scenario/market estimates with educational disclaimer language. Never present HomeRates as committing a rate to a named individual.
4. **Disclaimer preservation.** Every surface showing income/eligibility/rate figures tied to a real person must carry `EDUCATIONAL_DISCLAIMER` from `lib/disclosures.ts` or functionally equivalent language. Gap confirmed 2026-07-11: `/my-home` currently lacks this.

Full Decision 8 text is in `COMPLIANCE_DECISIONS.md`.

---

## Navigation Hard Rules

Before designing, scoping, or building ANY change that touches navigation menus,
nav-config, AppShell, route groups (`(consumer)/` or `(pro)/`), tier detection
(`useConsumerMode`), drawer content, top-bar links, chat chrome, or post-login
routing, check it against `NAVIGATION_SPEC.md` (invariants I-1 through I-10).
If a request, idea, or your own proposed approach could breach any of them —
including "just this one page" exceptions or hardcoded link lists — STOP and
flag it explicitly before proceeding. Name the invariant at risk. Do NOT quietly
implement a noncompliant surface. This tripwire fires regardless of whether the
request comes from Rayaan or from your own proposed plan.
