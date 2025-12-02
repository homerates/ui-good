// app/borrowers/new/page.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useAuth, SignInButton } from "@clerk/nextjs";

export default function NewBorrowerPage() {
    const router = useRouter();
    const { isSignedIn } = useAuth();

    const [name, setName] = React.useState("");
    const [email, setEmail] = React.useState("");
    const [state, setState] = React.useState("");
    const [postalCode, setPostalCode] = React.useState("");

    const [status, setStatus] = React.useState<
        "idle" | "loading" | "success" | "error"
    >("idle");
    const [message, setMessage] = React.useState("");

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        if (!name.trim()) {
            setStatus("error");
            setMessage("Borrower name is required.");
            return;
        }

        if (!isSignedIn) {
            setStatus("error");
            setMessage("Please sign in as a loan officer before adding borrowers.");
            return;
        }

        setStatus("loading");
        setMessage("");

        try {
            const res = await fetch("/api/borrowers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    email: email.trim() || null,
                    state: state.trim() || null,
                    postalCode: postalCode.trim() || null
                })
            });

            const data = await res.json();

            if (!res.ok) {
                setStatus("error");
                setMessage(
                    data.error ||
                    "Could not create borrower. Please check your plan or try again."
                );
                return;
            }

            setStatus("success");
            setMessage(data.message || "Borrower created successfully.");

            // Optional: redirect after short delay
            setTimeout(() => {
                router.push("/"); // or "/borrowers" if you later add a list page
            }, 1200);
        } catch (err: any) {
            console.error("New borrower error:", err);
            setStatus("error");
            setMessage("Unexpected error while creating borrower.");
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-8">
            <div className="w-full max-w-md border rounded-xl p-6 shadow-sm">
                <h1 className="text-xl font-semibold mb-2">
                    Add a New Borrower
                </h1>
                <p className="text-sm text-gray-600 mb-4">
                    Start with the basics. You can collect more details later as you
                    build the relationship.
                </p>

                {!isSignedIn && (
                    <div className="border rounded-md p-3 mb-4 bg-gray-50">
                        <p className="text-sm mb-2">
                            You need to sign in as a loan officer to add borrowers.
                        </p>
                        <SignInButton mode="modal">
                            <button className="w-full text-sm font-medium border rounded-md py-2">
                                Sign in
                            </button>
                        </SignInButton>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Borrower name
                        </label>
                        <input
                            type="text"
                            className="w-full border rounded-md px-3 py-2 text-sm"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Full name"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Email (optional)
                        </label>
                        <input
                            type="email"
                            className="w-full border rounded-md px-3 py-2 text-sm"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="borrower@example.com"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                State (optional)
                            </label>
                            <input
                                type="text"
                                className="w-full border rounded-md px-3 py-2 text-sm"
                                value={state}
                                onChange={(e) => setState(e.target.value)}
                                placeholder="CA"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Zip code (optional)
                            </label>
                            <input
                                type="text"
                                className="w-full border rounded-md px-3 py-2 text-sm"
                                value={postalCode}
                                onChange={(e) => setPostalCode(e.target.value)}
                                placeholder="90011"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={status === "loading"}
                        className="w-full text-sm font-semibold rounded-md py-2 border"
                    >
                        {status === "loading" ? "Saving borrower..." : "Save borrower"}
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
