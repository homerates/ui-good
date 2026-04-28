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
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap", weight: ["300","400","500","600","700","800"] });


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
    <ClerkProvider proxyUrl="https://homerates.ai/clerk-proxy">
      <html lang="en" suppressHydrationWarning>
        {/* Anti-flash: set theme BEFORE paint so there's no white flash on dark mode */}
        <head>
          {/* Anti-flash theme */}
          <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('hr-theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();` }} />
          {/* Schema.org — WebApplication (AI crawler structured data) */}
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            "name": "HomeRates.AI",
            "url": "https://chat.homerates.ai",
            "description": "The first consumer-controlled mortgage intelligence platform with private user-owned vault, deterministic math, real-time FRED data, and unbiased AI reasoning. Zero lead forms, zero data harvesting, zero lender hand-offs.",
            "applicationCategory": "FinanceApplication",
            "operatingSystem": "Web",
            "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
            "creator": { "@type": "Organization", "name": "HomeRates.AI", "url": "https://chat.homerates.ai" },
            "featureList": [
              "Private user-owned mortgage intelligence vault",
              "Deterministic PITI, DSCR, affordability, and refi calculators",
              "Real-time FRED economic data integration",
              "2026 FHFA nationwide conforming loan limits",
              "Zero lead generation — no data harvesting",
              "Anonymous borrower-to-LO scenario matching"
            ]
          }) }} />
          {/* llms.txt link for AI crawler discovery */}
          <link rel="llms" href="/llms.txt" />
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

          {/* Mobile footer auto-hide + composer follow: slide footer away on scroll-down, composer drops to edge */}
          <script dangerouslySetInnerHTML={{ __html: `(function(){var lastY=0,ticking=false,footer=null;function f(){return footer||(footer=document.querySelector('.footer-meta'));}function update(y){var el=f();if(!el){ticking=false;return;}if(window.innerWidth>640){el.classList.remove('footer-meta--hidden');ticking=false;return;}var c=document.querySelector('.hr-composer');if(y>lastY+4){el.classList.add('footer-meta--hidden');if(c)c.classList.add('hr-composer--footer-hidden');}else if(y<lastY-4){el.classList.remove('footer-meta--hidden');if(c)c.classList.remove('hr-composer--footer-hidden');}lastY=y;ticking=false;}function attach(){var s=document.querySelector('.scroll');if(s){s.addEventListener('scroll',function(){if(!ticking){var y=s.scrollTop;requestAnimationFrame(function(){update(y);});ticking=true;}},{passive:true});}else{window.addEventListener('scroll',function(){if(!ticking){requestAnimationFrame(function(){update(window.scrollY);});ticking=true;}},{passive:true});}}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',attach);}else{attach();}})();` }} />

        </body>
      </html>
    </ClerkProvider>
  );
}
