// app/disclosures/page.tsx

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Terms & Disclosures | HomeRates.ai",
    description:
        "HomeRates.ai terms, disclosures, and important information about how this educational mortgage tool should be used.",
};

export default function DisclosuresPage() {
    return (
        <main className="legal-page">
            <div className="legal-page-inner">
                <h1>HomeRates.ai – Terms &amp; Disclosures</h1>
                <p className="legal-last-updated">Last Updated: March 2026</p>

                <div style={{ margin: "8px 0 16px" }}>
                    <Link href="/" className="legal-back-link">
                        ← Back to Home
                    </Link>
                </div>

                <p>
                    HomeRates.ai is an independent educational platform designed to help
                    consumers and professionals understand general mortgage concepts,
                    terminology, affordability factors, and market dynamics. HomeRates.ai
                    is <strong>not</strong> a mortgage lender, mortgage broker, or
                    financial institution, and does <strong>not</strong> originate loans,
                    provide credit decisions, or issue commitments to lend.
                </p>

                <p>
                    By using HomeRates.ai, you acknowledge and agree to the following
                    Terms &amp; Disclosures. If you do not agree with these terms, you
                    should not use the service.
                </p>

                <hr />

                <section>
                    <h2>1. Not a Mortgage Lender or Broker</h2>
                    <p>
                        HomeRates.ai does not represent or act on behalf of any mortgage
                        lender, mortgage broker, bank, or financial institution. References
                        to “any mortgage lender” within the app are generic and illustrative
                        only.
                    </p>
                    <p>
                        All mortgage applications, credit decisions, required disclosures,
                        underwriting determinations, and interest rate quotes must be
                        obtained directly from a licensed mortgage lender or mortgage
                        company. HomeRates.ai:
                    </p>
                    <ul>
                        <li>does not provide official loan terms or offers to extend credit;</li>
                        <li>does not determine qualification, approval, or denial;</li>
                        <li>
                            does not issue Loan Estimates (LE), Closing Disclosures (CD), or
                            pre-approvals;
                        </li>
                        <li>
                            does not guarantee interest rates, fees, closing costs, or
                            program availability.
                        </li>
                    </ul>
                </section>

                <section>
                    <h2>2. Educational Content Only</h2>
                    <p>
                        All information provided by HomeRates.ai is intended for{" "}
                        <strong>general educational purposes only</strong>. Nothing
                        presented within the app should be interpreted as:
                    </p>
                    <ul>
                        <li>financial advice,</li>
                        <li>legal advice,</li>
                        <li>tax advice,</li>
                        <li>investment advice, or</li>
                        <li>personalized mortgage guidance.</li>
                    </ul>
                    <p>
                        Any examples, scenarios, or calculations (including monthly
                        payments, DSCR ratios, debt-to-income estimates, or potential
                        savings) are hypothetical and provided solely to illustrate concepts.
                        They may not reflect current program guidelines, lender overlays, or
                        market conditions. Users must verify all details with a licensed
                        mortgage lender, financial professional, or qualified advisor before
                        taking action.
                    </p>
                </section>

                <section>
                    <h2>3. No Guarantee of Accuracy or Completeness</h2>
                    <p>
                        Mortgage programs, eligibility criteria, interest rates, regulatory
                        requirements, and market conditions change frequently. While
                        HomeRates.ai strives to provide information that is current and
                        accurate, no guarantee is made as to completeness, timeliness, or
                        accuracy.
                    </p>
                    <p>
                        Users should always confirm important information directly with a
                        licensed mortgage lender, including but not limited to:
                    </p>
                    <ul>
                        <li>loan program requirements,</li>
                        <li>interest rate and pricing options,</li>
                        <li>underwriting guidelines and overlays,</li>
                        <li>qualification criteria and documentation needs.</li>
                    </ul>
                </section>

                <section>
                    <h2>4. No Credit Decisions, Approvals, or Guarantees</h2>
                    <p>
                        HomeRates.ai does not perform credit underwriting or issue lending
                        decisions. Any language within the app that discusses “qualification”
                        or “eligibility” is strictly educational and refers to general
                        industry practices, not to any specific lender&apos;s actual
                        decision on a real file.
                    </p>
                    <p>HomeRates.ai does not:</p>
                    <ul>
                        <li>pull or analyze credit reports,</li>
                        <li>approve or deny mortgage applications,</li>
                        <li>determine final loan terms, conditions, or rates,</li>
                        <li>
                            provide any form of binding commitment, pre-qualification, or
                            pre-approval.
                        </li>
                    </ul>
                </section>

                <section>
                    <h2>5. No Steering or Product Recommendations</h2>
                    <p>
                        HomeRates.ai does not steer, recommend, or favor any specific
                        mortgage product, lender, or loan structure. Any mention of loan
                        types (for example, conventional, FHA, VA, jumbo, DSCR, or down
                        payment assistance programs) is for illustrative and educational
                        purposes only.
                    </p>
                    <p>
                        Users should consult directly with a licensed mortgage lender to
                        determine which products, if any, may be appropriate for their
                        individual situation.
                    </p>
                </section>

                <section>
                    <h2>6. No Mortgage Application or Loan Processing</h2>
                    <p>
                        HomeRates.ai is not a loan application portal and does not submit
                        information to any lender. The app does not collect or process:
                    </p>
                    <ul>
                        <li>Social Security numbers,</li>
                        <li>credit reports or credit scores,</li>
                        <li>bank statements or asset documentation,</li>
                        <li>tax returns or W-2s,</li>
                        <li>employment verification data,</li>
                        <li>loan application forms.</li>
                    </ul>
                    <p>
                        Any decision to apply for a mortgage must be made directly with a
                        mortgage lender through that lender&apos;s official systems and
                        processes.
                    </p>
                </section>

                <section>
                    <h2>7. Subscription Plans, Billing &amp; Payments</h2>
                    <p>
                        HomeRates.ai offers both free and paid subscription plans. Paid plans
                        are billed on a monthly or annual basis through Stripe, a third-party
                        payment processor. By subscribing to a paid plan, you authorize
                        HomeRates.ai to charge your payment method on a recurring basis until
                        you cancel.
                    </p>
                    <ul>
                        <li>
                            <strong>Monthly plans</strong> are billed once per month on the
                            anniversary of your subscription start date.
                        </li>
                        <li>
                            <strong>Annual plans</strong> are billed once per year as a single
                            upfront charge.
                        </li>
                        <li>
                            Prices are listed in USD and are subject to change with reasonable
                            notice.
                        </li>
                        <li>
                            All payments are processed securely by Stripe. HomeRates.ai does
                            not store your full credit card details.
                        </li>
                    </ul>
                </section>

                <section>
                    <h2>8. Cancellation Policy</h2>
                    <p>
                        You may cancel your subscription at any time through the billing
                        portal accessible from your account dashboard. Cancellation takes
                        effect at the end of your current billing period. You will retain
                        full access to paid features until that date.
                    </p>
                    <p>
                        HomeRates.ai does not charge cancellation fees. After your
                        subscription ends, your account will revert to the free plan.
                    </p>
                </section>

                <section>
                    <h2>9. Refund Policy</h2>
                    <p>
                        HomeRates.ai offers a <strong>7-day money-back guarantee</strong> on
                        all new paid subscriptions. If you are not satisfied within the first
                        7 days of your initial subscription, contact us at support@homerates.ai
                        and we will issue a full refund, no questions asked.
                    </p>
                    <p>
                        After the 7-day period:
                    </p>
                    <ul>
                        <li>
                            <strong>Monthly plans</strong> — no refunds are issued for the
                            current billing period. You may cancel at any time to prevent
                            future charges.
                        </li>
                        <li>
                            <strong>Annual plans</strong> — refund requests after 7 days are
                            evaluated on a case-by-case basis. Contact support@homerates.ai
                            to request a prorated refund.
                        </li>
                    </ul>
                    <p>
                        Refunds are issued to the original payment method and may take
                        5–10 business days to appear depending on your bank.
                    </p>
                </section>

                <section>
                    <h2>10. Independence from Any Mortgage Lender</h2>
                    <p>
                        HomeRates.ai is an independent educational tool. It is not owned,
                        operated, endorsed, or sponsored by any mortgage lender or mortgage
                        company. References to “any mortgage lender” are generic and do not
                        indicate affiliation or partnership.
                    </p>
                </section>

                <section>
                    <h2>11. User Responsibility</h2>
                    <p>
                        By using HomeRates.ai, you agree that you are solely responsible
                        for:
                    </p>
                    <ul>
                        <li>how you interpret and use the information provided,</li>
                        <li>
                            verifying all mortgage-related information with a licensed
                            mortgage lender, and
                        </li>
                        <li>
                            consulting appropriate professionals (financial, legal, tax) before
                            making decisions.
                        </li>
                    </ul>
                    <p>
                        You agree not to hold HomeRates.ai or its operators liable for any
                        decisions made or actions taken based on information obtained through
                        the app.
                    </p>
                </section>

                <section>
                    <h2>12. Limitation of Liability</h2>
                    <p>
                        To the fullest extent permitted by law, HomeRates.ai and its
                        operators shall not be liable for any direct, indirect, incidental,
                        consequential, or special damages arising out of or in connection
                        with the use of, or inability to use, the app or any information
                        provided through it.
                    </p>
                </section>

                <section>
                    <h2>13. Changes to These Terms &amp; Disclosures</h2>
                    <p>
                        HomeRates.ai may update these Terms &amp; Disclosures from time to
                        time. The most current version will always be available on this
                        page. Continued use of the app after changes are posted constitutes
                        acceptance of the updated terms.
                    </p>
                </section>

                <section>
                    <h2>14. Contact</h2>
                    <p>
                        For questions about these Terms &amp; Disclosures, you may contact:
                    </p>
                    <p>
                        <strong>Email:</strong> support@homerates.ai
                    </p>
                </section>
            </div>
        </main>
    );
}
