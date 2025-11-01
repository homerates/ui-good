// app/dashboard/page.tsx (server component)
import { currentUser } from "@clerk/nextjs/server";

export default async function DashboardPage() {
  const user = await currentUser(); // null if not signed in (middleware should handle redirect)

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-sm text-gray-500">
        {user ? `Signed in as: ${user.emailAddresses?.[0]?.emailAddress ?? user.id}` : "Not signed in"}
      </p>
    </main>
  );
}
