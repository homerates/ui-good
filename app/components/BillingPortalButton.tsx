"use client";
// app/components/BillingPortalButton.tsx
// Hits POST /api/stripe/portal and redirects to Stripe Customer Portal.

import { useState } from "react";

export default function BillingPortalButton() {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error ?? "Could not open billing portal. Please try again.");
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        padding: "8px 16px",
        borderRadius: "8px",
        border: "1px solid rgba(0,0,0,0.12)",
        background: "#fff",
        color: "#0f172a",
        fontSize: "0.85rem",
        fontWeight: 500,
        cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? "Opening…" : "Manage billing →"}
    </button>
  );
}
