# NAVIGATION_SPEC.md — HomeRates.AI

> **This is the governance document for all navigation and chrome surfaces.**
> Derived from a direct audit of the live codebase (2026-06-30). Treat every
> section marked **HARD RULE** as a pre-implementation checklist item, not a
> suggestion. See §8 for the numbered invariants.
>
> **Companion docs** — do not duplicate, cross-reference:
> - `SHELL_MIGRATION_PLAN.md` — how we got here (staged sequence, revert anchors)
> - `ARCHITECTURE_DECISIONS.md` — settled design decisions (AD-1 through AD-10)
> - `BRAND.md` — marketplace placement rules (R1–R5)

---

## 1. Purpose & Scope

This document specifies:

- The **single source of truth** for all nav items and how every surface must
  read from it.
- The **consumer vs pro tier boundary** — how it is detected, how it is
  expressed, and where it must never leak into component forks.
- The **shell architecture** — `AppShell`, route-group layouts, chrome modes,
  and which pages use each.
- The **chat standalone exception** — why `/chat` will never join the shell and
  what that means for its nav.
- The **intent group taxonomy** — the five groups every nav item belongs to.
- **Post-login routing** — where each user tier lands on sign-up and login.
- **Hard rules and change protocol** — the check-against list for every future
  nav change.
- **Known divergences** — what is not yet compliant and what needs fixing.

Any file, PR, or session that touches navigation, menus, nav-config, AppShell,
route groups, or tier-routing MUST check against this document before proceeding
(CLAUDE.md tripwire enforces this — see §8).

---

## 2. Single Source of Truth — `lib/nav-config.ts`

### 2.1 The authority rule

`lib/nav-config.ts` is the **only** place nav items are defined. Every menu
surface — desktop top bar, full-screen drawer, chat sidebar, chat right-panel —
must render by **filtering** this array. No surface may maintain its own static
list of links.

Import path (verified in tsconfig `@/*` → `lib/*`):

```ts
import { NAV_ITEMS, topBarItems, type NavItem, type NavMode } from '@/nav-config';
```

### 2.2 NavItem shape (audited from `lib/nav-config.ts`)

```ts
export interface NavItem {
  id:           string;
  href:         string;
  label:        string;
  labelByMode?: Partial<Record<NavMode, string>>;  // per-tier label override
  icon:         string;                            // emoji
  group:        NavGroup;                          // 'decide'|'tools'|'mine'|'learn'|'account'
  modes:        NavMode[];                         // ['consumer']|['pro']|['consumer','pro']
  surfaces:     NavSurface[];                      // 'desktop'|'drawer'|'chatPanel'
  proBadge?:    boolean;                           // renders gold ⭐ Pro pill
  adminOnly?:   boolean;                           // gated by useAdminStatus()
  footer?:      boolean;                           // appears in drawer footer, not intent body
  subLabel?:    string;                            // secondary line in full-width drawers
}

export type NavMode    = 'consumer' | 'pro';
export type NavGroup   = 'decide' | 'tools' | 'mine' | 'learn' | 'account';
export type NavSurface = 'desktop' | 'drawer' | 'chatPanel';
```

Key behavioural notes:
- `labelByMode` — render `item.labelByMode?.[mode] ?? item.label`. Example:
  `library` has `{ pro: 'My Vault', consumer: 'My Library' }`.
- `footer: true` — item goes in the drawer footer section (Profile, Support,
  Settings, Sign Out, Admin), NOT in the intent groups.
- `adminOnly: true` — skip unless `useAdminStatus().isAdmin`.
- `id === 'sign-out'` — renderer must issue `<SignOutButton>` not `<Link>`.

### 2.3 Top-bar selector (`TOP_BAR_IDS` + `topBarItems`)

The top bar is an explicit whitelist, not a filtered group. Defined in
`lib/nav-config.ts`:

```ts
export const TOP_BAR_IDS: Record<NavMode, string[]> = {
  consumer: ['my-home', 'chat', 'market-intelligence', 'dashboard'],
  pro:      ['chat', 'market-intelligence', 'dashboard'],
};

export function topBarItems(mode: NavMode): NavItem[] {
  return TOP_BAR_IDS[mode]
    .map(id => NAV_ITEMS.find(i => i.id === id))
    .filter((i): i is NavItem => i !== undefined);
}
```

