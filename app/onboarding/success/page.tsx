// app/onboarding/success/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "../../components/PageShell";

export const metadata: Metadata = {
  title: "Welcome to HomeRates.ai",
  description: "Your HomeRates.ai access is now active.",
};

type SearchParamsPromise = Promise<Record<string, string | string[] | undefined>>;

export default async function OnboardingSuccessPage({
  searchParams,
}: {
  searchParams: SearchParamsPromise;
}) {
  const resolved = await searchParams;
  const rawBorrower = resolved.borrower;
  const borrowerId = Array.isArray(rawBorrower) ? rawBorrower[0] : rawBorrower ?? "";
  const chatHref = borrowerId
    ? `https://chat.homerates.ai/?borrower=${encodeURIComponent(borrowerId)}`
    : "https://chat.homerates.ai";

  return (
    <PageShell backHref="/" backLabel="Home" maxWidth={480}>
      <div style={{
        background: "rgba(0,232,122,0.05)",
        border: "1px solid rgba(0,232,122,0.2)",
        borderRadius: 16,
        padding: "32px 28px",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 36, marginBottom: 16 }}>✓</div>
        <p style={{ fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#00e87a", marginBottom: 8 }}>
          Onboarding complete
        </p>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#fff", margin: "0 0 16px" }}>
          Your access is active
        </h1>
        <p style={{ fontSize: "0.9rem", color: "rgba(185,208,192,0.8)", lineHeight: 1.6, marginBottom: 24 }}>
          You&apos;re all set. Your profile is linked to your loan officer, and your questions will stay attached to your file.
        </p>

        {borrowerId && (
          <p style={{ fontSize: "0.72rem", color: "rgba(185,208,192,0.45)", marginBottom: 20, wordBreak: "break-all", fontFamily: "var(--font-dm-mono, monospace)" }}>
            Borrower ID: {borrowerId}
          </p>
        )}

        <Link href={chatHref} style={{
          display: "inline-block",
          padding: "12px 28px",
          borderRadius: 999,
          background: "#00e87a",
          color: "#080c12",
          fontWeight: 700,
          fontSize: "0.9rem",
          textDecoration: "none",
          marginBottom: 12,
        }}>
          Enter HomeRates.ai →
        </Link>
        <p style={{ fontSize: "0.72rem", color: "rgba(185,208,192,0.4)", marginTop: 8 }}>
          You can close this tab at any time.
        </p>
      </div>
    </PageShell>
  );
}
