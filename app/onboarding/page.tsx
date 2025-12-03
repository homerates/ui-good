// app/onboarding/page.tsx
"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function OnboardingPage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const inviteCodeFromUrl = searchParams.get("invite") ?? "";

    const [inviteCode] = React.useState(inviteCodeFromUrl);
    const [firstName, setFirstName] = React.useState("");
    const [lastName, setLastName] = React.useState("");
    const [email, setEmail] = React.useState("");
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);
        setSubmitting(true);

        try {
            const res = await fetch("/api/onboarding/complete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    inviteCode,
                    firstName,
                    lastName,
                    email,
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => null);
                setError(data?.error || "Something went wrong completing onboarding.");
                setSubmitting(false);
                return;
            }

            const data = await res.json();
            const borrowerId = data?.borrowerId as string | undefined;

            if (!borrowerId) {
                setError("Onboarding completed, but no borrower ID returned.");
                setSubmitting(false);
                return;
            }

            router.push(
                `/onboarding/success?borrower=${encodeURIComponent(borrowerId)}`
            );
        } catch (err) {
            console.error("Onboarding submit error:", err);
            setError("Unexpected error. Please try again.");
            setSubmitting(false);
        }
    }

    return (
        <main
            style={{
                minHeight: "calc(100vh - 40px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px",
            }}
        >
            <section
                style={{
                    width: "100%",
                    maxWidth: "520px",
                    padding: "24px 20px",
                    borderRadius: "16px",
                    border: "1px solid rgba(148, 163, 184, 0.4)",
                    boxShadow: "0 18px 45px rgba(15, 23, 42, 0.10)",
                    background: "rgba(255, 255, 255, 0.98)",
                }}
            >
                <header style={{ marginBottom: "16px" }}>
                    <p
                        style={{
                            fontSize: "0.75rem",
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: "#64748b",
                            marginBottom: "4px",
                        }}
                    >
                        Step 1
                    </p>
                    <h1
                        style={{
                            fontSize: "1.3rem",
                            fontWeight: 600,
                            lineHeight: 1.25,
                            color: "#0f172a",
                            margin: 0,
                        }}
                    >
                        Tell HomeRates.ai who you are
                    </h1>
                </header>

                <p
                    style={{
                        fontSize: "0.9rem",
                        lineHeight: 1.5,
                        color: "#475569",
                        marginBottom: "20px",
                    }}
                >
                    Your answers help your loan officer see the full picture and keep your
                    questions and scenarios attached to your file.
                </p>

                <form onSubmit={handleSubmit} style={{ display: "grid", gap: "12px" }}>
                    {/* Invite (read-only) */}
                    <div style={{ display: "grid", gap: "4px" }}>
                        <label
                            style={{
                                fontSize: "0.8rem",
                                fontWeight: 500,
                                color: "#0f172a",
                            }}
                        >
                            Invite code
                        </label>
                        <input
                            type="text"
                            value={inviteCode}
                            readOnly
                            style={{
                                fontSize: "0.9rem",
                                padding: "8px 10px",
                                borderRadius: "8px",
                                border: "1px solid rgba(148, 163, 184, 0.8)",
                                backgroundColor: "#f8fafc",
                                color: "#0f172a",
                            }}
                        />
                    </div>

                    {/* First name */}
                    <div style={{ display: "grid", gap: "4px" }}>
                        <label
                            style={{
                                fontSize: "0.8rem",
                                fontWeight: 500,
                                color: "#0f172a",
                            }}
                        >
                            First name
                        </label>
                        <input
                            type="text"
                            required
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            style={{
                                fontSize: "0.9rem",
                                padding: "8px 10px",
                                borderRadius: "8px",
                                border: "1px solid rgba(148, 163, 184, 0.8)",
                            }}
                        />
                    </div>

                    {/* Last name */}
                    <div style={{ display: "grid", gap: "4px" }}>
                        <label
                            style={{
                                fontSize: "0.8rem",
                                fontWeight: 500,
                                color: "#0f172a",
                            }}
                        >
                            Last name
                        </label>
                        <input
                            type="text"
                            required
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            style={{
                                fontSize: "0.9rem",
                                padding: "8px 10px",
                                borderRadius: "8px",
                                border: "1px solid rgba(148, 163, 184, 0.8)",
                            }}
                        />
                    </div>

                    {/* Email */}
                    <div style={{ display: "grid", gap: "4px" }}>
                        <label
                            style={{
                                fontSize: "0.8rem",
                                fontWeight: 500,
                                color: "#0f172a",
                            }}
                        >
                            Email
                        </label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            style={{
                                fontSize: "0.9rem",
                                padding: "8px 10px",
                                borderRadius: "8px",
                                border: "1px solid rgba(148, 163, 184, 0.8)",
                            }}
                        />
                    </div>

                    {error && (
                        <p
                            style={{
                                fontSize: "0.8rem",
                                color: "#b91c1c",
                                marginTop: "4px",
                            }}
                        >
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={submitting}
                        style={{
                            marginTop: "12px",
                            padding: "10px 14px",
                            borderRadius: "999px",
                            border: "1px solid #0f172a",
                            background: submitting ? "#e2e8f0" : "#0f172a",
                            color: submitting ? "#64748b" : "#f9fafb",
                            fontSize: "0.9rem",
                            fontWeight: 500,
                            cursor: submitting ? "default" : "pointer",
                        }}
                    >
                        {submitting ? "Finishing setup..." : "Continue"}
                    </button>
                </form>
            </section>
        </main>
    );
}
