"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { SignedIn, SignedOut, useUser } from "@clerk/nextjs";

type FormState = {
    firstName: string;
    lastName: string;
    email: string;
};

export default function OnboardingPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const { user } = useUser();

    const inviteCode = searchParams?.get("invite") || "";

    const [form, setForm] = React.useState<FormState>({
        firstName: "",
        lastName: "",
        email: "",
    });

    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [successBorrowerId, setSuccessBorrowerId] =
        React.useState<string | null>(null);

    // Prefill from Clerk user when signed in
    React.useEffect(() => {
        if (!user) return;

        setForm((prev) => {
            const alreadyTouched =
                prev.firstName || prev.lastName || prev.email;

            if (alreadyTouched) return prev;

            const fullName = user.fullName || "";
            const parts = fullName.split(" ");
            const firstName = parts[0] || "";
            const lastName = parts.slice(1).join(" ") || "";

            return {
                ...prev,
                firstName,
                lastName,
                email: user.primaryEmailAddress?.emailAddress || "",
            };
        });
    }, [user]);

    // Build redirect_url back to this onboarding page (path + query)
    const redirectUrl = React.useMemo(() => {
        const base =
            typeof window !== "undefined"
                ? window.location.origin
                : "https://chat.homerates.ai";
        const url = new URL(pathname || "/onboarding", base);
        if (inviteCode) {
            url.searchParams.set("invite", inviteCode);
        }
        return url.pathname + url.search;
    }, [pathname, inviteCode]);

    function handleGoToSignIn() {
        const base =
            typeof window !== "undefined"
                ? window.location.origin
                : "https://chat.homerates.ai";
        const signInUrl = new URL("/sign-in", base);
        signInUrl.searchParams.set("redirect_url", redirectUrl);

        if (typeof window !== "undefined") {
            window.location.href = signInUrl.toString();
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        if (!inviteCode) {
            setError("This invite link is missing a valid invite code.");
            return;
        }

        if (!form.firstName || !form.lastName || !form.email) {
            setError("Please complete first name, last name and email.");
            return;
        }

        setSubmitting(true);

        try {
            const res = await fetch("/api/onboarding/complete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    inviteCode,
                    firstName: form.firstName.trim(),
                    lastName: form.lastName.trim(),
                    email: form.email.trim(),
                }),
            });

            const data = await res.json().catch(() => null);

            if (res.status === 401) {
                handleGoToSignIn();
                return;
            }

            if (!res.ok) {
                setError(
                    data?.error ||
                    "We could not complete your setup. Please try again."
                );
                setSubmitting(false);
                return;
            }

            if (!data?.borrowerId) {
                setError("Setup completed but no profile id was returned.");
                setSubmitting(false);
                return;
            }

            setSuccessBorrowerId(data.borrowerId as string);
            setSubmitting(false);
        } catch (err) {
            console.error("Onboarding submit error:", err);
            setError("Unexpected error. Please try again.");
            setSubmitting(false);
        }
    }

    function handleEnterApp() {
        if (successBorrowerId) {
            router.push(`/chat?borrower=${encodeURIComponent(successBorrowerId)}`);
        } else {
            router.push("/chat");
        }
    }

    // ── shared input style ───────────────────────────────────────────────────
    const inputStyle: React.CSSProperties = {
        marginTop: 4,
        width: "100%",
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid rgba(148,163,184,0.2)",
        background: "rgba(255,255,255,0.05)",
        color: "#e0f0e8",
        fontSize: "0.9rem",
        outline: "none",
        fontFamily: "inherit",
        boxSizing: "border-box",
    };

    const labelStyle: React.CSSProperties = {
        display: "block",
        fontSize: "0.78rem",
        fontWeight: 600,
        letterSpacing: "0.04em",
        color: "rgba(185,208,192,0.6)",
        textTransform: "uppercase",
    };

    const cardStyle: React.CSSProperties = {
        width: "100%",
        maxWidth: 440,
        padding: "32px 28px 36px",
        borderRadius: 18,
        border: "1px solid rgba(0,232,122,0.15)",
        background: "rgba(255,255,255,0.04)",
        display: "flex",
        flexDirection: "column",
        gap: 20,
    };

    // ── views ────────────────────────────────────────────────────────────────

    const SignedOutView = () => (
        <div style={cardStyle}>
            {/* Logo mark */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: "rgba(0,232,122,0.12)",
                    border: "1px solid rgba(0,232,122,0.25)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "1rem", fontWeight: 800, color: "#00e87a",
                    fontFamily: "Georgia, serif",
                }}>H</div>
                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "rgba(185,208,192,0.6)", letterSpacing: "0.06em", textTransform: "uppercase" }}>HomeRates.ai</span>
            </div>

            <div>
                <h1 style={{ margin: "0 0 8px", fontSize: "1.3rem", fontWeight: 700, color: "#f1f5f9", lineHeight: 1.25 }}>
                    You've been invited
                </h1>
                <p style={{ margin: 0, fontSize: "0.9rem", color: "rgba(185,208,192,0.7)", lineHeight: 1.6 }}>
                    Your loan officer has added you to HomeRates. Sign in or create a free account to activate your access.
                </p>
            </div>

            {inviteCode && (
                <div style={{
                    padding: "8px 12px", borderRadius: 8,
                    background: "rgba(0,232,122,0.06)",
                    border: "1px solid rgba(0,232,122,0.15)",
                    fontSize: "0.78rem", color: "rgba(185,208,192,0.5)",
                }}>
                    Invite code: <span style={{ fontFamily: "monospace", color: "#00e87a", marginLeft: 4 }}>{inviteCode}</span>
                </div>
            )}

            <button
                type="button"
                onClick={handleGoToSignIn}
                style={{
                    padding: "12px 20px",
                    borderRadius: 999,
                    border: "none",
                    background: "#00e87a",
                    color: "#080c12",
                    fontSize: "0.95rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    letterSpacing: "0.01em",
                }}
            >
                Continue to sign in →
            </button>
        </div>
    );

    const SignedInFormView = () => (
        <div style={cardStyle}>
            {/* Logo mark */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: "rgba(0,232,122,0.12)",
                    border: "1px solid rgba(0,232,122,0.25)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "1rem", fontWeight: 800, color: "#00e87a",
                    fontFamily: "Georgia, serif",
                }}>H</div>
                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "rgba(185,208,192,0.6)", letterSpacing: "0.06em", textTransform: "uppercase" }}>HomeRates.ai</span>
            </div>

            <div>
                <h1 style={{ margin: "0 0 8px", fontSize: "1.3rem", fontWeight: 700, color: "#f1f5f9", lineHeight: 1.25 }}>
                    Activate your access
                </h1>
                <p style={{ margin: 0, fontSize: "0.9rem", color: "rgba(185,208,192,0.7)", lineHeight: 1.6 }}>
                    Confirm your details below. Your questions will be linked to your loan officer's file.
                </p>
            </div>

            {!inviteCode && (
                <p style={{ margin: 0, padding: "10px 12px", borderRadius: 8, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", fontSize: "0.85rem", color: "#f87171" }}>
                    This invite link is missing a valid code. Ask your loan officer for a new link.
                </p>
            )}

            {error && (
                <p style={{ margin: 0, padding: "10px 12px", borderRadius: 8, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", fontSize: "0.85rem", color: "#f87171" }}>
                    {error}
                </p>
            )}

            <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
                <label style={labelStyle}>
                    First name
                    <input
                        type="text"
                        value={form.firstName}
                        onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
                        style={inputStyle}
                        required
                    />
                </label>

                <label style={labelStyle}>
                    Last name
                    <input
                        type="text"
                        value={form.lastName}
                        onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
                        style={inputStyle}
                        required
                    />
                </label>

                <label style={labelStyle}>
                    Email
                    <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                        style={inputStyle}
                        required
                    />
                </label>

                <button
                    type="submit"
                    disabled={submitting || !inviteCode}
                    style={{
                        marginTop: 4,
                        padding: "12px 20px",
                        borderRadius: 999,
                        border: "none",
                        background: submitting || !inviteCode ? "rgba(0,232,122,0.3)" : "#00e87a",
                        color: submitting || !inviteCode ? "rgba(8,12,18,0.5)" : "#080c12",
                        fontSize: "0.95rem",
                        fontWeight: 700,
                        cursor: submitting || !inviteCode ? "default" : "pointer",
                    }}
                >
                    {submitting ? "Setting up your account…" : "Finish setup →"}
                </button>
            </form>
        </div>
    );

    const SuccessView = () => (
        <div style={cardStyle}>
            {/* Check icon */}
            <div style={{
                width: 48, height: 48, borderRadius: 999,
                background: "rgba(0,232,122,0.12)",
                border: "1px solid rgba(0,232,122,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "1.4rem",
            }}>✓</div>

            <div>
                <h1 style={{ margin: "0 0 8px", fontSize: "1.3rem", fontWeight: 700, color: "#f1f5f9", lineHeight: 1.25 }}>
                    You're all set!
                </h1>
                <p style={{ margin: 0, fontSize: "0.9rem", color: "rgba(185,208,192,0.7)", lineHeight: 1.6 }}>
                    Your profile is linked to your loan officer. Ask mortgage questions, get rate alerts, and stay on top of your home purchase — all in one place.
                </p>
            </div>

            <button
                type="button"
                onClick={handleEnterApp}
                style={{
                    padding: "12px 20px",
                    borderRadius: 999,
                    border: "none",
                    background: "#00e87a",
                    color: "#080c12",
                    fontSize: "0.95rem",
                    fontWeight: 700,
                    cursor: "pointer",
                }}
            >
                Enter HomeRates.ai →
            </button>
        </div>
    );

    return (
        <>
            <style>{`
                body { background: #080c12 !important; }
                body.app { background: #080c12 !important; }
                * { box-sizing: border-box; }
                input::placeholder { color: rgba(185,208,192,0.3); }
                input:focus { border-color: rgba(0,232,122,0.4) !important; box-shadow: 0 0 0 3px rgba(0,232,122,0.12); }
            `}</style>
            <main style={{
                minHeight: "100dvh",
                background: "#080c12",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px 16px",
            }}>
                {successBorrowerId ? (
                    <SuccessView />
                ) : (
                    <>
                        <SignedOut>
                            <SignedOutView />
                        </SignedOut>
                        <SignedIn>
                            <SignedInFormView />
                        </SignedIn>
                    </>
                )}

                {/* Footer */}
                <p style={{
                    marginTop: 24,
                    fontSize: "0.72rem",
                    color: "rgba(185,208,192,0.25)",
                    textAlign: "center",
                }}>
                    HomeRates.ai — AI-powered mortgage intelligence
                </p>
            </main>
        </>
    );
}
