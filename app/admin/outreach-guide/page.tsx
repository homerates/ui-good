// app/admin/outreach-guide/page.tsx
// In-app reader for OUTREACH_GUIDE.md — the master outreach/invite reference.
// See app/admin/_shared/AdminMarkdownDoc.tsx for why this stays server-side.

export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { isAdminId } from "../../../lib/adminAuth";
import { AdminMarkdownDoc, AdminAccessRequired } from "../_shared/AdminMarkdownDoc";
import { OUTREACH_GUIDE_MARKDOWN } from "./content";

export default async function OutreachGuidePage() {
  const { userId } = await auth();
  const admin = await isAdminId(userId);

  if (!admin) return <AdminAccessRequired />;

  return <AdminMarkdownDoc markdown={OUTREACH_GUIDE_MARKDOWN} />;
}
