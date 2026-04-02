// app/about/page.tsx
import type { Metadata } from "next";
import PageShell from "../components/PageShell";

export const metadata: Metadata = {
  title: "About HomeRates.ai",
  description: "Learn what HomeRates.ai is, what it is for, and what it is not.",
};

export default function AboutPage() {
  return (
    <PageShell backHref="/" backLabel="Home" maxWidth={760}>
      <h1>About HomeRates.ai</h1>
      <span className="page-updated">Last Updated: April 2026</span>

      <p>HomeRates.ai is a product of <strong>HomeRatesAi LLC</strong>, a Delaware limited liability company. It is an independent educational platform built to help consumers and professionals better understand mortgage concepts, affordability factors, and real-world financing tradeoffs. It is designed to answer questions, explain terminology, and make complex topics easier to understand before any formal conversation with a mortgage lender.</p>

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
        <p>Questions? Contact us at <a href="mailto:support@homerates.ai">support@homerates.ai</a>.</p>
      </section>
    </PageShell>
  );
}
