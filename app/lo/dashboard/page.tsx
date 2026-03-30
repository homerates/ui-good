// app/lo/dashboard/page.tsx

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { getUserPlan } from "../../../lib/subscription";
import { PLANS } from "../../../lib/stripe";
import BillingPortalButton from "../../components/BillingPortalButton";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
        "Missing SUPABASE env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export const metadata = {
    title: "Loan Officer Portal - HomeRates.ai",
    robots: { index: false, follow: false },
};

export default async function LoDashboardPage() {
    // 1) Clerk auth – who is hitting this page?
    const { userId } = await auth();

    if (!userId) {
        // Not signed in at all
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
                <div
                    style={{
                        maxWidth: "480px",
                        padding: "18px 18px 20px",
                        borderRadius: "16px",
                        border: "1px solid rgba(148, 163, 184, 0.6)",
                        background: "#ffffff",
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                    }}
                >
                    <h1
                        style={{
                            margin: 0,
                            fontSize: "1.2rem",
                            fontWeight: 600,
                            color: "#0f172a",
                        }}
                    >
                        Please sign in
                    </h1>
                    <p
                        style={{
                            margin: "4px 0 0 0",
                            fontSize: "0.9rem",
                            color: "#64748b",
                        }}
                    >
                        The Loan Officer Portal is only available to signed-in users. Please
                        sign in with your HomeRates.ai account, then return here.
                    </p>
                    <Link
                        href="/sign-in"
                        style={{
                            marginTop: "6px",
                            alignSelf: "flex-start",
                            padding: "9px 16px",
                            borderRadius: "999px",
                            border: "1px solid #0f172a",
                            background: "#0f172a",
                            color: "#f9fafb",
                            fontSize: "0.9rem",
                            fontWeight: 500,
                            textDecoration: "none",
                        }}
                    >
                        Go to sign in
                    </Link>
                </div>
            </main>
        );
    }

    // 2) Look up loan officer record for this Clerk user
    const { data: loanOfficer, error: loError } = await supabase
        .from("loan_officers")
        .select("id, email, allowed_borrower_slots, stripe_customer_id, lender")
        .eq("user_id", userId)
        .maybeSingle();

    if (loError) {
        console.error("Error loading loan officer record:", loError);
    }

    if (!loanOfficer) {
        // Logged in, but not registered as LO
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
                <div
                    style={{
                        maxWidth: "520px",
                        padding: "18px 18px 20px",
                        borderRadius: "16px",
                        border: "1px solid rgba(248, 113, 113, 0.6)",
                        background: "#fef2f2",
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                    }}
                >
                    <h1
                        style={{
                            margin: 0,
                            fontSize: "1.2rem",
                            fontWeight: 600,
                            color: "#7f1d1d",
                        }}
                    >
                        Loan Officer access not found
                    </h1>
                    <p
                        style={{
                            margin: "4px 0 0 0",
                            fontSize: "0.9rem",
                            color: "#7f1d1d",
                        }}
                    >
                        You are signed in, but this account does not have a loan officer
                        profile in HomeRates.ai yet.
                    </p>
                    <p
                        style={{
                            margin: "4px 0 0 0",
                            fontSize: "0.85rem",
                            color: "#7f1d1d",
                        }}
                    >
                        If you&apos;re a lender or loan officer and want access to the
                        portal, please contact the HomeRates.ai team so we can enable your
                        profile.
                    </p>
                </div>
            </main>
        );
    }

    // 3) Count borrowers attached to this loan officer
    const { count: borrowerCount, error: borrowerCountError } = await supabase
        .from("borrowers")
        .select("id", { count: "exact", head: true })
        .eq("loan_officer_id", loanOfficer.id);

    if (borrowerCountError) {
        console.error("Error counting borrowers:", borrowerCountError);
    }

    const slots = loanOfficer.allowed_borrower_slots ?? 0;
    const used = borrowerCount ?? 0;
    const remaining = Math.max(slots - used, 0);

    // Fetch real subscription plan from users table
    const userPlan = await getUserPlan(userId);
    const planConfig = PLANS[userPlan.plan];
    const planLabel = planConfig.name;
    const hasActiveSub = userPlan.plan !== "free";
    const periodEnd = userPlan.billingPeriodEnd
        ? userPlan.billingPeriodEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : null;

    return (
        <main
            style={{
                minHeight: "calc(100vh - 40px)",
                padding: "24px 16px",
                display: "flex",
                justifyContent: "center",
            }}
        >
            <div
                style={{
                    width: "100%",
                    maxWidth: "960px",
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1.4fr)",
                    gap: "16px",
                }}
            >
                {/* Left column: main cards */}
                <section
                    style={{
                        display: "grid",
                        gap: "12px",
                    }}
                >
                    {/* Header */}
                    <div
                        style={{
                            padding: "16px 14px",
                            borderRadius: "16px",
                            border: "1px solid rgba(148, 163, 184, 0.6)",
                            background: "#ffffff",
                        }}
                    >
                        <h1
                            style={{
                                margin: 0,
                                fontSize: "1.3rem",
                                fontWeight: 600,
                                color: "#0f172a",
                            }}
                        >
                            Loan Officer Portal
                        </h1>
                        <p
                            style={{
                                margin: "6px 0 0 0",
                                fontSize: "0.9rem",
                                color: "#64748b",
                            }}
                        >
                            Manage your borrowers and access pro tools powered by
                            HomeRates.ai.
                        </p>
                        {loanOfficer.lender && (
                            <p
                                style={{
                                    margin: "6px 0 0 0",
                                    fontSize: "0.8rem",
                                    color: "#64748b",
                                }}
                            >
                                Lender: <strong>{loanOfficer.lender}</strong>
                            </p>
                        )}
                    </div>

                    {/* Invite borrowers card */}
                    <div
                        style={{
                            padding: "16px 14px",
                            borderRadius: "16px",
                            border: "1px solid rgba(148, 163, 184, 0.6)",
                            background: "#f8fafc",
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                        }}
                    >
                        <h2
                            style={{
                                margin: 0,
                                fontSize: "1rem",
                                fontWeight: 600,
                                color: "#0f172a",
                            }}
                        >
                            Invite borrowers
                        </h2>
                        <p
                            style={{
                                margin: 0,
                                fontSize: "0.9rem",
                                color: "#64748b",
                            }}
                        >
                            Generate a unique invite link so your borrowers can onboard into
                            HomeRates.ai and have their questions automatically tied to your
                            file.
                        </p>
                        <Link
                            href="/lo/borrowers"
                            style={{
                                marginTop: "6px",
                                alignSelf: "flex-start",
                                padding: "9px 16px",
                                borderRadius: "999px",
                                border: "1px solid #0f172a",
                                background: "#0f172a",
                                color: "#f9fafb",
                                fontSize: "0.9rem",
                                fontWeight: 500,
                                textDecoration: "none",
                            }}
                        >
                            Open borrower invites
                        </Link>
                    </div>

                    {/* Coming soon tools */}
                    <div
                        style={{
                            padding: "16px 14px",
                            borderRadius: "16px",
                            border: "1px solid rgba(148, 163, 184, 0.4)",
                            background: "#ffffff",
                            display: "grid",
                            gap: "10px",
                        }}
                    >
                        <h2
                            style={{
                                margin: 0,
                                fontSize: "1rem",
                                fontWeight: 600,
                                color: "#0f172a",
                            }}
                        >
                            Coming soon
                        </h2>
                        <ul
                            style={{
                                margin: "4px 0 0 0",
                                paddingLeft: "18px",
                                fontSize: "0.9rem",
                                color: "#64748b",
                                display: "grid",
                                gap: "4px",
                            }}
                        >
                            <li>Borrower list with status and last activity.</li>
                            <li>
                                Conversation analytics so you can see which borrowers are most
                                engaged.
                            </li>
                            <li>
                                Subscription & billing controls for managing your HomeRates.ai
                                plan.
                            </li>
                        </ul>
                    </div>
                </section>

                {/* Right column: metrics & billing */}
                <section
                    style={{
                        display: "grid",
                        gap: "12px",
                    }}
                >
                    {/* Borrower metrics */}
                    <div
                        style={{
                            padding: "16px 14px",
                            borderRadius: "16px",
                            border: "1px solid rgba(148, 163, 184, 0.6)",
                            background: "#ffffff",
                            display: "grid",
                            gap: "8px",
                        }}
                    >
                        <h2
                            style={{
                                margin: 0,
                                fontSize: "1rem",
                                fontWeight: 600,
                                color: "#0f172a",
                            }}
                        >
                            Borrower capacity
                        </h2>
                        <p
                            style={{
                                margin: 0,
                                fontSize: "0.9rem",
                                color: "#64748b",
                            }}
                        >
                            Active borrowers: <strong>{used}</strong>
                        </p>
                        <p
                            style={{
                                margin: 0,
                                fontSize: "0.9rem",
                                color: "#64748b",
                            }}
                        >
                            Plan limit: <strong>{slots}</strong> borrowers
                        </p>
                        <p
                            style={{
                                margin: 0,
                                fontSize: "0.9rem",
                                color: remaining > 0 ? "#16a34a" : "#b91c1c",
                            }}
                        >
                            Slots remaining: <strong>{remaining}</strong>
                        </p>
                    </div>

                    {/* Billing card */}
                    <div
                        style={{
                            padding: "16px 14px",
                            borderRadius: "16px",
                            border: hasActiveSub
                                ? "1px solid rgba(0, 232, 122, 0.3)"
                                : "1px solid rgba(148, 163, 184, 0.4)",
                            background: hasActiveSub ? "rgba(0, 232, 122, 0.04)" : "#f8fafc",
                            display: "grid",
                            gap: "10px",
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "#0f172a" }}>
                                Billing
                            </h2>
                            <span
                                style={{
                                    fontSize: "0.7rem",
                                    fontWeight: 700,
                                    letterSpacing: "0.06em",
                                    textTransform: "uppercase",
                                    padding: "3px 10px",
                                    borderRadius: "999px",
                                    background: hasActiveSub ? "rgba(0,232,122,0.15)" : "rgba(148,163,184,0.15)",
                                    color: hasActiveSub ? "#059669" : "#64748b",
                                }}
                            >
                                {planLabel}
                            </span>
                        </div>

                        {periodEnd && (
                            <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>
                                Renews {periodEnd}
                            </p>
                        )}

                        {!hasActiveSub && (
                            <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b", lineHeight: 1.5 }}>
                                You are on the free plan. Upgrade to Pro to add borrowers, export PDFs, and set up alerts.
                            </p>
                        )}

                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            {hasActiveSub ? (
                                <BillingPortalButton />
                            ) : (
                                <Link
                                    href="/pricing"
                                    style={{
                                        display: "inline-block",
                                        padding: "8px 16px",
                                        borderRadius: "8px",
                                        background: "#00e87a",
                                        color: "#080c12",
                                        fontSize: "0.85rem",
                                        fontWeight: 600,
                                        textDecoration: "none",
                                    }}
                                >
                                    Upgrade plan →
                                </Link>
                            )}
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}
