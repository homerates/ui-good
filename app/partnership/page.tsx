// app/partnership/page.tsx
// Partnership materials hub — shareable with external parties.
// Access is checked server-side against an HttpOnly cookie (lib/docAccess.ts);
// the access code never reaches the browser bundle. The embedded documents
// (app/partnership/[doc]/route.ts) are gated by the same cookie.

import { cookies } from "next/headers";
import type { Metadata } from "next";
import PartnershipHub from "./PartnershipHub";
import { DOC_COOKIE, hasDocAccess } from "../../lib/docAccess";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Partnership Materials",
    robots: { index: false, follow: false },
};

export default async function PartnershipPage({
    searchParams,
}: {
    searchParams: Promise<{ denied?: string }>;
}) {
    const jar = await cookies();
    if (hasDocAccess(jar.get(DOC_COOKIE)?.value)) return <PartnershipHub />;

    const { denied } = await searchParams;
    const isDenied = denied === "1";

    return (
        <div className="page-standalone" style={{
            minHeight: "100vh", background: "#080c12",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            padding: "24px",
        }}>
            <div style={{ maxWidth: 380, width: "100%", textAlign: "center" }}>
                {/* BRAND.md hard rule: approved logo asset only, never a recreated wordmark */}
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/assets/homerates-email-logo.png" alt="HomeRates.Ai" style={{ height: 28, width: "auto" }} />
                </div>

                <div style={{
                    background: "#0e1420", border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 16, padding: "32px 28px",
                }}>
                    <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8fa3b8", marginBottom: 8 }}>
                        Partnership Materials
                    </div>
                    <h1 style={{ fontSize: "1.3rem", fontWeight: 800, color: "#f0f4ff", letterSpacing: "-0.03em", marginBottom: 8 }}>
                        Enter access code
                    </h1>
                    <p style={{ fontSize: "0.8rem", color: "#8fa3b8", lineHeight: 1.6, marginBottom: 24 }}>
                        These documents are shared for internal review. Enter the access code provided by the HomeRates team.
                    </p>

                    <form method="POST" action="/api/doc-access" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <input type="hidden" name="next" value="/partnership" />
                        <input
                            type="password"
                            name="code"
                            placeholder="Access code"
                            aria-label="Access code"
                            autoComplete="off"
                            required
                            autoFocus
                            style={{
                                width: "100%", padding: "12px 14px",
                                background: "#141b28",
                                border: `1px solid ${isDenied ? "rgba(255,95,95,0.4)" : "rgba(255,255,255,0.1)"}`,
                                borderRadius: 10, color: "#f0f4ff", fontSize: "0.9rem",
                                fontFamily: "inherit", textAlign: "center",
                            }}
                        />
                        {isDenied && (
                            <div role="alert" style={{ fontSize: "0.72rem", color: "#ff8a8a" }}>
                                Incorrect access code — please try again or contact the HomeRates team.
                            </div>
                        )}
                        <button type="submit" style={{
                            padding: "12px", background: "#00e87a", border: "none",
                            borderRadius: 10, color: "#000", fontSize: "0.85rem", fontWeight: 700,
                            cursor: "pointer", fontFamily: "inherit",
                        }}>
                            Access documents →
                        </button>
                    </form>
                </div>

                <p style={{ marginTop: 20, fontSize: "0.7rem", color: "rgba(255,255,255,0.2)", lineHeight: 1.6 }}>
                    Confidential — HomeRates.Ai · For authorised review only
                </p>
            </div>
        </div>
    );
}
