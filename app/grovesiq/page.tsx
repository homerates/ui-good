"use client";
// app/grovesiq/page.tsx
// Password-gated partnership hub — shareable with external parties
// No Clerk auth required. Simple access code gate.

import { useState, useEffect } from "react";

const ACCESS_CODE = "groves2026";
const SESSION_KEY = "hr_grovesiq_auth";

const DOCS = [
    {
        id: "consumer-prototype",
        label: "Consumer UX",
        icon: "📱",
        desc: "Consumer experience prototype — home, scenario card, affordability, and the pro/consumer toggle",
        src: "/grovesiq/consumer-prototype.html",
    },
    {
        id: "lo-partner",
        label: "LO Partner Model",
        icon: "🏦",
        desc: "Generic LO Partner Program — LO portal and the borrower consumer experience side by side",
        src: "/grovesiq/lo-partner.html",
    },
    {
        id: "consumer-mockup",
        label: "Partnership Visual",
        icon: "🤝",
        desc: "LO-sponsored consumer experience — what borrowers see when their loan officer invites them",
        src: "/grovesiq/consumer-mockup.html",
    },
    {
        id: "framework",
        label: "Framework Document",
        icon: "📄",
        desc: "One-page partnership framework — structure, commercial terms, and next steps",
        src: "/grovesiq/framework.html",
    },
];

export default function GrovesIQHub() {
    const [authed, setAuthed] = useState(false);
    const [input, setInput] = useState("");
    const [error, setError] = useState(false);
    const [active, setActive] = useState("consumer-prototype");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        if (sessionStorage.getItem(SESSION_KEY) === "1") setAuthed(true);
    }, []);

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (input.trim().toLowerCase() === ACCESS_CODE) {
            sessionStorage.setItem(SESSION_KEY, "1");
            setAuthed(true);
            setError(false);
        } else {
            setError(true);
            setInput("");
        }
    }

    if (!mounted) return null;

    // ── PASSWORD GATE ───────────────────────────────────────────
    if (!authed) {
        return (
            <div style={{
                minHeight: "100vh", background: "#080c12",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                padding: "24px",
            }}>
                <div style={{ maxWidth: 380, width: "100%", textAlign: "center" }}>

                    {/* Logo */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 32 }}>
                        <div style={{
                            width: 36, height: 36, background: "#00e87a",
                            borderRadius: 9, display: "flex", alignItems: "center",
                            justifyContent: "center", fontWeight: 900, fontSize: 16, color: "#000",
                        }}>H</div>
                        <span style={{ fontSize: "1.05rem", fontWeight: 700, color: "#f0f4ff" }}>
                            Home<span style={{ color: "#00e87a" }}>Rates</span>
                        </span>
                    </div>

                    <div style={{
                        background: "#0e1420",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 16, padding: "32px 28px",
                    }}>
                        <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8fa3b8", marginBottom: 8 }}>
                            Partnership Materials
                        </div>
                        <h1 style={{ fontSize: "1.3rem", fontWeight: 800, color: "#f0f4ff", letterSpacing: "-0.03em", marginBottom: 8 }}>
                            Enter access code
                        </h1>
                        <p style={{ fontSize: "0.8rem", color: "#8fa3b8", lineHeight: 1.6, marginBottom: 24 }}>
                            These documents are shared for internal review. Enter the access code provided by the HomeRates team.
                        </p>

                        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <input
                                type="password"
                                value={input}
                                onChange={e => { setInput(e.target.value); setError(false); }}
                                placeholder="Access code"
                                autoFocus
                                style={{
                                    width: "100%", padding: "12px 14px",
                                    background: "#141b28",
                                    border: `1px solid ${error ? "rgba(255,95,95,0.4)" : "rgba(255,255,255,0.1)"}`,
                                    borderRadius: 10,
                                    color: "#f0f4ff", fontSize: "0.9rem",
                                    fontFamily: "inherit", outline: "none",
                                    transition: "border-color 0.15s",
                                }}
                            />
                            {error && (
                                <div style={{ fontSize: "0.72rem", color: "#ff5f5f", textAlign: "left" }}>
                                    Incorrect access code — please try again or contact the HomeRates team.
                                </div>
                            )}
                            <button
                                type="submit"
                                style={{
                                    padding: "12px",
                                    background: "#00e87a", border: "none",
                                    borderRadius: 10, color: "#000",
                                    fontSize: "0.85rem", fontWeight: 700,
                                    cursor: "pointer", fontFamily: "inherit",
                                }}
                            >
                                Access documents →
                            </button>
                        </form>
                    </div>

                    <p style={{ marginTop: 20, fontSize: "0.7rem", color: "rgba(255,255,255,0.2)", lineHeight: 1.6 }}>
                        Confidential — HomeRates.ai · For authorised review only
                    </p>
                </div>
            </div>
        );
    }

    // ── DOCUMENT HUB ────────────────────────────────────────────
    const activeDoc = DOCS.find(d => d.id === active)!;

    return (
        <div style={{
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
                    <div style={{
                        width: 28, height: 28, background: "#00e87a",
                        borderRadius: 7, display: "flex", alignItems: "center",
                        justifyContent: "center", fontWeight: 900, fontSize: 13, color: "#000",
                    }}>H</div>
                    <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "#f0f4ff" }}>
                        Home<span style={{ color: "#00e87a" }}>Rates</span>
                    </span>
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
