---
name: migration-apply
description: Use when applying a new or pending Supabase migration to HomeRates — writing a numbered SQL file, applying to staging, verifying, then applying to production. Trigger on "apply migration", "add a migration", "run the migration", or any reference to supabase/migrations/.
---

# Migration Apply

Supabase migrations for HomeRates — staging first, always.

## Steps

1. **Find the next migration number.**
   Check `supabase/migrations/` for the highest existing file number. The next file is `{N+1}_{short_description}.sql`.

2. **Write the migration file.**
   Every `CREATE TABLE` and `ADD COLUMN` must use `IF NOT EXISTS`. Never bare `CREATE TABLE` or `ADD COLUMN`.

3. **Apply to STAGING first.**
   Open the Staging Supabase SQL Editor (`NEXT_PUBLIC_SUPABASE_URL` from Vercel Preview env) and run the migration file contents. Do not skip this step.

4. **Verify on staging.**
   Run a targeted `SELECT` or column-existence check (e.g., `SELECT column_name FROM information_schema.columns WHERE table_name='...' AND column_name='...'`) and confirm the expected schema change is present. Show the output — don't claim success without it.

5. **Apply to PRODUCTION.**
   Open the Production Supabase SQL Editor and run the same file contents.

6. **Verify on production.**
   Same verification query as step 4. Show the output.

7. **Report.**
   State the migration number, what changed, and both verification results.

## Hard rules

- Never apply directly to production without a staging pass first.
- Never mark this done without showing both verification query outputs.
- The git-tracked SQL file is the source of truth — apply exactly that content to both environments.
- If staging verification fails, stop. Do not apply to production until the issue is resolved.
