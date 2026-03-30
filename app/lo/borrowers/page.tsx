// app/lo/borrowers/page.tsx
"use client";

import * as React from "react";
import PageShell from "../../components/PageShell";

export default function LoBorrowersPage() {
    const [creating, setCreating] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [inviteUrl, setInviteUrl] = React.useState<string | null>(null);
    const [inviteCode, setInviteCode] = React.useState<string | null>(null);
    const [copied, setCopied] = React.useState(false);

    async function handleCreateInvite() {
        setError(null);
        setCopied(false);
        setCreating(true);

        try {
            const res = await fetch("/api/lo/invites", { method: "POST" });

            if (!res.ok) {
                const data = await res.json().catch(() => null);
                setError(data?.error || "Unable to create invite.");
                setCreating(false);
                return;
            }

            const data = await res.json();
            setInviteUrl(data.inviteUrl || null);
            setInviteCode(data.code || null);
            setCreating(false);
        } catch (err) {
            console.error("Create invite error:", err);
            setError("Unexpected error. Please try again.");
            setCreating(false);
        }
    }

    async function handleCopy() {
        if (!inviteUrl) return;
        try {
            await navigator.clipboard.writeText(inviteUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch (err) {
            console.error("Clipboard error:", err);
            setError("Could not copy to clipboard. You can still copy it manually.");
        }
    }

    return (
        <PageShell backHref="/lo/dashboard" backLabel="LO Portal" maxWidth={860}>
            {/* Header row */}
            <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
                marginBottom: 4,
            }}>
                <div>
                    <h1 style={{ fontSize: "1.35rem", fontWeight: 700, margin: 0, color: "#f1f5f9" }}>
                        Borrowers
                    </h1>
                    <p style={{ margin: "4px 0 0", fontSize: "0.9rem", color: "rgba(160,192,168,0.7)", lineHeight: 1.5 }}>
                        Invite borrowers into HomeRates.ai and keep their questions tied to your file automatically.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={handleCreateInvite}
                    disabled={creating}
                    style={{
                        padding: "9px 18px",
                        borderRadius: 999,
                        border: "none",
                        background: creating ? "rgba(0,232,122,0.3)" : "#00e87a",
                        color: creating ? "rgba(8,12,18,0.5)" : "#080c12",
                        fontSize: "0.9rem",
                        fontWeight: 600,
                        cursor: creating ? "default" : "pointer",
                        whiteSpace: "nowrap",
                    }}
                >
                    {creating ? "Creating invite…" : "Invite Borrower"}
                </button>
            </div>

            {/* Invite result / error */}
            {(inviteUrl || error) && (
                <section style={{
                    padding: "16px 14px",
                    borderRadius: 12,
                    border: error && !inviteUrl
                        ? "1px solid rgba(248,113,113,0.25)"
                        : "1px solid rgba(0,232,122,0.2)",
                    background: error && !inviteUrl
                        ? "rgba(248,113,113,0.05)"
                        : "rgba(0,232,122,0.03)",
                    display: "grid",
                    gap: 8,
                }}>
                    {error && (
                        <p style={{ fontSize: "0.85rem", color: "#f87171", margin: 0 }}>
                            {error}
                        </p>
                    )}

                    {inviteUrl && (
                        <>
                            <p style={{ fontSize: "0.88rem", color: "#e2e8f0", margin: 0, fontWeight: 500 }}>
                                Send this link to your borrower:
                            </p>

                            {inviteCode && (
                                <p style={{ fontSize: "0.78rem", color: "rgba(160,192,168,0.55)", margin: 0 }}>
                                    Invite code:{" "}
                                    <span style={{ fontFamily: "var(--font-dm-mono, monospace)", color: "#00e87a" }}>
                                        {inviteCode}
                                    </span>
                                </p>
                            )}

                            <div style={{
                                padding: "8px 10px",
                                borderRadius: 8,
                                border: "1px solid rgba(148,163,184,0.2)",
                                fontSize: "0.8rem",
                                color: "#94a3b8",
                                wordBreak: "break-all",
                                background: "rgba(255,255,255,0.03)",
                                fontFamily: "var(--font-dm-mono, monospace)",
                            }}>
                                {inviteUrl}
                            </div>

                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    style={{
                                        padding: "7px 14px",
                                        borderRadius: 999,
                                        border: "1px solid rgba(0,232,122,0.4)",
                                        background: copied ? "rgba(0,232,122,0.15)" : "transparent",
                                        color: "#00e87a",
                                        fontSize: "0.82rem",
                                        fontWeight: 500,
                                        cursor: "pointer",
                                    }}
                                >
                                    {copied ? "Copied ✓" : "Copy link"}
                                </button>
                                <p style={{ fontSize: "0.75rem", color: "rgba(160,192,168,0.45)", margin: 0 }}>
                                    Paste this into a text or email to your borrower.
                                </p>
                            </div>
                        </>
                    )}
                </section>
            )}

            {/* Borrowers list placeholder */}
            <section style={{
                padding: "16px 14px",
                borderRadius: 12,
                border: "1px solid rgba(148,163,184,0.1)",
                background: "rgba(255,255,255,0.02)",
            }}>
                <p style={{ fontSize: "0.9rem", color: "rgba(160,192,168,0.55)", margin: 0, lineHeight: 1.6 }}>
                    Borrower list coming next. Every borrower who completes onboarding using your invite link will appear here with their status and recent activity.
                </p>
            </section>
        </PageShell>
    );
}
