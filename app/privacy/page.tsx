// app/privacy/page.tsx
import type { Metadata } from "next";
import PageShell from "../components/PageShell";

export const metadata: Metadata = {
  title: "Privacy & Data Policy | HomeRates.ai",
  description: "HomeRates.ai privacy and data handling policy, including what information is collected and how it is used.",
};

export default function PrivacyPage() {
  return (
    <PageShell backHref="/" backLabel="Home" maxWidth={760}>
      <h1>Privacy &amp; Data Policy</h1>
      <span className="page-updated">Last Updated: April 2026</span>

      <p>HomeRates.ai respects the privacy of all users and is committed to maintaining appropriate safeguards for data processed through the platform. This policy explains what information we collect, how it is used, and how it is stored.</p>

      <hr />

      <section>
        <h2>1. Information We Do Not Collect</h2>
        <p>HomeRates.ai is designed as an educational tool and does <strong>not</strong> request, collect, or store: Social Security numbers, credit reports or scores, tax returns, bank statements or account numbers, loan application forms, or government-issued identification numbers.</p>
        <p>Users should never enter sensitive personal financial information into the app.</p>
      </section>

      <section>
        <h2>2. Information We May Collect</h2>
        <p>To operate and improve the service, HomeRates.ai may collect:</p>
        <ul>
          <li>Questions and prompts submitted to the AI;</li>
          <li>Anonymized interaction logs (which features are used and how often);</li>
          <li>Basic device or browser information;</li>
          <li>Non-identifying technical data such as IP address and timestamps;</li>
          <li>Optional user preferences or settings.</li>
        </ul>
      </section>

      <section>
        <h2>3. How We Use Collected Data</h2>
        <p>Collected data is used to improve answer accuracy, monitor system reliability, identify technical issues, understand which features are most helpful, and maintain security. HomeRates.ai does <strong>not</strong> sell user data and does <strong>not</strong> share personal financial information with third parties.</p>
      </section>

      <section>
        <h2>4. Data Storage &amp; Security</h2>
        <p>HomeRates.ai is hosted on reputable cloud infrastructure providers that use industry-standard security measures. Interaction logs may be retained to support troubleshooting and quality improvement. These logs are not used to make lending decisions and are not shared with mortgage lenders.</p>
      </section>

      <section>
        <h2>5. Third-Party Services</h2>
        <p>HomeRates.ai uses the following third-party services:</p>
        <ul>
          <li><strong>Clerk</strong> — handles user authentication. Collects your email address and account credentials to manage sign-in and account security.</li>
          <li><strong>Stripe</strong> — processes subscription payments. Collects your payment method details. HomeRates.ai does not store your full card number — only a Stripe customer ID is stored on our systems. See <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">stripe.com/privacy</a>.</li>
          <li><strong>Supabase</strong> — provides the database storing your account plan, subscription status, and usage data. Hosted on AWS in US East region.</li>
          <li><strong>Vercel</strong> — hosts the application. May collect standard web server logs including IP address and request metadata.</li>
          <li><strong>OpenAI / Anthropic</strong> — AI model providers used to generate mortgage education responses. Prompts are transmitted to these providers to generate answers.</li>
        </ul>
        <p>No third-party service is permitted to use HomeRates.ai data for marketing its own products to users.</p>
      </section>

      <section>
        <h2>6. Billing Data</h2>
        <p>When you subscribe to a paid plan, HomeRates.ai stores: your email address, current subscription plan, Stripe customer ID (a non-sensitive reference token), and subscription status and billing period end date. Full payment card details are never stored on HomeRates.ai servers. All payment processing is handled exclusively by Stripe in accordance with PCI-DSS standards.</p>
      </section>

      <section>
        <h2>7. Cookies and Similar Technologies</h2>
        <p>HomeRates.ai may use cookies or similar technologies to support basic functionality such as keeping a session active or remembering simple preferences. These are not used to track personal financial information.</p>
      </section>

      <section>
        <h2>8. User Control and Data Requests</h2>
        <p>Users may request that their identifiable usage data be deleted by contacting <a href="mailto:support@homerates.ai">support@homerates.ai</a>. Some data may be technically anonymized or aggregated and may not be individually identifiable.</p>
      </section>

      <section>
        <h2>9. Children&apos;s Privacy</h2>
        <p>HomeRates.ai is intended for adults and is not directed to children under the age of 18. We do not knowingly collect personal data from children.</p>
      </section>

      <section>
        <h2>10. Changes to This Policy</h2>
        <p>HomeRates.ai may update this Privacy &amp; Data Policy from time to time. The most current version will always be available on this page. Continued use constitutes acceptance of the updated policy.</p>
      </section>

      <section>
        <h2>11. Contact</h2>
        <p><strong>HomeRatesAi LLC</strong><br />
        1401 Pennsylvania Ave Suite 105A PMB 70722<br />
        Wilmington, DE 19806<br />
        <strong>Email:</strong> <a href="mailto:support@homerates.ai">support@homerates.ai</a></p>
      </section>
    </PageShell>
  );
}
