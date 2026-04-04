// app/lo/dashboard/page.tsx

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { getUserPlan } from "../../../lib/subscription";
import { PLANS } from "../../../lib/stripe";
import BillingPortalButton from "../../components/BillingPortalButton";
import PageShell from "../../components/PageShell";

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
    const { userId } = await auth();

    if (!userId) {
        return (
            <PageShell backHref="/" backLabel="Home" maxWidth={480}>
                <div style={{
                    padding: "28px 24px",
                    borderRadius: 16,
                    border: "1px solid rgba(148,163,184,0.15)",
                    background: "rgba(255,255,255,0.03)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                }}>
                    <h1 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 600, color: "#f1f5f9" }}>
                        Please sign in
                    </h1>
                    <p style={{ margin: 0, fontSize: "0.9rem", color: "rgba(160,192,168,0.7)", lineHeight: 1.6 }}>
                        The Loan Officer Portal is only available to signed-in users. Please sign in with your HomeRates.ai account, then return here.
                    </p>
                    <Link href="/sign-in" style={{
                        marginTop: 4,
                        alignSelf: "flex-start",
                        padding: "9px 18px",
                        borderRadius: 999,
                        background: "#00e87a",
                        color: "#080c12",
                        fontSize: "0.9rem",
                        fontWeight: 600,
                        textDecoration: "none",
                    }}>
                        Go to sign in
                    </Link>
                </div>
            </PageShell>
        );
    }

    const { data: loanOfficer, error: loError } = await supabase
        .from("loan_officers")
        .select("id, email, allowed_borrower_slots, stripe_customer_id, lender")
        .eq("user_id", userId)
        .maybeSingle();

    if (loError) {
        console.error("Error loading loan officer record:", loError);
    }

    if (!loanOfficer) {
        return (
            <PageShell backHref="/" backLabel="Home" maxWidth={520}>
                <div style={{
                    padding: "28px 24px",
                    borderRadius: 16,
                    border: "1px solid rgba(248,113,113,0.25)",
                    background: "rgba(248,113,113,0.05)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                }}>
                    <h1 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 600, color: "#f87171" }}>
                        Loan Officer access not found
                    </h1>
                    <p style={{ margin: 0, fontSize: "0.9rem", color: "rgba(248,113,113,0.75)", lineHeight: 1.6 }}>
                        You are signed in, but this account does not have a loan officer profile in HomeRates.ai yet.
                    </p>
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "rgba(248,113,113,0.65)", lineHeight: 1.6 }}>
                        If you&apos;re a lender or loan officer and want access to the portal, please contact the HomeRates.ai team so we can enable your profile.
                    </p>
                </div>
            </PageShell>
        );
    }

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

    const userPlan = await getUserPlan(userId);
    const planConfig = PLANS[userPlan.plan];
    const planLabel = planConfig.name;
    const hasActiveSub = userPlan.plan !== "free";
    const periodEnd = userPlan.billingPeriodEnd
        ? userPlan.billingPeriodEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : null;

    return (
        <PageShell backHref="/" backLabel="Home" maxWidth={960}>
            <div style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1.4fr)",
                gap: 16,
            }}>
                {/* Left column */}
                <section style={{ display: "grid", gap: 12, alignContent: "start" }}>
                    {/* Header */}
                    <div style={{
                        padding: "20px 18px",
                        borderRadius: 16,
                        border: "1px solid rgba(148,163,184,0.12)",
                        background: "rgba(255,255,255,0.03)",
                    }}>
                        <h1 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700, color: "#f1f5f9" }}>
                            Loan Officer Portal
                        </h1>
                        <p style={{ margin: "6px 0 0", fontSize: "0.9rem", color: "rgba(160,192,168,0.7)", lineHeight: 1.6 }}>
                            Manage your borrowers and access pro tools powered by HomeRates.ai.
                        </p>
                        {loanOfficer.lender && (
                            <p style={{ margin: "6px 0 0", fontSize: "0.8rem", color: "rgba(160,192,168,0.5)" }}>
                                Lender: <strong style={{ color: "rgba(160,192,168,0.8)" }}>{loanOfficer.lender}</strong>
                            </p>
                        )}
                    </div>

                    {/* Invite borrowers */}
                    <div style={{
                        padding: "20px 18px",
                        borderRadius: 16,
                        border: "1px solid rgba(0,232,122,0.15)",
                        background: "rgba(0,232,122,0.03)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                    }}>
                        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "#f1f5f9" }}>
                            Invite borrowers
                        </h2>
                        <p style={{ margin: 0, fontSize: "0.9rem", color: "rgba(160,192,168,0.7)", lineHeight: 1.6 }}>
                            Generate a unique invite link so your borrowers can onboard into HomeRates.ai and have their questions automatically tied to your file.
                        </p>
                        <Link href="/lo/borrowers" style={{
                            marginTop: 4,
                            alignSelf: "flex-start",
                            padding: "9px 18px",
                            borderRadius: 999,
                            background: "#00e87a",
                            color: "#080c12",
                            fontSize: "0.9rem",
                            fontWeight: 600,
                            textDecoration: "none",
                        }}>
                            Open borrower invites
                        </Link>
                    </div>

                    {/* Scenario Board */}
                    <div style={{
                        padding: "20px 18px",
                        borderRadius: 16,
                        border: "1px solid rgba(61,139,255,0.2)",
                        background: "rgba(61,139,255,0.04)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                    }}>
                        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "#f1f5f9" }}>
                            Scenario Board
                        </h2>
                        <p style={{ margin: 0, fontSize: "0.9rem", color: "rgba(160,192,168,0.7)", lineHeight: 1.6 }}>
                            Browse anonymous borrower scenarios in your state and loan type. Respond with your rate estimate and approach — the borrower chooses who earns an introduction.
                        </p>
                        <Link href="/lo/scenarios" style={{
                            marginTop: 4,
                            alignSelf: "flex-start",
                            padding: "9px 18px",
                            borderRadius: 999,
                            background: "#3d8bff",
                            color: "#fff",
                            fontSize: "0.9rem",
                            fontWeight: 600,
                            textDecoration: "none",
                        }}>
                            View Scenario Board →
                        </Link>
                    </div>

                    {/* Coming soon */}
                    <div style={{
                        padding: "20px 18px",
                        borderRadius: 16,
                        border: "1px solid rgba(148,163,184,0.1)",
                        background: "rgba(255,255,255,0.02)",
                        display: "grid",
                        gap: 10,
                    }}>
                        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "#f1f5f9" }}>
                            Coming soon
                        </h2>
                        <ul style={{
                            margin: 0,
                            paddingLeft: 18,
                            fontSize: "0.88rem",
                            color: "rgba(160,192,168,0.6)",
                            display: "grid",
                            gap: 5,
                            lineHeight: 1.6,
                        }}>
                            <li>Borrower list with status and last activity.</li>
                            <li>Conversation analytics so you can see which borrowers are most engaged.</li>
                            <li>Subscription &amp; billing controls for managing your HomeRates.ai plan.</li>
                        </ul>
                    </div>
                </section>

                {/* Right column */}
                <section style={{ display: "grid", gap: 12, alignContent: "start" }}>
                    {/* Borrower capacity */}
                    <div style={{
                        padding: "20px 18px",
                        borderRadius: 16,
                        border: "1px solid rgba(148,163,184,0.12)",
                        background: "rgba(255,255,255,0.03)",
                        display: "grid",
                        gap: 8,
                    }}>
                        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "#f1f5f9" }}>
                            Borrower capacity
                        </h2>
                        <p style={{ margin: 0, fontSize: "0.9rem", color: "rgba(160,192,168,0.7)" }}>
                            Active borrowers: <strong style={{ color: "#e2e8f0" }}>{used}</strong>
                        </p>
                        <p style={{ margin: 0, fontSize: "0.9rem", color: "rgba(160,192,168,0.7)" }}>
                            Plan limit: <strong style={{ color: "#e2e8f0" }}>{slots}</strong> borrowers
                        </p>
                        <p style={{ margin: 0, fontSize: "0.9rem", color: remaining > 0 ? "#4ade80" : "#f87171" }}>
                            Slots remaining: <strong>{remaining}</strong>
                        </p>
                    </div>

                    {/* Billing */}
                    <div style={{
                        padding: "20px 18px",
                        borderRadius: 16,
                        border: hasActiveSub ? "1px solid rgba(0,232,122,0.2)" : "1px solid rgba(148,163,184,0.12)",
                        background: hasActiveSub ? "rgba(0,232,122,0.04)" : "rgba(255,255,255,0.02)",
                        display: "grid",
                        gap: 12,
                    }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "#f1f5f9" }}>
                                Billing
                            </h2>
                            <span style={{
                                fontSize: "0.7rem",
                                fontWeight: 700,
                                letterSpacing: "0.06em",
                                textTransform: "uppercase",
                                padding: "3px 10px",
                                borderRadius: 999,
                                background: hasActiveSub ? "rgba(0,232,122,0.15)" : "rgba(148,163,184,0.1)",
                                color: hasActiveSub ? "#00e87a" : "#94a3b8",
                            }}>
                                {planLabel}
                            </span>
                        </div>

                        {periodEnd && (
                            <p style={{ margin: 0, fontSize: "0.8rem", color: "rgba(160,192,168,0.55)" }}>
                                Renews {periodEnd}
                            </p>
                        )}

                        {!hasActiveSub && (
                            <p style={{ margin: 0, fontSize: "0.85rem", color: "rgba(160,192,168,0.6)", lineHeight: 1.5 }}>
                                You are on the free plan. Upgrade to add borrowers, export PDFs, and set up alerts.
                            </p>
                        )}

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {hasActiveSub ? (
                                <BillingPortalButton />
                            ) : (
                                <Link href="/pricing" style={{
                                    display: "inline-block",
                                    padding: "9px 18px",
                                    borderRadius: 999,
                                    background: "#00e87a",
                                    color: "#080c12",
                                    fontSize: "0.85rem",
                                    fontWeight: 600,
                                    textDecoration: "none",
                                }}>
                                    Upgrade plan →
                                </Link>
                            )}
                        </div>
                    </div>
                </section>
            </div>
        </PageShell>
    );
}
