"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { SignedIn, SignedOut, useUser } from "@clerk/nextjs";

type FormState = {
    firstName: string;
    lastName: string;
    email: string;
};

// ── shared styles (defined outside component so they're stable references) ──

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


// ─────────────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const { user } = useUser();

    const inviteCode   = searchParams?.get("invite") || "";
    const emailFromUrl = searchParams?.get("email")  || "";
    const nameFromUrl  = searchParams?.get("name")   || "";

    const [form, setForm] = React.useState<FormState>({
        firstName: nameFromUrl || "",
        lastName: "",
        email: emailFromUrl || "",
    });

    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [successBorrowerId, setSuccessBorrowerId] = React.useState<string | null>(null);

    // Prefill from Clerk user when signed in — only fills empty fields
    React.useEffect(() => {
        if (!user) return;
        setForm((prev) => {
            const parts = (user.fullName || "").split(" ");
            return {
                firstName: prev.firstName || parts[0] || "",
                lastName:  prev.lastName  || parts.slice(1).join(" ") || "",
                email:     prev.email     || user.primaryEmailAddress?.emailAddress || "",
            };
        });
    }, [user]);

    const redirectUrl = React.useMemo(() => {
        const base = typeof window !== "undefined" ? window.location.origin : "https://chat.homerates.ai";
        const url = new URL(pathname || "/onboarding", base);
        if (inviteCode) url.searchParams.set("invite", inviteCode);
        return url.pathname + url.search;
    }, [pathname, inviteCode]);

    function handleGoToSignIn() {
        const base = typeof window !== "undefined" ? window.location.origin : "https://chat.homerates.ai";
        const signInUrl = new URL("/sign-in", base);
        signInUrl.searchParams.set("redirect_url", redirectUrl);
        // Pre-fill email so the user doesn't have to type it
        if (emailFromUrl) signInUrl.searchParams.set("email", emailFromUrl);
        if (typeof window !== "undefined") window.location.href = signInUrl.toString();
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        if (!inviteCode) { setError("This invite link is missing a valid invite code."); return; }
        if (!form.firstName || !form.lastName || !form.email) { setError("Please complete first name, last name and email."); return; }

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

            if (res.status === 401) { handleGoToSignIn(); return; }
            if (!res.ok) {
                setError(data?.error || "We could not complete your setup. Please try again.");
                setSubmitting(false);
                return;
            }
            if (!data?.borrowerId) {
                setError("Setup completed but no profile id was returned.");
                setSubmitting(false);
                return;
            }

            // Silently set role = borrower so /welcome is skipped on next visit
            fetch("/api/onboarding/setup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role: "borrower" }),
            }).catch(() => { /* non-fatal */ });

            setSuccessBorrowerId(data.borrowerId as string);
            setSubmitting(false);
        } catch {
            setError("Unexpected error. Please try again.");
            setSubmitting(false);
        }
    }

    function handleEnterApp() {
        router.push(successBorrowerId ? `/chat?borrower=${encodeURIComponent(successBorrowerId)}` : "/chat");
    }

    // ── render ───────────────────────────────────────────────────────────────

    return (
        <>
            <style>{`
                body:has(.ob-root) .app-footer { display: none !important; }
                .ob-root { position: fixed; inset: 0; overflow-y: auto; overflow-x: hidden; background: #080c12; z-index: 9000; font-family: 'DM Sans', system-ui, sans-serif; color: #f0f4ff; display: flex; flex-direction: column; }
                .ob-nav { padding: 18px 32px; border-bottom: 1px solid rgba(255,255,255,0.06); flex-shrink: 0; }
                .ob-nav img { height: 28px; }
                .ob-body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 16px 60px; }
                input::placeholder { color: rgba(185,208,192,0.3); }
                input:focus { border-color: rgba(0,232,122,0.4) !important; box-shadow: 0 0 0 3px rgba(0,232,122,0.12); }
            `}</style>
            <div className="ob-root">
              <nav className="ob-nav">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" />
              </nav>
            <main className="ob-body">
                {successBorrowerId ? (
                    /* ── Success ── */
                    <div style={cardStyle}>
                        <div style={{
                            width: 48, height: 48, borderRadius: 999,
                            background: "rgba(0,232,122,0.12)",
                            border: "1px solid rgba(0,232,122,0.3)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "1.4rem", color: "#00e87a",
                        }}>✓</div>
                        <div>
                            <h1 style={{ margin: "0 0 8px", fontSize: "1.3rem", fontWeight: 700, color: "#f1f5f9", lineHeight: 1.25 }}>You're all set!</h1>
                            <p style={{ margin: 0, fontSize: "0.9rem", color: "rgba(185,208,192,0.7)", lineHeight: 1.6 }}>
                                Your profile is linked to your loan officer. Ask mortgage questions, get rate alerts, and stay on top of your home purchase — all in one place.
                            </p>
                        </div>
                        <button type="button" onClick={handleEnterApp} style={{
                            padding: "12px 20px", borderRadius: 999, border: "none",
                            background: "#00e87a", color: "#080c12", fontSize: "0.95rem", fontWeight: 700, cursor: "pointer",
                        }}>
                            Enter HomeRates.ai →
                        </button>
                    </div>
                ) : (
                    <>
                        {/* ── Not signed in ── */}
                        <SignedOut>
                            <div style={cardStyle}>
                                <div>
                                    <h1 style={{ margin: "0 0 8px", fontSize: "1.3rem", fontWeight: 700, color: "#f1f5f9", lineHeight: 1.25 }}>
                                        {nameFromUrl ? `Welcome, ${nameFromUrl}` : "You've been invited"}
                                    </h1>
                                    <p style={{ margin: 0, fontSize: "0.9rem", color: "rgba(185,208,192,0.7)", lineHeight: 1.6 }}>
                                        Your loan officer has added you to HomeRates.{" "}
                                        {emailFromUrl
                                            ? `We'll sign you in as ${emailFromUrl}.`
                                            : "Sign in or create a free account to activate your access."}
                                    </p>
                                </div>
                                {emailFromUrl && (
                                    <div style={{
                                        padding: "10px 14px", borderRadius: 8,
                                        background: "rgba(0,232,122,0.06)", border: "1px solid rgba(0,232,122,0.15)",
                                        fontSize: "0.88rem", color: "#00e87a", fontWeight: 600,
                                    }}>
                                        {emailFromUrl}
                                    </div>
                                )}
                                <button type="button" onClick={handleGoToSignIn} style={{
                                    padding: "12px 20px", borderRadius: 999, border: "none",
                                    background: "#00e87a", color: "#080c12", fontSize: "0.95rem", fontWeight: 700, cursor: "pointer",
                                }}>
                                    {emailFromUrl ? `Continue as ${emailFromUrl} →` : "Continue to sign in →"}
                                </button>
                            </div>
                        </SignedOut>

                        {/* ── Signed in — fill details ── */}
                        <SignedIn>
                            <div style={cardStyle}>
                                <div>
                                    <h1 style={{ margin: "0 0 8px", fontSize: "1.3rem", fontWeight: 700, color: "#f1f5f9", lineHeight: 1.25 }}>Activate your access</h1>
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
                                            marginTop: 4, padding: "12px 20px", borderRadius: 999, border: "none",
                                            background: submitting || !inviteCode ? "rgba(0,232,122,0.3)" : "#00e87a",
                                            color: submitting || !inviteCode ? "rgba(8,12,18,0.5)" : "#080c12",
                                            fontSize: "0.95rem", fontWeight: 700,
                                            cursor: submitting || !inviteCode ? "default" : "pointer",
                                        }}
                                    >
                                        {submitting ? "Setting up your account…" : "Finish setup →"}
                                    </button>
                                </form>
                            </div>
                        </SignedIn>
                    </>
                )}

            </main>
            </div>
        </>
    );
}
