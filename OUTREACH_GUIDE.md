# OUTREACH_GUIDE.md — Master Outreach & Invite Reference

**Last audited:** 2026-07-20 (full codebase pass — every mechanism below was traced to its actual route/table/migration, not inferred from naming).
**Status:** This is the master, single source of truth for every way a person can be brought onto HomeRates.ai or connected to another party on the platform. `/admin/outreach` (the CSV-blast tool) is only ONE of fourteen distinct mechanisms documented here — it is not a hub for the others.
**Keep this updated:** Any time a new invite/outreach mechanism is added, or an existing one's table/route/token scheme changes, update the relevant section below **and** the Quick Index table. If you're not sure whether something counts as "outreach," it belongs here if it (a) brings a new person onto the platform, (b) connects two existing accounts, or (c) sends an email/link to someone outside their own session.

---

## Quick Index

| # | Mechanism | Audience | Who triggers | Link pattern | Table | Expires? |
|---|---|---|---|---|---|---|
| 1 | Admin CSV outreach blast | Consumer or LO (manual list) | Admin | `/chat?sq=` (no token) | — (Loops only, no local log) | n/a |
| 2 | Consumer invite | Consumer/borrower | Admin | `/chat?invite=<hex24>` | `consumer_invites` | 7 days (auto-refreshed by cron) |
| 3 | LO → borrower invite | Consumer/borrower | Any LO or agent | `/join?invite=<code>` | `invite_codes` | optional, LO-set |
| 4 | Referral program | Anyone | Any signed-in user | `/r/[slug]` (slug = referral_code) | `users.referral_code` | never |
| 5 | Newsletter | Public subscribers | Public (subscribe) / Admin+cron (send) | n/a (email list) | `newsletter_subscribers`, `newsletter_sends` | never |
| 6 | Share / shorten | Anyone (virality, not acquisition) | Anyone | `/s/[slug]` | `shared_threads`, `short_links` | never |
| 7 | Founding 500 waitlist | LO / agent | Public (apply) / Admin (invite wave) / Auth (claim) | `/welcome` (email-matched, no token) | `pro_waitlist` | 72h invite |
| 8 | Founding urgency blast | LO / agent (existing founding members) | Admin (manual) / auto at 450 & 490 | — (retention email, not acquisition) | reads `pro_waitlist` | n/a |
| 9 | Pilots & Agent Pilots | LO (pilots) / Agent (agent-pilots) | Admin | `/pilot/[slug]` / `/agent-pilot/[slug]` | `company_pilots` (`pilot_type` column) | never |
| 10 | Professional Directory invite-to-claim | LO / agent (pre-seeded NMLS/DRE listing) | Any signed-in user, or Admin | `/professionals/claim/[id]` | `pro_directory`, `pro_invitations` | 7-day resend cooldown only |
| 11 | Brokerage self-serve | LO (team members) | Brokerage owner | `/join/[token]` | `brokerages.invite_token` | never (rotatable) |
| 12 | Corporate Invite + Org Nomination | Brokerage / enterprise org | Admin (invite) / any user (nominate) | `/org/claim/[token]` | `corporate_invitations`, `org_nominations` | never (no expiry checked) |
| 13 | Marketplace Lender invite | Institutional lender | Admin | `/lender-portal/[token]` (no Clerk auth) | `marketplace_lenders` | never |
| 14 | Deal Room collaborator invite | Buyer / LO / agent (one specific deal) | Deal room creator | `/deal-rooms/join?token=<uuid>` | `deal_room_members` | never, single-use per role slot |
| 15 | Scenario invite/respond | Borrower ↔ LO/agent (contact reveal) | Borrower selects a responder | none — same-session API action | `scenario_invites`, `scenario_responses` | n/a |

Not an invite mechanism, despite adjacency: **White-label partner branding** (`/admin/white-label`) — pure CRUD for partner theming (logo/colors/tagline), no email, no token, no claim flow. Listed in §5.2 only to rule it out explicitly.

---

## 1. Admin-Authorization Systems — read this first

**Three different, non-interchangeable "is this user an admin?" checks exist in the codebase.** A person granted admin one way is not automatically recognized by the other two. Know which one gates the mechanism you're using before assuming access.

