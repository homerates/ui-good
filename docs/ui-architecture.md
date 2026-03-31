# HomeRates.ai — UI Architecture Diagram

> Generated: 2026-03-31 | Stack: Next.js 15 · React 18 · TypeScript 5 · Tailwind CSS 4 · Clerk · Supabase · Stripe

---

## High-Level Architecture

```mermaid
graph TB
    subgraph CLIENT["Browser / Client"]
        LP["Landing Page\n/app/page.tsx"]
        CI["Chat Interface\n/app/chat/page.tsx"]
        CP["Calculator Pages\n/affordability, /dscr, /fha, /va…"]
        PG["Public Pages\n/about, /pricing, /privacy…"]
        UP["User Pages\n/profile, /library, /share"]
    end

    subgraph LAYOUT["Root Layout (app/layout.tsx)"]
        CL["Clerk Provider\n(auth session)"]
        FT["Fonts\nSyne · DM Sans · DM Mono"]
        AN["Vercel Analytics\n+ Speed Insights"]
        TH["Anti-flash Theme Script\n(dark mode)"]
    end

    subgraph MW["Middleware (middleware.ts)"]
        AUTH["clerkMiddleware\nPublic ↔ Protected route guard"]
    end

    CLIENT --> LAYOUT
    MW --> CLIENT
```

---

## Component Hierarchy

```mermaid
graph TD
    RL["Root Layout\napp/layout.tsx"]

    RL --> PS["PageShell\nPageShell.tsx\n(non-chat pages)"]
    RL --> CH["Chat Layout\nchat/page.tsx"]

    PS --> HD["Header.tsx\n(logo, back btn)"]
    PS --> FT["Footer\n(legal links)"]

    CH --> SB["Sidebar.tsx\n(31KB)\nProjects · History · Settings · Auth"]
    CH --> MA["Main Content Area"]
    CH --> CP["Composer\n(sticky bottom, mobile-pinned)"]

    MA --> WS["WelcomeScreen\n(empty state)"]
    MA --> AB["AnswerBlock / AnswerCard\n(response display)"]
    MA --> CDS["Calculator Cards"]

    CDS --> ISC["InteractiveSliderCard\n(Conventional / FHA / VA / Jumbo)"]
    CDS --> ASC["AffordabilitySliderCard"]
    CDS --> DSC["DSCRSliderCard"]
    CDS --> RSC["RefiSliderCard"]
    CDS --> PPC["PropertyPreviewCard\n(Zillow / Redfin)"]
    CDS --> LLC["LoanLimitsSliderCard"]
    CDS --> MCP["MortgageCalcPanel\n(PITI + amortization chart)"]

    AB --> SM["ShareModal"]
    AB --> PDF["PdfDownloadButton\n(@react-pdf/renderer)"]

    SB --> SP["SettingsPanel\n(theme, preferences)"]
    SB --> ALT["AlertBell\n(price watch)"]
    SB --> TT["ThemeToggle"]
```

---

## Data Flow — Chat / Calculation Request

```mermaid
sequenceDiagram
    participant U as User (browser)
    participant CH as Chat UI
    participant MW as Middleware (Clerk)
    participant ANS as /api/answers
    participant CD as calcDispatcher
    participant CE as calcEngine
    participant CB as cardBuilders
    participant LLM as LLM Router (Claude/Grok)
    participant SB as Supabase

    U->>CH: Types question ("$500k, 20% down, 6.5%")
    CH->>MW: Request (auth token)
    MW->>ANS: Authenticated request
    ANS->>CD: Detect question type
    CD->>CE: Run math (conventional/FHA/VA…)
    CE-->>CD: Raw calc result
    CD->>CB: Format into card
    CB-->>ANS: Formatted answer + chips
    ANS->>LLM: Optional LLM enrichment
    LLM-->>ANS: Narrative explanation
    ANS->>SB: Persist to user_answers / chat_threads
    ANS-->>CH: JSON response (breakdown + answer)
    CH-->>U: Render AnswerCard + SliderCard
```