Consumer top bar: My Home · Chat · Market Rates · Dashboard  
Pro top bar: Chat · Market Rates · Dashboard

---

## 3. Consumer vs Pro Tier Model

### 3.1 The structural boundary (AD-6)

Consumer and Pro are **different products**, not one product with a toggle. The
structural expression of this boundary is the **Next.js route group** — pages
that belong to a single tier live inside `(consumer)/` or `(pro)/` and inherit
their shell automatically via `layout.tsx`.

Pages that serve both tiers, or that pre-date the route-group migration, detect
tier at **runtime** via `useConsumerMode()`.

### 3.2 `useConsumerMode()` — the runtime resolver

File: `lib/useConsumerMode.ts`

Two signals, evaluated on mount (SSR starts as `false`):

| Signal | Consumer | Pro |
|--------|----------|-----|
| Hostname | `homerates.ai` or `www.homerates.ai` | `chat.homerates.ai` |
| Supabase role (from `/api/profile`) | `borrower` | `lo` or `agent` |

**Role overrides hostname.** A borrower who lands on `chat.homerates.ai` via a
direct link gets consumer chrome. An LO on `homerates.ai` stays pro.

Unauthenticated users → hostname is the only signal (role fetch returns nothing
meaningful, hook keeps hostname result).

### 3.3 Tier expression rule — config filtering, never forks

**HARD RULE:** Tier differences are expressed exclusively by filtering
`NAV_ITEMS` on `i.modes.includes(mode)`. Do not create separate component files
or duplicate JSX blocks per tier. Do not fork pages at the file level for
tier-specific nav.

Correct pattern:
```ts
const items = NAV_ITEMS.filter(i => i.modes.includes(mode) && i.surfaces.includes('drawer'));
```

Incorrect pattern (do not do):
```tsx
{isConsumer ? <ConsumerLinks /> : <ProLinks />}  // hardcoded forked lists
```

---

## 4. The Shell — AppShell

### 4.1 Component signature (audited from `app/components/AppShell.tsx`)

```ts
export interface AppShellProps {
  mode:     NavMode;
  chrome?:  'full' | 'minimal';   // default: 'full'
  children: React.ReactNode;
}
```

AppShell is the **only** component that owns page-level chrome for route-group
pages. It renders entirely from nav-config; no hardcoded links exist inside it.

### 4.2 Chrome modes

| Mode | What renders |
|------|-------------|
| `'full'` (default) | Sticky header (logo + top bar + hamburger) · right-slide drawer · page footer with LegalLinks |
| `'minimal'` | Sticky header (logo + "→ Back to App" for signed-in users only) · no drawer · no footer |

`minimal` is for onboarding/auth flows where full nav is distracting.

### 4.3 Drawer rendering (verified in AppShell.tsx)

```ts
// Intent items (body of drawer)
const intentItems = NAV_ITEMS.filter(i =>
  i.modes.includes(mode) && i.surfaces.includes('drawer') && !i.footer
);

// Footer items (bottom of drawer)
const footerItems = NAV_ITEMS.filter(i =>
  i.modes.includes(mode) && i.surfaces.includes('drawer') && i.footer
);

// Groups rendered in order
const GROUP_ORDER: NavGroup[] = ['decide', 'tools', 'mine', 'learn'];
```

Group label map: `decide → 'Decide'`, `tools → 'Tools'`, `mine → 'Mine'`,
`learn → 'Learn'`, `account → 'Account'`.

Admin items (`adminOnly: true`) are hidden unless `isAdmin` from
`useAdminStatus()`.

### 4.4 Route-group layouts (audited)

```
app/(consumer)/layout.tsx  →  <AppShell mode="consumer">{children}</AppShell>
app/(pro)/layout.tsx        →  <AppShell mode="pro">{children}</AppShell>
```

Layouts are intentionally trivial. All logic lives in AppShell + nav-config.

### 4.5 CSS interaction warning

AppShell injects:
```css
body:has(.ash-root) { display: block !important; height: auto !important; overflow: visible !important; }
html:has(.ash-root) { height: auto !important; overflow: visible !important; }
```

This overrides `globals.css`'s `html,body { height: 100%; overflow: hidden }`.
**This is why `/chat` cannot use AppShell.** See §7.

### 4.6 Pages confirmed in each route group (audited 2026-06-30)

