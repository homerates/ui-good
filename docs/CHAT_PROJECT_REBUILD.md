# Chat + Project Archiving Rebuild — AD-11 through AD-16 (Final)

**Status:** Complete. This supersedes the original Map-phase findings (`docs/audits/chat-project-archiving-findings.md`) and the Design draft (AD-11 through AD-15) as the record of what was actually built, since several decisions changed during implementation.

## What this replaced

The legacy system split chat identity across two columns (`chat_threads.chat_id` vs `thread_id`), written by different routes that were unaware of each other. Project assignment worked by accident in some paths and silently failed in others. See the original findings doc for the full root-cause list — not repeated here.

## Final architecture

### Schema (`supabase/migrations/061`–`064`)

```sql
CREATE TABLE chats (
  id               text NOT NULL,          -- frontend uid(): 8-char base-36 string, not a UUID
  clerk_user_id    text NOT NULL,
  project_id       uuid REFERENCES projects(id) ON DELETE SET NULL,
  title            text,
  messages         jsonb NOT NULL DEFAULT '[]',
  memory_thread_id uuid REFERENCES memory_threads(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, clerk_user_id)          -- composite, scoped to owner
);

-- projects (existing table, extended):
ALTER TABLE projects ADD COLUMN description text;
ALTER TABLE projects ADD COLUMN updated_at timestamptz DEFAULT now();
CREATE UNIQUE INDEX projects_user_name_uq ON projects(clerk_user_id, name);
```

