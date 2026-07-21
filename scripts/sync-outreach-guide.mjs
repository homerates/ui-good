// scripts/sync-outreach-guide.mjs
// Regenerates app/admin/outreach-guide/content.ts from the repo-root
// OUTREACH_GUIDE.md. Run this after any edit to OUTREACH_GUIDE.md so the
// in-app admin reference page (/admin/outreach-guide) stays in sync.
//
// Usage: node scripts/sync-outreach-guide.mjs

import fs from "fs";

const md = fs.readFileSync("OUTREACH_GUIDE.md", "utf8");

const header = [
  "// app/admin/outreach-guide/content.ts",
  "// Server-rendered copy of OUTREACH_GUIDE.md (repo root) for the in-app admin",
  "// reference page. This is a MANUALLY SYNCED snapshot, not a live read of the",
  "// repo file -- Next.js/Vercel file-tracing for arbitrary root-level files at",
  "// runtime is unreliable, and this doc documents real auth-check internals",
  "// (admin_users schema, token generation) that must never ship in a client",
  "// bundle -- see the server-component gating in ./page.tsx.",
  "//",
  "// After any edit to OUTREACH_GUIDE.md, regenerate this file from repo root:",
  "//   node scripts/sync-outreach-guide.mjs",
  "",
].join("\n");

const out = header + "\nexport const OUTREACH_GUIDE_MARKDOWN = " + JSON.stringify(md) + ";\n";

fs.writeFileSync("app/admin/outreach-guide/content.ts", out);
console.log(`Synced app/admin/outreach-guide/content.ts (${out.length} bytes)`);
