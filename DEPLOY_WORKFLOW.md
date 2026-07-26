# Deploy Workflow

## Branches

| Branch | Environment | URL | Credentials |
|--------|-------------|-----|-------------|
| `main` | Production | chat.homerates.ai | Live Clerk, Stripe, Supabase |
| `dev` | Preview | dev.homerates.ai (Vercel login required — see note) | Dev Clerk (unconfirmed — see note), Stripe test mode, **same Supabase project as production** |

**Corrected 2026-07-24:** this doc previously named the staging domain `dev.chat.homerates.ai` — that hostname does not resolve at all (confirmed via public DNS, no record exists). The real staging domain is **`dev.homerates.ai`** (no "chat." — confirmed live, resolves to a Vercel deployment). It's gated by Vercel's Deployment Protection (login-required preview access): visiting it while logged into the Vercel account with project access works normally; an unauthenticated request (or a plain `curl`) gets redirected to `vercel.com/sso-api`. That's expected behavior, not a bug.

**No separate staging Supabase project exists.** Confirmed directly with Rayaan 2026-07-23: no Supabase branch was ever created for `dev`. There is exactly one Supabase project, and both Preview and Production Vercel environments point at it. This means:
- Migrations only ever run against the one real database — there is no isolated environment to test a destructive migration in first. The `IF NOT EXISTS` / additive-only convention (below) is the *only* safety net, not environment isolation.
- Testing on the `dev` preview build is a legitimate full test against real data, not a stand-in for one — there's no data drift to worry about between "staging" and "production" because they're the same data.

**Clerk/Stripe separation between Preview and Production is not independently confirmed** (Stripe test-vs-live keys are set per CLAUDE.md rule 5 and believed accurate; Clerk dev-vs-live instance separation has not been verified via dashboard). Treat as probably-true-but-unverified, not as confirmed fact, until checked directly.

## Day-to-day development

1. All feature work happens on `dev` (or a feature branch that merges to `dev`).
2. Every push to `dev` triggers a Vercel preview build, available at `dev.homerates.ai` (Vercel login required — see note above).
3. Test on the `dev` preview build before touching `main`. Since Supabase is shared, this is a real test against real data, not a lower-fidelity stand-in for one.

## Promoting to production

```
git checkout main
git merge dev
git push origin main
```

Vercel auto-deploys `main` to `chat.homerates.ai`.

## Database migrations

New migrations go in `supabase/migrations/` as `NNN_description.sql`.

- **There is one Supabase SQL Editor** (production — see note above). Rayaan runs every migration there manually; Claude Code writes the SQL but never executes it directly.
- Migration files must use `CREATE TABLE IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS` — never bare `CREATE TABLE` or `ADD COLUMN`. This convention is the actual safety net here, precisely because there's no isolated environment to catch a bad migration first.
- A migration that needs to be destructive (a drop, a non-additive column change) has no staging environment to test in — treat that case with extra caution and flag it explicitly before running it.

## Schema reset files (if ever needed)

These files exist in the repo but predate the confirmation that there's only one Supabase project — run them against that one project if a full reset is ever genuinely needed, in order:

1. `supabase/staging_base_schema.sql` — 31 base tables (not in numbered migrations)
2. `supabase/staging_seed.sql` — 51 incremental migrations
3. `app/setup-supabase.sql` — already included in staging_base_schema.sql (no-op)

## Environment variables

Scoped in Vercel:

| Variable | Production | Preview (dev) |
|----------|-----------|---------------|
| `NEXT_PUBLIC_SUPABASE_URL` | project URL | **same project URL** (one Supabase project, not two) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key | **same anon key** |
| `SUPABASE_SERVICE_ROLE_KEY` | service key | **same service key** |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Live instance | Dev instance (unverified — see note above) |
| `CLERK_SECRET_KEY` | Live instance | Dev instance (unverified — see note above) |
| `STRIPE_SECRET_KEY` | Live key | Test key |
| `STRIPE_WEBHOOK_SECRET` | Live webhook | Test webhook |
| `NEXT_PUBLIC_APP_BASE_URL` | https://chat.homerates.ai | https://dev.homerates.ai |

All other vars (xAI, Tavily, FRED, Resend, etc.) are shared across environments.

## Hard rules

- Never push directly to `main` for feature work.
- Never paste secret values into this repo or to Claude.
- FRED pipeline files require admin approval before any change.
- Migrations run once, manually, in the single Supabase project's SQL Editor — `IF NOT EXISTS` is the safety net, not a separate staging database.
