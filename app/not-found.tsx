// app/not-found.tsx
import Link from "next/link";

export const metadata = {
  title: "Page Not Found | HomeRates.ai",
  description: "The page you're looking for doesn't exist.",
};

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "#f8fafc",
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: "72px",
          fontWeight: 800,
          color: "#10b981",
          lineHeight: 1,
          marginBottom: "8px",
          letterSpacing: "-0.04em",
        }}
      >
        404
      </div>
      <h1
        style={{
          fontSize: "1.4rem",
          fontWeight: 700,
          color: "#0f172a",
          margin: "0 0 8px",
        }}
      >
        Page not found
      </h1>
      <p
        style={{
          fontSize: "0.95rem",
          color: "#64748b",
          margin: "0 0 32px",
          maxWidth: "360px",
          lineHeight: 1.6,
        }}
      >
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Link
        href="/"
        style={{
          display: "inline-block",
          padding: "10px 24px",
          background: "#10b981",
          color: "#fff",
          borderRadius: "9999px",
          fontWeight: 600,
          fontSize: "0.9rem",
          textDecoration: "none",
        }}
      >
        Back to HomeRates.ai
      </Link>
    </div>
  );
}
