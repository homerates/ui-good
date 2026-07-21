// app/admin/_shared/AdminMarkdownDoc.tsx
// Shared renderer for admin-only markdown reference docs (OUTREACH_GUIDE.md,
// OUTREACH_PLAYBOOK.md, and any future ones). Pure server-side rendering --
// callers must gate on the canonical admin check (see lib/adminAuth.ts)
// BEFORE rendering AdminMarkdownDoc. Some of these docs name real internals
// (admin_users schema, token generation) that must never reach a non-admin's
// JS bundle; keeping this a server component (never "use client") is what
// makes that true -- rendering happens before anything is sent to the browser.
//
// _shared/ is a Next.js "private folder" (underscore prefix) -- opted out of
// routing, safe to colocate non-page components under app/admin/.

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import AppNav from "../../components/AppNav";

// Cross-doc links are written as plain GitHub-relative markdown
// ("OUTREACH_GUIDE.md#some-anchor") so they work correctly when the file is
// viewed on GitHub or in an editor. Rewrite them to the live in-app route so
// they also work here. Heading anchors themselves come from rehype-slug,
// which uses github-slugger -- the same algorithm GitHub's own web renderer
// uses, so a link written against GitHub's rendering resolves identically here.
const DOC_ROUTES: Record<string, string> = {
  "OUTREACH_GUIDE.md": "/admin/outreach-guide",
  "OUTREACH_PLAYBOOK.md": "/admin/outreach-playbook",
};

function resolveHref(href?: string): string | undefined {
  if (!href) return href;
  for (const [file, route] of Object.entries(DOC_ROUTES)) {
    if (href === file) return route;
    if (href.startsWith(file + "#")) return route + href.slice(file.length);
  }
  return href;
}

export function AdminAccessRequired() {
  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#0a0a0a", color: "#fff" }}>
      <AppNav />
      <div style={{ padding: "2rem" }}>Admin access required.</div>
    </div>
  );
}

export function AdminMarkdownDoc({ markdown }: { markdown: string }) {
  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#0a0a0a", color: "#fff", overflowY: "auto" }}>
      <AppNav />
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "2rem 1.5rem 4rem", boxSizing: "border-box" }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <Link href="/admin" style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, textDecoration: "none" }}>
            ← Admin
          </Link>
        </div>

        <div className="amd-md">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}
            components={{
              table: ({ children }) => (
                <div style={{ overflowX: "auto", margin: "1rem 0" }}>
                  <table>{children}</table>
                </div>
              ),
              a: ({ children, href }) => {
                const resolved = resolveHref(href);
                return (
                  <a href={resolved} target={resolved?.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
                    {children}
                  </a>
                );
              },
            }}
          >
            {markdown}
          </ReactMarkdown>
        </div>

        <style>{`
.amd-md { font-size: 0.92rem; line-height: 1.6; color: rgba(255,255,255,0.82); }
.amd-md h1 { font-size: 1.6rem; font-weight: 800; color: #fff; margin: 0 0 0.5rem; letter-spacing: -0.01em; }
.amd-md h2 { font-size: 1.25rem; font-weight: 700; color: #fff; margin: 2rem 0 0.75rem; padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.08); }
.amd-md h2:first-of-type { border-top: none; padding-top: 0; }
.amd-md h3 { font-size: 1.02rem; font-weight: 700; color: #fff; margin: 1.5rem 0 0.5rem; }
.amd-md p { margin: 0 0 0.85rem; }
.amd-md strong { color: #fff; font-weight: 700; }
.amd-md em { color: rgba(255,255,255,0.7); }
.amd-md hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 1.5rem 0; }
.amd-md ul, .amd-md ol { margin: 0 0 0.85rem; padding-left: 1.4rem; }
.amd-md li { margin: 0.25rem 0; }
.amd-md code { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; padding: 1px 6px; font-size: 0.85em; color: #7ee8a5; font-family: ui-monospace, monospace; }
.amd-md a { color: #3d8bff; text-decoration: underline; text-underline-offset: 2px; }
.amd-md a:hover { color: #6ea8ff; }
.amd-md table { border-collapse: collapse; width: 100%; font-size: 0.82rem; }
.amd-md th, .amd-md td { border: 1px solid rgba(255,255,255,0.1); padding: 6px 10px; text-align: left; vertical-align: top; }
.amd-md th { background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.6); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 0.7rem; }
.amd-md del { color: rgba(255,255,255,0.35); }
.amd-md blockquote { border-left: 2px solid rgba(0,232,122,0.4); margin: 0 0 0.85rem; padding: 0.1rem 0 0.1rem 1rem; color: rgba(255,255,255,0.6); }
        `}</style>
      </div>
    </div>
  );
}
