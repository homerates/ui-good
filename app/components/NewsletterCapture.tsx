"use client";
// app/components/NewsletterCapture.tsx
// Inline email capture for article pages — dark design, matches mna-root palette.

import { useState } from "react";

export default function NewsletterCapture({ source }: { source: string }) {
  const [email, setEmail]   = useState("");
  const [state, setState]   = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || state === "loading") return;
    setState("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source }),
      });
      const data = await res.json();
      if (res.ok) {
        setState("done");
      } else {
        setErrorMsg(data.error ?? "Something went wrong");
        setState("error");
      }
    } catch {
      setErrorMsg("Network error — please try again");
      setState("error");
    }
  }

  return (
    <div style={{
      margin: "48px 0",
      background: "linear-gradient(135deg, rgba(0,232,122,0.06), rgba(0,232,122,0.02))",
      border: "1px solid rgba(0,232,122,0.18)",
      borderRadius: 14,
      padding: "28px 32px",
    }}>
      {state === "done" ? (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.5rem", marginBottom: 8 }}>✓</div>
          <p style={{ margin: 0, fontSize: "0.95rem", color: "#00e87a", fontWeight: 700 }}>
            You&apos;re in.
          </p>
          <p style={{ margin: "6px 0 0", fontSize: "0.82rem", color: "#8fa3b8" }}>
            Weekly rate updates and market analysis — straight to your inbox.
          </p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase", color: "#00e87a", marginBottom: 6,
            }}>
              Free weekly digest
            </div>
            <h3 style={{
              margin: "0 0 6px", fontSize: "1.1rem", fontWeight: 800,
              color: "#f0f4ff", lineHeight: 1.2,
            }}>
              Get live rate moves delivered to you
            </h3>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "#8fa3b8", lineHeight: 1.6 }}>
              FRED data, market analysis, and refi alerts — weekly, no spam.
            </p>
          </div>
          <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="email"
              required
              placeholder="you@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={state === "loading"}
              style={{
                flex: "1 1 200px",
                padding: "11px 14px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                color: "#f0f4ff",
                fontSize: "0.9rem",
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <button
              type="submit"
              disabled={state === "loading" || !email.trim()}
              style={{
                padding: "11px 24px",
                background: "#00e87a",
                color: "#080c12",
                border: "none",
                borderRadius: 8,
                fontSize: "0.875rem",
                fontWeight: 700,
                cursor: state === "loading" ? "wait" : "pointer",
                opacity: (!email.trim() || state === "loading") ? 0.5 : 1,
                fontFamily: "inherit",
                whiteSpace: "nowrap",
              }}
            >
              {state === "loading" ? "Subscribing…" : "Subscribe free →"}
            </button>
          </form>
          {state === "error" && (
            <p style={{ margin: "8px 0 0", fontSize: "0.78rem", color: "#ff5f5f" }}>
              {errorMsg}
            </p>
          )}
          <p style={{ margin: "10px 0 0", fontSize: "0.72rem", color: "#3a4560" }}>
            No spam. Unsubscribe any time.
          </p>
        </>
      )}
    </div>
  );
}
