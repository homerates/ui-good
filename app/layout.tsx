// HR-Build: HRB-2025-11-10-d994b21 | File-Ref: HRF-0002-D684DDC7 | SHA256: D684DDC76358CC27
// app/layout.tsx
import "./globals.css";
import { Inter } from "next/font/google";
import { Syne, DM_Mono, DM_Sans } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import LegalLinks from "./components/LegalLinks";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const syne = Syne({ subsets: ["latin"], variable: "--font-syne", display: "swap", weight: ["400","500","600","700","800"] });
const dmMono = DM_Mono({ subsets: ["latin"], variable: "--font-dm-mono", display: "swap", weight: ["300","400","500"] });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap", weight: ["300","400","500"] });


const BASE_URL = "https://chat.homerates.ai";

export const metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "HomeRates.ai — Mortgage AI Chat",
    template: "%s | HomeRates.ai",
  },
  description:
    "Ask anything about buying a home, refinancing, or investing in real estate. Real mortgage math, live rates, no sales pitch.",
  keywords: [
    "mortgage calculator",
    "mortgage AI",
    "home affordability",
    "DSCR loan",
    "FHA loan",
    "refinance calculator",
    "mortgage rates",
    "unbiased mortgage AI",
    "consumer-controlled mortgage platform",
    "anti-lead-gen mortgage",
    "private vault mortgage intelligence",
    "mortgage intelligence platform",
  ],
  authors: [{ name: "HomeRates.ai", url: BASE_URL }],
  creator: "HomeRates.ai",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: BASE_URL,
    siteName: "HomeRates.ai",
    title: "HomeRates.ai — Mortgage AI Chat",
    description:
      "Ask anything about buying a home, refinancing, or investing. Real math. Live rates. No sales pitch.",
    images: [
      {
        url: "/assets/og-card.png",
        width: 1200,
        height: 627,
        alt: "HomeRates.ai — Mortgage AI Intelligence",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "HomeRates.ai — Mortgage AI Chat",
    description:
      "Real mortgage math, live rates, no sales pitch. Ask anything about buying, refinancing, or investing.",
    images: ["/assets/og-card.png"],
    creator: "@homerates_ai",
  },
  verification: {
    google: "IFO6kyqdiob63QHj5ua4q-5LUnFErGkfN27SXd85Ryk",
  },
  alternates: {
    canonical: BASE_URL,
  },
};

// Force SSR on the root so Clerk is never statically exported
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        {/* Anti-flash: set theme BEFORE paint so there's no white flash on dark mode */}
        <head>
          <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('hr-theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();` }} />
          {/* Organization schema — global entity signal for LLMs & search engines */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Organization",
                "@id": "https://chat.homerates.ai/#organization",
                "name": "HomeRates.AI",
                "url": "https://chat.homerates.ai",
                "logo": "https://chat.homerates.ai/assets/og-card.png",
                "description": "HomeRates.AI is the first consumer-controlled mortgage intelligence platform. Zero lead forms, zero data harvesting, zero lender hand-offs. Powered by live FRED data, deterministic math, and AI reasoning. Every conversation is privately stored in the user's personal vault.",
                "slogan": "The first mortgage intelligence platform that finally puts the consumer in control.",
                "foundingDate": "2025",
                "knowsAbout": [
                  "Mortgage rates",
                  "Home affordability",
                  "FHA loans",
                  "DSCR loans",
                  "Mortgage refinancing",
                  "Consumer mortgage education",
                  "PITI calculations",
                  "Conforming loan limits",
                  "Debt-to-income ratio",
                  "Private mortgage insurance"
                ],
                "sameAs": [
                  "https://homerates.ai"
                ],
              })
            }}
          />
          {/* WebApplication schema — describes the platform for AI/LLM citation */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "WebApplication",
                "@id": "https://chat.homerates.ai/#webapp",
                "name": "HomeRates.AI",
                "url": "https://chat.homerates.ai",
                "applicationCategory": "FinanceApplication",
                "operatingSystem": "Web",
                "offers": {
                  "@type": "Offer",
                  "price": "0",
                  "priceCurrency": "USD",
                  "description": "Free mortgage intelligence — no sign-up required for calculators"
                },
                "description": "The first unbiased mortgage intelligence platform. Pulls live FRED rate data, runs deterministic math calculations, and provides AI-powered mortgage guidance with zero lead generation, zero data harvesting, and zero lender hand-offs.",
                "featureList": [
                  "Live FRED mortgage rate data",
                  "Deterministic mortgage math engine",
                  "Private user-owned conversation vault",
                  "Zero lead forms",
                  "Zero lender hand-offs",
                  "Home affordability calculator",
                  "FHA loan calculator",
                  "DSCR investment property calculator",
                  "Refinance break-even calculator",
                  "Conventional loan calculator",
                  "PITI payment breakdown",
                  "Clerk authentication",
                  "Supabase private vault"
                ],
                "author": {
                  "@type": "Organization",
                  "@id": "https://chat.homerates.ai/#organization"
                },
              })
            }}
          />
        </head>
        <body className={`app ${inter.variable} ${syne.variable} ${dmMono.variable} ${dmSans.variable}`}>
          {children}
          <Analytics />
          <SpeedInsights />

          {/* Footer meta stays separate and non-interactive */}
          <footer className="app-footer">
            <div className="footer-meta">
              <LegalLinks />
            </div>
          </footer>


          {/* Hard override: fix composer layout + keep it off the sidebar */}
          <style
            dangerouslySetInnerHTML={{
              __html: `
/* Keep composer centered and away from sidebar; prevent full-bleed */
.composer{
  max-width: min(920px, 96vw) !important;
  margin: 0 auto !important;
  padding: 8px 12px !important;
  box-sizing: border-box !important;
  z-index: 900 !important;
}

/* Row: force a 2-track grid: input (1fr) | button (160px) */
.composer .composer-inner{
  display: grid !important;
  grid-template-columns: minmax(0,1fr) 160px !important;
  grid-auto-flow: column !important;
  align-items: center !important;
  gap: 8px !important;
  max-width: 100% !important;
}

/* Input: allow shrink so the grid can resolve without overflow */
.composer .composer-inner > .input,
.composer .composer-inner > input{
  min-width: 0 !important;
}

/* Button: force it into column 2 and hard-cap width */
.composer .composer-inner > button,
.composer .composer-inner > .btn,
.composer .composer-inner [data-testid="ask-pill"]{
  grid-column: 2 !important;
  justify-self: end !important;

  box-sizing: border-box !important;
  width: 160px !important;
  min-width: 160px !important;
  max-width: 160px !important;

  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

/* Nuke stretchy utility variants that may be applied to the pill */
.composer .composer-inner > .btn.w-full,
.composer .composer-inner > .btn.flex-1,
.composer .composer-inner > .btn[style*="flex: 1"],
.composer .composer-inner > .btn[style*="width: 100%"]{
  width: 160px !important;
  min-width: 160px !important;
  max-width: 160px !important;
  flex: 0 0 160px !important;
}

/* Ensure scroll area clears footer + composer */
.scroll{ padding-bottom: calc(var(--footer-h, 40px) + 92px) !important; }
`}}
          />

        </body>
      </html>
    </ClerkProvider>
  );
}
