# Chat History & Project Archiving — Audit Findings

**Audit date:** 2026-07-01  
**Auditor:** Claude Code (Map phase only — no edits made)  
**Scope:** Data model, backend API, frontend state, cross-cutting  
**Trigger:** "Move chat to a project" dialog only shows projects already in Supabase; projects created via sidebar form disappear after refresh; project filter shows wrong chats.

---

## 1. Current Architecture As-Built

### 1.1 Database Schema

Three tables are involved. **None of them appear in the numbered migration system** (`001_` through `060_`). They were created directly in the Supabase dashboard and are only captured in `supabase/staging_base_schema.sql` (comment: "extracted from production 2026-06-10").

#### `projects`
```sql
CREATE TABLE IF NOT EXISTS projects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  name          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
  -- NO updated_at column
  -- NO unique constraint on (clerk_user_id, name)
);
```
RLS: CRUD scoped to `clerk_user_id = auth.uid()::text` (service role key bypasses in API routes).

#### `chat_threads`
```sql
CREATE TABLE IF NOT EXISTS chat_threads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id    text NOT NULL,
  project_id       uuid,           -- nullable; NO FK to projects.id
  thread_id        text,           -- nullable; written by POST /api/projects
  chat_id          text,           -- nullable; written by PUT /api/chat-threads
  memory_thread_id uuid,           -- nullable; NO FK to memory_threads.id
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  title            text,
  messages         jsonb DEFAULT '[]'::jsonb
  -- NO unique constraint on (clerk_user_id, chat_id)
  -- NO unique constraint on (clerk_user_id, thread_id)
  -- PRIMARY KEY is internal uuid, not the chat identity
);
```
RLS: CRUD scoped to `clerk_user_id`. Service role key used in all API routes.

#### `memory_threads`
```sql
CREATE TABLE IF NOT EXISTS memory_threads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  project_id    uuid,     -- nullable; NO FK to projects.id
  title         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```
`memory_threads` has its own `project_id` column — a third place where project membership is theoretically recorded, with no constraint linking it to `projects`.

#### What is "Unsorted"?
"Unsorted" is a **real row** in the `projects` table. It was created by the old `prompt()` move flow (still present in `handleHistoryAction('move')` at `app/chat/page.tsx:2038`), which called `POST /api/projects` with `projectName: "Unsorted"`. It is NOT a UI sentinel for null `project_id`. The sidebar/API have no concept of a default "Unsorted" bucket — chats with `project_id = null` are simply unfiltered.

---

### 1.2 The Two Parallel Chat-Persistence Systems

The system has **two completely separate write paths** for `chat_threads` that write to different columns and are unaware of each other:

#### System A — Chat Content Persistence (`/api/chat-threads`)
- **Written by:** `PUT /api/chat-threads` — fired after every AI response (`page.tsx:3262`)
- **Identifies chat by:** `chat_id` field (= the frontend local UUID `uid()`)
- **Upsert key:** `onConflict: "clerk_user_id,chat_id"` — **but no unique constraint exists on this pair in the schema** (see §1.1). Without the constraint, PostgREST may insert a new row each time rather than updating. This cannot be confirmed from code alone — requires direct DB inspection.
- **Writes:** `clerk_user_id`, `chat_id`, `updated_at`, `title`, `memory_thread_id`, `messages`
- **Never writes:** `project_id` (not in the payload), `thread_id` (not set here)
- **Read by:** `GET /api/chat-threads` — filters `NOT chat_id IS NULL`, orders by `created_at DESC`, limit 50

