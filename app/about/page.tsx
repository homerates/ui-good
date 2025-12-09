// app/about/page.tsx

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "About HomeRates.ai",
    description:
        "Learn what HomeRates.ai is, what it is for, and what it is not.",
};

export default function AboutPage() {
    return (
        <main className="legal-page">
            <div className="legal-page-inner">
                <h1>About HomeRates.ai</h1>
                <p className="legal-last-updated">Last Updated: January 2026</p>

                <div style={{ margin: "8px 0 16px" }}>
                    <Link href="/" className="legal-back-link">
                        ← Back to Home
                    </Link>
                </div>

                <p>
                    HomeRates.ai is an independent educational platform built to help
                    consumers and professionals better understand mortgage concepts,
                    affordability factors, and real-world financing tradeoffs. It is
                    designed to answer questions, explain terminology, and make complex
                    topics easier to understand before any formal conversation with a
                    mortgage lender.
                </p>

                <section>
                    <h2>What HomeRates.ai Is</h2>
                    <ul>
                        <li>
                            A general mortgage education and literacy tool that explains how
                            things like DTI, DSCR, down payments, equity, and monthly payments
                            work in principle.
                        </li>
                        <li>
                            A way to explore “what if” scenarios in a conceptual, hypothetical
                            way so users can ask better questions when they speak with a
                            licensed mortgage professional.
                        </li>
                        <li>
                            A modern alternative to static FAQs, brochures, and mortgage
                            glossaries.
                        </li>
                    </ul>
                </section>

                <section>
                    <h2>What HomeRates.ai Is Not</h2>
                    <ul>
                        <li>It is not a mortgage lender, broker, or bank.</li>
                        <li>
                            It does not provide real-time rate quotes, official loan terms, or
                            approvals.
                        </li>
                        <li>
                            It does not act as a loan application system and does not submit
                            information to any lender.
                        </li>
                        <li>
                            It does not replace the role of a licensed mortgage professional
                            or required disclosures under federal or state law.
                        </li>
                    </ul>
                </section>

                <section>
                    <h2>How It Should Be Used</h2>
                    <p>
                        HomeRates.ai is intended to be used as a starting point for learning
                        and preparation. Users should:
                    </p>
                    <ul>
                        <li>treat all outputs as general education only,</li>
                        <li>
                            verify important details directly with a licensed mortgage lender,
                        </li>
                        <li>
                            consult appropriate financial, legal, or tax professionals before
                            making decisions.
                        </li>
                    </ul>
                </section>

                <section>
                    <h2>Independence from Mortgage Lenders</h2>
                    <p>
                        HomeRates.ai is not operated on behalf of, endorsed by, or affiliated
                        with any specific mortgage lender or mortgage company. References to{" "}
                        “any mortgage lender” within the app are generic and do not indicate
                        a partnership or sponsorship.
                    </p>
                </section>

                <section>
                    <h2>More Information</h2>
                    <p>
                        For full details, please review the{" "}
                        <a href="/disclosures">Terms &amp; Disclosures</a> and{" "}
                        <a href="/privacy">Privacy &amp; Data Policy</a>.
                    </p>
                </section>
            </div>
        </main>
    );
}
