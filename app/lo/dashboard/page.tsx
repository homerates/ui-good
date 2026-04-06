// app/lo/dashboard/page.tsx
// Redirects to the unified /dashboard — kept for backwards compatibility
// (bookmarks, old emails, etc.)

import { redirect } from "next/navigation";

export default function LoDashboardPage() {
  redirect("/dashboard");
}
