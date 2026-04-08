// app/support/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import AppNav from '../components/AppNav';

export const metadata: Metadata = {
  title: 'Support | HomeRates.ai',
  description: 'Get help with your HomeRates.ai account, subscription, billing, and mortgage tools.',
  alternates: { canonical: 'https://chat.homerates.ai/support' },
};

const BILLING_FAQS = [
  {
    q: 'How do I cancel my subscription?',
    a: 'Go to the Pricing page while signed in and click "Manage Subscription." This opens the Stripe billing portal where you can cancel at any time. Your access continues until the end of your current billing period — no partial refunds are issued for unused time.',
  },
  {
    q: 'How do I update my payment method?',
    a: 'Visit the Pricing page → "Manage Subscription." In the Stripe portal you can add a new card, remove old ones, and set a default. Changes take effect on your next billing cycle.',
  },
  {
    q: 'What happens when my free trial ends?',
    a: 'After the 7-day trial, your card is charged for the plan you selected. You will receive an email receipt from Stripe. If you cancel before the trial ends, you will not be charged.',
  },
  {
    q: 'Can I switch from monthly to annual billing?',
    a: 'Yes. Go to Pricing → "Manage Subscription" → Change Plan. Select your same plan billed annually to lock in the 30% discount. The change takes effect at your next renewal date.',
  },
  {
    q: 'Can I upgrade or downgrade my plan?',
    a: 'Yes. Visit the Pricing page while signed in. Click the upgrade button on any higher-tier plan to switch immediately. To downgrade, use "Manage Subscription" in the Stripe portal and select a lower plan — it takes effect at the next renewal.',
  },
  {
    q: 'I was charged but didn\'t expect it — what happened?',
    a: 'This is almost always a trial-to-paid conversion. Check your email for a Stripe receipt with the exact date and amount. If you believe the charge is in error, email us at support@homerates.ai within 7 days and we will investigate.',
  },
  {
    q: 'Do you offer refunds?',
    a: 'We offer a full refund within 48 hours of your first charge if you have not used the paid features (PDF export, unlimited questions, alerts). After 48 hours or after use, we do not issue refunds but you can cancel to stop future charges. Email support@homerates.ai for refund requests.',
  },
  {
    q: 'Is my payment information stored securely?',
    a: 'HomeRates.ai never stores your card details. All payment processing is handled by Stripe, which is PCI DSS Level 1 certified — the highest level of payment security available.',
  },
  {
    q: 'Why does my receipt come from Stripe?',
    a: 'Stripe is our payment processor. All subscription charges, receipts, and billing communications come from Stripe on behalf of HomeRates.ai. This is expected and normal.',
  },
];

const PRODUCT_FAQS = [
  {
    q: 'How accurate are the mortgage rates shown?',
    a: 'Rate data is pulled from FRED (Federal Reserve Economic Data) and updated daily. Rates shown are national averages for well-qualified borrowers and are for informational purposes only. Your actual rate will depend on your credit score, LTV, loan type, and lender. Always get a formal Loan Estimate from a licensed lender.',
  },
  {
    q: 'Is HomeRates.ai a lender or mortgage broker?',
    a: 'No. HomeRates.ai is an AI-powered mortgage research and education platform. We do not originate loans, take applications, or provide regulated mortgage advice. All content is for educational and informational purposes only.',
  },
  {
    q: 'How do I export a mortgage scenario as a PDF?',
    a: 'After any AI response generates a calculation card, look for the "Export PDF" button at the bottom of the card. PDF export requires a Plus or Pro subscription. The PDF includes the full scenario, rate assumptions, and payment breakdown.',
  },
  {
    q: 'How do I share a mortgage scenario with someone?',
    a: 'Every answer card has a Share button. Click it to copy a unique link. Anyone with the link can view the scenario — no account required. You can also use the social share buttons (X, LinkedIn, Facebook) on Knowledge Hub and Market News articles.',
  },
  {
    q: 'What is the difference between the calculators?',
    a: 'The main chat handles all mortgage scenarios conversationally. Dedicated calculator pages (Affordability, FHA, DSCR, Refinance, Conventional, Jumbo) are optimized for specific loan types and show detailed breakdowns. All calculators are free to use.',
  },
  {
    q: 'How do rate alerts work?',
    a: 'Rate alerts are available on Plus and Pro plans. Set a target rate threshold in your profile and we will email you when national averages cross it. Alerts check daily and send a maximum of one email per day to avoid inbox spam.',
  },
  {
    q: 'I am a loan officer — can I manage clients on HomeRates.ai?',
    a: 'Yes. The Pro plan ($19/mo) includes an LO dashboard, up to 10 borrower slots, borrower invite codes, and shared project threads. Borrowers receive a personalized onboarding link and can run their own scenarios which you can review.',
  },
  {
    q: 'Is my data and conversation history private?',
    a: 'Yes. Your chat history is tied to your account and is not shared with third parties or used to train AI models. Conversations are stored securely in our database. You can contact us to request deletion of your data at any time.',
  },
  {
    q: 'The AI gave me an answer that seems wrong — what should I do?',
    a: 'AI responses can occasionally contain errors, especially for complex or edge-case scenarios. Always verify critical numbers with a licensed mortgage professional before making financial decisions. If you spot a recurring error, email support@homerates.ai with a screenshot so we can investigate.',
  },
  {
    q: 'How do I delete my account?',
    a: 'Email support@homerates.ai from the address associated with your account and request deletion. We will cancel any active subscription, delete your data, and confirm within 3 business days.',
  },
];

