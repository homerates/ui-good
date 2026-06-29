# SHELL_MIGRATION_PLAN.md — HomeRates.AI

> Plan for the consumer/pro shell + nav consolidation migration. High blast
> radius (touches how every page mounts). Staged, preview-verified, abortable.

---

## REVERT ANCHOR (the most important fact in this doc)

- **Production live commit:** `303a90f` — "Merge pull request #62 from
  homerates/dev" (confirmed in Vercel Deployments, status Ready/Current).
- **Tag:** `pre-shell-migration` → points at `303a90f`.
- **Abort, fastest:** In Vercel dashboard, redeploy the `303a90f` deployment.
  Instant, no CLI.
- **Abort, local:** `git reset --hard pre-shell-migration`.

Production flow is `dev → PR → main`. Production CANNOT move until Rayaan opens the
merge PR. All migration work happens on `dev` → auto-deploys to dev preview
(staging Supabase, isolated). Production stays on `303a90f` the entire time.

---

## PRE-FLIGHT (all must be green before migration code)

1. [ ] Local `main` confirmed == `303a90f` (`git log -1 --oneline`).
2. [ ] Tag `pre-shell-migration` created and pushed.
3. [ ] Staging boundary confirmed isolated — DONE (separate Preview vs Production
       Supabase URLs verified in Vercel dashboard).
4. [ ] Docs committed to `dev` as standalone commits BEFORE migration code:
       BRAND.md, ARCHITECTURE_DECISIONS.md, SHELL_MIGRATION_PLAN.md.
5. [ ] Structural audit complete (shell layer + chrome inventory + nav config).

---

## WHY THIS MIGRATION

Root cause of menu drift and bare pages (e.g. `/messages` has no logo, no footer,
a mismatched drawer): there is no shared layout shell and no single nav source.
Every page improvises its own chrome. Six independent nav definitions diverge.
Fixing pages one-by-one treats symptoms; fixing the shell + nav config fixes the
generator. (See ARCHITECTURE_DECISIONS AD-6, AD-7.)

---

## STAGED SEQUENCE (one stage per PR-to-dev; verify on preview between each)

**Stage 0 — Audit (report only, no edits).** Map the current shell/layout
structure, which pages are wrapped vs bare, where consumer/pro is decided, and the
full deduped nav inventory tagged by mode/surface/role. Output is the spec for
Stage 1+.

**Stage 1 — Nav config.** Build the single tagged nav config array (AD-7). No
rendering change yet — just the source of truth in place.

**Stage 2 — Shell shells.** Create `(consumer)` and `(pro)` route-group layouts
with logo + nav + footer chrome, each rendering nav by filtering the config.
Do NOT move pages yet.

**Stage 3 — Migrate one route group.** Move a SMALL, low-risk set of pages into a
shell (candidate: `/messages` + one or two standalone pages — they're already
bare, so the only direction is up). Verify on preview: logo present, footer
present, correct shell for mode, nav renders from config.

**Stage 4 — Migrate the rest, group by group.** Each group its own commit, each
verified on preview before the next. Chat panels (`chat/page.tsx`, highest blast
radius) LAST.

**Stage 5 — Card intent-moments (separate workstream, after shell is stable).**
"→ Rate Engine" on My Home rate line (new element); "→ AMI Qualifier" on the
IncomeQualify card (new element). DSC card Rate Intelligence L5 row already exists
— no change. These are inline affordances, NOT menu items — kept out of the shell
work to avoid scope merge.

**Final — Merge PR dev → main.** Only after all groups verified on preview.

---

## HARD CONSTRAINTS DURING MIGRATION

- ZERO schema changes. No new tables, columns, RLS edits, or migration SQL. (This
  is what keeps code-only revert fully safe against the shared-nothing boundary.)
- ZERO Clerk/auth config changes.
- ZERO env var changes.
- Pending DPA migrations 059/060 are NOT part of this work and must not be applied
  during it.
- Verbatim hunks, audit-before-edit, one root cause per change. No full-file
  replace of layout/nav files.

---

## DONE CRITERIA (per migrated group)

- Logo present, footer present, correct shell for the page's mode.
- Nav renders from the single config (no hand-listed items).
- Consumer pages get consumer shell (no left sidebar); pro pages get pro shell.
- No page renders bare chrome.

## ABORT TRIGGERS (pre-agreed — abort is unemotional)

- Any page renders without its shell after migration.
- Consumer sees pro chrome, or pro sees consumer chrome.
- A preview build breaks and can't be resolved in one root-cause pass.
- Any unintended write to Supabase/Clerk is observed.

On any trigger: redeploy `303a90f` in Vercel (or `git reset --hard
pre-shell-migration`), and the docs (committed separately, ahead of migration
code) survive the revert intact.
