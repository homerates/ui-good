// app/components/SidebarLegal.tsx
"use client";

import Link from "next/link";

export default function SidebarLegal() {
    return (
        <div className="sidebar-legal">
            <h4 className="sidebar-legal-title">About &amp; Legal</h4>
            <Link href="/about" className="sidebar-legal-link">
                About HomeRates.ai
            </Link>
            <Link href="/disclosures" className="sidebar-legal-link">
                Terms &amp; Disclosures
            </Link>
            <Link href="/privacy" className="sidebar-legal-link">
                Privacy &amp; Data Policy
            </Link>
        </div>
    );
}
