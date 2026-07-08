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
