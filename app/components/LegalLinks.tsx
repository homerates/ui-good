// app/components/LegalLinks.tsx
"use client";

import Link from "next/link";

async function logLegalClick(type: "disclosures" | "privacy") {
    try {
        await fetch("/api/legal-event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                type,
                ts: new Date().toISOString(),
            }),
            keepalive: true,
        });
    } catch {
        // best-effort only
    }
}

export default function LegalLinks() {
    return (
        <div className="legal-links">
            {/* Line 1 */}
            <div className="legal-links-row">
                <span>
                    HomeRates.ai is an independent educational tool and is not a mortgage
                    lender or broker.
                </span>
            </div>

            {/* Line 2 */}
            <div className="legal-links-row legal-links-row-bottom">
                <span>Educational only, not financial advice.</span>

                <Link
                    href="/disclosures"
                    className="legal-link"
                    onClick={() => logLegalClick("disclosures")}
                >
                    Terms &amp; Disclosures
                </Link>

                <span className="footer-separator">•</span>

                <Link
                    href="/privacy"
                    className="legal-link"
                    onClick={() => logLegalClick("privacy")}
                >
                    Privacy &amp; Data Policy
                </Link>

                <span className="footer-separator">•</span>
                <span>Build: Legal-2026.01</span>
            </div>
        </div>
    );
}
