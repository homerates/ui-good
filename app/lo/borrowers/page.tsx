// app/lo/borrowers/page.tsx
"use client";

import * as React from "react";

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
            const res = await fetch("/api/lo/invites", {
                method: "POST",
            });

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
        <main
            style={{
                minHeight: "calc(100vh - 40px)",
                padding: "24px 20px",
                maxWidth: "960px",
                margin: "0 auto",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
            }}
        >
            {/* Header row */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    flexWrap: "wrap",
                }}
            >
                <div>
                    <h1
                        style={{
                            fontSize: "1.4rem",
                            fontWeight: 600,
                            margin: 0,
                            color: "#0f172a",
                        }}
                    >
                        Borrowers
                    </h1>
                    <p
                        style={{
                            margin: "4px 0 0 0",
                            fontSize: "0.9rem",
                            color: "#64748b",
                        }}
                    >
                        Invite borrowers into HomeRates.ai and keep their questions tied to
                        your file automatically.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={handleCreateInvite}
                    disabled={creating}
                    style={{
                        padding: "9px 16px",
                        borderRadius: "999px",
                        border: "1px solid #0f172a",
                        background: creating ? "#e2e8f0" : "#0f172a",
                        color: creating ? "#64748b" : "#f9fafb",
                        fontSize: "0.9rem",
                        fontWeight: 500,
                        cursor: creating ? "default" : "pointer",
                        whiteSpace: "nowrap",
                    }}
                >
                    {creating ? "Creating invite..." : "Invite Borrower"}
                </button>
            </div>

            {/* Invite result card */}
            {(inviteUrl || error) && (
                <section
                    style={{
                        marginTop: "8px",
                        padding: "16px 14px",
                        borderRadius: "12px",
                        border: "1px solid rgba(148, 163, 184, 0.7)",
                        background: "#f8fafc",
                        display: "grid",
                        gap: "8px",
                    }}
                >
                    {error && (
                        <p
                            style={{
                                fontSize: "0.85rem",
                                color: "#b91c1c",
                                margin: 0,
                            }}
                        >
                            {error}
                        </p>
                    )}

                    {inviteUrl && (
                        <>
                            <p
                                style={{
                                    fontSize: "0.85rem",
                                    color: "#0f172a",
                                    margin: 0,
                                    fontWeight: 500,
                                }}
                            >
                                Send this link to your borrower:
                            </p>

                            {inviteCode && (
                                <p
                                    style={{
                                        fontSize: "0.75rem",
                                        color: "#64748b",
                                        margin: "0 0 4px 0",
                                    }}
                                >
                                    Invite code:{" "}
                                    <span
                                        style={{
                                            fontFamily:
                                                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                                        }}
                                    >
                                        {inviteCode}
                                    </span>
                                </p>
                            )}

                            <div
                                style={{
                                    display: "grid",
                                    gap: "6px",
                                }}
                            >
                                <div
                                    style={{
                                        padding: "8px 10px",
                                        borderRadius: "8px",
                                        border: "1px solid rgba(148, 163, 184, 0.8)",
                                        fontSize: "0.8rem",
                                        color: "#0f172a",
                                        wordBreak: "break-all",
                                        background: "#ffffff",
                                    }}
                                >
                                    {inviteUrl}
                                </div>

                                <div
                                    style={{
                                        display: "flex",
                                        gap: "8px",
                                        alignItems: "center",
                                        justifyContent: "flex-start",
                                        flexWrap: "wrap",
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={handleCopy}
                                        style={{
                                            padding: "7px 14px",
                                            borderRadius: "999px",
                                            border: "1px solid #0f172a",
                                            background: "#ffffff",
                                            fontSize: "0.8rem",
                                            fontWeight: 500,
                                            cursor: "pointer",
                                        }}
                                    >
                                        {copied ? "Copied" : "Copy link"}
                                    </button>
                                    <p
                                        style={{
                                            fontSize: "0.75rem",
                                            color: "#64748b",
                                            margin: 0,
                                        }}
                                    >
                                        Paste this into a text or email to your borrower.
                                    </p>
                                </div>
                            </div>
                        </>
                    )}
                </section>
            )}

            {/* Borrowers list placeholder */}
            <section
                style={{
                    marginTop: "12px",
                    padding: "16px 14px",
                    borderRadius: "12px",
                    border: "1px solid rgba(148, 163, 184, 0.4)",
                    background: "#ffffff",
                }}
            >
                <p
                    style={{
                        fontSize: "0.9rem",
                        color: "#64748b",
                        margin: 0,
                    }}
                >
                    Borrower list coming next. Every borrower who completes onboarding
                    using your invite link will appear here with their status and recent
                    activity.
                </p>
            </section>
        </main>
    );
}
