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
        // Fail silently – logging is best-effort only
    }
}

export default function LegalLinks() {
    return (
        <div className="legal-links">
            <p className="legal-links-text">
                HomeRates.ai is an independent educational tool and is not a mortgage
                lender or broker. It does not provide credit decisions, loan approvals,
                or rate guarantees. All official loan information must be obtained
                directly from a licensed mortgage lender.
            </p>

            <div className="legal-links-row">
                <Link
                    href="/disclosures"
                    className="legal-link"
                    onClick={() => logLegalClick("disclosures")}
                >
                    Terms &amp; Disclosures
                </Link>
                <span className="legal-link-separator">•</span>
                <Link
                    href="/privacy"
                    className="legal-link"
                    onClick={() => logLegalClick("privacy")}
                >
                    Privacy &amp; Data Policy
                </Link>
            </div>
        </div>
    );
}
