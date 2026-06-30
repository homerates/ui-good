// Throwaway Stage 2 isolation test — DELETE in Stage 3+ cleanup.
// URL: /__mintest  — sits outside any route group so no group layout wraps it.
// Uses AppShell directly with chrome="minimal".
// Verify on preview: logo only + "→ Back to App" (if signed in), NO nav, NO footer.
import AppShell from "../components/AppShell";

export default function MinimalShellTest() {
  return (
    <AppShell mode="pro" chrome="minimal">
      <div style={{ padding: '48px 32px', maxWidth: 640, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.5rem', fontWeight: 700, color: '#e0f0e8', marginBottom: 12 }}>
          Minimal Chrome — isolation test
        </h1>
        <p style={{ color: 'rgba(185,208,192,0.7)', lineHeight: 1.7, marginBottom: 8 }}>
          chrome: <strong style={{ color: '#00e87a' }}>minimal</strong>
        </p>
        <p style={{ color: 'rgba(185,208,192,0.7)', lineHeight: 1.7, marginBottom: 8 }}>
          Header should show: <strong>logo only</strong> + "→ Back to App" link (signed-in only).
        </p>
        <p style={{ color: 'rgba(185,208,192,0.7)', lineHeight: 1.7 }}>
          No top bar, no hamburger, no page footer. This is the target chrome for
          /rate-intelligence-engine (Stage 3+).
        </p>
      </div>
    </AppShell>
  );
}
