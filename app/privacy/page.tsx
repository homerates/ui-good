// app/privacy/page.tsx

import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Privacy & Data Policy | HomeRates.ai",
    description:
        "HomeRates.ai privacy and data handling policy, including what information is collected and how it is used.",
};

export default function PrivacyPage() {
    return (
        <main className="legal-page">
            <div className="legal-page-inner">
                <h1>HomeRates.ai – Privacy &amp; Data Policy</h1>
                <p className="legal-last-updated">Last Updated: January 2026</p>

                <p>
                    HomeRates.ai respects the privacy of all users and is committed to
                    maintaining appropriate safeguards for data and information processed
                    through the platform. This Privacy &amp; Data Policy explains what
                    information we collect, how it is used, and how it is stored.
                </p>

                <hr />

                <section>
                    <h2>1. Information We Do Not Collect</h2>
                    <p>
                        HomeRates.ai is designed as an educational tool and is{" "}
                        <strong>not</strong> a mortgage application system. The platform
                        does <strong>not</strong> request, collect, or store:
                    </p>
                    <ul>
                        <li>Social Security numbers;</li>
                        <li>credit reports or credit scores;</li>
                        <li>tax returns, W-2s, or pay stubs;</li>
                        <li>bank statements or account numbers;</li>
                        <li>loan application forms or loan numbers;</li>
                        <li>government-issued identification numbers.</li>
                    </ul>
                    <p>
                        Users should never enter sensitive personal financial information
                        into the app. All mortgage applications and personal financial data
                        must be handled directly and exclusively with a licensed mortgage
                        lender through that lender&apos;s approved systems.
                    </p>
                </section>

                <section>
                    <h2>2. Information We May Collect</h2>
                    <p>
                        To operate and improve the service, HomeRates.ai may collect limited
                        technical and usage information, such as:
                    </p>
                    <ul>
                        <li>questions and prompts submitted to the AI;</li>
                        <li>
                            anonymized or pseudonymized interaction logs (for example, which
                            features are used and how often);
                        </li>
                        <li>basic device or browser information;</li>
                        <li>non-identifying technical data such as IP address and timestamps;</li>
                        <li>optional user preferences or settings.</li>
                    </ul>
                    <p>
                        This information is used solely to maintain system performance,
                        improve answer quality, and enhance the educational experience.
                    </p>
                </section>

                <section>
                    <h2>3. How We Use Collected Data</h2>
                    <p>HomeRates.ai may use collected data to:</p>
                    <ul>
                        <li>improve answer accuracy and relevance;</li>
                        <li>monitor system reliability and performance;</li>
                        <li>identify and fix technical issues;</li>
                        <li>
                            understand which features are most helpful for users and prioritize
                            future improvements;
                        </li>
                        <li>maintain security and prevent misuse of the platform.</li>
                    </ul>
                    <p>
                        HomeRates.ai does <strong>not</strong> sell user data and does{" "}
                        <strong>not</strong> share personal financial information with third
                        parties.
                    </p>
                </section>

                <section>
                    <h2>4. Data Storage &amp; Security</h2>
                    <p>
                        HomeRates.ai is hosted on reputable cloud infrastructure providers
                        that use industry-standard security measures. While no system can be
                        guaranteed 100 percent secure, reasonable efforts are made to
                        protect data against unauthorized access, loss, or misuse.
                    </p>
                    <p>
                        Interaction logs may be retained for a period of time to support
                        troubleshooting, quality improvement, and internal analytics. These
                        logs are not used to make lending decisions and are not shared with
                        mortgage lenders for underwriting purposes.
                    </p>
                </section>

                <section>
                    <h2>5. Third-Party Services</h2>
                    <p>
                        HomeRates.ai may use third-party services for infrastructure,
                        analytics, or AI processing (for example, hosting providers, logging
                        tools, or AI model providers). These services may process limited
                        technical data in order to operate the platform.
                    </p>
                    <p>
                        No third-party service is permitted to use HomeRates.ai data for
                        marketing its own products to users, and no sensitive personal
                        financial information is provided to such services through this app.
                    </p>
                </section>

                <section>
                    <h2>6. Cookies and Similar Technologies</h2>
                    <p>
                        HomeRates.ai may use cookies or similar technologies to support
                        basic functionality (such as keeping a session active or remembering
                        simple preferences). These are not used to track personal financial
                        information.
                    </p>
                </section>

                <section>
                    <h2>7. User Control and Data Requests</h2>
                    <p>
                        Users may request that their identifiable usage data be deleted,
                        where applicable, by contacting:
                    </p>
                    <p>
                        <strong>Email:</strong> support@homerates.ai
                    </p>
                    <p>
                        Depending on how access is provided, some data may be technically
                        anonymized or aggregated and may not be individually identifiable.
                    </p>
                </section>

                <section>
                    <h2>8. Children&apos;s Privacy</h2>
                    <p>
                        HomeRates.ai is intended for adults and is not directed to children
                        under the age of 18. We do not knowingly collect personal data from
                        children.
                    </p>
                </section>

                <section>
                    <h2>9. Data Storage Statement</h2>
                    <p>
                        HomeRates.ai does not store, transmit, or process formal mortgage
                        application data and does not act as a system of record for any
                        mortgage lender. All data processed through the app is used solely to
                        provide educational content and improve the performance of the
                        platform.
                    </p>
                </section>

                <section>
                    <h2>10. Changes to This Policy</h2>
                    <p>
                        HomeRates.ai may update this Privacy &amp; Data Policy from time to
                        time. The most current version will always be available on this
                        page. Continued use of the app after changes are posted constitutes
                        acceptance of the updated policy.
                    </p>
                </section>

                <section>
                    <h2>11. Contact</h2>
                    <p>
                        For questions about this Privacy &amp; Data Policy, you may contact:
                    </p>
                    <p>
                        <strong>Email:</strong> support@homerates.ai
                    </p>
                </section>
            </div>
        </main>
    );
}
