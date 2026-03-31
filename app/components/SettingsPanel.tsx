"use client";
// app/components/SettingsPanel.tsx
// Settings gear icon → slide-in panel with subscription, billing, account links.

import { useState, useEffect, useRef } from "react";
import { useUser, SignOutButton } from "@clerk/nextjs";
import Link from "next/link";

interface UserPlanData {
  plan: string;
  billingPeriodEnd: string | null;
  chatMessages: number;
  chatLimit: number | null;
}

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  free:  { label: "Free",  color: "rgba(160,192,168,0.6)" },
  plus:  { label: "Plus",  color: "#00e87a" },
  pro:   { label: "Pro",   color: "#00e87a" },
};

export default function SettingsPanel() {
  const { user, isSignedIn } = useUser();
  const [open, setOpen] = useState(false);
  const [planData, setPlanData] = useState<UserPlanData | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load plan on open
  useEffect(() => {
    if (!open || !isSignedIn) return;
    fetch("/api/user/plan")
      .then((r) => r.json())
      .then((d) => setPlanData(d))
      .catch(() => null);
  }, [open, isSignedIn]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function openBillingPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error ?? "Could not open billing portal.");
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setPortalLoading(false);
    }
  }

  const plan = planData?.plan ?? "free";
  const planMeta = PLAN_LABELS[plan] ?? PLAN_LABELS.free;
  const isOnFreePlan = plan === "free";
  const periodEnd = planData?.billingPeriodEnd
    ? new Date(planData.billingPeriodEnd).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      })
    : null;

  const msgUsed = planData?.chatMessages ?? 0;
  const msgLimit = planData?.chatLimit ?? 20;

  return (
    <div style={{ position: "relative" }} ref={panelRef}>
      {/* Gear button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Settings"
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: "none",
          background: open ? "rgba(0,232,122,0.12)" : "transparent",
          color: open ? "#00e87a" : "rgba(160,192,168,0.7)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 0.15s, color 0.15s",
          flexShrink: 0,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: 300,
          height: "100vh",
          background: "#0a0f18",
          borderLeft: "1px solid rgba(0,232,122,0.12)",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.4)",
          fontFamily: "var(--font-dm-sans, sans-serif)",
        }}>
          {/* Header */}
          <div style={{
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <span style={{ color: "#fff", fontWeight: 600, fontSize: "0.95rem" }}>Settings</span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "rgba(160,192,168,0.6)",
              cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "2px 4px",
            }}>✕</button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Account */}
            {isSignedIn && user && (
              <section>
                <div style={sectionLabel}>Account</div>
                <div style={card}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {user.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.imageUrl} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} />
                    )}
                    <div>
                      <div style={{ color: "#fff", fontWeight: 600, fontSize: "0.875rem" }}>
                        {user.fullName ?? user.username ?? "Account"}
                      </div>
                      <div style={{ color: "rgba(160,192,168,0.6)", fontSize: "0.75rem" }}>
                        {user.primaryEmailAddress?.emailAddress}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Subscription */}
            <section>
              <div style={sectionLabel}>Subscription</div>
              <div style={card}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ color: "rgba(160,192,168,0.8)", fontSize: "0.8rem" }}>Current plan</span>
                  <span style={{
                    background: isOnFreePlan ? "rgba(160,192,168,0.1)" : "rgba(0,232,122,0.12)",
                    color: planMeta.color,
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    padding: "3px 10px",
                    borderRadius: 999,
                  }}>{planMeta.label}</span>
                </div>

                {/* Free tier usage bar */}
                {isOnFreePlan && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "rgba(160,192,168,0.6)", marginBottom: 4 }}>
                      <span>Questions this month</span>
                      <span>{msgUsed} / {msgLimit}</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${Math.min((msgUsed / msgLimit) * 100, 100)}%`,
                        background: msgUsed >= msgLimit ? "#f87171" : "#00e87a",
                        borderRadius: 999,
                        transition: "width 0.3s",
                      }} />
                    </div>
                  </div>
                )}

                {periodEnd && (
                  <div style={{ fontSize: "0.75rem", color: "rgba(160,192,168,0.5)", marginBottom: 10 }}>
                    Renews {periodEnd}
                  </div>
                )}

                {isOnFreePlan ? (
                  <Link href="/pricing" onClick={() => setOpen(false)} style={primaryBtn}>
                    Upgrade plan →
                  </Link>
                ) : (
                  <button onClick={openBillingPortal} disabled={portalLoading} style={secondaryBtn}>
                    {portalLoading ? "Opening…" : "Manage billing →"}
                  </button>
                )}
              </div>
            </section>

            {/* Navigation */}
            <section>
              <div style={sectionLabel}>Navigation</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Link href="/chat" onClick={() => setOpen(false)} style={navLink}>
                  <span>💬</span> Chat
                </Link>
                {isSignedIn && (
                  <Link href="/library" onClick={() => setOpen(false)} style={{ ...navLink, color: "rgba(0,232,122,0.8)", fontWeight: 600 }}>
                    <span>✦</span> My Vault
                  </Link>
                )}
                <Link href="/pricing" onClick={() => setOpen(false)} style={navLink}>
                  <span>💳</span> Pricing
                </Link>
                <Link href="/lo/dashboard" onClick={() => setOpen(false)} style={navLink}>
                  <span>📊</span> LO Dashboard
                </Link>
                <Link href="/lo/borrowers" onClick={() => setOpen(false)} style={navLink}>
                  <span>👥</span> Borrowers
                </Link>
              </div>
            </section>

            {/* Legal */}
            <section>
              <div style={sectionLabel}>Legal</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Link href="/disclosures" onClick={() => setOpen(false)} style={navLink}>
                  <span>📄</span> Terms &amp; Disclosures
                </Link>
                <Link href="/privacy" onClick={() => setOpen(false)} style={navLink}>
                  <span>🔒</span> Privacy Policy
                </Link>
                <Link href="/about" onClick={() => setOpen(false)} style={navLink}>
                  <span>ℹ️</span> About
                </Link>
              </div>
            </section>
          </div>

          {/* Sign out footer */}
          {isSignedIn && (
            <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <SignOutButton redirectUrl="/">
                <button style={{
                  width: "100%",
                  padding: "9px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "transparent",
                  color: "rgba(160,192,168,0.7)",
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "var(--font-dm-sans, sans-serif)",
                }}>
                  Sign out
                </button>
              </SignOutButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Shared styles
const sectionLabel: React.CSSProperties = {
  fontSize: "0.65rem",
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "rgba(160,192,168,0.4)",
  marginBottom: 8,
};

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 10,
  padding: "12px 14px",
};

const primaryBtn: React.CSSProperties = {
  display: "block",
  padding: "9px 14px",
  borderRadius: 8,
  background: "#00e87a",
  color: "#080c12",
  fontSize: "0.85rem",
  fontWeight: 600,
  textDecoration: "none",
  textAlign: "center",
};

const secondaryBtn: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "9px 14px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "transparent",
  color: "rgba(224,240,232,0.8)",
  fontSize: "0.85rem",
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "var(--font-dm-sans, sans-serif)",
};

const navLink: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "9px 12px",
  borderRadius: 8,
  color: "rgba(224,240,232,0.75)",
  textDecoration: "none",
  fontSize: "0.875rem",
  transition: "background 0.12s",
};
