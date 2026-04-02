// app/jumbo-calculator/page.tsx
// Standalone jumbo loan calculator — /jumbo-calculator
// ps-root pattern: inline CSS + body:has(.ps-root) override so globals.css never breaks it

import type { Metadata } from 'next';
import Link from 'next/link';
import JumboAffordabilitySliderCard from '@/components/JumboAffordabilitySliderCard';
import { NATIONAL_CONFORMING_BASELINE } from '@/loanLimits2026';

export const metadata: Metadata = {
    title: 'Jumbo Loan Calculator 2026 — HomeRates.ai',
    description:
        'Calculate your jumbo loan payment, income requirement, and cash at close for 2026. Supports conforming, high-balance, and jumbo zones with live rate spreads and reserve requirements.',
    keywords: [
        'jumbo loan calculator',
        'jumbo mortgage calculator 2026',
        'jumbo loan payment calculator',
        'high balance loan calculator',
        'jumbo loan income requirements',
        'jumbo mortgage california',
    ],
    openGraph: {
        title: 'Jumbo Loan Calculator 2026 — HomeRates.ai',
        description:
            'Interactive jumbo mortgage calculator. Adjust price, down payment, and rate — see conforming vs high-balance vs jumbo zones, income needed, and cash at close.',
        url: 'https://chat.homerates.ai/jumbo-calculator',
        type: 'website',
    },
};

// Client wrapper — JumboAffordabilitySliderCard is 'use client'
// The page itself is a server component; the card renders client-side
export default function JumboCalculatorPage() {
    const nationalBaseline = NATIONAL_CONFORMING_BASELINE.units1; // 832750

    return (
        <>
            <style>{`
                /* Override body.app when ps-root is present */
                body:has(.ps-root) {
                    display: block !important;
                    height: auto !important;
                    overflow: visible !important;
                }
                html:has(.ps-root) {
                    height: auto !important;
                    overflow: visible !important;
                }
                body:has(.ps-root) .app-footer { display: none !important; }

                .ps-root {
                    min-height: 100vh;
                    width: 100%;
                    background: #080c12;
                    color: #e0f0e8;
                    font-family: var(--font-dm-sans, 'DM Sans', sans-serif);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    overflow-x: hidden;
                    box-sizing: border-box;
                }
                .ps-root * { box-sizing: border-box; }

                .jc-header {
                    position: sticky;
                    top: 0;
                    z-index: 50;
                    width: 100%;
                    background: rgba(8,12,18,0.92);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border-bottom: 1px solid rgba(255,255,255,0.06);
                }
                .jc-header-inner {
                    max-width: 760px;
                    margin: 0 auto;
                    padding: 0 24px;
                    height: 56px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .jc-logo-link {
                    display: flex;
                    align-items: center;
                    text-decoration: none;
                }
                .jc-logo {
                    height: 26px;
                    width: auto;
                    display: block;
                }
                .jc-chat-link {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.82rem;
                    font-weight: 600;
                    color: #00e87a;
                    text-decoration: none;
                    padding: 6px 14px;
                    border: 1px solid rgba(0,232,122,0.3);
                    border-radius: 8px;
                    transition: background 0.15s, color 0.15s;
                }
                .jc-chat-link:hover {
                    background: rgba(0,232,122,0.08);
                    color: #00ff8a;
                }

                .jc-main {
                    width: 100%;
                    max-width: 760px;
                    padding: 40px 16px 60px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }

                .jc-hero {
                    width: 100%;
                    text-align: center;
                    margin-bottom: 28px;
                }
                .jc-title {
                    font-size: clamp(1.6rem, 4vw, 2.2rem);
                    font-weight: 800;
                    color: #f0f4ff;
                    margin: 0 0 10px;
                    line-height: 1.2;
                }
                .jc-subtitle {
                    font-size: 0.95rem;
                    color: rgba(160,192,168,0.7);
                    max-width: 560px;
                    margin: 0 auto;
                    line-height: 1.5;
                }

                .jc-card-wrap {
                    width: 100%;
                }

                .jc-footer {
                    width: 100%;
                    border-top: 1px solid rgba(255,255,255,0.06);
                    margin-top: 40px;
                    padding: 20px 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-wrap: wrap;
                    gap: 8px;
                    font-size: 0.78rem;
                    color: rgba(160,192,168,0.4);
                }
                .jc-footer-link {
                    color: rgba(0,232,122,0.5);
                    text-decoration: none;
                    transition: color 0.15s;
                }
                .jc-footer-link:hover { color: #00e87a; }
                .jc-sep { opacity: 0.4; }
            `}</style>

            <div className="ps-root">
                {/* Header */}
                <header className="jc-header">
                    <div className="jc-header-inner">
                        <Link href="/" className="jc-logo-link">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src="/assets/HomeRates-Logo Green.png"
                                alt="HomeRates.ai"
                                className="jc-logo"
                            />
                        </Link>
                        <Link href="/chat" className="jc-chat-link">
                            Chat with an expert →
                        </Link>
                    </div>
                </header>

                {/* Main content */}
                <main className="jc-main">
                    <div className="jc-hero">
                        <h1 className="jc-title">Jumbo Loan Calculator</h1>
                        <p className="jc-subtitle">
                            Adjust price, down payment, and rate to see your conforming / high-balance / jumbo zone,
                            monthly PITI, income needed, and total cash at close — updated instantly.
                        </p>
                    </div>

                    <div className="jc-card-wrap">
                        <JumboAffordabilitySliderCard
                            price={1_500_000}
                            downPct={20}
                            baseRate={7.15}
                            countyLimit={1_249_125}
                            nationalBaseline={nationalBaseline}
                            county="LOS ANGELES"
                            taxRate={0.011}
                            insRate={0.003}
                        />
                    </div>

                    <div style={{ marginTop: 24, textAlign: 'center', fontSize: '0.85rem', color: 'rgba(160,192,168,0.6)' }}>
                        Want a personalized analysis?{' '}
                        <Link href="/chat" style={{ color: '#00e87a', textDecoration: 'none', fontWeight: 600 }}>
                            Chat with our AI mortgage expert →
                        </Link>
                    </div>
                </main>

                {/* Footer */}
                <footer className="jc-footer">
                    <span>HomeRates.ai — educational tool, not a mortgage lender.</span>
                    <span className="jc-sep">•</span>
                    <Link href="/disclosures" className="jc-footer-link">Terms</Link>
                    <span className="jc-sep">•</span>
                    <Link href="/privacy" className="jc-footer-link">Privacy</Link>
                    <span className="jc-sep">•</span>
                    <span>National conforming baseline: ${nationalBaseline.toLocaleString()} (2026 FHFA)</span>
                </footer>
            </div>
        </>
    );
}
