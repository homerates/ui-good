// app/admin/outreach-guide/page.tsx
// In-app reader for OUTREACH_GUIDE.md — the master outreach/invite reference.
//
// Deliberately a SERVER component, not a client one: this document names
// exact admin-auth internals (admin_users schema, token generation schemes,
// known auth gaps). Gating with a client-side hook (like /admin/outreach
// does) would still ship the content in the browser's JS bundle to anyone
// who loads the page, readable via devtools regardless of what the UI shows.
// Rendering server-side means unauthorized requests never receive the
// content at all.

export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AppNav from "../../components/AppNav";
import { isAdminId } from "../../../lib/adminAuth";
import { OUTREACH_GUIDE_MARKDOWN } from "./content";

export default async function OutreachGuidePage() {
  const { userId } = await auth();
  const admin = await isAdminId(userId);

  if (!admin) {
    return (
      <div style={{ minHeight: "100vh", width: "100%", background: "#0a0a0a", color: "#fff" }}>
        <AppNav />
        <div style={{ padding: "2rem" }}>Admin access required.</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#0a0a0a", color: "#fff", overflowY: "auto" }}>
      <AppNav />
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "2rem 1.5rem 4rem", boxSizing: "border-box" }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <Link href="/admin" style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, textDecoration: "none" }}>
            ← Admin
          </Link>
        </div>

        <div className="og-md">
          <ReactMarkdown remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => (
                <div style={{ overflowX: "auto", margin: "1rem 0" }}>
                  <table>{children}</table>
                </div>
              ),
              a: ({ children, href }) => (
                <a href={href} target={href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{children}</a>
              ),
            }}
          >
            {OUTREACH_GUIDE_MARKDOWN}
          </ReactMarkdown>
        </div>

        <style>{`
.og-md { font-size: 0.92rem; line-height: 1.6; color: rgba(255,255,255,0.82); }
.og-md h1 { font-size: 1.6rem; font-weight: 800; color: #fff; margin: 0 0 0.5rem; letter-spacing: -0.01em; }
.og-md h2 { font-size: 1.25rem; font-weight: 700; color: #fff; margin: 2rem 0 0.75rem; padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.08); }
.og-md h2:first-of-type { border-top: none; padding-top: 0; }
.og-md h3 { font-size: 1.02rem; font-weight: 700; color: #fff; margin: 1.5rem 0 0.5rem; }
.og-md p { margin: 0 0 0.85rem; }
.og-md strong { color: #fff; font-weight: 700; }
.og-md em { color: rgba(255,255,255,0.7); }
.og-md hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 1.5rem 0; }
.og-md ul, .og-md ol { margin: 0 0 0.85rem; padding-left: 1.4rem; }
.og-md li { margin: 0.25rem 0; }
.og-md code { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; padding: 1px 6px; font-size: 0.85em; color: #7ee8a5; font-family: ui-monospace, monospace; }
.og-md a { color: #3d8bff; text-decoration: underline; text-underline-offset: 2px; }
.og-md a:hover { color: #6ea8ff; }
.og-md table { border-collapse: collapse; width: 100%; font-size: 0.82rem; }
.og-md th, .og-md td { border: 1px solid rgba(255,255,255,0.1); padding: 6px 10px; text-align: left; vertical-align: top; }
.og-md th { background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.6); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 0.7rem; }
.og-md del { color: rgba(255,255,255,0.35); }
.og-md blockquote { border-left: 2px solid rgba(0,232,122,0.4); margin: 0 0 0.85rem; padding: 0.1rem 0 0.1rem 1rem; color: rgba(255,255,255,0.6); }
        `}</style>
      </div>
    </div>
  );
}