#### System B — Project Assignment (`/api/projects`, `/api/projects/move-chat`)
- **Written by:** `POST /api/projects` (create project + attach thread) and `POST /api/projects/move-chat` (reassign)
- **Identifies chat by:** `thread_id` field (same UUID value as System A's `chat_id`)
- **`POST /api/projects` INSERT writes:** `clerk_user_id`, `project_id`, `thread_id` — **`chat_id` is never set**
- **`move-chat` UPDATE writes:** Sets `project_id` by matching `thread_id = threadId` first, then `chat_id = threadId` as fallback
- **Read by:** `GET /api/projects/threads-map` — selects `project_id, thread_id` and **skips rows where `thread_id IS NULL`**

---

### 1.3 Data Flow Diagram

```
Frontend creates new chat
        │
        ▼
uid() → local chatId (e.g. "abc-123")
        │
        ├──► localStorage: history[], threads{}, activeId
        │
        └──► [after first AI response]
             PUT /api/chat-threads
             {chat_id: "abc-123", title, messages, ...}
                     │
                     ▼
             chat_threads row:
             chat_id = "abc-123"  ← the authoritative row
             thread_id = NULL
             project_id = NULL

User clicks "Move to project" → picks existing project
        │
        ▼
POST /api/projects/move-chat
{threadId: "abc-123", projectId: "proj-xyz"}
        │
        ├── Step 1: WHERE thread_id = "abc-123" → 0 rows (thread_id IS NULL)
        ├── Step 2: WHERE chat_id  = "abc-123" → 1 row → UPDATE project_id ✓
        │
        ▼
chat_threads row:
  chat_id = "abc-123"  ← still null thread_id
  thread_id = NULL     ← NEVER SET by move-chat
  project_id = "proj-xyz"

GET /api/projects/threads-map
  SELECT project_id, thread_id FROM chat_threads
  WHERE clerk_user_id = userId
        │
        ▼
For our row: thread_id IS NULL → skipped by:
  if (!pid || !tid) continue;
        │
        ▼
map = {}   ← project "proj-xyz" has NO entries

Sidebar renders: projectThreadsMap["proj-xyz"] = undefined
  visibleHistory falls through to: return history (ALL chats)
```

When using `POST /api/projects` (new-project path) instead:
```
POST /api/projects {threadId: "abc-123", projectName: "REFI"}
        │
        ├── Find or create project row for "REFI"
        └── INSERT into chat_threads:
            {clerk_user_id, project_id: "proj-new", thread_id: "abc-123"}
            ← chat_id is NOT set in this insert

Result: TWO rows for the same chat:
  Row 1: chat_id = "abc-123", thread_id = NULL,      project_id = NULL   (from System A)
  Row 2: chat_id = NULL,      thread_id = "abc-123", project_id = "proj-new" (from System B)

threads-map returns: {"proj-new": ["abc-123"]} ← works because thread_id is set
Sidebar filter: allowed.has("abc-123") ← matches Row 2's thread_id ✓
BUT: Row 2 is permanently orphaned from Row 1 (different columns, no shared key)
```

---

### 1.4 Chat Persistence — Server vs Client

Chat history IS persisted server-side in the `messages` jsonb column of `chat_threads`. However, **localStorage is the primary store** and Supabase is secondary:

```javascript
// page.tsx:1730
setHistory(prev =>
    Array.isArray(prev) && prev.length > 0
        ? prev          // ← localStorage wins if ANY data exists
        : dbHistory     // ← Supabase only fills empty state
);
```

Consequences:
- A user opening `/chat` in the same browser always gets localStorage. Supabase writes are real but reads are ignored if localStorage is populated.
- A user on a new device/browser gets Supabase history correctly.
- The "active session" and the Supabase record can diverge. In-progress renames (via `prompt()`) only update localStorage; Supabase `title` updates are only sent in the PUT payload on the next AI response.

**"Refresh" button** in `ProjectsPanel` calls `fetchProjects()` → `GET /api/projects`. It exists because mutations (rename, delete) don't propagate back to the `ProjectsPanel` React state — no global event bus, no context invalidation. It's a manual workaround for missing state sync.

---

### 1.5 Component Tree

```
app/chat/page.tsx (all state lives here)
  ├── localStorage read/write (history, threads, activeId, memoryThreadByChatId)
  ├── Supabase hydration via GET /api/chat-threads (fills localStorage gaps)
  ├── handleHistoryAction()     ← "rename"/"move"/"archive"/"delete" on chats (old path)
  ├── handleProjectAction()     ← rename/delete projects (calls projectsClient.ts)
  ├── handleMoveChatToProject() ← calls POST /api/projects/move-chat + shows window.alert()
  │
  └── <Sidebar>
        ├── history[]           ← prop from page.tsx state
        ├── visibleHistory      ← computed from history filtered by projectThreadsMap
        ├── projectThreadsMap   ← fetched from GET /api/projects/threads-map
        ├── moveDialogOpen/threadId ← local state for dialog
        ├── handleMoveDialogMoved() ← fires onMoveChatToProject from page (duplicate write, see §2.5)
        │
        ├── [PROJECTS section]
        │     "New Project" btn → props.onNewProject() → page.tsx.onNewProject()
        │         → setShowProject(true) → renders local form (no API call, see §3.4)
        │
        │     <ProjectsPanel>
        │       fetchProjects() on mount → GET /api/projects
        │       "Refresh" button → refetch
        │       onSelectProject → setActiveProjectId (filters visibleHistory)
        │       onProjectAction → page.handleProjectAction (rename/delete via API)
        │
        └── [CHATS section]
              visibleHistory.map → chat buttons
              "…" menu → "Move to project" → handleMoveToProject(h.id)
                  → opens <MoveToProjectDialog threadId=h.id>

<MoveToProjectDialog>
  ├── fetchProjects() on open → GET /api/projects
  ├── [new project name input]  ← added 2026-07-01, calls POST /api/projects
  └── [existing projects select] ← calls POST /api/projects/move-chat
```

---

## 2. Root Causes

### RC-1: The `thread_id` / `chat_id` Column Split (Critical)

`chat_threads` has two separate text columns that hold the same logical value (the frontend chat UUID) but are written by different API routes:
- System A (`PUT /api/chat-threads`) writes to `chat_id`
- System B (`POST /api/projects`) writes to `thread_id`

The `threads-map` endpoint only reads `thread_id` and skips rows where it is null. After `move-chat` correctly updates `project_id` by matching `chat_id`, the row's `thread_id` remains null. The project filter therefore silently produces an empty set and falls back to showing all chats.

This is the single root cause of "moving a chat to a project doesn't work" — the move write succeeds but the read path ignores it.

### RC-2: Missing Unique Constraint on `(clerk_user_id, chat_id)` (Critical, Unconfirmed)

`PUT /api/chat-threads` upserts with `onConflict: "clerk_user_id,chat_id"`. The staging schema DDL contains no unique constraint or index on this pair. Without it, PostgREST either errors (and the client silently swallows it via `.catch(() => {})`) or inserts a new row on every call. This may be producing duplicate rows per chat that accumulate silently. Cannot confirm without querying the live DB — the staging schema may be incomplete.

**Canary check:** If `chat_threads` in production has more than 50 rows per user, or multiple rows with the same `chat_id`, RC-2 is confirmed.

### RC-3: `POST /api/projects` Creates Orphan Rows (High)

When `POST /api/projects` attaches a thread, it inserts a new row with `thread_id = threadId` and `chat_id = NULL`. This creates a second row for the same chat alongside the existing System A row. The two rows share the same UUID value but store it in different columns with no shared key. Row 2 is invisible to `GET /api/chat-threads` (which filters `NOT chat_id IS NULL`), but IS visible to `threads-map` (reads `thread_id`). The project filter works by coincidence — it matches the orphan row's `thread_id` against the authoritative row's history entry `h.id`. This "accidental match" breaks the moment either row's ID drifts (e.g., RC-2 causes duplicate rows).

### RC-4: `threads-map` Drops `chat_id`-Only Rows (High)

`GET /api/projects/threads-map` selects only `project_id, thread_id` and explicitly skips rows where `thread_id IS NULL`. Any chat whose project was assigned via `move-chat` (which updates by `chat_id`) is permanently invisible to the project filter.

```javascript
if (!pid || !tid) continue;  // silently drops the assignment
```

### RC-5: "New Project" Sidebar Form Is Local-State Only (Medium)

The `+ New` button in the Projects section calls `onNewProject()` → `setShowProject(true)` → renders a form that creates a local chat thread with title `"Project: ${name}"`. No API call is made. No row is inserted into `projects`. These "projects" are invisible to `ProjectsPanel`, `MoveToProjectDialog`, and any Supabase query. They are purely cosmetic chat title prefixes.

### RC-6: Double Write on Move (Medium)

When `MoveToProjectDialog` fires `onMoved(projectId)`, the Sidebar calls `onMoveChatToProject(threadId, projectId)`, which in turn calls `page.handleMoveChatToProject()`. That function calls `POST /api/projects/move-chat` a second time. For the "existing project" path in the dialog, `move-chat` is therefore called twice — once by the dialog, once by the page callback. The second call also fires `window.alert()` showing the raw API result, which is an unintended UX leak of internal state.

### RC-7: No FK Constraints or Cascades (Medium)

`chat_threads.project_id`, `memory_threads.project_id`, and `library_events.project_id` all reference `projects.id` with no declared FK. The `DELETE /api/projects/[id]` route manually deletes `chat_threads WHERE project_id = ?` before deleting the project row. If that step fails (or another code path deletes the project differently), `project_id` values in `chat_threads` become stale references to non-existent projects.

### RC-8: Tables Not in Migration System (Medium)

`chat_threads`, `projects`, `memory_threads`, and several others were created directly in the Supabase dashboard and are only approximated in `staging_base_schema.sql`. This means:
- No numbered migration can reference their exact column types with confidence
- Any schema drift between staging and production is invisible
- The staging reset process depends on a schema file that may be out of date

### RC-9: localStorage Wins Over Supabase on Hydration (Low/Behavioral)

The chat hydration logic ignores Supabase if localStorage has any data. Project assignments stored only in Supabase are never reflected in the sidebar for an active browser session. After a move, the user must refresh the page (losing localStorage) or use the manual "Refresh" button in ProjectsPanel to see updated project state.

### RC-10: Chat Delete Is Local-Only (Low/Behavioral)

`handleHistoryAction('delete')` removes the chat from `history[]` and `threads{}` state (and localStorage). It does NOT call any API to delete the row from `chat_threads` in Supabase. On next session, the deleted chat will re-appear from Supabase hydration if localStorage is cleared.

---

## 3. Patch vs. Rebuild Recommendation

### Verdict: Rebuild

The data model is structurally inconsistent in ways that interact. Each patch creates a new edge case. The full list of changes needed to patch:

| # | Patch required | Risk |
|---|----------------|------|
| P1 | `threads-map` must read `COALESCE(thread_id, chat_id)` instead of only `thread_id` | Safe but still leaves two-column chaos |
| P2 | `move-chat` must also set `chat_id` when updating by `chat_id` so the row is findable by both columns | Safe |
| P3 | Add unique constraint on `(clerk_user_id, chat_id)` to fix upsert behavior | Requires DB migration; may conflict with existing duplicate rows from RC-2 |
| P4 | `POST /api/projects` must upsert the existing row (by `chat_id`) rather than inserting an orphan | Changes semantics of the API; may break other callers |
| P5 | Remove double-fire of `move-chat` from `handleMoveChatToProject` in page.tsx | Safe |
| P6 | Wire `+ New` sidebar form to call `POST /api/projects` (or use new dialog) | Safe but now mixed with the local project form |
| P7 | `handleHistoryAction('delete')` must call `DELETE /api/chat-threads/:id` | New API route needed |
| P8 | ProjectsPanel must invalidate after rename/delete without requiring manual Refresh | Needs event bus or lifted state |
| P9 | LocalStorage hydration priority must be inverted (Supabase wins, localStorage is cache) | Behavioral change; requires session-level testing |
| P10 | Migrate all existing `chat_threads` rows to unify `thread_id` into `chat_id` | Data migration on live production; requires careful rollback plan |

P3 + P10 together are a live data migration on the production `chat_threads` table, which may have rows from RC-2 that require deduplication before the constraint can be added. This is dangerous without a tested migration script.

P9 is a behavioral inversion. Users who have localStorage-only history (never synced to Supabase) would lose chats if localStorage is treated as inferior. This requires a merge strategy, not a simple priority flip.

The combination of P3+P10 risk, P9 behavioral complexity, and the need to surgically repair a dual-column identity system while the table is live makes patching approximately as risky as a rebuild — but without the architectural clarity a rebuild would bring.

**A rebuild is recommended** because:
- The target data model (see §4) requires fewer total rows, no orphan rows, and no dual-column identity
- The rebuild can happen incrementally (new API routes, new component tree) behind a feature flag while the old system remains live
- The rebuild produces a foundation the team can actually reason about for future features (archiving, search, bulk move)

---

## 4. Proposed Target Data Model

This is a proposal only. No implementation yet.

### 4.1 Schema

```sql
-- migration 061_chat_projects_rebuild.sql

-- One unified identity per chat: id is the canonical key
-- No thread_id / chat_id split — the frontend generates the id before creation
CREATE TABLE IF NOT EXISTS chats (
  id              text PRIMARY KEY,           -- frontend uuid, e.g. "abc-123"; provided by client
  clerk_user_id   text NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE SET NULL,
  title           text,
  messages        jsonb NOT NULL DEFAULT '[]',
  memory_thread_id uuid REFERENCES memory_threads(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chats_user_idx ON chats(clerk_user_id);
CREATE INDEX IF NOT EXISTS chats_project_idx ON chats(project_id);

-- projects: add updated_at (missing in current schema)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
-- Add unique constraint so name dedup is reliable
CREATE UNIQUE INDEX IF NOT EXISTS projects_user_name_uq ON projects(clerk_user_id, name);
```

**Key decisions:**
- `chats.id` = the frontend's `uid()` (text), provided by the client — eliminates the `thread_id / chat_id` split entirely
- `project_id` is a real FK with `ON DELETE SET NULL` — deleted projects send chats to null (the logical "unsorted" state)
- No orphan rows: one row per chat, project assignment is a column on that row
- `memory_thread_id` FK ensures memory records aren't orphaned either

### 4.2 API Surface

```
GET  /api/v2/chats              → list chats (optional ?project_id=, ?limit=, ?offset=)
PUT  /api/v2/chats/:id          → upsert chat (create or update title, messages, memory_thread_id, project_id)
DELETE /api/v2/chats/:id        → delete chat (removes from DB, not just localStorage)

GET  /api/v2/projects           → list projects for user
POST /api/v2/projects           → create project (name only — no thread attachment)
PATCH /api/v2/projects/:id      → rename project
DELETE /api/v2/projects/:id     → delete project (ON DELETE SET NULL handles chats)
```

Single upsert endpoint for chats: `PUT /api/v2/chats/:id` handles all writes — content, title, project assignment. No separate "move-chat" endpoint needed. Project assignment is just a field on the chat upsert.

### 4.3 Frontend State Model

```
[Supabase is authoritative, localStorage is a read-through cache]

On mount:
  1. GET /api/v2/chats → hydrate sidebar + memory map
  2. Merge into localStorage (Supabase wins on conflict)

On new chat:
  - Generate uuid → PUT /api/v2/chats/:id {title, messages: []}

On AI response:
  - PUT /api/v2/chats/:id {title, messages, memory_thread_id} (fire-and-forget)
  - localStorage sync via useEffect watching [messages, activeId]

On project assign/move:
  - PUT /api/v2/chats/:id {project_id: newProjectId}
  - ProjectsPanel invalidates (or React Query cache key includes project_id)

On project create:
  - POST /api/v2/projects → refresh ProjectsPanel
  - Optionally pass project_id to the next PUT /api/v2/chats/:id

On delete chat:
  - DELETE /api/v2/chats/:id
  - Remove from localStorage
```

### 4.4 Migration Strategy (Existing Data)

1. Run migration 061 in staging → verify shape
2. Write a one-time backfill script:
   - For each `chat_threads` row with `chat_id IS NOT NULL`: insert into `chats` with `id = chat_id`
   - For each `chat_threads` row with `chat_id IS NULL AND thread_id IS NOT NULL`: insert into `chats` with `id = thread_id`
   - For deduplication where both columns appear: merge into single row, prefer non-null values
3. Run backfill on staging, validate counts
4. Ship new API routes (`/api/v2/`) alongside old ones (no deletion yet)
5. Cut frontend to new routes; keep old routes alive for 1 release cycle
6. After validation, deprecate old routes and old tables

---

## Appendix: Flagged Issues (Not Fixed in Map Phase)

| ID | File | Description |
|----|------|-------------|
| F-1 | `app/api/projects/[id]/route.ts` | Uses a local `getSupabase()` that calls `createClient` directly with service role key — inconsistent with the `getSupabase()` from `lib/supabaseServer.ts` used by other project routes. Two different Supabase client factories. |
| F-2 | `app/chat/page.tsx:2088` | `archive` action is `alert('Archive (coming soon)')` — this surface appears in the `handleHistoryAction` switch but is never wired to a menu item in the Sidebar (the Sidebar context menu only shows "Move to project" and "Delete"). Dead code path. |
| F-3 | `app/chat/page.tsx:2038` | Old `prompt()`-based move flow (`handleHistoryAction('move')`) remains in the codebase even though the Sidebar context menu no longer calls it. The Sidebar `…` menu calls `handleMoveToProject()` → `MoveToProjectDialog` now. The old flow is unreachable from UI but not removed. |
| F-4 | `app/components/ProjectsPanel.tsx:309` | Rename button text color `#eaf8f7` (nearly white on white background) makes "Rename project" invisible in the dropdown menu. |
| F-5 | `page.tsx:1957` `handleMoveChatToProject` | Fires `window.alert()` with raw API fields (`thread_id`, `project_id`, `mode`) — internal API shape exposed to user as a success notification. |
| F-6 | `page.tsx:newChat()` | `setHistory(h => [..., ...].slice(0, 20))` — history is capped at 20 items in localStorage. On the 21st chat, the oldest entry is silently evicted from the sidebar. Supabase retains up to 50. The cap is inconsistent across stores. |
| F-7 | `app/api/chat-threads/route.ts:97` | Comment says "This unique constraint must exist" for the `(clerk_user_id, chat_id)` upsert, but the staging DDL shows no such constraint. If it doesn't exist in production, every PUT inserts a new row and the `chat_threads` table may have many duplicates accumulating silently. |
| F-8 | `app/components/MoveToProjectDialog.tsx` | After my fix (2026-07-01), `onMoved` still fires `page.handleMoveChatToProject` which calls `move-chat` a second time for the "existing project" path. The double-write should be resolved when the dialog logic is audited post-fix. |
| F-9 | `staging_base_schema.sql` | The comment "NOT in the numbered migration files" applies to at minimum: `chat_threads`, `projects`, `memory_threads`, `library_events`, `user_answers`, `buyer_evaluation_sessions`, `white_label_partners`. Schema drift between staging and production is undetectable without direct DB inspection. |
| F-10 | `app/chat/page.tsx:2092` | `handleHistoryAction('delete')` removes from local state only. No API call deletes the Supabase row. Deleted chats resurface on fresh login. |
