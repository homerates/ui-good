# HomeRates.ai — UI Project Structure & Auth Wiring
**Snapshot Date:** 2025-11-02 20:17:41

This document captures the current app structure, key files, routing, and auth/middleware plumbing so we always edit the correct file and avoid regressions. Treat this as the living “source of truth” and update when we add/rename routes or move layout responsibilities.

---

## 1) Repo & Branch
- **Repo:** `homerates/ui-good`
- **Active branch (auth work):** `fix/sidebar-search-login`
- **Recent notable commits:**
  - `0c4b2f4` — auth: add sign-in/sign-up routes
  - `a666284` — auth: protect non-public routes (optional)
  - `976d2be` — clerk: wrap app with ClerkProvider
  - `950963c` — nav: update bottom button text to Dashboard
  - `b987f0b` — nav: update bottom button text to Dashboard

---

## 2) Runtime & Tooling
- **Next.js:** 15.5.5 (per local build logs)
- **TypeScript:** enabled (tsc in prepush)
- **Pre-push:** `node tools/preflight.mjs && npx tsc --noEmit && next build`
- **Safe-ship (single file):**
  ```powershell
  git add <path\to\changed-file>
  npm run build
  git commit -m "chore: targeted change - <short description>"
  git push
  ```

---

## 3) App Router: File & Route Map
```
app/
  layout.tsx                ← Global shell (ClerkProvider, <html>, <body>); may host 2-col grid
  page.tsx                  ← Home route “/” (often renders chat/main column)
  globals.css               ← Global styles

  components/
    Sidebar.tsx             ← The ONLY sidebar component we edit

  profile/
    page.tsx                ← “/profile” (temporary target after login)

  sign-in/
    [[...sign-in]]/
      page.tsx              ← Clerk Sign-In route (dynamic)

  sign-up/
    [[...sign-up]]/
      page.tsx              ← Clerk Sign-Up route (dynamic)
```

**URL mapping:**
- `/` → `app/page.tsx`
- `/profile` → `app/profile/page.tsx`
- `/sign-in` → `app/sign-in/[[...sign-in]]/page.tsx`
- `/sign-up` → `app/sign-up/[[...sign-up]]/page.tsx`

---

## 4) Auth (Clerk v5) Plumbing
### 4.1 Provider
- **File:** `app/layout.tsx`
- **Contract:** Wraps the entire app with `<ClerkProvider> … {children} … </ClerkProvider>`
- Keep footer/timestamp/version as-is; no extra header UI here.

### 4.2 Routes
- **Sign-In:** `app/sign-in/[[...sign-in]]/page.tsx`
  ```tsx
  import { SignIn } from "@clerk/nextjs";
  export default function Page(){ return <SignIn /> }
  ```
- **Sign-Up:** `app/sign-up/[[...sign-up]]/page.tsx`
  ```tsx
  import { SignUp } from "@clerk/nextjs";
  export default function Page(){ return <SignUp /> }
  ```

### 4.3 Middleware
- **File:** `/middleware.ts`
- **Contract (Clerk v5):**
  ```ts
  import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

  const isPublic = createRouteMatcher([
    "/", "/sign-in(.*)", "/sign-up(.*)", "/api/health",
    "/_next(.*)", "/favicon.ico",
  ]);

  export default clerkMiddleware(async (auth, req) => {
    if (isPublic(req)) return;
    await auth.protect();
  });

  export const config = { matcher: ["/((?!_next|.*\\..*).*)"] };
  ```

### 4.4 Environment
- **Local:** `.env.local`
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_…`
  - `CLERK_SECRET_KEY=sk_…`
- **Vercel (Preview & Prod):** same two keys set in Project Settings → Environment Variables.

---

## 5) Layout Pattern (Two-Column)
You can host the two-column grid either globally (layout) or per-page.

### Option A — Global (recommended for consistent behavior)
- **File:** `app/layout.tsx`
- **Wrapper:**
  ```tsx
  <div className="min-h-[100dvh] overflow-x-hidden">
    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] min-h-[100dvh]">
      {/* <Sidebar … /> */}
      <div className="h-[100dvh] overflow-y-auto">{children}</div>
    </div>
  </div>
  ```

### Option B — Per Page (e.g., only on `/`)
- **File:** `app/page.tsx`
- **Wrapper:**
  ```tsx
  <div className="min-h-[100dvh] overflow-x-hidden">
    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] min-h-[100dvh]">
      {/* <Sidebar … /> */}
      <main className="h-[100dvh] overflow-y-auto">{/* content */}</main>
    </div>
  </div>
  ```

**Rules of thumb:**
- `overflow-x-hidden` on the outer wrapper to prevent horizontal scroll.
- Sidebar and main each own vertical scroll with `h-[100dvh] overflow-y-auto`.

---

## 6) Sidebar Contract (Single Source of Truth)
- **File:** `app/components/Sidebar.tsx`
- **Known-good behavior:**
  - Sticky header and pinned sticky footer
  - Independent vertical scroll: `h-[100dvh] overflow-y-auto`
  - Footer shows Clerk avatar + name/email when signed in; Login button when signed out
  - History list + kebab menu; quick actions (New, Search, Library, New Project)
- **Do not duplicate Sidebar in other folders**; all edits here only.

---

## 7) Chat UX Notes (Main Column)
- **Auto-scroll to latest message:**
  ```tsx
  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages]);
  // … later in render:
  <div className="flex-1 overflow-y-auto scroll-smooth">
    {messages.map(/* … */)}
    <div ref={bottomRef} />
  </div>
  ```

---

## 8) Editing Rules (so we never touch the wrong file)
1. Sidebar visuals/behavior → **`app/components/Sidebar.tsx`** only.
2. Auth UI pages → **`app/sign-in/[[...sign-in]]/page.tsx`**, **`app/sign-up/[[...sign-up]]/page.tsx`**.
3. Protect/allow routes → **`/middleware.ts`**.
4. Global shell / ClerkProvider / 2-col grid → **`app/layout.tsx`**.
5. Chat behaviors (auto-scroll, message list) → **`app/page.tsx`**.

---

## 9) Deployment Notes
- **Branch**: `fix/sidebar-search-login` is ahead containing the Clerk wiring and Sidebar fixes.
- **Vercel**: pushes to this branch trigger Preview deploys; merge to `main` for Production.
- **Rollback**: revert single files with `git checkout <sha> -- <file>` to recover known-good states.

---

## 10) Open TODOs / Decisions
- Decide whether the 2-col grid lives in `layout.tsx` (global) or `page.tsx` (home only).
- Profile page content (currently minimal); add real user profile or redirect to future dashboard.
- Finalize Sidebar color tokens (`--sidebar-bg`, `--sidebar-fg`, `--border`) to match brand fully.
- Add chat auto-scroll (if not already) and ensure main column always keeps newest content in view.

---

## Appendix: Quick Verification Checks
- `ClerkProvider` is present in `app/layout.tsx`.
- `/sign-in` and `/sign-up` render without errors.
- `middleware.ts` calls `await auth.protect()` for non-public routes.
- Sidebar footer shows avatar + name/email when signed in.
- No horizontal scroll; both columns scroll vertically and independently.
