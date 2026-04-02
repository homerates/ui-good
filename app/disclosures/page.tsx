// app/disclosures/page.tsx
import type { Metadata } from "next";
import PageShell from "../components/PageShell";

export const metadata: Metadata = {
  title: "Terms & Disclosures | HomeRates.ai",
  description: "HomeRates.ai terms, disclosures, and important information about how this educational mortgage tool should be used.",
};

export default function DisclosuresPage() {
  return (
    <PageShell backHref="/" backLabel="Home" maxWidth={760}>
      <h1>Terms &amp; Disclosures</h1>
      <span className="page-updated">Last Updated: April 2026</span>

      <p>HomeRates.ai is an independent educational platform designed to help consumers and professionals understand general mortgage concepts, terminology, affordability factors, and market dynamics. HomeRates.ai is <strong>not</strong> a mortgage lender, mortgage broker, or financial institution, and does <strong>not</strong> originate loans, provide credit decisions, or issue commitments to lend.</p>
      <p>By using HomeRates.ai, you acknowledge and agree to the following Terms &amp; Disclosures. If you do not agree with these terms, you should not use the service.</p>

      <hr />

      <section>
        <h2>1. Not a Mortgage Lender or Broker</h2>
        <p>HomeRates.ai does not represent or act on behalf of any mortgage lender, mortgage broker, bank, or financial institution. References to "any mortgage lender" within the app are generic and illustrative only.</p>
        <p>All mortgage applications, credit decisions, required disclosures, underwriting determinations, and interest rate quotes must be obtained directly from a licensed mortgage lender or mortgage company. HomeRates.ai:</p>
        <ul>
          <li>does not provide official loan terms or offers to extend credit;</li>
          <li>does not determine qualification, approval, or denial;</li>
          <li>does not issue Loan Estimates (LE), Closing Disclosures (CD), or pre-approvals;</li>
          <li>does not guarantee interest rates, fees, closing costs, or program availability.</li>
        </ul>
      </section>

      <section>
        <h2>2. Educational Content Only</h2>
        <p>All information provided by HomeRates.ai is intended for <strong>general educational purposes only</strong>. Nothing presented within the app should be interpreted as financial advice, legal advice, tax advice, investment advice, or personalized mortgage guidance.</p>
        <p>Any examples, scenarios, or calculations are hypothetical and provided solely to illustrate concepts. Users must verify all details with a licensed mortgage lender, financial professional, or qualified advisor before taking action.</p>
      </section>

      <section>
        <h2>3. No Guarantee of Accuracy or Completeness</h2>
        <p>Mortgage programs, eligibility criteria, interest rates, regulatory requirements, and market conditions change frequently. While HomeRates.ai strives to provide current and accurate information, no guarantee is made as to completeness, timeliness, or accuracy.</p>
      </section>

      <section>
        <h2>4. No Credit Decisions, Approvals, or Guarantees</h2>
        <p>HomeRates.ai does not perform credit underwriting or issue lending decisions. The platform does not pull or analyze credit reports, approve or deny mortgage applications, determine final loan terms, or provide any form of binding commitment, pre-qualification, or pre-approval.</p>
      </section>

      <section>
        <h2>5. No Steering or Product Recommendations</h2>
        <p>HomeRates.ai does not steer, recommend, or favor any specific mortgage product, lender, or loan structure. Any mention of loan types is for illustrative and educational purposes only.</p>
      </section>

      <section>
        <h2>6. No Mortgage Application or Loan Processing</h2>
        <p>HomeRates.ai is not a loan application portal and does not submit information to any lender. The app does not collect or process Social Security numbers, credit reports, bank statements, tax returns, employment verification data, or loan application forms.</p>
      </section>

      <section>
        <h2>7. Subscription Plans, Billing &amp; Payments</h2>
        <p>HomeRates.ai offers both free and paid subscription plans. Paid plans are billed on a monthly or annual basis through Stripe. By subscribing, you authorize HomeRates.ai to charge your payment method on a recurring basis until you cancel.</p>
        <ul>
          <li><strong>Monthly plans</strong> are billed once per month on the anniversary of your subscription start date.</li>
          <li><strong>Annual plans</strong> are billed once per year as a single upfront charge.</li>
          <li>Prices are listed in USD and are subject to change with reasonable notice.</li>
          <li>All payments are processed securely by Stripe. HomeRates.ai does not store your full credit card details.</li>
        </ul>
      </section>

      <section>
        <h2>8. Cancellation Policy</h2>
        <p>You may cancel your subscription at any time through the billing portal in your account settings. Cancellation takes effect at the end of your current billing period. You will retain full access to paid features until that date. HomeRates.ai does not charge cancellation fees.</p>
      </section>

      <section>
        <h2>9. Refund Policy</h2>
        <p>HomeRates.ai offers a <strong>7-day money-back guarantee</strong> on all new paid subscriptions. Contact <a href="mailto:support@homerates.ai">support@homerates.ai</a> within 7 days of your initial subscription for a full refund, no questions asked.</p>
        <p>After the 7-day period: monthly plans are non-refundable for the current billing period; annual plan refund requests are evaluated on a case-by-case basis. Refunds may take 5–10 business days to appear.</p>
      </section>

      <section>
        <h2>10. Independence from Any Mortgage Lender</h2>
        <p>HomeRates.ai is an independent educational tool. It is not owned, operated, endorsed, or sponsored by any mortgage lender or mortgage company.</p>
      </section>

      <section>
        <h2>11. User Responsibility</h2>
        <p>By using HomeRates.ai, you agree that you are solely responsible for how you interpret and use the information provided, and for verifying all mortgage-related information with a licensed mortgage lender before making decisions.</p>
      </section>

      <section>
        <h2>12. Limitation of Liability</h2>
        <p>To the fullest extent permitted by law, HomeRates.ai and its operators shall not be liable for any direct, indirect, incidental, consequential, or special damages arising out of or in connection with the use of the app.</p>
      </section>

      <section>
        <h2>13. Changes to These Terms</h2>
        <p>HomeRates.ai may update these Terms from time to time. The most current version will always be available on this page. Continued use constitutes acceptance of the updated terms.</p>
      </section>

      <section>
        <h2>14. Contact</h2>
        <p><strong>HomeRatesAi LLC</strong><br />
        1401 Pennsylvania Ave Suite 105A PMB 70722<br />
        Wilmington, DE 19806<br />
        <strong>Email:</strong> <a href="mailto:support@homerates.ai">support@homerates.ai</a></p>
      </section>
    </PageShell>
  );
}
