import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export default function Page() {
  return (
    <div className="auth-shell">
      <div className="auth-shell-header">
        <Link href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" className="auth-shell-logo" />
        </Link>
      </div>

      <div className="auth-shell-body">
        <SignIn fallbackRedirectUrl="/dashboard" />
      </div>

      <div className="auth-shell-footer">
        <Link href="/disclosures" className="auth-shell-footer-link">Terms</Link>
        <span>•</span>
        <Link href="/privacy" className="auth-shell-footer-link">Privacy</Link>
      </div>

      <style>{`
        .auth-shell {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          background: var(--bg, #080c12);
          font-family: var(--font-dm-sans, sans-serif);
        }
        .auth-shell-header {
          width: 100%;
          padding: 20px 24px;
          display: flex;
          justify-content: center;
          border-bottom: 1px solid rgba(0,232,122,0.08);
        }
        .auth-shell-logo { height: 30px; width: auto; }
        .auth-shell-body {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 16px;
        }
        .auth-shell-footer {
          padding: 16px;
          display: flex;
          gap: 10px;
          align-items: center;
          font-size: 0.72rem;
          color: rgba(160,192,168,0.4);
        }
        .auth-shell-footer-link {
          color: rgba(0,232,122,0.55);
          text-decoration: none;
        }
        .auth-shell-footer-link:hover { color: #00e87a; }
      `}</style>
    </div>
  );
}
