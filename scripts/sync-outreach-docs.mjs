// scripts/sync-outreach-docs.mjs
// Regenerates the in-app admin copies of OUTREACH_GUIDE.md and
// OUTREACH_PLAYBOOK.md from their repo-root source files. Run this after
// editing either doc so the live pages (/admin/outreach-guide,
// /admin/outreach-playbook) stay in sync.
//
// Usage: node scripts/sync-outreach-docs.mjs

import fs from "fs";

const DOCS = [
  {
    source: "OUTREACH_GUIDE.md",
    dest: "app/admin/outreach-guide/content.ts",
    constName: "OUTREACH_GUIDE_MARKDOWN",
    note: "admin_users schema, token generation schemes, known auth gaps",
  },
  {
    source: "OUTREACH_PLAYBOOK.md",
    dest: "app/admin/outreach-playbook/content.ts",
    constName: "OUTREACH_PLAYBOOK_MARKDOWN",
    note: "internal admin field labels and step-by-step flows",
  },
];

for (const doc of DOCS) {
  const md = fs.readFileSync(doc.source, "utf8");

  const header = [
    `// ${doc.dest}`,
    `// Server-rendered copy of ${doc.source} (repo root) for the in-app admin`,
    "// reference page. This is a MANUALLY SYNCED snapshot, not a live read of the",
    "// repo file -- Next.js/Vercel file-tracing for arbitrary root-level files at",
    `// runtime is unreliable, and this doc documents ${doc.note}`,
    "// that must never ship in a client bundle -- see the server-component",
    "// gating in ./page.tsx.",
    "//",
    `// After any edit to ${doc.source}, regenerate this file from repo root:`,
    "//   node scripts/sync-outreach-docs.mjs",
    "",
  ].join("\n");

  const out = header + `\nexport const ${doc.constName} = ` + JSON.stringify(md) + ";\n";

  fs.writeFileSync(doc.dest, out);
  console.log(`Synced ${doc.dest} (${out.length} bytes)`);
}
