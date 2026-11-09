"use client";
// app/partnership/PartnershipHub.tsx
// Document hub UI. Rendered only after app/partnership/page.tsx has verified
// the server-side access cookie (lib/docAccess.ts) — no access logic here.

import { useState } from "react";

const DOCS = [
    {
        id: "consumer-prototype",
        label: "Consumer UX",
        icon: "📱",
        desc: "Consumer experience prototype — home, scenario card, affordability, and the pro/consumer toggle",
        src: "/partnership/consumer-prototype.html",
    },
    {
        id: "lo-partner",
        label: "LO Partner Model",
        icon: "🏦",
        desc: "Generic LO Partner Program — LO portal and the borrower consumer experience side by side",
        src: "/partnership/lo-partner.html",
    },
    {
        id: "consumer-mockup",
        label: "Partnership Visual",
        icon: "🤝",
        desc: "LO-sponsored consumer experience — what borrowers see when their loan officer invites them",
        src: "/partnership/consumer-mockup.html",
    },
    {
        id: "framework",
        label: "Framework Document",
        icon: "📄",
        desc: "One-page partnership framework — structure, commercial terms, and next steps",
        src: "/partnership/framework.html",
    },
];

export default function PartnershipHub() {
    const [active, setActive] = useState("consumer-prototype");

    // ── DOCUMENT HUB ────────────────────────────────────────────
    const activeDoc = DOCS.find(d => d.id === active)!;

    return (
        <div className="page-standalone" style={{
            minHeight: "100vh", background: "#080c12",
            display: "flex", flexDirection: "column",
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        }}>

            {/* Top bar */}
            <div style={{
                background: "#0e1420",
                borderBottom: "1px solid rgba(255,255,255,0.07)",
                padding: "14px 24px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                flexShrink: 0,
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/assets/homerates-email-logo.png" alt="HomeRates.Ai" style={{ height: 20, width: "auto" }} />
                    <span style={{
                        fontSize: "0.6rem", fontWeight: 700, padding: "2px 8px",
                        background: "rgba(61,139,255,0.1)", border: "1px solid rgba(61,139,255,0.2)",
                        borderRadius: 4, color: "#3d8bff", textTransform: "uppercase", letterSpacing: "0.06em",
                        marginLeft: 4,
                    }}>
                        Partnership Materials
                    </span>
                </div>

                {/* Doc tabs */}
                <div style={{ display: "flex", gap: 6 }}>
                    {DOCS.map(doc => (
                        <button
                            key={doc.id}
                            onClick={() => setActive(doc.id)}
                            style={{
                                padding: "6px 14px",
                                background: doc.id === active ? "rgba(0,232,122,0.1)" : "rgba(255,255,255,0.04)",
                                border: `1px solid ${doc.id === active ? "rgba(0,232,122,0.25)" : "rgba(255,255,255,0.08)"}`,
                                borderRadius: 8,
                                color: doc.id === active ? "#00e87a" : "#8fa3b8",
                                fontSize: "0.72rem", fontWeight: 600,
                                cursor: "pointer", fontFamily: "inherit",
                                transition: "all 0.15s",
                                display: "flex", alignItems: "center", gap: 5,
                            }}
                        >
                            <span>{doc.icon}</span>
                            <span>{doc.label}</span>
                        </button>
                    ))}
                </div>

                <a
                    href={activeDoc.src}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        padding: "6px 14px",
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 8,
                        color: "#8fa3b8", fontSize: "0.72rem", fontWeight: 600,
                        textDecoration: "none",
                    }}
                >
                    ↗ Full screen
                </a>
            </div>

            {/* Doc description strip */}
            <div style={{
                background: "#080c12",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
                padding: "10px 24px",
                display: "flex", alignItems: "center", gap: 10,
                flexShrink: 0,
            }}>
                <span style={{ fontSize: "1rem" }}>{activeDoc.icon}</span>
                <div>
                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#f0f4ff" }}>{activeDoc.label}</span>
                    <span style={{ fontSize: "0.72rem", color: "#8fa3b8", marginLeft: 10 }}>{activeDoc.desc}</span>
                </div>
            </div>

            {/* Iframe */}
            <iframe
                key={active}
                src={activeDoc.src}
                style={{
                    flex: 1,
                    width: "100%",
                    border: "none",
                    background: "#fff",
                    minHeight: "calc(100vh - 100px)",
                }}
                title={activeDoc.label}
            />
        </div>
    );
}
