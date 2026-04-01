// app/about/page.tsx
import type { Metadata } from "next";
import PageShell from "../components/PageShell";

export const metadata: Metadata = {
  title: "About HomeRates.ai",
  description:
    "HomeRates.AI is the first consumer-controlled mortgage intelligence platform. Zero lead forms, zero data harvesting, zero lender hand-offs. Learn what we are, what we are not, and why we built it.",
  keywords: [
    "about HomeRates.AI",
    "consumer-controlled mortgage platform",
    "unbiased mortgage AI",
    "anti-lead-gen mortgage",
    "private mortgage intelligence",
    "mortgage education platform",
  ],
  alternates: { canonical: "https://chat.homerates.ai/about" },
  openGraph: {
    title: "About HomeRates.AI — Consumer-Controlled Mortgage Intelligence",
    description:
      "The first mortgage platform built for consumers, not lenders. Zero lead forms. Zero data harvesting. Zero lender hand-offs. Every conversation privately stored in your vault.",
    url: "https://chat.homerates.ai/about",
    siteName: "HomeRates.ai",
    type: "website",
  },
};

const aboutSchema = [
  {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    "@id": "https://chat.homerates.ai/about#webpage",
    "url": "https://chat.homerates.ai/about",
    "name": "About HomeRates.AI",
    "description":
      "HomeRates.AI is the first consumer-controlled mortgage intelligence platform. Zero lead forms, zero data harvesting, zero lender hand-offs.",
    "isPartOf": {
      "@id": "https://chat.homerates.ai/#webapp",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://chat.homerates.ai/#organization",
    "name": "HomeRates.AI",
    "url": "https://chat.homerates.ai",
    "description":
      "HomeRates.AI is the first consumer-controlled mortgage intelligence platform. An independent educational platform built to help consumers understand mortgage concepts, affordability, and financing trade-offs — with zero lead generation, zero data harvesting, and zero lender hand-offs. Not a lender, broker, or mortgage company.",
    "foundingDate": "2025",
    "knowsAbout": [
      "Mortgage education",
      "Home affordability",
      "FHA loans",
      "DSCR loans",
      "Mortgage refinancing",
      "Consumer mortgage literacy",
      "PITI calculations",
      "Debt-to-income ratio",
      "Private mortgage insurance",
      "Conforming loan limits 2026",
    ],
  },
];

export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutSchema) }}
      />
    <PageShell backHref="/" backLabel="Home" maxWidth={760}>
      <h1>About HomeRates.ai</h1>
      <span className="page-updated">Last Updated: January 2026</span>

      <p>HomeRates.ai is an independent educational platform built to help consumers and professionals better understand mortgage concepts, affordability factors, and real-world financing tradeoffs. It is designed to answer questions, explain terminology, and make complex topics easier to understand before any formal conversation with a mortgage lender.</p>

      <section>
        <h2>What HomeRates.ai Is</h2>
        <ul>
          <li>A general mortgage education and literacy tool that explains how things like DTI, DSCR, down payments, equity, and monthly payments work in principle.</li>
          <li>A way to explore &ldquo;what if&rdquo; scenarios so users can ask better questions when they speak with a licensed mortgage professional.</li>
          <li>A modern alternative to static FAQs, brochures, and mortgage glossaries.</li>
        </ul>
      </section>

      <section>
        <h2>What HomeRates.ai Is Not</h2>
        <ul>
          <li>It is not a mortgage lender, broker, or bank.</li>
          <li>It does not provide real-time rate quotes, official loan terms, or approvals.</li>
          <li>It does not act as a loan application system and does not submit information to any lender.</li>
          <li>It does not replace the role of a licensed mortgage professional or required disclosures under federal or state law.</li>
        </ul>
      </section>

      <section>
        <h2>How It Should Be Used</h2>
        <p>HomeRates.ai is intended as a starting point for learning and preparation. Users should treat all outputs as general education only, verify important details directly with a licensed mortgage lender, and consult appropriate financial, legal, or tax professionals before making decisions.</p>
      </section>

      <section>
        <h2>Independence from Mortgage Lenders</h2>
        <p>HomeRates.ai is not operated on behalf of, endorsed by, or affiliated with any specific mortgage lender or mortgage company. References to &ldquo;any mortgage lender&rdquo; within the app are generic and do not indicate a partnership or sponsorship.</p>
      </section>

      <section>
        <h2>More Information</h2>
        <p>For full details, please review the <a href="/disclosures">Terms &amp; Disclosures</a> and <a href="/privacy">Privacy &amp; Data Policy</a>.</p>
      </section>
    </PageShell>
    </>
  );
}
