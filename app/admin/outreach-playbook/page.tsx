// app/admin/outreach-playbook/page.tsx
// In-app reader for OUTREACH_PLAYBOOK.md — the audience-first quick-start
// companion to OUTREACH_GUIDE.md. See app/admin/_shared/AdminMarkdownDoc.tsx
// for why this stays server-side.

export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { isAdminId } from "../../../lib/adminAuth";
import { AdminMarkdownDoc, AdminAccessRequired } from "../_shared/AdminMarkdownDoc";
import { OUTREACH_PLAYBOOK_MARKDOWN } from "./content";

export default async function OutreachPlaybookPage() {
  const { userId } = await auth();
  const admin = await isAdminId(userId);

  if (!admin) return <AdminAccessRequired />;

  return <AdminMarkdownDoc markdown={OUTREACH_PLAYBOOK_MARKDOWN} />;
}