**`(consumer)/`**: ami-qualifier · check-property · dashboard · library ·
loan-limits · messages · my-home · settings · track5

**`(pro)/`**: *(empty — layout.tsx exists but no pages have migrated in yet)*

All other app pages are **standalone** (no route-group shell, own their own
chrome via AppNav or bespoke headers). See §11 (Known Divergences).

---

## 5. Intent Groups

Every nav item belongs to exactly one group. Groups appear in this fixed order
in all drawers: **Decide → Tools → Mine → Learn**. Footer items (Account group)
appear below a divider at the bottom of every drawer, independent of intent
order.

| Group | Purpose | Representative items |
|-------|---------|---------------------|
| **Decide** | Primary user journeys — research and decision surfaces | Chat, Market Rates, My Home, Property Lookup, Level 5, Home Value |
| **Tools** | Calculators and data utilities | Rate Engine, AMI Qualifier, Loan Limits, Calculators |
| **Mine** | Personal records and workspace | My Library/Vault, Messages, Dashboard, Deal Rooms, My Scenario, Investor Portal |
| **Learn** | Content and education | HomeRates Lab, Knowledge Hub, Platform Intelligence, Market News |
| **Account** (`footer: true`) | Auth and account management | My Profile, Support, Settings, Sign Out, Admin |

---

## 6. Post-Login Landing

Verified in `app/welcome/page.tsx` (handles both new-user onboarding and
returning-user redirect):

```ts
// Returning user with existing role:
window.location.replace(role === 'borrower' ? '/my-home' : '/dashboard');

// New user completing role selection:
window.location.href = type === 'borrower' ? '/my-home' : '/dashboard';
```

| Role | Landing page | Shell at landing |
|------|-------------|-----------------|
| `borrower` | `/my-home` | `(consumer)` AppShell, full chrome |
| `lo` / `agent` | `/dashboard` | `(consumer)` AppShell (AD-9: dashboard is in consumer group), full chrome |

**AD-9 note:** `/dashboard` sits in the `(consumer)` route group and uses
consumer AppShell chrome, but its page content is role-differentiated server-side
(borrower sees scenario status; LO sees pipeline). This is the one established
exception to AD-6's consumer/pro route-group boundary.

---

## 7. Documented Exceptions

Exceptions to the AppShell/nav-config pattern require an Architecture Decision
entry in `ARCHITECTURE_DECISIONS.md`. No exception may be silent.

### Exception 1 — `/chat` standalone chrome (AD-10, permanent)

**What:** `/chat` owns its own header, sidebar, and right panel. It does not use
AppShell. It will never be moved into `(consumer)` or `(pro)`.

**Why (two hard incompatibilities, audited):**

1. AppShell's `body:has(.ash-root)` CSS override releases `overflow:hidden` on
   the body. Chat's scroll model requires `html,body { height:100%; overflow:hidden }`
   so only the `.scroll` flex child scrolls. Removing that collapses scroll and
   breaks auto-scroll-to-bottom.

2. AppShell's `.ash-root { min-height:100vh }` wraps chat's
   `<section style={{minHeight:'100dvh'}}>`. The two stack to ~200dvh, making the
   page document-scrollable and unpinning the mobile fixed composer.

**How chat nav is governed:**
- Consumer hamburger (`ConsumerNav → AppNav drawerOnly, consumer=true`) — see §11 divergence note.
- Pro left sidebar (`Sidebar.tsx`) — nav-config driven as of commit `77d31530`.
- Pro right panel — nav-config driven as of commit `db022c91`.
- Chat header top-bar links — currently hardcoded (see §11 divergence D-3).
- `useConsumerMode()` is imported in chat and drives consumer/pro branching throughout.

**Enforcement:** Any session proposing to wrap `/chat` in AppShell or move it
into a route group must be rejected and pointed to AD-10.

### Exception 2 — `/dashboard` in `(consumer)` group for both roles (AD-9)

Described in §6 above. Both borrowers and LO/agents land at `/dashboard` which
renders under the consumer AppShell. Page content differentiates by server-side
role check; the shell does not branch.

---

## 8. Invariants / Hard Rules

These are the numbered check-against items. Verify each before implementing any
nav change.

