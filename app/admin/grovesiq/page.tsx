"use client";
// app/admin/grovesiq/page.tsx
// Groves IQ partnership hub — admin view

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminStatus } from "../../hooks/useAdminStatus";
import AppNav from "../../components/AppNav";

const ACCESS_CODE = "groves2026";

const DOCS = [
    {
        id: "consumer-prototype",
        label: "Consumer UX",
        icon: "📱",
        desc: "4-screen consumer experience prototype — home, scenario card, affordability, pro toggle",
        src: "/grovesiq/consumer-prototype.html",
        tag: "UX Prototype",
    },
    {
        id: "lo-partner",
        label: "LO Partner Model",
        icon: "🏦",
        desc: "Generic LO Partner Program — side-by-side LO portal and consumer borrower experience",
        src: "/grovesiq/lo-partner.html",
        tag: "Product Mockup",
    },
    {
        id: "consumer-mockup",
        label: "Groves IQ Consumer",
        icon: "🤝",
        desc: "Groves IQ specific — LO-sponsored consumer experience with unlocked premium features",
        src: "/grovesiq/consumer-mockup.html",
        tag: "Partnership Visual",
    },
    {
        id: "framework",
        label: "Framework Doc",
        icon: "📄",
        desc: "One-page partnership framework — what each platform does, the arrangement, commercial terms, next steps",
        src: "/grovesiq/framework.html",
        tag: "Business Document",
    },
];

