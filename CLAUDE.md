# CLAUDE.md

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