**I-1. nav-config is the only source of links.**
No menu surface may define its own static array of nav items. All links come
from `NAV_ITEMS` in `lib/nav-config.ts`, filtered by `modes` and `surfaces`.

**I-2. No mode forks at the component level.**
Consumer vs pro differences in nav are expressed via `i.modes.includes(mode)`
filtering, never via `{isConsumer ? <A/> : <B/>}` with different link sets.

**I-3. Label, icon, and route changes happen in nav-config only.**
If a nav item's label, icon, href, or group must change, the change is made in
`lib/nav-config.ts`. Surfaces pick it up automatically on next render. Do not
patch individual surfaces.

**I-4. No undocumented exceptions to AppShell.**
If a page cannot use AppShell, an AD entry is required. The AD must name the
root cause, not just assert the exception.

**I-5. `(pro)` route group is for pro-only pages.**
Pages whose content is exclusively for LO/agent users belong in `(pro)/`.
Pages that serve both tiers, or that need runtime detection, stay outside both
groups and use `useConsumerMode()`.

**I-6. New surfaces filter, not re-list.**
When adding a new nav surface (e.g., a settings sidebar, a mobile tab bar),
implement it by filtering `NAV_ITEMS` — define a new `NavSurface` value if
needed and tag items in nav-config. Do not copy-paste an item list into the new
surface.

**I-7. Tier routing is role-based, not assumption-based.**
Post-login routing must read the actual Supabase role. Do not infer role from
URL, email, or any client-side heuristic.

**I-8. Admin items use `adminOnly: true` in nav-config.**
Admin-gated links must not be hardcoded in individual surfaces. Tag the item
`adminOnly: true` in nav-config; AppShell and all compliant surfaces gate on
`useAdminStatus()`.

**I-9. `proBadge` is set in nav-config, not in surface JSX.**
The gold ⭐ Pro badge on Deal Rooms must not be hardcoded in individual
surfaces. It comes from `item.proBadge === true`. If a surface renders a Pro
badge, it must be reading this field.

**I-10. Any new NavSurface or NavGroup must be defined in nav-config.ts.**
Do not invent surface or group strings locally. Add the literal type to
`NavSurface` or `NavGroup` in nav-config and update this spec.

---

## 9. Change Protocol

### 9.1 Adding or changing a nav item

1. Edit `lib/nav-config.ts` — add or update the `NavItem` entry.
2. If the item needs a new surface tag, add the literal to `NavSurface` and
   tag any other items that should also appear on that surface.
3. Run `npx tsc --noEmit` — confirm zero errors.
4. Push to `dev`. Check the Vercel preview in **both consumer and pro modes**
   (switch hostname or role) and verify the item appears in all expected
   surfaces and is absent from surfaces where it should not appear.
5. Confirm no existing surfaces have drifted (check AppShell drawer, chat
   Sidebar, chat right panel).

### 9.2 Adding a new page to a route group

1. Create the page file inside `app/(consumer)/` or `app/(pro)/` as
   appropriate.
2. Verify the page renders inside AppShell chrome (logo, top bar, drawer work).
3. If the page needs a nav entry, follow §9.1 first — add the item in
   nav-config with the correct `modes` and `surfaces` before the page goes live.
4. Test: navigate to the page as both a borrower and an LO and confirm the
   correct chrome is shown.

### 9.3 Adding a new exception (page that cannot use AppShell)

1. Identify and document the root cause (not just "it doesn't work").
2. Add an AD entry to `ARCHITECTURE_DECISIONS.md` with: what, why, and
   what the page uses instead.
3. Add the exception to §7 of this document.
4. If the page has its own drawer/nav panel, it MUST still filter `NAV_ITEMS`
   for that panel — the exception is to AppShell only, not to nav-config.

### 9.4 Preview verification checklist

After any nav change, verify on Vercel preview:
- [ ] Consumer mode: top bar shows `My Home · Chat · Market Rates · Dashboard`
- [ ] Pro mode: top bar shows `Chat · Market Rates · Dashboard`
- [ ] Consumer drawer: Decide / Tools / Mine / Learn groups present, no pro-only items
- [ ] Pro drawer: all four groups present, Deal Rooms shows ⭐ Pro, Admin hidden for non-admin
- [ ] Chat `/chat`: consumer hamburger opens correct consumer drawer; pro sidebar and right panel show correct items
- [ ] `/chat` scroll and mobile composer still work (AppShell body-overflow not introduced)
- [ ] New page (if any) shows correct chrome for both roles

