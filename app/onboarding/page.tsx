"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { SignedIn, SignedOut, useUser } from "@clerk/nextjs";

type FormState = {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    state: string;
    postalCode: string;
};

export default function OnboardingPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const { user } = useUser();

    const inviteCode = searchParams.get("invite") || "";

    const [form, setForm] = React.useState<FormState>({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        state: "",
        postalCode: "",
    });

    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [successBorrowerId, setSuccessBorrowerId] =
        React.useState<string | null>(null);

    // Prefill from Clerk user if available and form is untouched
    React.useEffect(() => {
        if (!user) return;

        setForm((prev) => {
            const alreadyTouched =
                prev.firstName || prev.lastName || prev.email || prev.phone;
            if (alreadyTouched) return prev;

            const fullName = user.fullName || "";
            const split = fullName.split(" ");
            const firstName = split[0] || "";
            const lastName = split.slice(1).join(" ") || "";

            return {
                ...prev,
                firstName,
                lastName,
                email: user.primaryEmailAddress?.emailAddress || "",
            };
        });
    }, [user]);

    // Build redirectUrl back to this onboarding page with invite preserved
    const redirectUrl = React.useMemo(() => {
        const base =
            typeof window !== "undefined"
                ? window.location.origin
                : "https://chat.homerates.ai";
        const url = new URL(pathname || "/onboarding", base);
        if (inviteCode) {
            url.searchParams.set("invite", inviteCode);
        }
        // Clerk expects a relative path in redirect_url (starting with /)
        return url.pathname + url.search;
    }, [inviteCode, pathname]);

    function goToSignIn() {
        const base =
            typeof window !== "undefined"
                ? window.location.origin
                : "https://chat.homerates.ai";
        const url = new URL("/sign-in", base);
        url.searchParams.set("redirect_url", redirectUrl);
        // Full page navigation to Clerk sign-in
        if (typeof window !== "undefined") {
            window.location.href = url.toString();
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
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    inviteCode,
                    firstName: form.firstName.trim(),
                    lastName: form.lastName.trim(),
                    email: form.email.trim(),
                    phone: form.phone.trim() || null,
                    state: form.state.trim() || null,
                    postalCode: form.postalCode.trim() || null,
                }),
            });

            const data = await res.json().catch(() => null);

            // If API says "Not authenticated", immediately send them to sign in
            if (res.status === 401) {
                goToSignIn();
                return;
            }

            if (!res.ok) {
                setError(
                    data?.error ||
                    "We could not complete your onboarding. Please try again."
                );
                setSubmitting(false);
                return;
            }

            if (!data?.borrowerId) {
                setError("Onboarding completed but no borrower id was returned.");
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
            router.push(`/?borrower=${encodeURIComponent(successBorrowerId)}`);
        } else {
            router.push("/");
        }
    }

    // --- Render helpers ---

    const renderSuccess = () => (
        <div
            style={{
                width: "100%",
                maxWidth: "480px",
                padding: "18px 18px 20px",
                borderRadius: "16px",
                border: "1px solid rgba(148, 163, 184, 0.6)",
                background: "#f8fafc",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
            }}
        >
            <div>
                <h1
                    style={{
                        margin: 0,
                        fontSize: "1.25rem",
                        fontWeight: 600,
                        color: "#0f172a",
                    }}
                >
                    Your HomeRates.ai access is active
                </h1>
                <p
                    style={{
                        margin: "6px 0 0 0",
                        fontSize: "0.9rem",
                        color: "#475569",
                    }}
                >
                    You are now linked to your loan officer inside HomeRates.ai. You can
                    start asking questions any time.
                </p>
            </div>

            <button
                type="button"
                onClick={handleEnterApp}
                style={{
                    marginTop: "4px",
                    padding: "10px 16px",
                    borderRadius: "999px",
                    border: "1px solid #0f172a",
                    background: "#0f172a",
                    color: "#f9fafb",
                    fontSize: "0.95rem",
                    fontWeight: 500,
                    cursor: "pointer",
                }}
            >
                Enter HomeRates.ai
            </button>
        </div>
    );

    const renderForm = () => (
        <div
            style={{
                width: "100%",
                maxWidth: "480px",
                padding: "18px 18px 20px",
                borderRadius: "16px",
                border: "1px solid rgba(148, 163, 184, 0.6)",
                background: "#ffffff",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                maxHeight: "80vh",
                overflowY: "auto",
            }}
        >
            <div>
                <h1
                    style={{
                        margin: 0,
                        fontSize: "1.2rem",
                        fontWeight: 600,
                        color: "#0f172a",
                    }}
                >
                    Activate your HomeRates.ai access
                </h1>
                <p
                    style={{
                        margin: "6px 0 0 0",
                        fontSize: "0.9rem",
                        color: "#64748b",
                    }}
                >
                    A few quick details so we can link your questions to your loan
                    officer.
                </p>
            </div>

            {error && (
                <p
                    style={{
                        margin: 0,
                        fontSize: "0.85rem",
                        color: "#b91c1c",
                    }}
                >
                    {error}
                </p>
            )}

            {!inviteCode && (
                <p
                    style={{
                        margin: 0,
                        fontSize: "0.85rem",
                        color: "#b91c1c",
                    }}
                >
                    This invite link is missing a valid invite code. Please ask your loan
                    officer for a new link.
                </p>
            )}

            <form
                onSubmit={handleSubmit}
                style={{
                    display: "grid",
                    gap: "10px",
                }}
            >
                <div
                    style={{
                        display: "grid",
                        gap: "8px",
                    }}
                >
                    <label
                        style={{
                            fontSize: "0.8rem",
                            color: "#475569",
                        }}
                    >
                        First name
                        <input
                            type="text"
                            value={form.firstName}
                            onChange={(e) =>
                                setForm((prev) => ({ ...prev, firstName: e.target.value }))
                            }
                            style={{
                                marginTop: "4px",
                                width: "100%",
                                padding: "7px 9px",
                                borderRadius: "8px",
                                border: "1px solid rgba(148, 163, 184, 0.8)",
                                fontSize: "0.9rem",
                            }}
                            required
                        />
                    </label>

                    <label
                        style={{
                            fontSize: "0.8rem",
                            color: "#475569",
                        }}
                    >
                        Last name
                        <input
                            type="text"
                            value={form.lastName}
                            onChange={(e) =>
                                setForm((prev) => ({ ...prev, lastName: e.target.value }))
                            }
                            style={{
                                marginTop: "4px",
                                width: "100%",
                                padding: "7px 9px",
                                borderRadius: "8px",
                                border: "1px solid rgba(148, 163, 184, 0.8)",
                                fontSize: "0.9rem",
                            }}
                            required
                        />
                    </label>

                    <label
                        style={{
                            fontSize: "0.8rem",
                            color: "#475569",
                        }}
                    >
                        Email
                        <input
                            type="email"
                            value={form.email}
                            onChange={(e) =>
                                setForm((prev) => ({ ...prev, email: e.target.value }))
                            }
                            style={{
                                marginTop: "4px",
                                width: "100%",
                                padding: "7px 9px",
                                borderRadius: "8px",
                                border: "1px solid rgba(148, 163, 184, 0.8)",
                                fontSize: "0.9rem",
                            }}
                            required
                        />
                    </label>

                    <label
                        style={{
                            fontSize: "0.8rem",
                            color: "#475569",
                        }}
                    >
                        Mobile (optional)
                        <input
                            type="tel"
                            value={form.phone}
                            onChange={(e) =>
                                setForm((prev) => ({ ...prev, phone: e.target.value }))
                            }
                            style={{
                                marginTop: "4px",
                                width: "100%",
                                padding: "7px 9px",
                                borderRadius: "8px",
                                border: "1px solid rgba(148, 163, 184, 0.8)",
                                fontSize: "0.9rem",
                            }}
                        />
                    </label>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1.2fr 1fr",
                            gap: "8px",
                        }}
                    >
                        <label
                            style={{
                                fontSize: "0.8rem",
                                color: "#475569",
                            }}
                        >
                            State (optional)
                            <input
                                type="text"
                                value={form.state}
                                onChange={(e) =>
                                    setForm((prev) => ({ ...prev, state: e.target.value }))
                                }
                                style={{
                                    marginTop: "4px",
                                    width: "100%",
                                    padding: "7px 9px",
                                    borderRadius: "8px",
                                    border: "1px solid rgba(148, 163, 184, 0.8)",
                                    fontSize: "0.9rem",
                                }}
                            />
                        </label>

                        <label
                            style={{
                                fontSize: "0.8rem",
                                color: "#475569",
                            }}
                        >
                            Zip (optional)
                            <input
                                type="text"
                                value={form.postalCode}
                                onChange={(e) =>
                                    setForm((prev) => ({
                                        ...prev,
                                        postalCode: e.target.value,
                                    }))
                                }
                                style={{
                                    marginTop: "4px",
                                    width: "100%",
                                    padding: "7px 9px",
                                    borderRadius: "8px",
                                    border: "1px solid rgba(148, 163, 184, 0.8)",
                                    fontSize: "0.9rem",
                                }}
                            />
                        </label>
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={submitting || !inviteCode}
                    style={{
                        marginTop: "6px",
                        padding: "9px 16px",
                        borderRadius: "999px",
                        border: "1px solid #0f172a",
                        background: submitting ? "#e2e8f0" : "#0f172a",
                        color: submitting ? "#64748b" : "#f9fafb",
                        fontSize: "0.95rem",
                        fontWeight: 500,
                        cursor: submitting || !inviteCode ? "default" : "pointer",
                    }}
                >
                    {submitting ? "Finishing setup..." : "Finish setup"}
                </button>
            </form>
        </div>
    );

    const renderSignedOut = () => (
        <div
            style={{
                width: "100%",
                maxWidth: "480px",
                padding: "18px 18px 20px",
                borderRadius: "16px",
                border: "1px solid rgba(148, 163, 184, 0.6)",
                background: "#ffffff",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
            }}
        >
            <div>
                <h1
                    style={{
                        margin: 0,
                        fontSize: "1.2rem",
                        fontWeight: 600,
                        color: "#0f172a",
                    }}
                >
                    Join your loan officer in HomeRates.ai
                </h1>
                <p
                    style={{
                        margin: "6px 0 0 0",
                        fontSize: "0.9rem",
                        color: "#64748b",
                    }}
                >
                    To accept this invite, please sign in or create your free account.
                </p>
            </div>

            {inviteCode && (
                <p
                    style={{
                        margin: 0,
                        fontSize: "0.8rem",
                        color: "#64748b",
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

            <button
                type="button"
                onClick={goToSignIn}
                style={{
                    marginTop: "4px",
                    padding: "9px 16px",
                    borderRadius: "999px",
                    border: "1px solid #0f172a",
                    background: "#0f172a",
                    color: "#f9fafb",
                    fontSize: "0.95rem",
                    fontWeight: 500,
                    cursor: "pointer",
                }}
            >
                Continue to sign in
            </button>
        </div>
    );

    return (
        <main
            style={{
                minHeight: "calc(100vh - 40px)",
                padding: "24px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            <SignedOut>{renderSignedOut()}</SignedOut>

            <SignedIn>
                {successBorrowerId ? renderSuccess() : renderForm()}
            </SignedIn>
        </main>
    );
}
