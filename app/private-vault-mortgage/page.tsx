// app/private-vault-mortgage/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import AppNav from "../components/AppNav";

export const metadata: Metadata = {
  title: 'Private Vault Mortgage Intelligence — No Lead Gen | HomeRates.ai',
  description: 'Your mortgage intelligence, privately owned. HomeRates.ai stores every scenario, card, and PDF in your personal Supabase vault — secured by Clerk auth. Zero data harvesting.',
  keywords: ['private mortgage vault','mortgage intelligence no lead gen','consumer mortgage privacy','secure mortgage data','no lead form mortgage'],
  openGraph: { title: 'Private Vault Mortgage Intelligence — No Lead Gen', description: 'Every mortgage scenario you run is stored in your private vault. No data harvesting, no lead forms.', url: 'https://chat.homerates.ai/private-vault-mortgage', type: 'website' },
  alternates: { canonical: 'https://chat.homerates.ai/private-vault-mortgage' },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    { "@type": "Question", "name": "What is a private mortgage vault?", "acceptedAnswer": { "@type": "Answer", "text": "A private mortgage vault is a secure, user-owned database of your mortgage intelligence cards, scenarios, PDFs, and analysis. HomeRates.ai stores this data in Supabase, secured by Clerk authentication — only you can access it." } },
    { "@type": "Question", "name": "Does HomeRates.ai sell my mortgage data?", "acceptedAnswer": { "@type": "Answer", "text": "No. HomeRates.ai never sells user data, never shares contact information with lenders, and never uses your scenarios for lead generation. Your data belongs to you." } },
  ]
};