function FaqSection({ title, color, faqs }: { title: string; color: string; faqs: { q: string; a: string }[] }) {
  return (
    <div className="sup-section">
      <div className="sup-section-label" style={{ color }}>{title}</div>
      <div className="sup-faq-list">
        {faqs.map((item, i) => (
          <details key={i} className="sup-faq">
            <summary className="sup-faq-q">{item.q}</summary>
            <p className="sup-faq-a">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}

export default function SupportPage() {
  return (
    <>
      <style>{`
        body:has(.sup-root) {
          display: block !important;
          height: auto !important;
          overflow: visible !important;
        }
        html:has(.sup-root) {
          height: auto !important;
          overflow: visible !important;
        }
        .sup-root {
          --bg: #080c12;
          --surface: #0e1420;
          --surface2: #141b28;
          --border: rgba(255,255,255,0.07);
          --border-bright: rgba(255,255,255,0.13);
          --text: #f0f4ff;
          --text-muted: #8fa3b8;
          --text-dim: #3a4560;
          --green: #00e87a;
          --blue: #3d8bff;
          --purple: #a78bfa;
          --orange: #ff8c42;
          font-family: 'DM Sans', sans-serif;
          background: var(--bg);
          color: var(--text);
          min-height: 100vh;
        }
        .sup-root * { box-sizing: border-box; }
        body:has(.sup-root) .app-footer { display: none; }

        /* NAV */
        .sup-nav {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 40px;
          border-bottom: 1px solid var(--border);
          background: var(--bg);
          position: sticky; top: 0; z-index: 10;
        }
        .sup-nav-logo { display: flex; align-items: center; text-decoration: none; }
        .sup-nav-logo img { height: 32px; width: auto; }
        .sup-nav-back {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 13px; color: var(--text-muted);
          text-decoration: none; transition: color 0.2s;
        }
        .sup-nav-back:hover { color: var(--text); }

        /* HERO */
        .sup-hero {
          max-width: 800px; margin: 0 auto;
          padding: 56px 40px 48px;
          text-align: center;
        }
        .sup-eyebrow {
          display: inline-flex; align-items: center; gap: 8px;
          font-family: 'DM Mono', monospace; font-size: 11px;
          color: var(--green); letter-spacing: 0.1em; text-transform: uppercase;
          margin-bottom: 20px;
        }
        .sup-hero h1 {
          font-family: 'DM Sans', sans-serif;
          font-size: 42px; font-weight: 800;
          line-height: 1.1; margin: 0 0 16px;
        }
        .sup-hero h1 span { color: var(--green); }
        .sup-hero p {
          font-size: 16px; color: var(--text-muted);
          line-height: 1.7; margin: 0 0 32px;
        }
        .sup-contact-bar {
          display: inline-flex; align-items: center; gap: 10px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 12px 20px;
          font-size: 14px; color: var(--text-muted);
        }
        .sup-contact-bar a {
          color: var(--green); text-decoration: none; font-weight: 600;
        }
        .sup-contact-bar a:hover { text-decoration: underline; }

        /* BODY */
        .sup-body {
          max-width: 800px; margin: 0 auto;
          padding: 16px 40px 80px;
        }
        .sup-section { margin-bottom: 56px; }
        .sup-section-label {
          font-family: 'DM Mono', monospace;
          font-size: 10px; font-weight: 600;
          letter-spacing: 0.12em; text-transform: uppercase;
          margin-bottom: 20px;
        }

        /* FAQ accordion */
        .sup-faq-list { display: flex; flex-direction: column; gap: 8px; }
        .sup-faq {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
          transition: border-color 0.2s;
        }
        .sup-faq[open] { border-color: var(--border-bright); }
        .sup-faq-q {
          padding: 18px 22px;
          font-size: 15px; font-weight: 600; color: var(--text);
          cursor: pointer; list-style: none;
          display: flex; align-items: center; justify-content: space-between;
          gap: 16px;
          user-select: none;
        }
        .sup-faq-q::-webkit-details-marker { display: none; }
        .sup-faq-q::after {
          content: '+';
          font-size: 18px; font-weight: 400;
          color: var(--text-muted); flex-shrink: 0;
          transition: transform 0.2s;
        }
        .sup-faq[open] .sup-faq-q::after {
          content: '−';
        }
        .sup-faq-a {
          padding: 0 22px 18px;
          font-size: 14px; color: var(--text-muted);
          line-height: 1.75; margin: 0;
        }

        /* CONTACT CTA */
        .sup-cta {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 36px;
          text-align: center;
          margin-bottom: 56px;
        }
        .sup-cta h2 {
          font-family: 'DM Sans', sans-serif;
          font-size: 22px; font-weight: 700;
          margin: 0 0 10px;
        }
        .sup-cta p {
          font-size: 15px; color: var(--text-muted);
          line-height: 1.65; margin: 0 0 24px;
        }
        .sup-cta-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
        .sup-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 11px 24px; border-radius: 8px;
          font-size: 14px; font-weight: 600;
          text-decoration: none; transition: opacity 0.2s;
        }
        .sup-btn:hover { opacity: 0.85; }
        .sup-btn--primary { background: var(--green); color: #080c12; }
        .sup-btn--ghost {
          background: transparent; color: var(--text-muted);
          border: 1px solid var(--border-bright);
        }

        /* FOOTER */
        .sup-footer {
          max-width: 800px; margin: 0 auto;
          padding: 24px 40px 40px;
          display: flex; align-items: center; justify-content: space-between;
          border-top: 1px solid var(--border);
          font-size: 12px; color: var(--text-dim);
          flex-wrap: wrap; gap: 12px;
        }
        .sup-footer-links { display: flex; gap: 20px; }
        .sup-footer-links a { color: var(--text-dim); text-decoration: none; transition: color 0.2s; }
        .sup-footer-links a:hover { color: var(--text-muted); }

        @media (max-width: 768px) {
          .sup-nav { padding: 14px 20px; }
          .sup-hero { padding: 40px 20px 32px; }
          .sup-hero h1 { font-size: 30px; }
          .sup-body { padding: 16px 20px 60px; }
          .sup-footer { padding: 24px 20px 40px; }
          .sup-cta { padding: 24px 20px; }
        }
      `}</style>

      <div className="sup-root">
        <nav className="sup-nav">
          <Link href="/" className="sup-nav-logo">
            <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" />
          </Link>
          <Link href="/" className="sup-nav-back">← Home</Link>
          <AppNav drawerOnly />
        </nav>

        <div className="sup-hero">
          <div className="sup-eyebrow">&#9679; Help Center</div>
          <h1>How can we <span>help?</span></h1>
          <p>Answers to common questions about billing, subscriptions, and using HomeRates.ai.</p>
          <div className="sup-contact-bar">
            Can&apos;t find what you need? Email us at <a href="mailto:support@homerates.ai">support@homerates.ai</a>
          </div>
        </div>

        <div className="sup-body">
          <FaqSection
            title="Billing &amp; Subscriptions"
            color="#00e87a"
            faqs={BILLING_FAQS}
          />

          <FaqSection
            title="Product &amp; Features"
            color="#3d8bff"
            faqs={PRODUCT_FAQS}
          />

          <div className="sup-cta">
            <h2>Still need help?</h2>
            <p>Our team typically responds within one business day. For urgent billing issues,<br />include your account email and a description of the charge in question.</p>
            <div className="sup-cta-actions">
              <a href="mailto:support@homerates.ai" className="sup-btn sup-btn--primary">
                Email Support
              </a>
              <Link href="/pricing" className="sup-btn sup-btn--ghost">
                Manage Subscription
              </Link>
            </div>
          </div>
        </div>

        <footer className="sup-footer">
          <div>HomeRates.ai · Educational content only · Not financial advice</div>
          <div className="sup-footer-links">
            <Link href="/disclosures">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/chat">Ask a question</Link>
          </div>
        </footer>
      </div>
    </>
  );
}
