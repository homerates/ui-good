// app/onboarding/success/page.tsx

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Welcome to HomeRates.ai",
    description: "Your HomeRates.ai access is now active.",
};

// In your Next version, searchParams is a *Promise*.
// We mark the component async and await it.
type SearchParamsPromise = Promise<
    Record<string, string | string[] | undefined>
>;

export default async function OnboardingSuccessPage({
    searchParams,
}: {
    searchParams: SearchParamsPromise;
}) {
    const resolved = await searchParams;

    const rawBorrower = resolved.borrower;
    const borrowerId = Array.isArray(rawBorrower)
        ? rawBorrower[0]
        : rawBorrower ?? "";

    const chatHref = borrowerId
        ? `https://chat.homerates.ai/?borrower=${encodeURIComponent(borrowerId)}`
        : "https://chat.homerates.ai";

    return (
        <main
            style={{
                minHeight: "calc(100vh - 40px)", // keeps clear of your small footer
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px",
            }}
        >
            <section
                style={{
                    width: "100%",
                    maxWidth: "480px",
                    padding: "24px 20px",
                    borderRadius: "16px",
                    border: "1px solid rgba(148, 163, 184, 0.4)",
                    boxShadow: "0 18px 45px rgba(15, 23, 42, 0.10)",
                    background: "rgba(255, 255, 255, 0.98)",
                }}
            >
                <header style={{ marginBottom: "16px" }}>
                    <p
                        style={{
                            fontSize: "0.75rem",
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: "#64748b",
                            marginBottom: "4px",
                        }}
                    >
                        Onboarding complete
                    </p>
                    <h1
                        style={{
                            fontSize: "1.3rem",
                            fontWeight: 600,
                            lineHeight: 1.25,
                            color: "#0f172a",
                            margin: 0,
                        }}
                    >
                        Your HomeRates.ai access is active
                    </h1>
                </header>

                <p
                    style={{
                        fontSize: "0.9rem",
                        lineHeight: 1.5,
                        color: "#475569",
                        marginBottom: "20px",
                    }}
                >
                    You&apos;re all set. Your profile is linked to your loan officer, and
                    your questions will now stay attached to your file behind the scenes.
                </p>

                {borrowerId && (
                    <p
                        style={{
                            fontSize: "0.75rem",
                            lineHeight: 1.4,
                            color: "#94a3b8",
                            marginBottom: "16px",
                            wordBreak: "break-all",
                        }}
                    >
                        Borrower ID:&nbsp;
                        <span
                            style={{
                                fontFamily:
                                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                            }}
                        >
                            {borrowerId}
                        </span>
                    </p>
                )}

                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        marginTop: "8px",
                    }}
                >
                    <Link
                        href={chatHref}
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "10px 14px",
                            borderRadius: "999px",
                            fontSize: "0.9rem",
                            fontWeight: 500,
                            textDecoration: "none",
                            border: "1px solid #0f172a",
                        }}
                    >
                        Enter HomeRates.ai
                    </Link>

                    <p
                        style={{
                            fontSize: "0.75rem",
                            lineHeight: 1.4,
                            color: "#94a3b8",
                            textAlign: "center",
                            marginTop: "2px",
                        }}
                    >
                        You can close this tab at any time. Your conversations will stay
                        linked to your loan officer through your borrower ID.
                    </p>
                </div>
            </section>
        </main>
    );
}
