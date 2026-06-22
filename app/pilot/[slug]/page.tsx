"use client";
// app/pilot/[slug]/page.tsx
// Company pilot landing page — sent to LOs via CEO/owner outreach.
// No pricing, no commitment language. Pure pilot access framing.

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface PilotData {
  company_name: string;
  slug: string;
  credits_per_lo: number;
  activations: number;
}

export default function PilotPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [pilot, setPilot] = useState<PilotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/pilot/${slug}`)
      .then(r => {
        if (!r.ok) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then(d => {
        if (d) setPilot(d);
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [slug]);

  const activateHref = `/welcome?pilot=${slug}&role=lo`;

  if (loading) {
    return (
      <div style={styles.root}>
        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.9rem", margin: "auto" }}>Loading…</div>
        <style>{css}</style>
      </div>
    );
  }

  if (notFound || !pilot) {
    return (
      <div style={styles.root}>
        <nav style={styles.nav}>
          <Link href="/">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" style={{ height: 28 }} />
          </Link>
        </nav>
        <div style={{ ...styles.center, gap: 16 }}>
          <div style={{ fontSize: "2rem" }}>🔍</div>
          <div style={{ color: "#f0f4ff", fontWeight: 700 }}>Pilot link not found</div>
          <div style={{ color: "#8fa3b8", fontSize: "0.875rem" }}>This link may have expired or been deactivated.</div>
          <Link href="/" style={styles.secondaryBtn}>Go to HomeRates.ai →</Link>
        </div>
        <style>{css}</style>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      {/* Nav */}
      <nav style={styles.nav}>
        <Link href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" style={{ height: 28 }} />
        </Link>
        <Link href="/sign-in" style={styles.navSignIn}>Already have an account? Sign in →</Link>
      </nav>

      <div style={styles.container}>
        <div style={styles.card}>

          {/* Eyebrow */}
          <div style={styles.eyebrow}>Free Pilot Access</div>

          {/* Company header */}
          <div style={styles.companyRow}>
            <span style={styles.companyName}>{pilot.company_name}</span>
            <span style={styles.cross}>×</span>
            <span style={styles.brand}>HomeRates.ai</span>
          </div>

          {/* Headline */}
          <h1 style={styles.headline}>
            AI mortgage intelligence<br />for your loan officers.
          </h1>

          <p style={styles.sub}>
            Live rate data, scenario modeling, and decision scoring — built for LOs who win clients with data, not just price. No credit card. No commitment.
          </p>

          {/* Benefits */}
          <div style={styles.benefits}>
            {[
              { icon: "⚡", label: `${pilot.credits_per_lo.toLocaleString()} AI analysis credits`, sub: "Enough to run full scenarios for multiple clients" },
              { icon: "🏅", label: "Founding Member", sub: "Permanently on your profile — visible to every borrower" },
              { icon: "💬", label: "Full platform access", sub: "Chat, Market Rates, Decision Score, Deal Rooms — everything" },
              { icon: "🎯", label: "Direct line to the founders", sub: "Shape the product from day one" },
            ].map(b => (
              <div key={b.label} style={styles.benefit}>
                <span style={styles.benefitIcon}>{b.icon}</span>
                <div>
                  <div style={styles.benefitLabel}>{b.label}</div>
                  <div style={styles.benefitSub}>{b.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <a href={activateHref} style={styles.cta}>
            Activate my free access →
          </a>

          {/* Trust line */}
          <div style={styles.trust}>
            No credit card &nbsp;·&nbsp; No subscription &nbsp;·&nbsp; No strings
          </div>

        </div>

        {/* Footer */}
        <div style={styles.footer}>
          Powered by <a href="https://chat.homerates.ai" style={{ color: "#00e87a", textDecoration: "none" }}>HomeRates.ai</a>
          &nbsp;·&nbsp;
          <Link href="/disclosures" style={{ color: "#8fa3b8", textDecoration: "none" }}>Terms</Link>
          &nbsp;·&nbsp;
          <Link href="/privacy" style={{ color: "#8fa3b8", textDecoration: "none" }}>Privacy</Link>
        </div>
      </div>

      <style>{css}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: "fixed", inset: 0, overflowY: "auto",
    background: "#080c12", fontFamily: "'DM Sans', system-ui, sans-serif",
    color: "#f0f4ff", display: "flex", flexDirection: "column",
  },
  nav: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "18px 32px", borderBottom: "1px solid rgba(255,255,255,0.06)",
    flexShrink: 0,
  },
  navSignIn: {
    fontSize: "0.82rem", color: "#8fa3b8", textDecoration: "none",
  },
  container: {
    maxWidth: 540, margin: "0 auto", padding: "3rem 1.5rem 4rem",
    display: "flex", flexDirection: "column", gap: 24,
  },
  card: {
    background: "#0e1420", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 20, padding: "2.5rem",
    display: "flex", flexDirection: "column", gap: "1.5rem",
  },
  eyebrow: {
    fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.1em",
    textTransform: "uppercase" as const, color: "#00e87a",
  },
  companyRow: {
    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const,
  },
  companyName: {
    fontSize: "1.1rem", fontWeight: 800, color: "#f0f4ff",
  },
  cross: {
    fontSize: "1rem", color: "#8fa3b8",
  },
  brand: {
    fontSize: "1.1rem", fontWeight: 800, color: "#00e87a",
  },
  headline: {
    fontSize: "1.75rem", fontWeight: 800, margin: 0,
    lineHeight: 1.2, letterSpacing: "-0.02em", color: "#f0f4ff",
  },
  sub: {
    fontSize: "0.9rem", color: "#8fa3b8", margin: 0, lineHeight: 1.6,
  },
  benefits: {
    display: "flex", flexDirection: "column" as const, gap: 12,
  },
  benefit: {
    display: "flex", alignItems: "flex-start", gap: 14,
    padding: "12px 14px", background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12,
  },
  benefitIcon: { fontSize: "1.1rem", flexShrink: 0, marginTop: 2 },
  benefitLabel: { fontSize: "0.875rem", fontWeight: 600, color: "#f0f4ff", marginBottom: 2 },
  benefitSub: { fontSize: "0.78rem", color: "#8fa3b8", lineHeight: 1.4 },
  cta: {
    display: "block", textAlign: "center" as const, padding: "15px",
    background: "#00e87a", color: "#080c12", borderRadius: 999,
    fontWeight: 700, fontSize: "1rem", textDecoration: "none",
    transition: "opacity 0.15s",
  },
  trust: {
    textAlign: "center" as const, fontSize: "0.78rem",
    color: "rgba(143,163,184,0.6)",
  },
  footer: {
    textAlign: "center" as const, fontSize: "0.75rem", color: "#8fa3b8",
  },
  secondaryBtn: {
    display: "inline-block", padding: "10px 20px",
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10, color: "#f0f4ff", textDecoration: "none", fontSize: "0.875rem",
  },
  center: {
    display: "flex", flexDirection: "column" as const,
    alignItems: "center", justifyContent: "center", flex: 1, textAlign: "center" as const,
    padding: "2rem",
  },
};

const css = `
  body:has([data-pilot-page]) .app-footer { display: none !important; }
  @media (max-width: 480px) {
    .pilot-card { padding: 1.75rem !important; }
  }
`;