| Check | Source of truth | Used by |
|---|---|---|
| **Canonical** — `lib/adminAuth.ts` (`requireAdmin()` / `isAdminId()`) | `admin_users` table + hardcoded `BOOTSTRAP_ADMIN_IDS` fallback (always includes Rayaan's Production Clerk ID), 5-min in-memory cache | Marketplace Lenders, `/admin/directory`, `/api/admin/white-label`, client-side `useAdminStatus()` hook (→ `/api/admin/check`) |
| **Re-implemented, same table** — local `isAdmin()` in `app/api/admin/corporate-invite/route.ts` | `admin_users` table directly, **no** `BOOTSTRAP_ADMIN_IDS` fallback | Corporate Invite only |
| **Different table entirely** — local `requireAdmin()` duplicated in `app/api/admin/pilots/*` and `app/api/admin/agent-pilots/*` | `users.role === 'admin'` column | Pilots, Agent Pilots (list/CRUD/bulk/invite, all 6 routes) |

**Operational risk:** admins are managed via `/admin → Manage Admins`, which (per `lib/adminAuth.ts`'s own comment) writes to `admin_users`. Someone added that way can manage the Directory and Marketplace Lenders but **cannot** manage Pilots/Agent Pilots unless they also happen to have `users.role='admin'` set (not verified anywhere how/whether that column is currently kept in sync). This should be reconciled to one check — flagged in §8.

---

## 2. Consumer / Borrower Outreach

### 2.1 Admin CSV Outreach Blast
- **What it is:** the tool actually living at `/admin/outreach` — upload/paste a Name+Email list, pick audience (LO or Consumer), and it fires an immediate templated "3 questions" email to everyone on the list via Resend, plus adds them to Loops CRM.
- **Who can trigger:** Admin only (canonical check, `useAdminStatus` client-side + `requireAdmin()` server-side).
- **UI:** `app/admin/outreach/page.tsx`.
- **API:** `POST /api/admin/loops-import`.
- **Delivery:** Resend (from `HomeRates.ai <digest@mail.homerates.ai>`), rate-limited ~1/120ms; Loops add is best-effort/fire-and-forget, tagged `source: "admin-outreach-import"`.
- **Link:** no invite token at all — email links directly to `https://chat.homerates.ai/chat?sq=<encoded question>`, which auto-fires that question through the AI chat on load. No auth, no account creation, no credit grant.
- **DB:** nothing persisted locally for the send itself — no send-log table. Only Loops (external) retains the contact.
- **Automation:** none — manual, on-demand only.

### 2.2 Consumer Invite (admin bulk + weekly reminder cron)
- **What it is:** the "invite a named person with a credit grant" tool — this is the mechanism behind the "1,258 invites sent 2026-06-08, 25 credits each" note in project memory; the code structurally corroborates the memory (`source DEFAULT 'bulk_2026-06-08'`, `credits DEFAULT 25` on the table) though the literal count would need a live DB query to confirm.
- **Who can trigger creation:** Admin only (canonical check). No dedicated page — a form embedded in `app/admin/page.tsx` (email, full name, phone, credits, personal note, sender name).
- **Who can claim:** any authenticated Clerk user.
- **API:** `POST /api/admin/consumer-invite` (create/refresh), `POST /api/invite/claim` (claim), `POST /api/cron/consumer-invite-reminder` (also `GET`, weekly sweep).
- **Delivery:** Resend (`emailConsumerInvite` / `emailConsumerInviteReminder`).
- **Link/token:** `randomBytes(24).toString("hex")` (48-char hex). Lands at **`/chat?invite=<token>`** (not `/join`). If the visitor isn't signed in, `app/chat/page.tsx` stashes the token in `localStorage.pendingConsumerInvite`, then auto-claims via `POST /api/invite/claim` once `isSignedIn` flips true.
- **Expiry:** 7 days (`expires_at`), enforced on claim (410 if expired).
- **DB:** `consumer_invites` — **not a tracked numbered migration**, only present in `supabase/staging_base_schema.sql`. Schema-drift risk (see §9).
- **What claim does:** marks `claimed`; links any existing `borrowers` rows for that email to the newly-claiming account via `linkBorrowerAccount()`; awards credits (`awardCredits`, idempotent by reference ID). No redirect beyond staying on `/chat`.
- **Automation:** `vercel.json` cron `3 9 * * 1` (Mondays) → sweeps `pending` invites with `reminder_count < 3` and no reminder in the last 6 days, refreshes `expires_at` to a fresh 7 days, increments `reminder_count`, resends. **Note:** the code comment claims this fires 9:03am Pacific, but Vercel cron schedules run in UTC — worth confirming actual fire time in the Vercel dashboard if timing matters operationally.

### 2.3 LO → Borrower Invite (`invite_codes`)
- **What it is:** a loan officer or agent generating a referral link for their own client to onboard. Despite the route living at `/api/lo/invites`, this does **not** invite other professionals — it's LO-to-consumer.
- **Who can trigger:** any signed-in user with a `loan_officers` or `agents` row.
- **UI:** `app/pro/clients/page.tsx` ("Invite a client"). Landing page: `app/join/page.tsx` (query-param form, **not** `/join/[token]` — see §12 for the unrelated token-path version of `/join`).
- **API:** `POST /api/lo/invites` (generate), `POST /api/onboarding/complete` (claim).
- **Delivery:** none built in — returns a copyable `inviteUrl` for the LO to send manually (text, email, however they choose).
- **Link/token:** 10-char code (`randomUUID()` truncated/uppercased), stored in `invite_codes.code`. URL: `${APP_BASE_URL}/onboarding?invite=<CODE>`. `max_uses: 1` by default; `expires_at` supported by the schema but not set by this route.
- **DB:** `invite_codes` — also **not** a tracked numbered migration (only in `supabase/staging_base_schema.sql`).
- **What claim does:** inserts a `borrowers` row linked to the LO, sets `users.referred_by`, auto-sets `users.role='borrower'` (skips the `/welcome` role picker), increments `used_count`.

### 2.4 Referral Program
- **What it is:** every signed-in user gets a personal short link; visitors who click it get cookie-attributed before signing up.
- **Who can trigger:** code generation requires sign-in; the tracking/redirect link itself is public.
- **UI:** generated from `app/profile/page.tsx`; landing page is `app/r/[slug]/page.tsx`.
- **API:** `GET /api/referral/code` (get-or-create), `GET /api/referral/track?code=X&redirect=Y` (sets cookie, redirects — same-origin only, guards against open redirect).
- **Delivery:** link only, no email built in.
- **Link/token:** `/r/[slug]` where `slug` **is** `users.referral_code` directly — `randomBytes(4).toString("hex")` (8-char hex), unique-indexed, generated lazily on first request. Never expires.
- **DB:** `users.referral_code` column, migration `015_referral_codes_and_founding.sql`.
- **What landing does:** renders a personalized card ("X, Loan Officer at Y, is sharing…"), routes through the tracking endpoint to set an `hr_ref` cookie (httpOnly, 7-day) before redirecting to `/sign-up?redirect_url=/welcome`. **Not traced:** where `hr_ref` is read downstream to actually attribute/reward the referral — follow up with `grep -rn "hr_ref"` if that reward path needs documenting.

### 2.5 Newsletter
- **What it is:** hybrid — subscribe is new-contact growth (public opt-in from article pages), send is a retention digest to the existing list, not acquisition.
- **Who can trigger subscribe:** public, no auth. **Send:** `CRON_SECRET` bearer token, or an authenticated admin (canonical check) as fallback.
- **UI:** embedded on Knowledge Hub article pages (exact component not pinned down — grep `/api/newsletter/subscribe` if you need it).
- **API:** `POST /api/newsletter/subscribe`, `GET/POST /api/newsletter/send`, `GET /api/newsletter/cron`.
- **Delivery:** Resend, with proper `List-Unsubscribe` headers.
- **DB:** `newsletter_subscribers` (`020_newsletter_subscribers.sql`), `newsletter_sends` (`023_newsletter_sends.sql`) — these ARE tracked migrations.
- **Automation:** `vercel.json` cron `0 9 * * 1` (Mondays) → weekly digest (FRED rate snapshot + latest 3 published articles) to every non-suppressed subscriber.

### 2.6 Share & Shorten (growth virality, not acquisition)
- **What it is:** two overlapping API surfaces over the same underlying data — sharing a chat conversation or property analysis generates a short link with rich OG-card previews for crawlers.
- **`/api/shorten`** (`POST`) — dual-mode: `messages[]` body → `shared_threads` table (the live/primary path); `url` body → `short_links` table (legacy/backward-compat, validated against an `ALLOWED_HOSTS` allowlist).
- **`/api/share`** (`POST`) — the newer/primary API for the same `shared_threads` table. Adds two things `/api/shorten` doesn't: (1) an optional `email` field that sends the link directly to a named person via a raw Resend REST call, and (2) a side-channel LO notification — if the sharer has a `borrowers` row with a linked `loan_officer_id`, that LO gets emailed a preview too (retention nudge, not new-contact outreach).
- **`GET /api/share/load?slug=X`** — public, hydrates `/chat?shared={slug}`.
- **Who can trigger:** anyone; `auth()` checked but optional (`userId || "anon"`).
- **Link/token:** 7-char slug (excludes ambiguous chars I/O/0/1), `crypto.randomInt`, never expires.
- **DB:** `shared_threads`, `short_links` — **neither is a tracked migration**, only in `staging_base_schema.sql`.
- **Landing (`/s/[slug]`):** OG-card preview for crawlers (including a "My Decision Portfolio" card with address/score/photo), JS-redirect to `/chat?shared={slug}` for humans. No auth, no account creation, no credit grant.

---

## 3. Loan Officer / Agent Acquisition

### 3.1 Founding 500 Waitlist + urgency blast
- **What it is:** the gated professional-tier waitlist — LOs and agents apply, admin releases them in invite "waves," they claim after signing in and get a sequential `founding_number` + founding-member badge.
- **Who can apply:** public, no auth. **Who releases waves / direct-invites / expires stale invites:** admin only (canonical check). **Who claims:** any signed-in user whose email matches an `invited`/`joined` row.
- **UI:** `app/founding/page.tsx` (public application), `app/admin/waitlist/page.tsx` (admin console). Claim fires programmatically from `/welcome` on mount, not a dedicated claim page.
- **API:** `POST /api/waitlist/apply`, `GET/POST /api/admin/waitlist` (actions: `direct_invite`, `expire`, `reinvite`, `invite_wave`), `POST /api/waitlist/claim`.
- **Delivery:** Resend only (`emailWaitlistConfirm`, `emailWaitlistInvite`, `emailFoundingUrgency`) — no Loops here.
- **Matching:** by **email address**, no per-user token/slug. Confirmation → `/founding`; invite → `/welcome`.
- **Expiry:** 72 hours after invite sent (`invite_expires_at`). **Note:** the claim route does not itself re-check `invite_expires_at` — it only checks `status IN ('invited','joined')` — so a technically-expired-but-not-yet-swept invite is still claimable until the `expire` admin action (or a future automated sweep) catches it.
- **DB:** `pro_waitlist`, migration `017_pro_waitlist.sql`.
- **What claim does:** assigns sequential `founding_number`, marks `joined`, sets `is_founding_member = true` on the matching `loan_officers` or `agents` row. No credits granted by this step alone (credits come from the standard/pilot founding bonus in `onboarding/setup`, §9).
- **Automation:** `lib/foundingMilestone.ts` — at exactly `founding_number` 450 or 490, auto-fires an urgency blast to all current founding members (deduped via an atomic insert into `system_flags`, inline from the claim flow — not a cron).
- **Manual urgency blast:** `POST /api/admin/founding-blast` — admin-triggered, resolves founding members' emails from Clerk in batches of 10, sends the same `emailFoundingUrgency` to everyone. `GET /api/admin/founding-stats` — `{claimed, remaining}` against a hardcoded `FOUNDING_CAP = 500`.

### 3.2 Pilots & Agent Pilots
- **What they are:** admin-driven direct-outreach programs for named companies/teams — "Pilots" targets loan officers, "Agent Pilots" targets real estate agents. **They share one table** (`company_pilots`, `pilot_type` column added in `054_agent_pilots.sql`, default `'lo'`), not two separate systems, despite two separate admin UIs and two separate route trees.
- **Who can trigger:** admin only — but via the **`users.role='admin'`** check (§1's third variant), not the canonical `admin_users` check.
- **UI:** `app/admin/pilots/page.tsx`, `app/admin/agent-pilots/page.tsx` (no client-side admin gate on either — relies entirely on the API 401).
- **API:** `GET/POST/PATCH(/DELETE for agent-pilots only) /api/admin/pilots` and `/api/admin/agent-pilots`, plus `/bulk` and `/invite` variants for each.
- **Delivery:** Resend (`emailPilotInvite` — personal, founder-voiced tone; `emailAgentPilotInvite`).
- **Link:** human-readable slug, not a random token — `${BASE}/pilot/${slug}` or `${BASE}/agent-pilot/${slug}`. Reusable/shareable — anyone with the link can activate. Never expires.
- **Landing:** `app/pilot/[slug]/page.tsx` (has hand-written per-slug custom copy via a `PILOT_COPY` map — e.g. `sunflower-bank` gets AMI-Qualifier-focused messaging) / `app/agent-pilot/[slug]/page.tsx`. CTA → `/welcome?pilot=<slug>&role=lo|agent`.
- **What claim does:** `app/api/onboarding/setup/route.ts` looks up `company_pilots` by slug, awards `credits_per_lo` credits (instead of the standard 1,000 founding bonus) via `awardCredits(..., "founding_bonus", ...)`, and links the pilot back to the user's profile.
- **⚠️ Known bug — agent-pilot linkage never actually writes:** verified directly in `app/api/onboarding/setup/route.ts` lines 181–197. The pilot lookup has **no `pilot_type` filter** (`.eq("slug", ...).eq("is_active", true)` only) — if the same slug exists as both an `lo` and `agent` pilot (the schema explicitly allows this via the `(slug, pilot_type)` unique constraint), the lookup can resolve the wrong row. Worse: the linkage write is **unconditional**: `await sb.from("loan_officers").update({ company_pilot_id: pilot.id, is_founding_member: true }).eq("user_id", userId)` — but `company_pilot_id` only exists on `loan_officers` (confirmed in `052_company_pilots.sql`), never added to `agents`. For an agent claiming an agent-pilot link, this update matches **zero rows** — the agent's `is_founding_member` flag and pilot linkage are never set from this code path (though credits still land correctly, since `awardCredits` doesn't depend on the linkage). Net effect: agent-pilot "activation" counts and founding-member badges are unreliable. Not fixed as part of this audit — flagged for a future fix.
- **Cross-program leakage:** `GET /api/admin/pilots` selects `*` from `company_pilots` with **no `pilot_type` filter**, so `/admin/pilots` can show/edit agent-pilot rows mixed in with LO ones. `POST /api/admin/pilots` doesn't set `pilot_type` explicitly either (defaults to `'lo'`). The `agent-pilots` routes filter correctly; the general `pilots` routes mostly don't.

### 3.3 Professional Directory (invite-to-claim / self-register)
- **What it is:** a pre-seeded directory of real NMLS/CA-DRE license holders; anyone can invite a listed-but-unclaimed professional to claim their profile, or a professional can self-register from scratch.
- **Invite (`POST /api/pro-directory/invite`):** trigger is **any signed-in user** — no professional-status check. Entry points: `app/professionals/[id]/page.tsx` (public detail page, "Know this professional? Send them a link to claim it") and `app/admin/directory/page.tsx` (per-row Invite action — same endpoint, admin-facing UI over it). Dedup: blocks resend to the same listing+email combo within 7 days.
- **Claim (`POST /api/pro-directory/claim`):** any signed-in user, landing on `/professionals/claim/[id]`. 409 if already claimed by someone else or if the claimer already claimed a different listing (one claim per user).
- **Self-register (`POST /api/pro-directory/register`):** for professionals with no seed listing — creates a brand-new, immediately self-claimed `pro_directory` row. UI: `app/professionals/new/page.tsx`.
- **Link:** `${BASE}/professionals/claim/${pro.id}` — uses the directory row's **UUID**, not the `pro_invitations.token` column. That token is generated and stored but **not actually validated anywhere in the claim flow** — claim is authorized purely by directory-row ID + signed-in identity. Vestigial column; confirm with the founder whether that was an intentional simplification or an unfinished hardening step.
- **DB:** `pro_directory`, `pro_invitations` (migration `014_pro_invitations.sql`).
- **What claim does:** flips `pro_directory.claimed_by`; auto-creates a `loan_officers` row (if `pro_type` is `lo`/`lo_company`) or `agents` row (if `agent`/`agent_broker`), seeded from the directory's NMLS/license; upserts `users.role`. **No brokerage linkage** — a claimed pro still has to separately create/join a brokerage (§4). No credits granted.
- **Bonus mechanism surfaced by `/admin/directory`'s UI (not in the route file itself):** a second per-row button, **"Invite to Founding 500,"** calls `POST /api/admin/waitlist` with `action: "direct_invite"` — this is just §3.1's admin-direct-invite action, triggered from the Directory page as a shortcut. Not a separate system.

---

## 4. Brokerage / Team

### 4.1 Brokerage self-serve (create → invite → join → manage)
Four routes over one table (`brokerages` + `brokerage_members`, migration `016_brokerage_teams.sql`):
- **Create** (`POST /api/brokerage/create`) — any LO without an existing brokerage. Generates a persistent `invite_token` column on the new row.
- **Invite** (`POST /api/brokerage/invite`) — **owner only**. Emails (Resend) a link containing the brokerage's `invite_token`. **This link is reusable and non-expiring by design** — the email text literally says it can be reused by multiple team members. No per-invitee token.
- **Join** (`POST /api/brokerage/join`) — any LO (agents cannot join via this route — 403 "Only loan officers can join a brokerage team") who isn't already in a brokerage. Landing page: `app/join/[token]/page.tsx` — this is the **token-path** `/join`, unrelated to §2.3's query-param `/join?invite=`.
- **Manage** (`/api/brokerage/manage`, GET/POST/DELETE) — owner-only dashboard; POST **rotates** `invite_token` (`randomBytes(16).toString("hex")`), which revokes the old link.
- **UI:** `app/brokerage/manage/page.tsx`.

### 4.2 Corporate Invite + Org Nomination
- **What it is:** the admin-driven, top-down counterpart to §4.1 — same `brokerages` table, different door in. Also includes a nomination path where an existing pro flags their own employer for the admin to follow up with.
- **Corporate invite trigger:** admin only, via the corporate-invite-specific `isAdmin()` check (§1 — no bootstrap fallback). **Nominate trigger:** any signed-in user.
- **UI:** `app/admin/corporate/page.tsx` (uses `useAdminStatus` correctly). No dedicated nomination-submission page located — presumably embedded in a professional dashboard/settings surface.
- **API:** `GET/POST/PATCH /api/admin/corporate-invite` (lists/creates/updates both `corporate_invitations` and `org_nominations`), `POST /api/org/nominate`, `GET/POST /api/org/claim`.
- **Delivery:** Resend (`emailCorporateInvite`).
- **Link/token:** `${BASE}/org/claim/${token}` — `corporate_invitations.token` is DB-generated at insert. **No expiry field is checked anywhere in the claim route** — unlike every other timed invite in this doc, this one does not expire.
- **DB:** `corporate_invitations`, `org_nominations` (migration `022_corporate_invitations.sql`); also touches `brokerages`, `brokerage_members`, `loan_officers` on claim.
- **What claim does:** requires sign-in + a `compliance_accepted: true` checkbox; creates a **new** `brokerages` row (`admin_invited: true`, `compliance_accepted_at` stamped), adds the claimer as `role: 'owner'`, links their `loan_officers.brokerage_id`. Blocks if the claimer already owns a brokerage. Redirects to `/brokerage/manage`.
- **Relationship to §4.1:** functionally, **two doors into the same room** — both paths create an ordinary `brokerages` row; only `admin_invited`/`compliance_accepted_at` distinguish provenance. Once created either way, team recruitment for that brokerage proceeds through the identical §4.1 invite/join flow.

---

## 5. Partner / Institutional

### 5.1 Marketplace Lender invite
- **What it is:** onboarding an institutional lender into the rate marketplace — a fundamentally different identity model from everything else in this doc: **no Clerk account is created**, access is pure bearer-token to a `marketplace_lenders` row.
- **Who can trigger:** admin only (canonical check).
- **UI:** `app/admin/marketplace/page.tsx` — **has no client-side admin gate at all** (doesn't call `useAdminStatus`), relies entirely on the API's 401/403. Page shell renders before the auth check bites.
- **API:** `GET/POST/PATCH /api/admin/marketplace-lenders` (CRUD — pricing/eligibility overlays), `POST /api/admin/marketplace-lenders/invite`.
- **Delivery:** Resend, "Lender Partner Program" branding.
- **Link/token:** `randomBytes(20).toString("hex")` on `marketplace_lenders.invite_token` — persists and is **reused**, not rotated, on repeat invite sends. URL: `${BASE}/lender-portal/${token}`. **No expiry.** Per the migration comment, explicitly designed as a tokenized portal requiring no Clerk auth.
- **DB:** `marketplace_lenders`, migrations `055_marketplace_lenders.sql` + `060_lender_invite_token.sql`.
- **Landing:** `app/lender-portal/[token]/page.tsx` — token-gated view of listing/DPA-program stats; no account creation.

### 5.2 White-label partners — NOT an invite mechanism
Documented here only to close the loop: `app/admin/white-label/page.tsx` + `/api/admin/white-label` is pure CRUD over `white_label_partners` (name, logo, tagline, accent color, contact email) for cosmetic partner branding on chat/landing surfaces. No email is ever sent (`contact_email` is stored but unused for sending — no Resend import in the route at all), no token, no claim flow, no linkage to `brokerages`/`marketplace_lenders`/`company_pilots`. If white-label partners should go through an actual onboarding/invite flow in the future, that would need to be built — likely by reusing the Corporate Invite token pattern (§4.2).

---

## 6. In-App Transactional Invites (not acquisition)

These don't bring new people onto the platform — they connect two people who are (or are about to be) already-platform accounts, scoped to one specific transaction.

### 6.1 Deal Room collaborator invites
- **Who can trigger:** only the deal room's creator (any authenticated member can *view* existing invite links; only the creator can create/reset a role slot). Room must not be closed/cancelled.
- **API:** `GET/POST /api/deal-rooms/[id]/invite` (per-role-slot: `buyer`/`lo`/`agent`), `POST /api/deal-rooms/join`.
- **Delivery:** Resend, **only if** an email was supplied for that slot — otherwise link-only/copy-paste.
- **Link/token:** `crypto.randomUUID()` per role slot on `deal_room_members.invite_token`. URL: `${origin}/deal-rooms/join?token=<uuid>`. **Single-use per role slot** — once joined, re-inviting that slot requires the creator to explicitly reset it (409 otherwise). No expiry field.
- **DB:** `deal_room_members` (migration `041_deal_rooms.sql`).
- **Landing:** `app/deal-rooms/join/page.tsx` — requires sign-in, then seats the joiner into that specific deal room (posts a system "X joined" message). **No account/role creation** — assumes the joiner already has whatever professional/consumer account they need.

### 6.2 Scenario invite / respond (contact exchange)
- **What it is:** not a new-account invite — the moment an anonymous LO/agent response to a borrower's posted scenario becomes a real, contact-visible connection.
- **Respond** (`POST /api/scenarios/[id]/respond`) — any LO (with `nmls` set) or agent (with `license` set) responds to an active, non-own scenario (subject to `max_responses`, `closes_at`, one-response-per-pro limits). Auto-seeds a `conversation_threads` row with their approach text.
- **Invite** (`POST /api/scenarios/[id]/invite`) — **the scenario's own borrower only** selects a responder. This is the actual identity-exchange moment: mutual double opt-in.
- **Delivery:** two Resend emails on invite — one to the professional ("you earned a connection," includes borrower name+email), one to the borrower (confirms the introduction, includes the pro's name/NMLS-or-license/rate estimate).
- **No token/link/landing page** — same-session API action between two already-authenticated accounts, not a shareable URL.
- **DB:** `scenario_invites`, `scenario_responses`, `scenario_briefs`.

---

## 7. Who Can Invite Whom — matrix

| Actor | Can invite/reach | Via |
|---|---|---|
| Admin | Consumers (named or bulk) | §2.1, §2.2 |
| Admin | LOs / agents (waitlist, pilots, directory) | §3.1, §3.2, §3.3 |
| Admin | Brokerages / enterprise orgs | §4.2 |
| Admin | Institutional lenders | §5.1 |
| LO or agent | Their own borrower/client | §2.3 |
| Brokerage owner | LOs to join their team | §4.1 |
| Any signed-in user | Anyone (generic referral) | §2.4 |
| Any signed-in user | An unclaimed directory listing's owner | §3.3 |
| Any signed-in user | Their employer (nomination, not a direct invite) | §4.2 |
| Deal room creator | Buyer/LO/agent into one specific deal | §6.1 |
| Borrower | A specific responding LO/agent (contact reveal) | §6.2 |
| Public/anonymous | — (self-serve entry points only: waitlist apply, newsletter subscribe) | §3.1, §2.5 |

---

## 8. Known Issues / Redundancies (tracked for future cleanup)

1. **Three incompatible admin-check implementations** (§1) — reconcile Pilots/Agent-Pilots (`users.role`) and Corporate Invite (local `admin_users` check without bootstrap fallback) onto the canonical `lib/adminAuth.ts`.
2. **Agent-pilot linkage silently fails** (§3.2) — `onboarding/setup` writes pilot linkage unconditionally to `loan_officers.company_pilot_id`, which doesn't exist for agents. Credits still award correctly; activation counts/founding badges for agent pilots do not.
3. **`/admin/pilots` shows both pilot types unfiltered** (§3.2) — risk of an admin editing/deactivating an agent-pilot row while believing they're only looking at LO pilots.
4. **Two independent "consumer invite" systems** — `invite_codes` (self-serve per-LO, §2.3, no reminders/no email) and `consumer_invites` (admin-bulk, §2.2, Resend + cron reminders) don't share a table or a reporting surface.
5. **Two doors into `brokerages`** (§4) — self-serve create and admin Corporate Invite both write the same table; fine as designed, just worth knowing they're not separate systems if you're auditing brokerage growth.
6. **`pro_invitations.token` is generated but never validated** (§3.3) — claim auth relies solely on directory-row ID + session identity.
7. **`/join`, `/join/[token]`, and `/api/invite/claim` share a URL prefix but are three unrelated systems** with three unrelated tables (`invite_codes`, `brokerages.invite_token`, `consumer_invites`) — a likely source of confusion reading route names cold. No shared "claim a token" library exists; each implements its own lookup.
8. **Corporate Invite tokens never expire** (§4.2) — the only invite type in this doc with no expiry check at all.
9. **`hr_ref` referral cookie's downstream consumption not traced** (§2.4) — confirm where/whether it's actually read to attribute rewards before assuming the referral loop closes end-to-end.
10. **Marketplace lender invite tokens are reused, not rotated**, on repeat sends (§5.1) — unlike brokerage invite tokens, which the owner can explicitly rotate via Manage.

## 9. Schema Drift — tables missing from tracked migrations

These tables are live (referenced throughout the app) but only defined in `supabase/staging_base_schema.sql`, not as a numbered file under `supabase/migrations/`. Per this repo's hard rule (`CLAUDE.md` — all schema changes go through a numbered migration), this is drift worth closing:
- `consumer_invites` (§2.2)
- `invite_codes` (§2.3)
- `shared_threads`, `short_links` (§2.6)

If any of these tables need a schema change in the future, write the numbered migration retroactively documenting current state before layering a change on top — don't assume `staging_base_schema.sql` is kept in sync with production.

---

## Appendix — Full Endpoint Reference

| Endpoint | Method | Mechanism |
|---|---|---|
| `/api/admin/loops-import` | POST | §2.1 |
| `/api/admin/consumer-invite` | POST | §2.2 |
| `/api/invite/claim` | POST | §2.2 |
| `/api/cron/consumer-invite-reminder` | GET/POST | §2.2 |
| `/api/lo/invites` | POST | §2.3 |
| `/api/onboarding/complete` | POST | §2.3 |
| `/api/referral/code` | GET | §2.4 |
| `/api/referral/track` | GET | §2.4 |
| `/api/newsletter/subscribe` | POST | §2.5 |
| `/api/newsletter/send` | GET/POST | §2.5 |
| `/api/newsletter/cron` | GET | §2.5 |
| `/api/shorten` | POST | §2.6 |
| `/api/share` | POST | §2.6 |
| `/api/share/load` | GET | §2.6 |
| `/api/waitlist/apply` | POST | §3.1 |
| `/api/admin/waitlist` | GET/POST | §3.1 |
| `/api/waitlist/claim` | POST | §3.1 |
| `/api/admin/founding-blast` | POST | §3.1 |
| `/api/admin/founding-stats` | GET | §3.1 |
| `/api/admin/pilots`, `/bulk`, `/invite` | GET/POST/PATCH | §3.2 |
| `/api/admin/agent-pilots`, `/bulk`, `/invite` | GET/POST/PATCH/DELETE | §3.2 |
| `/api/pilot/[slug]`, `/api/agent-pilot/[slug]` | GET | §3.2 |
| `/api/onboarding/setup` | POST | §3.2 (pilot linkage + all founding-credit logic) |
| `/api/pro-directory/invite` | POST | §3.3 |
| `/api/pro-directory/claim` | POST | §3.3 |
| `/api/pro-directory/register` | POST | §3.3 |
| `/api/brokerage/create` | POST | §4.1 |
| `/api/brokerage/invite` | POST | §4.1 |
| `/api/brokerage/join` | POST | §4.1 |
| `/api/brokerage/manage` | GET/POST/DELETE | §4.1 |
| `/api/org/nominate` | POST | §4.2 |
| `/api/admin/corporate-invite` | GET/POST/PATCH | §4.2 |
| `/api/org/claim` | GET/POST | §4.2 |
| `/api/admin/marketplace-lenders`, `/invite` | GET/POST/PATCH | §5.1 |
| `/api/admin/white-label` | GET/POST | §5.2 (not an invite mechanism) |
| `/api/deal-rooms/[id]/invite` | GET/POST | §6.1 |
| `/api/deal-rooms/join` | POST | §6.1 |
| `/api/scenarios/[id]/respond` | POST | §6.2 |
| `/api/scenarios/[id]/invite` | POST | §6.2 |
| `/api/admin/check` | GET | §1 (backs `useAdminStatus`) |