export default function GrovesIQAdmin() {
    const router = useRouter();
    const { isAdmin, loading } = useAdminStatus();
    const [active, setActive] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const shareUrl = typeof window !== "undefined"
        ? `${window.location.origin}/grovesiq`
        : "https://chat.homerates.ai/grovesiq";

    function copyShareInfo() {
        navigator.clipboard.writeText(`URL: ${shareUrl}\nAccess code: ${ACCESS_CODE}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    if (loading) {
        return (
            <div style={{ minHeight: "100vh", background: "#080c12", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ color: "#8fa3b8", fontSize: "0.85rem" }}>Loading…</div>
            </div>
        );
    }

    if (!isAdmin) {
        router.push("/chat");
        return null;
    }

    const activeDoc = DOCS.find(d => d.id === active);

    return (
        <div style={{ minHeight: "100vh", background: "#080c12", display: "flex" }}>
            <AppNav />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", marginLeft: 240 }}>

                {/* Header */}
                <div style={{
                    padding: "24px 32px 20px",
                    borderBottom: "1px solid rgba(255,255,255,0.07)",
                    display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                    background: "#0e1420",
                }}>
                    <div>
                        <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8fa3b8", marginBottom: 6 }}>
                            Admin · Partnership Materials
                        </div>
                        <h1 style={{ fontSize: "1.3rem", fontWeight: 800, color: "#f0f4ff", letterSpacing: "-0.03em", marginBottom: 4 }}>
                            Groves IQ Partnership Hub
                        </h1>
                        <p style={{ fontSize: "0.8rem", color: "#8fa3b8" }}>
                            4 documents · Share externally via password-protected URL
                        </p>
                    </div>

                    {/* Share box */}
                    <div style={{
                        background: "rgba(61,139,255,0.08)",
                        border: "1px solid rgba(61,139,255,0.2)",
                        borderRadius: 12,
                        padding: "14px 18px",
                        minWidth: 280,
                    }}>
                        <div style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#3d8bff", marginBottom: 8 }}>
                            Share with Groves IQ team
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#8fa3b8", marginBottom: 4 }}>
                            URL: <span style={{ color: "#f0f4ff", fontFamily: "monospace" }}>{shareUrl}</span>
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#8fa3b8", marginBottom: 12 }}>
                            Access code: <span style={{ color: "#00e87a", fontWeight: 700, fontFamily: "monospace" }}>{ACCESS_CODE}</span>
                        </div>
                        <button
                            onClick={copyShareInfo}
                            style={{
                                width: "100%", padding: "7px",
                                background: copied ? "rgba(0,232,122,0.15)" : "rgba(61,139,255,0.12)",
                                border: `1px solid ${copied ? "rgba(0,232,122,0.3)" : "rgba(61,139,255,0.25)"}`,
                                borderRadius: 8,
                                color: copied ? "#00e87a" : "#3d8bff",
                                fontSize: "0.72rem", fontWeight: 700,
                                cursor: "pointer", fontFamily: "inherit",
                                transition: "all 0.15s",
                            }}
                        >
                            {copied ? "✓ Copied to clipboard" : "Copy URL + access code"}
                        </button>
                    </div>
                </div>

                <div style={{ flex: 1, padding: "24px 32px", display: "flex", flexDirection: "column", gap: 24 }}>

                    {/* Document grid */}
                    {!active && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
                            {DOCS.map(doc => (
                                <button
                                    key={doc.id}
                                    onClick={() => setActive(doc.id)}
                                    style={{
                                        background: "#0e1420",
                                        border: "1px solid rgba(255,255,255,0.08)",
                                        borderRadius: 14, padding: "20px 22px",
                                        cursor: "pointer", textAlign: "left",
                                        transition: "all 0.15s", fontFamily: "inherit",
                                        display: "flex", flexDirection: "column", gap: 8,
                                    }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.18)"; (e.currentTarget as HTMLElement).style.background = "#141b28"; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLElement).style.background = "#0e1420"; }}
                                >
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                            <span style={{ fontSize: "1.4rem" }}>{doc.icon}</span>
                                            <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "#f0f4ff" }}>{doc.label}</span>
                                        </div>
                                        <span style={{
                                            fontSize: "0.6rem", fontWeight: 700, padding: "2px 8px",
                                            background: "rgba(255,255,255,0.06)", borderRadius: 4,
                                            color: "#8fa3b8", textTransform: "uppercase", letterSpacing: "0.06em",
                                        }}>
                                            {doc.tag}
                                        </span>
                                    </div>
                                    <p style={{ fontSize: "0.78rem", color: "#8fa3b8", lineHeight: 1.55 }}>{doc.desc}</p>
                                    <div style={{ fontSize: "0.72rem", color: "#3d8bff", fontWeight: 600 }}>
                                        Open full screen →
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Iframe viewer */}
                    {active && activeDoc && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <button
                                    onClick={() => setActive(null)}
                                    style={{
                                        background: "none", border: "1px solid rgba(255,255,255,0.12)",
                                        borderRadius: 8, padding: "6px 12px",
                                        color: "#8fa3b8", fontSize: "0.75rem", cursor: "pointer", fontFamily: "inherit",
                                    }}
                                >
                                    ← Back
                                </button>
                                <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "#f0f4ff" }}>
                                    {activeDoc.icon} {activeDoc.label}
                                </span>
                                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                                    {DOCS.map(d => (
                                        <button
                                            key={d.id}
                                            onClick={() => setActive(d.id)}
                                            style={{
                                                padding: "5px 12px",
                                                background: d.id === active ? "rgba(0,232,122,0.1)" : "rgba(255,255,255,0.04)",
                                                border: `1px solid ${d.id === active ? "rgba(0,232,122,0.25)" : "rgba(255,255,255,0.08)"}`,
                                                borderRadius: 7,
                                                color: d.id === active ? "#00e87a" : "#8fa3b8",
                                                fontSize: "0.7rem", fontWeight: 600,
                                                cursor: "pointer", fontFamily: "inherit",
                                            }}
                                        >
                                            {d.icon} {d.label}
                                        </button>
                                    ))}
                                    <a
                                        href={activeDoc.src}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            padding: "5px 12px",
                                            background: "rgba(61,139,255,0.1)",
                                            border: "1px solid rgba(61,139,255,0.2)",
                                            borderRadius: 7,
                                            color: "#3d8bff",
                                            fontSize: "0.7rem", fontWeight: 600,
                                            textDecoration: "none",
                                        }}
                                    >
                                        ↗ Open raw
                                    </a>
                                </div>
                            </div>
                            <iframe
                                src={activeDoc.src}
                                style={{
                                    width: "100%",
                                    height: "calc(100vh - 220px)",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    borderRadius: 12,
                                    background: "#fff",
                                }}
                                title={activeDoc.label}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
