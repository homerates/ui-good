"use client";

import React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth, SignInButton } from "@clerk/nextjs";

export default function JoinPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { isSignedIn } = useAuth();

    const initialInvite = searchParams.get("invite") || "";
    const [inviteCode, setInviteCode] = React.useState(initialInvite);
    const [status, setStatus] = React.useState<"idle" | "loading" | "success" | "error">("idle");
    const [message, setMessage] = React.useState<string>("");

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        if (!inviteCode.trim()) {
            setStatus("error");
            setMessage("Please enter an invite code.");
            return;
        }

        if (!isSignedIn) {
            setStatus("error");
            setMessage("Please sign in before claiming an invite.");
            return;
        }

        setStatus("loading");
        setMessage("");

        try {
            const res = await fetch("/api/onboarding/complete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ inviteCode: inviteCode.trim() })
            });

            const data = await res.json();

            if (!res.ok) {
                setStatus("error");
                setMessage(data.error || "Failed to complete onboarding.");
                return;
            }

            setStatus("success");
            setMessage("You’re in. Your loan officer profile is ready.");

            // Redirect into the main app after a short delay
            setTimeout(() => {
                router.push("/"); // or "/dashboard" if that’s your main page
            }, 1200);
        } catch (err: any) {
            console.error("Join error", err);
            setStatus("error");
            setMessage("Unexpected error while completing onboarding.");
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-8">
            <div className="w-full max-w-md border rounded-xl p-6 shadow-sm">
                <h1 className="text-xl font-semibold mb-2">
                    Join HomeRates.ai
                </h1>
                <p className="text-sm text-gray-600 mb-4">
                    Enter your invite code to finish setting up your loan officer account.
                </p>

                {!isSignedIn && (
                    <div className="border rounded-md p-3 mb-4 bg-gray-50">
                        <p className="text-sm mb-2">
                            You need to sign in before you can claim an invite.
                        </p>
                        <SignInButton mode="modal">
                            <button className="w-full text-sm font-medium border rounded-md py-2">
                                Sign in or create an account
                            </button>
                        </SignInButton>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Invite code
                        </label>
                        <input
                            type="text"
                            value={inviteCode}
                            onChange={(e) => setInviteCode(e.target.value)}
                            placeholder="Paste your invite code here"
                            className="w-full border rounded-md px-3 py-2 text-sm"
                        />
                        {initialInvite && (
                            <p className="text-xs text-gray-500 mt-1">
                                We pre-filled this from your invite link.
                            </p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={status === "loading"}
                        className="w-full text-sm font-semibold rounded-md py-2 border"
                    >
                        {status === "loading" ? "Finishing setup..." : "Claim invite & complete setup"}
                    </button>
                </form>

                {status === "error" && message && (
                    <p className="mt-3 text-sm text-red-600">{message}</p>
                )}
                {status === "success" && message && (
                    <p className="mt-3 text-sm text-green-600">{message}</p>
                )}
            </div>
        </div>
    );
}
