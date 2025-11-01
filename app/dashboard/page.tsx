// app/dashboard/page.tsx
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import UserGreeting from "./UserGreeting";

export default async function DashboardPage() {
    // NOTE: await auth() — fixes TS2339 (Promise<...>)
    const { userId } = await auth();
    if (!userId) redirect("/login");

    const user = await currentUser();

    return (
        <main style={{ padding: 24 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
                Dashboard
            </h1>

            {/* Optional live greeting just under the H1 */}
            <UserGreeting />

            <p style={{ color: "#4b5563", marginBottom: 16 }}>
                {user?.firstName ? `Welcome, ${user.firstName}.` : "Welcome."}
            </p>

            <section
                style={{
                    display: "grid",
                    gap: 12,
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                }}
            >
                <div
                    style={{
                        padding: 16,
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.05)",
                    }}
                >
                    <h2 style={{ fontWeight: 600, marginBottom: 6 }}>Getting started</h2>
                    <p style={{ color: "#6b7280" }}>
                        This page is protected. Only signed-in users can see it.
                    </p>
                </div>
            </section>
        </main>
    );
}
