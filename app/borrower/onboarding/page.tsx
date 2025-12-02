"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function BorrowerOnboardingPage() {
    const searchParams = useSearchParams();
    const [inviteCode, setInviteCode] = useState("");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        const codeFromUrl = searchParams.get("code");
        if (codeFromUrl && !inviteCode) {
            setInviteCode(codeFromUrl);
        }
    }, [searchParams, inviteCode]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        if (!inviteCode.trim()) {
            setError("Invite code is required.");
            return;
        }

        if (!email.trim()) {
            setError("Email is required.");
            return;
        }

        setLoading(true);

        try {
            const res = await fetch("/api/borrower/onboard", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    inviteCode: inviteCode.trim(),
                    name: name.trim(),
                    email: email.trim(),
                    phone: phone.trim(),
                }),
            });

            const data = await res.json();

            if (!res.ok || data.error) {
                setError(
                    data.error ||
                    "Something went wrong completing onboarding. Please try again."
                );
                setSuccess(null);
            } else {
                setSuccess(
                    data.message ||
                    "Your HomeRates.ai access has been activated. You can now use HomeRates.ai."
                );
                setError(null);
            }
        } catch (err: unknown) {
            console.error("Borrower onboarding submit error:", err);
            setError("Network error. Please try again.");
            setSuccess(null);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div
            style={{
                minHeight: "100vh",
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "2.5rem 1.5rem",
                backgroundColor: "#020617",
            }}
        >
            <div
                style={{
                    width: "100%",
                    maxWidth: 420,
                    backgroundColor: "#020617",
                    borderRadius: "1rem",
                    padding: "1.75rem",
                    boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
                    border: "1px solid rgba(148, 163, 184, 0.3)",
                }}
            >
                <h1
                    style={{
                        fontSize: "1.35rem",
                        fontWeight: 600,
                        marginBottom: "0.4rem",
                        color: "#e5e7eb",
                        textAlign: "center",
                    }}
                >
                    Your HomeRates.ai Access
                </h1>

                <p
                    style={{
                        fontSize: "0.88rem",
                        color: "#9ca3af",
                        marginBottom: "1.4rem",
                        textAlign: "center",
                    }}
                >
                    Your loan officer has invited you to use HomeRates.ai. Confirm your
                    details below to activate your access.
                </p>

                <form
                    onSubmit={handleSubmit}
                    style={{ display: "grid", gap: "0.9rem" }}
                >
                    <div style={{ display: "grid", gap: "0.35rem" }}>
                        <label
                            htmlFor="inviteCode"
                            style={{ fontSize: "0.82rem", color: "#e5e7eb" }}
                        >
                            Invite Code
                        </label>
                        <input
                            id="inviteCode"
                            type="text"
                            value={inviteCode}
                            onChange={(e) => setInviteCode(e.target.value)}
                            placeholder="Paste your invite code"
                            style={{
                                padding: "0.55rem 0.75rem",
                                borderRadius: "0.5rem",
                                border: "1px solid #4b5563",
                                backgroundColor: "#020617",
                                color: "#e5e7eb",
                                fontSize: "0.95rem",
                            }}
                        />
                    </div>

                    <div style={{ display: "grid", gap: "0.35rem" }}>
                        <label
                            htmlFor="name"
                            style={{ fontSize: "0.82rem", color: "#e5e7eb" }}
                        >
                            Full Name
                        </label>
                        <input
                            id="name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Your full name"
                            style={{
                                padding: "0.55rem 0.75rem",
                                borderRadius: "0.5rem",
                                border: "1px solid #4b5563",
                                backgroundColor: "#020617",
                                color: "#e5e7eb",
                                fontSize: "0.95rem",
                            }}
                        />
                    </div>

                    <div style={{ display: "grid", gap: "0.35rem" }}>
                        <label
                            htmlFor="email"
                            style={{ fontSize: "0.82rem", color: "#e5e7eb" }}
                        >
                            Email
                        </label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            style={{
                                padding: "0.55rem 0.75rem",
                                borderRadius: "0.5rem",
                                border: "1px solid #4b5563",
                                backgroundColor: "#020617",
                                color: "#e5e7eb",
                                fontSize: "0.95rem",
                            }}
                        />
                    </div>

                    <div style={{ display: "grid", gap: "0.35rem" }}>
                        <label
                            htmlFor="phone"
                            style={{ fontSize: "0.82rem", color: "#e5e7eb" }}
                        >
                            Mobile (optional)
                        </label>
                        <input
                            id="phone"
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="Mobile number"
                            style={{
                                padding: "0.55rem 0.75rem",
                                borderRadius: "0.5rem",
                                border: "1px solid #4b5563",
                                backgroundColor: "#020617",
                                color: "#e5e7eb",
                                fontSize: "0.95rem",
                            }}
                        />
                    </div>

                    {error && (
                        <div
                            style={{
                                padding: "0.55rem 0.75rem",
                                borderRadius: "0.5rem",
                                backgroundColor: "rgba(248, 113, 113, 0.08)",
                                border: "1px solid rgba(248, 113, 113, 0.45)",
                                color: "#fecaca",
                                fontSize: "0.82rem",
                            }}
                        >
                            {error}
                        </div>
                    )}

                    {success && (
                        <div
                            style={{
                                padding: "0.55rem 0.75rem",
                                borderRadius: "0.5rem",
                                backgroundColor: "rgba(34, 197, 94, 0.12)",
                                border: "1px solid rgba(34, 197, 94, 0.5)",
                                color: "#bbf7d0",
                                fontSize: "0.82rem",
                            }}
                        >
                            {success}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            marginTop: "0.35rem",
                            padding: "0.7rem 0.75rem",
                            borderRadius: "999px",
                            border: "none",
                            fontSize: "0.95rem",
                            fontWeight: 500,
                            cursor: loading ? "default" : "pointer",
                            background:
                                "linear-gradient(135deg, #38bdf8, #0ea5e9, #38bdf8)",
                            color: "#020617",
                            opacity: loading ? 0.7 : 1,
                            transition: "transform 0.12s ease-out, box-shadow 0.12s ease-out",
                            boxShadow: loading
                                ? "0 0 0 rgba(0,0,0,0)"
                                : "0 8px 24px rgba(56,189,248,0.4)",
                        }}
                    >
                        {loading ? "Activating access..." : "Activate Access"}
                    </button>
                </form>
            </div>
        </div>
    );
}
