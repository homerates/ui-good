// app/dashboard/page.tsx
// Unified dashboard — same 2-column shell, different cards per user type
// Types: borrower (default) | lo (loan_officers record found) | agent (future)

import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSupabase } from "../../lib/supabaseServer";
import { getUserPlan, canPostScenario } from "../../lib/subscription";
import { PLANS } from "../../lib/stripe";
import BillingPortalButton from "../components/BillingPortalButton";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard — HomeRates.ai",
  robots: { index: false, follow: false },
};

// ─── helpers ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(148,163,184,0.1)",
      borderRadius: 12, padding: "16px 18px",
    }}>
      <div style={{ fontSize: "0.75rem", color: "rgba(185,208,192,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: 700, color: accent ?? "#f1f5f9", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: "0.78rem", color: "rgba(185,208,192,0.5)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function SectionCard({ children, accent }: { children: React.ReactNode; accent?: "green" | "blue" | "none" }) {
  const border = accent === "green" ? "1px solid rgba(0,232,122,0.15)" : accent === "blue" ? "1px solid rgba(61,139,255,0.15)" : "1px solid rgba(148,163,184,0.1)";
  const bg = accent === "green" ? "rgba(0,232,122,0.03)" : accent === "blue" ? "rgba(61,139,255,0.03)" : "rgba(255,255,255,0.02)";
  return (
    <div style={{ background: bg, border, borderRadius: 16, padding: "20px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
      {children}
    </div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "#f1f5f9" }}>{children}</h2>;
}

function CardBody({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, fontSize: "0.875rem", color: "rgba(185,208,192,0.7)", lineHeight: 1.6 }}>{children}</p>;
}

function ActionLink({ href, children, variant = "green" }: { href: string; children: React.ReactNode; variant?: "green" | "blue" | "ghost" }) {
  const styles: Record<string, React.CSSProperties> = {
    green: { background: "#00e87a", color: "#080c12" },
    blue: { background: "#3d8bff", color: "#fff" },
    ghost: { background: "transparent", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(224,240,232,0.8)" },
  };
  return (
    <Link href={href} style={{
      alignSelf: "flex-start", marginTop: 4,
      padding: "9px 18px", borderRadius: 999,
      fontSize: "0.875rem", fontWeight: 600,
      textDecoration: "none", ...styles[variant],
    }}>
      {children}
    </Link>
  );
}

// ─── page ────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const sb = getSupabase();

  // Check if user has completed onboarding (has a role set)
  let userRole: string | null = null;
  if (sb) {
    const { data: userRow } = await sb.from("users").select("role").eq("id", userId).maybeSingle();
    userRole = userRow?.role ?? null;
  }
  // First-time users go to /welcome to pick their type
  if (!userRole) redirect("/welcome");

  // Detect user type — check loan_officers table for LO record
  const { data: loRecord } = sb
    ? await sb.from("loan_officers").select("id, email, lender, allowed_borrower_slots, stripe_customer_id").eq("user_id", userId).maybeSingle()
    : { data: null };

  const userType: "lo" | "agent" | "borrower" =
    userRole === "lo" || loRecord ? "lo" :
    userRole === "agent" ? "agent" :
    "borrower";

  // Get plan
  const userPlan = await getUserPlan(userId);
  const planConfig = PLANS[userPlan.plan];
  const planLabel = planConfig?.name ?? "Free";
  const isOnFreePlan = userPlan.plan === "free";
  const periodEnd = userPlan.billingPeriodEnd
    ? userPlan.billingPeriodEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  // Get Clerk user name
  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId);
  const displayName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || clerkUser.username || "there";

  // ── LO-specific data ─────────────────────────────────────────────────────
  let borrowerCount = 0;
  let newScenarioCount = 0;
  let myConnectionCount = 0;
  let slots = 0;

  if ((userType === "lo") && sb && loRecord) {
    slots = loRecord.allowed_borrower_slots ?? 0;

    const { count: bc } = await sb
      .from("borrowers")
      .select("id", { count: "exact", head: true })
      .eq("loan_officer_id", loRecord.id);
    borrowerCount = bc ?? 0;

    const { count: sc } = await sb
      .from("scenario_briefs")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .in("needs_professional", ["lender", "both"]);
    newScenarioCount = sc ?? 0;

    const { count: cc } = await sb
      .from("scenario_invites")
      .select("id", { count: "exact", head: true })
      .eq("lo_id", userId);
    myConnectionCount = cc ?? 0;
  }

  // ── Agent-specific data ──────────────────────────────────────────────────
  let agentScenarioCount = 0;
  let agentConnectionCount = 0;
  let agentRecord: { brokerage: string | null } | null = null;

  if (userType === "agent" && sb) {
    const { data: ar } = await sb.from("agents").select("brokerage").eq("user_id", userId).maybeSingle();
    agentRecord = ar ?? null;
    const { count: sc } = await sb
      .from("scenario_briefs")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .in("needs_professional", ["agent", "both"]);
    agentScenarioCount = sc ?? 0;

    const { count: cc } = await sb
      .from("scenario_responses")
      .select("id", { count: "exact", head: true })
      .eq("responder_id", userId)
      .eq("responder_type", "agent");
    agentConnectionCount = cc ?? 0;
  }

  // ── Borrower-specific data ───────────────────────────────────────────────
  let activeScenario: { id: string; loan_type: string; state: string; status: string; response_count: number } | null = null;
  let scenarioQuota: { used: number; limit: number | null } = { used: 0, limit: null };

  if (userType === "borrower" && sb) {
    const [scResult, quotaResult] = await Promise.all([
      sb
        .from("scenario_briefs")
        .select("id, loan_type, state, status, response_count")
        .eq("borrower_id", userId)
        .in("status", ["active", "matched"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      canPostScenario(userId),
    ]);
    activeScenario = scResult.data ?? null;
    scenarioQuota = { used: quotaResult.used, limit: quotaResult.limit };
  }

  const remaining = Math.max(slots - borrowerCount, 0);

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="db-root" style={{
      minHeight: "100vh",
      background: "#080c12",
      fontFamily: "var(--font-dm-sans, system-ui, sans-serif)",
      color: "#f0f4ff",
    }}>
      {/* Top bar */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(8,12,18,0.95)", backdropFilter: "blur(8px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "14px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" style={{ height: 26 }} />
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link href="/chat" style={{ fontSize: "0.85rem", color: "#8fa3b8", textDecoration: "none" }}>← Back to chat</Link>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "2.5rem 1.5rem 5rem" }}>

        {/* Page header */}
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#00e87a", marginBottom: 6 }}>
            {userType === "lo" ? "Loan Officer" : userType === "agent" ? "Real Estate Agent" : "Borrower"} Dashboard
          </div>
          <h1 style={{ fontFamily: "var(--font-dm-sans, sans-serif)", fontSize: "clamp(1.5rem, 3vw, 2rem)", fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
            Welcome back, {displayName}
          </h1>
          {userType === "lo" && loRecord?.lender && (
            <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "#3a4560" }}>
              {loRecord.lender}
            </p>
          )}
        </div>

        {/* ── STATS ROW ── */}
        <div className="db-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: "1.75rem" }}>
          {userType === "lo" ? (
            <>
              <StatCard label="New Scenarios" value={newScenarioCount} sub="awaiting your response" accent="#3d8bff" />
              <StatCard label="Connections Earned" value={myConnectionCount} sub="borrowers who chose you" accent="#00e87a" />
              <StatCard label="Active Borrowers" value={borrowerCount} sub={`of ${slots} slots`} />
              <StatCard label="Plan" value={planLabel} sub={periodEnd ? `Renews ${periodEnd}` : "Current plan"} />
            </>
          ) : userType === "agent" ? (
            <>
              <StatCard label="Open Scenarios" value={agentScenarioCount} sub="awaiting your response" accent="#3d8bff" />
              <StatCard label="Responses Sent" value={agentConnectionCount} sub="buyers you've responded to" accent="#00e87a" />
              <StatCard label="Plan" value={planLabel} sub={periodEnd ? `Renews ${periodEnd}` : "Current plan"} />
            </>
          ) : (
            <>
              <StatCard
                label="Active Scenario"
                value={activeScenario ? (activeScenario.status === "matched" ? "Matched ✓" : "Live") : "None"}
                sub={activeScenario ? `${activeScenario.response_count} response${activeScenario.response_count !== 1 ? "s" : ""}` : "Post one to get started"}
                accent={activeScenario?.status === "matched" ? "#00e87a" : activeScenario ? "#3d8bff" : undefined}
              />
              {scenarioQuota.limit !== null && (
                <StatCard
                  label="Scenarios this month"
                  value={`${scenarioQuota.used} / ${scenarioQuota.limit}`}
                  sub={scenarioQuota.used >= scenarioQuota.limit ? "Limit reached — upgrade" : `${scenarioQuota.limit - scenarioQuota.used} remaining`}
                  accent={scenarioQuota.used >= scenarioQuota.limit ? "#f87171" : undefined}
                />
              )}
              <StatCard label="Plan" value={planLabel} sub={periodEnd ? `Renews ${periodEnd}` : "Current plan"} />
            </>
          )}
        </div>

        {/* ── MAIN GRID ── */}
        <div className="db-main-grid" style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1.35fr)",
          gap: 16,
          alignItems: "start",
        }}>

          {/* LEFT COLUMN */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {userType === "agent" ? (
              <>
                <SectionCard accent="blue">
                  <CardTitle>Buyer Scenario Board</CardTitle>
                  <CardBody>
                    Browse anonymous buyer scenarios in your market. Respond with your approach and buyer rep fee — the buyer picks who earns the introduction.
                  </CardBody>
                  <ActionLink href="/agent/scenarios" variant="blue">
                    View {agentScenarioCount > 0 ? `${agentScenarioCount} ` : ""}Scenarios →
                  </ActionLink>
                </SectionCard>

                <SectionCard accent="green">
                  <CardTitle>How It Works</CardTitle>
                  <CardBody>
                    Buyers post anonymously. You respond with your approach. If they like what they see, they invite you — no Zillow auction, no lead fees, no bidding wars.
                  </CardBody>
                  <ActionLink href="/for-pros" variant="ghost">Learn more →</ActionLink>
                </SectionCard>

                <SectionCard>
                  <CardTitle>Coming soon</CardTitle>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.875rem", color: "rgba(185,208,192,0.55)", display: "flex", flexDirection: "column", gap: 5, lineHeight: 1.6 }}>
                    <li>Buyer activity feed — see which buyers are most engaged</li>
                    <li>Response analytics — track scenario types in your market</li>
                    <li>Team seats — add colleagues to your account</li>
                  </ul>
                </SectionCard>
              </>
            ) : userType === "lo" ? (
              <>
                <SectionCard accent="blue">
                  <CardTitle>Scenario Board</CardTitle>
                  <CardBody>
                    Browse anonymous borrower scenarios filtered by your state and loan type. Respond with your rate and approach — the borrower picks who earns the introduction.
                  </CardBody>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <ActionLink href="/lo/scenarios" variant="blue">
                      View {newScenarioCount > 0 ? `${newScenarioCount} ` : ""}Scenarios →
                    </ActionLink>
                  </div>
                </SectionCard>

                <SectionCard accent="green">
                  <CardTitle>Borrower Invites</CardTitle>
                  <CardBody>
                    Invite your own borrowers to HomeRates.ai and have their questions automatically tied to your file. They get AI-powered answers; you stay in the loop.
                  </CardBody>
                  <ActionLink href="/lo/borrowers" variant="green">Manage borrowers →</ActionLink>
                </SectionCard>

                <SectionCard>
                  <CardTitle>Coming soon</CardTitle>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.875rem", color: "rgba(185,208,192,0.55)", display: "flex", flexDirection: "column", gap: 5, lineHeight: 1.6 }}>
                    <li>Borrower activity feed — see which borrowers are most engaged</li>
                    <li>Conversation analytics — track scenario types coming in</li>
                    <li>Team seats — add colleagues to your account</li>
                  </ul>
                </SectionCard>
              </>
            ) : (
              <>
                <SectionCard accent={activeScenario ? "blue" : "green"}>
                  <CardTitle>{activeScenario ? "Your Active Scenario" : "Find a Lender or Agent"}</CardTitle>
                  {activeScenario ? (
                    <>
                      <CardBody>
                        Your {activeScenario.loan_type.toUpperCase()} scenario in {activeScenario.state} is{" "}
                        {activeScenario.status === "matched" ? "matched — you've chosen a professional." : `live with ${activeScenario.response_count} response${activeScenario.response_count !== 1 ? "s" : ""} waiting.`}
                      </CardBody>
                      <ActionLink href="/connect/my-scenario" variant="blue">View responses →</ActionLink>
                    </>
                  ) : (
                    <>
                      <CardBody>
                        Post your scenario anonymously. Verified loan officers and agents respond with their rates and approach. You review and invite the one who earns your trust — no credit check, no spam.
                      </CardBody>
                      <ActionLink href="/connect/post" variant="green">Post my scenario →</ActionLink>
                    </>
                  )}
                </SectionCard>

                <SectionCard>
                  <CardTitle>AI Analysis</CardTitle>
                  <CardBody>
                    Run your numbers through the HomeRates.ai engine. Get a real benchmark rate, PITI breakdown, and a checklist of questions to ask any lender — before you talk to anyone.
                  </CardBody>
                  <ActionLink href="/chat" variant="ghost">Open chat →</ActionLink>
                </SectionCard>

                <SectionCard>
                  <CardTitle>My Vault</CardTitle>
                  <CardBody>
                    Your saved analyses, PDFs, and shared snapshots — organized and accessible any time.
                  </CardBody>
                  <ActionLink href="/library" variant="ghost">Open My Vault →</ActionLink>
                </SectionCard>
              </>
            )}
          </div>

          {/* RIGHT COLUMN */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Billing card — same for all types */}
            <SectionCard accent={isOnFreePlan ? "none" : "green"}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <CardTitle>Plan &amp; Billing</CardTitle>
                <span style={{
                  fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.06em",
                  textTransform: "uppercase", padding: "3px 10px", borderRadius: 999,
                  background: isOnFreePlan ? "rgba(185,208,192,0.1)" : "rgba(0,232,122,0.12)",
                  color: isOnFreePlan ? "rgba(185,208,192,0.6)" : "#00e87a",
                }}>
                  {planLabel}
                </span>
              </div>

              {isOnFreePlan ? (
                <>
                  <CardBody>You're on the free plan. Upgrade for unlimited questions, PDF exports, and rate alerts.</CardBody>
                  <ActionLink href="/pricing" variant="green">Upgrade plan →</ActionLink>
                </>
              ) : (
                <>
                  {periodEnd && <CardBody>Renews {periodEnd}</CardBody>}
                  <BillingPortalButton />
                </>
              )}
            </SectionCard>

            {/* LO-only: capacity */}
            {userType === "lo" && (
              <SectionCard>
                <CardTitle>Borrower Capacity</CardTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[
                    ["Active borrowers", borrowerCount],
                    ["Plan limit", slots],
                    ["Slots remaining", remaining],
                  ].map(([label, val]) => (
                    <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
                      <span style={{ color: "rgba(185,208,192,0.6)" }}>{label}</span>
                      <strong style={{ color: label === "Slots remaining" ? (remaining > 0 ? "#4ade80" : "#f87171") : "#e2e8f0" }}>{val}</strong>
                    </div>
                  ))}
                </div>
                {/* Usage bar */}
                {slots > 0 && (
                  <div style={{ height: 4, borderRadius: 999, background: "rgba(255,255,255,0.07)", overflow: "hidden", marginTop: 4 }}>
                    <div style={{
                      height: "100%", borderRadius: 999,
                      width: `${Math.min((borrowerCount / slots) * 100, 100)}%`,
                      background: remaining > 0 ? "#00e87a" : "#f87171",
                      transition: "width 0.3s",
                    }} />
                  </div>
                )}
              </SectionCard>
            )}

            {/* Profile card — always visible for pros */}
            {userType === "lo" && (
              <SectionCard>
                <CardTitle>My Profile</CardTitle>
                <CardBody>
                  {loRecord?.lender
                    ? `${loRecord.lender}${loRecord?.lender ? " · " : ""}Update your license info, NMLS, and company details.`
                    : "Add your lender or company name so borrowers know who they're hearing from."}
                </CardBody>
                <ActionLink href="/profile" variant="ghost">Edit profile →</ActionLink>
              </SectionCard>
            )}
            {userType === "agent" && (
              <SectionCard>
                <CardTitle>My Profile</CardTitle>
                <CardBody>
                  {agentRecord?.brokerage
                    ? `${agentRecord.brokerage} · Update your license and brokerage details.`
                    : "Add your brokerage name so buyers know who they're hearing from when you respond."}
                </CardBody>
                <ActionLink href="/profile" variant="ghost">Edit profile →</ActionLink>
              </SectionCard>
            )}

            {/* Quick links */}
            <SectionCard>
              <CardTitle>Quick links</CardTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {(userType === "lo" ? [
                  { href: "/lo/scenarios", label: "Scenario Board" },
                  { href: "/lo/borrowers", label: "Borrower Invites" },
                  { href: "/chat", label: "AI Chat" },
                  { href: "/profile", label: "My Profile" },
                  { href: "/for-pros", label: "For Professionals" },
                ] : userType === "agent" ? [
                  { href: "/agent/scenarios", label: "Buyer Scenarios" },
                  { href: "/chat", label: "AI Chat" },
                  { href: "/profile", label: "My Profile" },
                  { href: "/for-pros", label: "For Professionals" },
                  { href: "/pricing", label: "Pricing" },
                ] : [
                  { href: "/connect", label: "Get Matched" },
                  { href: "/connect/my-scenario", label: "My Scenario" },
                  { href: "/chat", label: "AI Analysis" },
                  { href: "/library", label: "My Vault" },
                  { href: "/profile", label: "My Profile" },
                  { href: "/pricing", label: "Pricing" },
                ]).map(({ href, label }) => (
                  <Link key={href} href={href} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 10px", borderRadius: 8,
                    color: "rgba(224,240,232,0.7)", fontSize: "0.875rem",
                    textDecoration: "none",
                    border: "1px solid transparent",
                    transition: "background 0.12s",
                  }}>
                    {label}
                    <span style={{ color: "#3a4560", fontSize: "0.75rem" }}>→</span>
                  </Link>
                ))}
              </div>
            </SectionCard>

          </div>
        </div>
      </div>

      <style>{`
        body:has(.db-root) {
          display: block !important; height: auto !important;
          overflow-y: auto !important; background: #080c12 !important;
        }
        html:has(.db-root) { background: #080c12 !important; height: auto !important; overflow-y: auto !important; }
        body:has(.db-root) .app-footer { display: none; }
        @media (max-width: 680px) {
          .db-main-grid { grid-template-columns: 1fr !important; }
          .db-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