---

## 10. Known Divergences / Open Items

These are places where the actual code does not yet match the rules in this
spec. They are tracked here — not silently normalized — so they can be
addressed in priority order.

### D-1 — `AppNav.tsx` still uses hardcoded drawer arrays (NOT nav-config)

**What:** `app/components/AppNav.tsx` defines two hardcoded arrays —
`NAV_LINKS` (5 pro desktop items) and `CONSUMER_NAV_LINKS` (4 consumer desktop
items) — and builds its consumer and professional drawers from hardcoded JSX
blocks, NOT from `NAV_ITEMS`.

**Where it's used:**
- Standalone pages not yet in a route group (pages that still call `<AppNav />`
  directly).
- The consumer hamburger in `/chat` (`ConsumerNav → AppNav(drawerOnly, consumer=true)`).

**Impact:** The AppNav consumer drawer has different item labels and groupings
than nav-config (e.g., "My Account" vs "Decide", "Resources" vs "Tools/Learn").
Items added to nav-config do not automatically appear in AppNav drawers.

**Resolution:** Migrate AppNav drawer render to filter `NAV_ITEMS`, same as
AppShell. Long term: once all pages are in route groups, AppNav is deprecated
entirely and its drawerOnly mode is replaced by a thin wrapper that uses the
AppShell drawer component.

### D-2 — `(pro)` route group has no pages

**What:** `app/(pro)/layout.tsx` exists and is wired correctly
(`<AppShell mode="pro">`), but **no pages live inside `(pro)/`**. The pro
shell migration has not started.

**Impact:** Pro users (LO/agent) on pages like `/lab`, `/deal-rooms`,
`/investor`, `/compare`, etc., get whatever chrome those pages provide
individually (usually AppNav), not the AppShell pro layout.

**Resolution:** Migrate pro-only pages into `(pro)/` in priority order. Low
risk — the layout is ready; only page moves required. Candidate first pages:
`/lab`, `/deal-rooms`, `/investor`.

### D-3 — Chat header top-bar links are hardcoded

**What:** The horizontal nav links inside the `/chat` header (above the message
area) are hardcoded inline in `app/chat/page.tsx` around line 3895–3902.

Consumer mode renders: Home · New Chat (button) · Scenario (button) · Property Lookup (button)  
Pro mode renders: Home · Scenario Engine (button) · HomeRates Lab (link) · My Vault (link)

These do not read from nav-config.

**Impact:** Label/route changes made in nav-config are NOT reflected in the
chat header. These must be updated manually in parallel with nav-config edits.

**Resolution:** The chat header is exempt from AppShell (AD-10) but not from
nav-config. Refactor the header nav to filter `NAV_ITEMS` by
`surfaces.includes('chatPanel')` for the top bar, similar to how the right
panel was updated in `db022c91`. Note: some items are in-chat actions (e.g.,
`newChat()`, `setPropertyLookupMode(true)`) that have no `href` — these may
need a new field (e.g., `chatAction?: string`) in `NavItem`, or kept as
special-cased buttons alongside the nav-config-driven links.

### D-4 — AppNav consumer drawer groups do not match nav-config group taxonomy

**What:** AppNav's consumer drawer renders items under "My Account" and
"Resources" section labels. Nav-config uses "Decide", "Tools", "Mine", "Learn".
The item sets also differ (AppNav consumer drawer is missing some items present
in nav-config for consumer/drawer, e.g., `home-value`, and has different order).

**Resolution:** Subsumed by D-1. Fixed when AppNav drawer is rewritten to
filter `NAV_ITEMS`.

### D-5 — AppNav pro drawer group structure mismatches nav-config

**What:** AppNav's pro drawer groups items under unlabeled Primary, "Tools",
and "Account" sections. Nav-config uses Decide / Tools / Mine / Learn.
Specifically: "Deal Rooms" is under AppNav's "Account" group; nav-config has it
under "mine". "Investor Portal" is in AppNav under "Tools"; nav-config has it
under "mine" with `surfaces: ['drawer']` only (not `chatPanel`).

**Resolution:** Subsumed by D-1. Fixed when AppNav drawer is rewritten to
filter `NAV_ITEMS`.