export default function PrivateVaultMortgagePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <style>{`
        body:has(.ps-root){display:block!important;height:auto!important;overflow:visible!important;}
        html:has(.ps-root){height:auto!important;overflow:visible!important;}
        body:has(.ps-root) .app-footer{display:none!important;}
        .ps-root{min-height:100vh;width:100%;background:#080c12;color:#e0f0e8;font-family:var(--font-dm-sans,'DM Sans',sans-serif);display:flex;flex-direction:column;align-items:center;overflow-x:hidden;box-sizing:border-box;}
        .ps-root *{box-sizing:border-box;}
        .pl-header{position:sticky;top:0;z-index:50;width:100%;background:rgba(8,12,18,0.92);backdrop-filter:blur(12px);border-bottom:1px solid rgba(255,255,255,0.06);}
        .pl-header-inner{max-width:860px;margin:0 auto;padding:0 24px;height:56px;display:flex;align-items:center;justify-content:space-between;}
        .pl-logo-link{display:flex;align-items:center;text-decoration:none;}
        .pl-logo{height:26px;width:auto;}
        .pl-cta-link{display:inline-flex;align-items:center;gap:6px;font-size:0.82rem;font-weight:600;color:#00e87a;text-decoration:none;padding:6px 14px;border:1px solid rgba(0,232,122,0.3);border-radius:8px;transition:background 0.15s;}
        .pl-cta-link:hover{background:rgba(0,232,122,0.08);}
        .pl-main{width:100%;max-width:860px;padding:48px 24px 80px;display:flex;flex-direction:column;gap:40px;}
        .pl-eyebrow{font-size:0.72rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#00e87a;background:rgba(0,232,122,0.1);border:1px solid rgba(0,232,122,0.2);border-radius:6px;padding:4px 10px;display:inline-block;margin-bottom:12px;}
        .pl-h1{font-size:clamp(1.8rem,4vw,2.8rem);font-weight:800;color:#f0f4ff;line-height:1.15;margin:0 0 16px;}
        .pl-answer-first{font-size:1.05rem;line-height:1.65;color:#a0c0a8;background:rgba(0,232,122,0.05);border-left:3px solid #00e87a;padding:16px 20px;border-radius:0 10px 10px 0;margin-bottom:8px;}
        .pl-h2{font-size:1.35rem;font-weight:700;color:#f0f4ff;margin:0 0 14px;}
        .pl-p{font-size:0.95rem;line-height:1.7;color:#a0c0a8;margin:0 0 12px;}
        .pl-section{display:flex;flex-direction:column;gap:12px;}
        .pl-stack{display:flex;flex-direction:column;gap:10px;}
        .pl-stack-row{display:flex;align-items:flex-start;gap:14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:16px 18px;}
        .pl-stack-icon{font-size:1.4rem;flex-shrink:0;margin-top:2px;}
        .pl-stack-title{font-size:0.9rem;font-weight:600;color:#e0f0e8;margin-bottom:4px;}
        .pl-stack-desc{font-size:0.85rem;color:#a0c0a8;line-height:1.5;}
        .pl-disruptive{background:rgba(0,232,122,0.05);border:1px solid rgba(0,232,122,0.15);border-radius:16px;padding:28px 32px;font-size:0.95rem;line-height:1.7;color:#a0c0a8;}
        .pl-disruptive strong{color:#00e87a;}
        .pl-cta-block{text-align:center;padding:32px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:16px;}
        .pl-cta-btn{display:inline-flex;align-items:center;gap:8px;background:#00e87a;color:#080c12;font-size:0.95rem;font-weight:700;padding:14px 32px;border-radius:10px;text-decoration:none;transition:background 0.15s;}
        .pl-cta-btn:hover{background:#00ff8a;}
        .pl-footer{width:100%;border-top:1px solid rgba(255,255,255,0.06);padding:20px 24px;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px;font-size:0.78rem;color:rgba(185,208,192,0.4);}
        .pl-footer a{color:rgba(0,232,122,0.5);text-decoration:none;}
        .pl-footer a:hover{color:#00e87a;}
        .pl-footer-sep{opacity:0.4;}
      `}</style>
      <div className="ps-root">
        <header className="pl-header">
          <div className="pl-header-inner">
            <Link href="/" className="pl-logo-link">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" className="pl-logo" />
            </Link>
            <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
              <Link href="/chat" className="pl-cta-link">Try free →</Link>
              <AppNav drawerOnly />
            </div>
          </div>
        </header>
        <main className="pl-main">
          <div>
            <span className="pl-eyebrow">Privacy First</span>
            <h1 className="pl-h1">Private Vault Mortgage Intelligence — No Lead Gen</h1>
            <p className="pl-answer-first">
              <strong>HomeRates.ai gives every user a private, user-owned mortgage intelligence vault.</strong> Every scenario you run, every card you save, every PDF you export stays encrypted in your personal Supabase database — secured by Clerk authentication. We never sell your data. We never hand you to a lender.
            </p>
          </div>

          <div className="pl-section">
            <h2 className="pl-h2">How the Vault Works</h2>
            <div className="pl-stack">
              {[
                { icon: '🔐', title: 'Clerk Authentication', desc: 'Every vault is tied to a verified Clerk identity. Multi-factor authentication supported. No one else can access your data.' },
                { icon: '🗄️', title: 'Supabase Storage', desc: 'Your scenarios, cards, and PDFs are stored in row-level-security Supabase — isolated per user. Not shared, not sold, not aggregated.' },
                { icon: '📄', title: 'PDF Export', desc: 'Export any Intelligence Card as a formatted PDF. Download it. Share it directly. It leaves your vault only when you choose.' },
                { icon: '🔗', title: 'Secure Share Links', desc: 'Generate a read-only share link for any card. Share with your agent, LO, or attorney — they see only what you choose to share.' },
                { icon: '🧠', title: 'Full Recall', desc: 'The AI remembers your past scenarios in-session. Return to a saved card and pick up exactly where you left off.' },
              ].map(r => (
                <div key={r.title} className="pl-stack-row">
                  <span className="pl-stack-icon">{r.icon}</span>
                  <div><div className="pl-stack-title">{r.title}</div><div className="pl-stack-desc">{r.desc}</div></div>
                </div>
              ))}
            </div>
          </div>

          <div className="pl-section">
            <h2 className="pl-h2">What Other Platforms Do With Your Data</h2>
            <p className="pl-p">When you enter your information on Bankrate, LendingTree, or Zillow Mortgage, you are generating a "lead" that is sold to multiple lenders simultaneously. You will receive calls, emails, and texts — often for months. Your contact information, income, credit score estimate, and purchase intent are all monetized.</p>
            <p className="pl-p">HomeRates.ai charges users directly for premium features. That is our entire business model. Your data is never the product.</p>
          </div>

          <div className="pl-disruptive">
            <strong>Your data. Your vault. Your terms.</strong> Every conversation and every Property Intelligence Card is privately owned by you, stored in your personal Supabase vault secured by Clerk authentication. No lead-gen funnels. No lender hand-offs. No "enter your email to see your rate."
          </div>

          <div className="pl-cta-block">
            <p className="pl-p" style={{ marginBottom: 16 }}>Start building your private mortgage intelligence vault today.</p>
            <Link href="/chat" className="pl-cta-btn">Try free — no forms required →</Link>
          </div>
        </main>
        <footer className="pl-footer">
          <span>HomeRates.ai — educational tool, not a lender.</span>
          <span className="pl-footer-sep">•</span>
          <Link href="/disclosures">Terms</Link>
          <span className="pl-footer-sep">•</span>
          <Link href="/privacy">Privacy</Link>
        </footer>
      </div>
    </>
  );
}
