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
        <h2>8. Platform Credits</h2>
        <p>HomeRates.ai may award platform credits ("Credits") as a participation bonus for activities such as account creation, referrals, and founding membership. Credits are not currency, have no cash value, and are non-transferable except where explicitly supported by the platform (e.g., LO-to-borrower gifting).</p>
        <ul>
          <li><strong>Earning credits</strong> is available to all users, including those on the free plan.</li>
          <li><strong>Redeeming credits</strong> requires an active paid subscription (Plus or Pro). Free-tier users accumulate credits but may not apply them until a paid plan is active.</li>
          <li>HomeRates.ai reserves the right to modify, expire, or discontinue the Credits program at any time with reasonable notice.</li>
          <li>Credits have no monetary value and cannot be exchanged for cash, transferred to third parties outside platform features, or carried forward indefinitely at HomeRates.ai's discretion.</li>
        </ul>
      </section>

      <section>
        <h2>10. Cancellation Policy</h2>
        <p>You may cancel your subscription at any time through the billing portal in your account settings. Cancellation takes effect at the end of your current billing period. You will retain full access to paid features until that date. HomeRates.ai does not charge cancellation fees.</p>
      </section>

      <section>
        <h2>11. Refund Policy</h2>
        <p>HomeRates.ai offers a <strong>7-day money-back guarantee</strong> on all new paid subscriptions. Contact <a href="mailto:support@homerates.ai">support@homerates.ai</a> within 7 days of your initial subscription for a full refund, no questions asked.</p>
        <p>After the 7-day period: monthly plans are non-refundable for the current billing period; annual plan refund requests are evaluated on a case-by-case basis. Refunds may take 5–10 business days to appear.</p>
      </section>

      <section>
        <h2>12. Independence from Any Mortgage Lender</h2>
        <p>HomeRates.ai is an independent educational tool. It is not owned, operated, endorsed, or sponsored by any mortgage lender or mortgage company.</p>
      </section>

      <section>
        <h2>13. User Responsibility</h2>
        <p>By using HomeRates.ai, you agree that you are solely responsible for how you interpret and use the information provided, and for verifying all mortgage-related information with a licensed mortgage lender before making decisions.</p>
      </section>

      <section>
        <h2>14. Limitation of Liability</h2>
        <p>To the fullest extent permitted by law, HomeRates.ai and its operators shall not be liable for any direct, indirect, incidental, consequential, or special damages arising out of or in connection with the use of the app.</p>
      </section>

      <section>
        <h2>15. Professional Matching — Introduction Service Only</h2>
        <p>HomeRates.ai operates as a <strong>technology platform and introduction service only</strong>. When borrowers and mortgage professionals (loan officers, agents) connect through the platform, HomeRates.ai's role ends at the point of introduction. Specifically:</p>
        <ul>
          <li>HomeRates.ai does <strong>not</strong> verify, validate, or guarantee the accuracy of any contact information provided by borrowers or professionals, including email addresses, phone numbers, or business details.</li>
          <li>HomeRates.ai does <strong>not</strong> guarantee that any borrower will respond to, engage with, or proceed with a mortgage application after contact information has been exchanged.</li>
          <li>HomeRates.ai does <strong>not</strong> guarantee that any professional's rate indication, approach, or service offering will result in a completed transaction.</li>
          <li>HomeRates.ai does <strong>not</strong> mediate, arbitrate, or intervene in any dispute between a borrower and a professional arising from or related to any introduction made through the platform.</li>
          <li>HomeRates.ai does <strong>not</strong> issue refunds, credits, or compensation to any party based on the outcome of a professional-borrower introduction, including cases where a borrower is unresponsive, contact information is inaccurate, or a transaction does not close.</li>
        </ul>
        <p>By using the matching and messaging features of HomeRates.ai, all parties expressly acknowledge and agree that HomeRates.ai bears no liability for the outcome of any introduction, the quality of any service rendered, or any failure to communicate, transact, or perform.</p>
      </section>

      <section>
        <h2>16. Professional Conduct — No Liability for Third-Party Actions</h2>
        <p>Mortgage professionals (loan officers and real estate agents) who use HomeRates.ai are independent licensed professionals operating under their own applicable state and federal licensing requirements. HomeRates.ai:</p>
        <ul>
          <li>does <strong>not</strong> employ, supervise, direct, or control any loan officer, real estate agent, or other professional using the platform;</li>
          <li>does <strong>not</strong> endorse, recommend, or vouch for the quality, competence, or conduct of any individual professional;</li>
          <li>does <strong>not</strong> accept responsibility for any advice, quote, representation, or service provided by any professional through or outside of the platform;</li>
          <li>does <strong>not</strong> mediate, resolve, or take sides in any dispute between a borrower and a professional, including complaints of misconduct, misrepresentation, non-performance, or regulatory violations.</li>
        </ul>
        <p>Users who believe a professional has engaged in unlawful conduct should contact the relevant state licensing authority (e.g., NMLS Consumer Access at <a href="https://nmlsconsumeraccess.org" target="_blank" rel="noopener noreferrer">nmlsconsumeraccess.org</a> for mortgage professionals, or the applicable state real estate commission for agents).</p>
      </section>

      <section>
        <h2>17. Scenario Posting — Anti-Abuse Policy</h2>
        <p>Borrowers may post mortgage scenarios to the HomeRates.ai platform to receive rate indications and approaches from licensed professionals. By posting a scenario, you agree that:</p>
        <ul>
          <li>all information provided is accurate and truthful to the best of your knowledge;</li>
          <li>you will not post duplicate, fabricated, or test scenarios intended to mislead or waste the time of professionals;</li>
          <li>posting a scenario does not obligate you to proceed with any professional, but you agree to act in good faith toward professionals who respond;</li>
          <li>HomeRates.ai reserves the right to suspend or terminate access for users who engage in abusive, repetitive, or bad-faith scenario posting.</li>
        </ul>
      </section>

      <section>
        <h2>18. AI Model Accuracy — You're Part of What Makes This Better</h2>
        <p>HomeRates.ai uses some of the most advanced AI reasoning models available today. The scenario analysis engine, card routing logic, and memory system that personalizes your experience represent genuinely new technology — the kind that is still maturing, still learning, and still improving with every conversation.</p>
        <p>What that means in practice: the system is exceptionally good at the vast majority of mortgage calculations, rate analysis, and scenario comparisons it handles every day. But like any frontier AI, it can occasionally drift — selecting the wrong card type, misrouting a scenario, or carrying stale context from an earlier part of a conversation that leads it down the wrong path.</p>
        <p><strong>When that happens, here is what to do:</strong></p>
        <ul>
          <li><strong>Start a new chat.</strong> This flushes the memory context and gives the model a clean slate. Most drift issues resolve immediately with a fresh session.</li>
          <li><strong>Share the card with our team.</strong> If you see a scenario card that is clearly wrong — wrong loan type, wrong numbers, wrong product — take a screenshot and send it to <a href="mailto:support@homerates.ai">support@homerates.ai</a> with a brief note on what you asked and what you expected. Every report directly improves the routing logic for every user who comes after you.</li>
        </ul>
        <p>We are transparent about this because we believe users deserve to understand the tools they rely on. The mortgage decisions that flow from these conversations are significant — and accuracy matters deeply to us. Our team reviews every reported drift case, traces it back to the routing decision that caused it, and uses it to improve the model.</p>
        <p>HomeRates.ai users are not just using a product — they are active participants in building the most accurate AI mortgage intelligence platform in the industry. We are grateful for that partnership, and we take every piece of feedback seriously.</p>
        <p><em>Note: AI-generated scenario cards and analysis are for educational and illustrative purposes only. Always verify outputs with a licensed mortgage professional before making financial decisions. See Section 2 (Educational Content Only) and Section 4 (No Credit Decisions) above.</em></p>
      </section>

      <section>
        <h2>19. Changes to These Terms</h2>
        <p>HomeRates.ai may update these Terms from time to time. The most current version will always be available on this page. Continued use constitutes acceptance of the updated terms.</p>
      </section>

      <section>
        <h2>20. Contact</h2>
        <p><strong>HomeRatesAi LLC</strong><br />
        1401 Pennsylvania Ave Suite 105A PMB 70722<br />
        Wilmington, DE 19806<br />
        <strong>Email:</strong> <a href="mailto:support@homerates.ai">support@homerates.ai</a></p>
      </section>
    </PageShell>
  );
}
