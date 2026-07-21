# OUTREACH_PLAYBOOK.md — Quick-Start Outreach Steps

**What this is:** pick who you're trying to reach, follow the steps. No code, no tables, no tokens.
**What this isn't:** the technical reference. For how any of this actually works under the hood (routes, tables, tokens, known bugs) — see **[OUTREACH_GUIDE.md](OUTREACH_GUIDE.md)**, cross-referenced by section number (§) throughout below.

Every field label below is copied verbatim from the actual admin page — if what you see on screen doesn't match, the page has changed since this was last synced (check the "Last synced" date at the bottom).

---

## Find your path

| I want to... | Go to |
|---|---|
| Invite one specific homebuyer/borrower I know | [§A.1 Consumer — one person](#a1-invite-one-person-with-credits) |
| Blast a list of names/emails (consumer or LO) | [§A.2 Consumer/LO — bulk list](#a2-blast-a-list-consumer-or-lo) |
| Get a specific LO or agent onto the platform now, skip the waitlist | [§B.1 Professional — direct invite](#b1-invite-one-lo-or-agent-directly) |
| I found them in the professional directory (or they're flagged/unclaimed there) | [§B.2 Professional — from the directory](#b2-invite-someone-already-in-the-directory) |
| Pitch an entire mortgage company or real estate team | [§B.3 Professional — company pilot](#b3-pitch-a-whole-company-or-team-pilot-program) |
| Reach a brokerage, lender, bank, or credit union | [§C.1 Enterprise](#c1-brokerage--lender--bank--credit-union) |
| Reach a strategic partner (fintech, MLS, title co., affinity group, etc.) | [§D.1 Strategic partners — no tool yet](#d1-strategic-partners--no-dedicated-tool-yet) |

---

## A. Consumer

### A.1 Invite one person (with credits)
**Go to:** `/admin` → **Consumer Invite** section.
**Have ready:** their email, their name, how many credits to grant (defaults to 25).
**Steps:**
1. Fill in **Email**, **Full Name**, **Phone** (optional), **Credits**, **Personal Note** (optional — shows in the email).
2. Click **Send Invite →**.
3. They get an email with a link. They click it, sign up (or sign in), and credits land automatically — no extra step for them.
4. The tool shows you the invite link directly if you want to send it yourself instead (text, DM, etc.) rather than relying on the email.

*Expires in 7 days; a reminder email auto-sends weekly until claimed or expired. Technical detail: [Guide §2.2](OUTREACH_GUIDE.md#22-consumer-invite-admin-bulk--weekly-reminder-cron).*

### A.2 Blast a list (consumer OR LO)
**Go to:** `/admin/outreach`.
**Have ready:** a CSV or pasted list of `Name, Email` rows.
**Steps:**
1. Pick the audience toggle: **Loan Officers / Brokers** or **Consumers / Buyers** — this changes the email template.
2. Drag & drop your CSV, or paste `Name, Email` lines directly.
3. Review the preview table.
4. Click **Send Outreach Email (N)**.
5. Everyone on the list gets an immediate templated email with 3 clickable questions that open the AI chat pre-loaded with that question. They're also added to Loops CRM.

*No invite token, no account requirement to click through — lowest-friction, least-personalized option. Technical detail: [Guide §2.1](OUTREACH_GUIDE.md#21-admin-csv-outreach-blast).*

---

## B. Professional (individual LO or real estate agent)

### B.1 Invite one LO or agent directly
Use this when you know exactly who you want and don't want them to wait for a Founding 500 wave.
**Go to:** `/admin/waitlist` → click **"+ Add & invite someone directly →"**.
**Have ready:** their full name, email, state, whether they're an LO or Agent, and (optional) NMLS#/License# and brokerage name.
**Steps:**
1. Click **+ Add & invite someone directly →** to expand the **Direct Founding Invite** form.
2. Fill in **Full name**, **Email**, **State** (required), pick **LO** or **Agent**, optionally fill NMLS#/License# and Brokerage.
3. Click **Send founding invite →**.
4. They get an email → land on `/welcome` → claim their Founding Member badge and starting credits.

*Technical detail: [Guide §3.1](OUTREACH_GUIDE.md#31-founding-500-waitlist--urgency-blast).*

### B.2 Invite someone already in the directory
Use this when they're a real NMLS/DRE-licensed pro who shows up in the professional directory but hasn't claimed their profile yet.
**Go to:** `/admin/directory`, search/filter to find them.
**Steps:**
1. Click their row to open it.
2. Two options appear:
   - **Invite to claim listing** — enter their email, send. They get a link straight to claiming their existing (pre-filled) profile.
   - **🏅 Invite to Founding 500** — enter their email, click **Send founding invite →**. Same Founding 500 flow as B.1, just launched from here instead.
3. Either way: they click the email link, sign up, and their profile is ready to go.

*Technical detail: [Guide §3.3](OUTREACH_GUIDE.md#33-professional-directory-invite-to-claim--self-register).*

### B.3 Pitch a whole company or team (pilot program)
Use this for a CEO/owner/principal-broker-level outreach — one link the whole company can share internally.
**Go to:** `/admin/pilots` (loan officer companies) or `/admin/agent-pilots` (real estate teams/brokerages).
**Have ready:** company name, a URL slug (auto-suggested from the name), CEO/principal contact name + email (optional but needed if you want the tool to send the email for you), credits per activation (defaults to 1,000).
**Steps — single company:**
1. Fill in **Company Name**, confirm/edit the auto-generated **URL Slug**, optionally **CEO/Contact Name** + **CEO/Contact Email** (or **Principal Broker** on the agent side), **Credits per LO**, internal **Notes**.
2. Click **Create pilot link →**.
3. On the new row: click **Send invite ✉** if you added a contact email, or **Copy link** to send it yourself anywhere (LinkedIn DM, text, email).
4. Click **Preview ↗** to see exactly what the recipient sees before sending.

**Steps — bulk (many companies at once):**
1. Scroll to **Bulk Import**, paste lines as `Company, Contact Name, Email` (one per line).
2. Review the preview, then choose to create-only or create-and-send-invites immediately.

*The link is reusable — anyone at that company who has it can activate. Technical detail: [Guide §3.2](OUTREACH_GUIDE.md#32-pilots--agent-pilots) (includes a known bug note on agent-pilot activation tracking).*

---

## C. Enterprise (brokerage, lender, bank, credit union)

### C.1 Brokerage / Lender / Bank / Credit Union
**Go to:** `/admin/corporate`.
**Have ready:** organization name, which type it is, a contact name/email/phone at that org, an optional personal note (shows up in the email — mention how you know them).
**Steps:**
1. Under **Send Corporate Invitation**, pick **Organization type**: `Mortgage Brokerage`, `Lender / Bank`, `Credit Union`, or `Real Estate Brokerage`.
2. Fill in **Organization name**, **Contact name**, **Contact email** (required), **Contact phone**, and a **Personal note**.
3. Click **Send invitation →**.
4. You'll immediately see the claim link on screen (in case you want to send it yourself). They get an emailed link that requires sign-in + accepting a compliance checkbox, then it stands up a full brokerage account for them with themselves as owner — from there they invite their own team (same mechanism a self-serve brokerage owner uses).

*This link does not expire — flagged as a known gap, not yet time-limited. Technical detail: [Guide §4.2](OUTREACH_GUIDE.md#42-corporate-invite--org-nomination).*

---

## D. Strategic partners

### D.1 Strategic partners — no dedicated tool yet
There is currently **no invite/outreach mechanism built for this audience** (fintechs, MLS providers, title companies, affinity groups, integration partners — anything that isn't an individual pro or a lending institution). What exists today (`/admin/white-label`) is branding *configuration* for a partner once a relationship is already in place — logo, colors, tagline — not a way to reach out to one in the first place.

**Until a real flow exists, the practical path is manual:** reach out directly (email, call, LinkedIn), and once there's an agreement, set up their branding at `/admin/white-label`.

If this becomes a repeated need, worth building a real mechanism for it — likely following the same pattern as Corporate Invite (§C.1): a token-based claim link, its own `org_type`, tracked in a table the same way. Flag it and we can scope that build.

*Technical detail: [Guide §5.2](OUTREACH_GUIDE.md#52-white-label-partners--not-an-invite-mechanism).*

---

**Last synced:** 2026-07-20 — every field label and button above was copied directly from the live admin page source, not reconstructed from the API. If a page's UI changes, this doc needs a manual re-check (there's no automated sync between this file and the actual pages).
