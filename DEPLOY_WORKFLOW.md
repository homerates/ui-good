# Deploy Workflow

## Branches

| Branch | Environment | URL | Credentials |
|--------|-------------|-----|-------------|
| `main` | Production | chat.homerates.ai | Live Clerk, Stripe, Supabase |
| `dev` | Staging / Preview | dev.chat.homerates.ai | Dev Clerk, Stripe test mode, Staging Supabase |

## Day-to-day development

1. All feature work happens on `dev` (or a feature branch that merges to `dev`).
2. Every push to `dev` triggers a Vercel preview build — available at `dev.chat.homerates.ai`.
3. Test on staging before touching `main`.

## Promoting to production

```
git checkout main
git merge dev
git push origin main
```

Vercel auto-deploys `main` to `chat.homerates.ai`.

## Database migrations

New migrations go in `supabase/migrations/` as `NNN_description.sql`.

- **Staging first:** run the migration in the staging Supabase SQL Editor.
- **Production:** once verified, run the same file in the production Supabase SQL Editor.
- Migration files must use `CREATE TABLE IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS` — never bare `CREATE TABLE` or `ADD COLUMN`.

## Staging schema reset (if ever needed)

Run these three files in staging Supabase SQL Editor, in order:

1. `supabase/staging_base_schema.sql` — 31 base tables (not in numbered migrations)
2. `supabase/staging_seed.sql` — 51 incremental migrations
3. `app/setup-supabase.sql` — already included in staging_base_schema.sql (no-op)

## Environment variables

Scoped in Vercel:

| Variable | Production | Preview (dev) |
|----------|-----------|---------------|
| `NEXT_PUBLIC_SUPABASE_URL` | prod project URL | staging project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon key | staging anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | prod service key | staging service key |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Live instance | Dev instance |
| `CLERK_SECRET_KEY` | Live instance | Dev instance |
| `STRIPE_SECRET_KEY` | Live key | Test key |
| `STRIPE_WEBHOOK_SECRET` | Live webhook | Test webhook |
| `NEXT_PUBLIC_APP_BASE_URL` | https://chat.homerates.ai | https://dev.chat.homerates.ai |

All other vars (xAI, Tavily, FRED, Resend, etc.) are shared across environments.

## Hard rules

- Never push directly to `main` for feature work.
- Never paste secret values into this repo or to Claude.
- FRED pipeline files require admin approval before any change.
- Migrations must be tested on staging before production.