**AD-11 (final):** Single identity column (`chats.id`, the frontend's `uid()` value) replaces the old `chat_id`/`thread_id` split entirely. Composite primary key `(id, clerk_user_id)` — every API route filters by both explicitly, since the app uses the Supabase service-role key which bypasses RLS.

**AD-12 (confirmed):** "Unsorted" is not a project row for new chats — `project_id IS NULL` is the unsorted state. However, see the Gotchas section below: **old "Unsorted" project rows still exist and are load-bearing for an unrelated feature.**

**AD-13 (revised — archive descoped):** The original design proposed a soft-archive state (`archived_at`). This was dropped after confirming the actual desired UX (Claude.ai / ChatGPT-style sidebar): chats support **Add to project** and **Delete** only, no archive state. Projects support **Rename** and **Delete** only, no Pin. Delete is a hard delete on both.

**AD-14 (confirmed, unchanged):** `memory_threads.project_id` and `library_events.project_id` are separate, pre-existing project-membership columns unrelated to this rebuild — left untouched. Not migrated, not deprecated. Out of scope.

**AD-15 (superseded):** The original migration/backfill plan (dedup logic, two-pass migration of old `chat_threads` data) was **never executed**. Decision made mid-build: no data migration. Old `chat_threads` rows are not preserved or ported into `chats`. This was a deliberate scope cut, not an oversight — see "What was deferred" below.

**AD-16 (new):** `projects` cleanup — of 41 pre-existing rows, 18 were verified empty (zero `user_answers`, zero `chat_threads`, zero answers-via-threads) and deleted. The remaining 23 are real "Unsorted" buckets auto-created by the AI Chat Engine (`app/api/answers/route.ts`) for actual users and were **not** touched. They will continue to appear in the new Projects UI for those users. This is intentional, not a bug.

### API routes (`app/api/v2/`)

- `GET /api/v2/chats` — list, `?project_id=` filter, no message bodies (list view stays light)
- `GET/PUT/DELETE /api/v2/chats/:id` — `PUT` is a single upsert endpoint; handles create, content updates, and project reassignment (no separate "move" endpoint)
- `GET/POST /api/v2/projects` — `POST` returns 409 on duplicate name
- `PATCH/DELETE /api/v2/projects/:id` — `DELETE` returns 409 with a clear message if the project has chat history attached (FK constraint, see Gotchas)

Every route filters explicitly by `clerk_user_id` in addition to whatever RLS provides, per AD-11.

### Frontend

- `app/components/Sidebar.tsx` — PROJECTS section (list + `+ New` + Rename/Delete) and RECENTS section (flat list + Add to project/Delete), both reading/writing through `/api/v2/*`. Dropdown menus render via `createPortal(..., document.body)` to escape the sidebar's `transform`/`overflow` CSS trap, with viewport-edge collision handling (flips upward near the bottom of the screen).
- `app/projects/page.tsx` — dedicated Projects grid page (search, sort by Last updated/Name, cards with name/description/updated date/chat count, New project form with name+description). Wrapped in `AppShell` per `NAVIGATION_SPEC.md` — see deferred items below for governance doc updates still owed.
- `app/chat/page.tsx` — chat persistence switched from `PUT /api/chat-threads` to `PUT /api/v2/chats/:id`. The old localStorage-priority hydration was removed; `GET /api/v2/chats` is now the source of truth for the sidebar list on load.

## What was deferred (not built, on purpose)

- **No data migration.** Pre-rebuild chat history in `chat_threads` was explicitly not ported. Confirmed with Rayaan as acceptable — it was mostly test data. This significantly simplified the build (no dedup logic, no two-pass migration, no orphan-row merging).
- **`NAVIGATION_SPEC.md` §4.6 entry for `/projects`** — flagged by Claude Code as missing, not yet added. Owed: document `/projects` as a standalone AppShell page and a future `(pro)/` route-group candidate once divergence D-2 is resolved.
- **`lib/nav-config.ts` `NavItem` for `/projects`** — currently reachable only via the Sidebar's own "PROJECTS" section link, not from the drawer or top nav. Acceptable bootstrap state per Claude Code's I-1 assessment; add a proper `NavItem` if/when it should be reachable from elsewhere.
- **Old routes (`/api/chat-threads`, `/api/projects` non-v2) were left in place, untouched, unused.** Standard one-release-cycle deprecation window before removal — not yet scheduled.
- **Pin and Archive** — excluded from scope per the confirmed UX reference. Both are cheap to add later (each is one nullable column) if wanted.

## Gotchas for future maintainers (read this before touching `projects` or `chat_threads` again)

1. **`projects` is a shared table between two unrelated features.** The chat/project sidebar (this rebuild) is one consumer. The AI Chat Engine (`app/api/answers/route.ts`, `getOrCreateDefaultProject()`) is a completely separate consumer that auto-creates/uses an "Unsorted" project per user on every chat turn, server-side, with no user-facing UI of its own. **Do not bulk-delete or truncate `projects` again without checking both `user_answers.project_id` (direct) and `chat_threads.project_id` → `user_answers.chat_thread_id` (indirect, via cascade) first.** A `TRUNCATE` or naive `CASCADE` delete here already caused one production incident during this rebuild.

2. **The FK chain that caused that incident:** `chat_threads.project_id → projects` is `ON DELETE CASCADE`. `user_answers.chat_thread_id → chat_threads` is `RESTRICT` (no `ON DELETE` clause). `user_answers.project_id → projects` is also `RESTRICT`. Net effect: deleting a project can fail loudly (good) via either path, but a `CASCADE` override on the `projects` delete would silently destroy `chat_threads` rows and then hard-fail on `user_answers` — which is what happened. The new `chats.project_id → projects` FK is `ON DELETE SET NULL` by contrast — intentionally softer, since `chats` is this rebuild's own table and orphaning to "no project" is the correct behavior there.

3. **`chat_threads` is not being retired by this rebuild**, even though its sidebar-facing role was fully replaced by `chats`. It still serves as the memory-binding bookkeeping table for `app/api/answers/route.ts` and `app/api/answers/scenario/route.ts` — both independently read/write `chat_threads.memory_thread_id` keyed on `chat_id` (a text field, not the old dual-column split), regardless of what the Sidebar does. This is a legitimate second purpose for that table now. Don't drop `chat_threads` without re-auditing both answer routes first.

4. **All SQL against staging/production is run manually by Rayaan** — Claude Code writes migration files but does not execute them. This became a hard rule after a mid-rebuild incident where an unreviewed backfill migration ran directly against production. Keep this rule for any future schema work on this table set.