---

## API Layer (43 Endpoints)

```mermaid
graph LR
    subgraph CORE["Core Calc & Chat"]
        ANS["/api/answers\nMain calc + LLM response"]
        ANSS["/api/answers/scenario\nMulti-scenario comparison"]
        CHAT["/api/chat\nHelper"]
        CALC["/api/calc/answer\n/api/calc/payment\nPure math, no LLM"]
    end

    subgraph USER["User / Projects"]
        PROJ["/api/projects\nCRUD chat folders"]
        PROJ2["/api/projects/[id]\nRename / Delete"]
        MOVE["/api/projects/move-chat"]
        LIB["/api/library\nSaved answers"]
        IDENT["/api/identity"]
        PLAN["/api/user/plan\nSubscription status"]
    end

    subgraph SHARE["Sharing"]
        SH["/api/share\nCreate short link"]
        SHL["/api/share/load\nLoad shared answer"]
    end

    subgraph PROPERTY["Property"]
        PROP["/api/property/lookup\nZillow / Redfin data"]
        LIST["/api/listings/search"]
    end

    subgraph MARKET["Market Data"]
        FRED["/api/fred\nFRED rates + economic data"]
        TICK["/api/ticker\nMarket ticker"]
        TAV["/api/tavily\nWeb search (comparables)"]
        KNOW["/api/knowledge\nKnowledge base"]
    end

    subgraph ALERTS["Alerts"]
        ALT["/api/alerts\nPrice watches"]
        ALTC["/api/alerts/check"]
    end

    subgraph PAYMENTS["Payments & Auth Webhooks"]
        SCO["/api/stripe/checkout"]
        SPO["/api/stripe/portal"]
        WCL["/api/webhooks/clerk\nUser sync → Supabase"]
        WST["/api/webhooks/stripe\nPlan updates"]
    end
```

---

## Business Logic Layer

```mermaid
graph TD
    subgraph DISP["calcDispatcher.ts (23KB)"]
        NLP["Parse natural language question"]
        RT["Route: calc | LLM | web-search"]
    end

    subgraph ENGINE["calcEngine.ts (38KB)"]
        CONV["calcConventional()\n3 / 5 / 10 / 20% down"]
        FHA["calcFHA()\n3.5% down + UFMIP + MIP"]
        VA["calcVA()\nFunding fee options"]
        JUMBO["calcJumbo()\n> $1.25M"]
        DSCR["calcDSCR()\nInvestment DSCR"]
        AFF["calcAffordability()\nIncome → max price"]
        REFI["calcRefi()\nBreak-even analysis"]
        XPAY["calcExtraPayment()\nBi-weekly / extra principal"]
        CORE2["Core formulas\nmonthlyPI, remainingBalance,\nyearsToLTV, monthlyPMI"]
    end

    subgraph CARDS["cardBuilders.ts (66KB)"]
        FMT["Format results → markdown cards"]
        CHIPS["Add follow-up chips"]
        CONF["Confidence scores"]
    end

    subgraph LLM["ai-providers/router.ts"]
        CLAUD["Claude API\n(primary)"]
        GROK["Grok / XAI\n(secondary)"]
    end

    DISP --> ENGINE
    DISP --> CARDS
    DISP --> LLM
    ENGINE --> CARDS
    LLM --> CARDS
```

---

## Data & Integration Layer

```mermaid
graph TB
    subgraph DB["Supabase PostgreSQL"]
        USR["users\n(Clerk sync)"]
        PRJ["projects\n(chat folders)"]
        THR["chat_threads\n(conversations)"]
        ANS2["user_answers\n(saved calcs)"]
        ALTS["alerts\n(price watches)"]
        SUBS["subscriptions\n(Stripe plans)"]
    end

    subgraph AUTH["Clerk Auth"]
        SI["Sign in / Sign up"]
        WH1["Webhook → /api/webhooks/clerk"]
        SESS["Session tokens"]
    end

    subgraph PAY["Stripe Payments"]
        CHK["Checkout session"]
        PORT["Billing portal"]
        WH2["Webhook → /api/webhooks/stripe"]
    end

    subgraph EXT["External APIs"]
        FRED2["FRED API\n30Y rates, treasury, econ"]
        TAV2["Tavily Search\nComparables, listings"]
        ZR["Zillow / Redfin\nOpenGraph property data"]
        CLAUD2["Claude API (Anthropic)"]
        GROK2["Grok API (XAI)"]
    end

    subgraph KB["Static Knowledge Base\n/data/knowledge"]
        PG2["Product guides\n(DSCR, VA, FHA, Jumbo)"]
        UW["Underwriting guidelines\n(Fannie Mae, Freddie Mac)"]
        REGS["Regulations\n(RESPA, Dodd-Frank, NMLS)"]
        CTY["County tax rates\n+ loan limits (CA)"]
        ACR["Acronyms & terminology"]
    end

    AUTH --> DB
    PAY --> DB
    EXT --> DB
```

---

## Authentication & Route Protection

```mermaid
flowchart TD
    REQ["Incoming Request"]
    MW["middleware.ts\nclerkMiddleware"]
    PUB["Public Routes\n/, /chat, /calculators, /share,\n/about, /pricing, /sign-in, /sign-up"]
    PROT["Protected Routes\n/profile, /library, /projects, /alerts"]
    UNAUTH["Unauthenticated?"]
    REDIR["Redirect → /sign-in"]
    SERVE["Serve page"]

    REQ --> MW
    MW --> PUB
    MW --> PROT
    PROT --> UNAUTH
    UNAUTH -- Yes --> REDIR
    UNAUTH -- No --> SERVE
    PUB --> SERVE
```

---

## Styling System

```mermaid
graph LR
    subgraph CSS["CSS Architecture"]
        TW["Tailwind CSS v4\n(utility classes)"]
        GC["globals.css (44KB)\n(design tokens, resets)"]
        VARS["CSS Variables\n--bg, --card, --accent,\n--text, --border"]
    end

    subgraph THEME["Dark Theme (default)"]
        BG["Background: #080c12"]
        CARD["Card surface: #0e1420"]
        ACC["Accent: #00e87a (green)"]
        TXT["Text: #f0f4ff"]
    end

    subgraph FONTS["Typography (Google Fonts)"]
        SY["Syne — Display headings"]
        DMS["DM Sans — Body text"]
        DMM["DM Mono — Code / numbers"]
        IN["Inter — Fallback"]
    end

    CSS --> THEME
    CSS --> FONTS
```

---

## Deployment

```mermaid
graph LR
    GH["GitHub\n(source control)"]
    VCL["Vercel\n(hosting + CDN)"]
    SSF["Serverless Functions\n(API routes)"]
    EF["Edge Functions\n(middleware)"]
    CDN["Global CDN\n(static assets)"]
    SBI["Supabase\n(database)"]
    CLK["Clerk\n(auth)"]
    STR["Stripe\n(payments)"]

    GH -->|git push| VCL
    VCL --> SSF
    VCL --> EF
    VCL --> CDN
    SSF --> SBI
    SSF --> CLK
    SSF --> STR
```

---

## Technology Summary

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 15.5.7 |
| UI Library | React | 18.3.1 |
| Language | TypeScript | 5.9.3 |
| Styling | Tailwind CSS | 4.1.16 |
| Auth | Clerk | 6.37.3 |
| Database | Supabase (PostgreSQL) | 2.81.1 |
| Payments | Stripe | 21.0.1 |
| PDF Export | @react-pdf/renderer | 4.3.2 |
| Validation | Zod | 3.23.8 |
| Markdown | react-markdown | 8.0.7 |
| Query Parsing | Chevrotain | 11.0.3 |
| Web Search | Tavily | 0.7.2 |
| Primary LLM | Claude (Anthropic) | latest |
| Secondary LLM | Grok (XAI) | latest |
| Hosting | Vercel | — |
| Analytics | Vercel Analytics + Speed Insights | — |
