// Throwaway Stage 2 isolation test — DELETE in Stage 3+ cleanup.
// URL: /__shelltest   (route group prefix stripped by Next.js)
// Verify on preview: logo present, top bar = My Home / Chat / Market Rates,
// drawer grouped (Decide/Tools/Mine/Learn) with footer zone, page footer present.
export default function ConsumerShellTest() {
  return (
    <div style={{ padding: '48px 32px', maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.5rem', fontWeight: 700, color: '#e0f0e8', marginBottom: 12 }}>
        Consumer Shell — isolation test
      </h1>
      <p style={{ color: 'rgba(185,208,192,0.7)', lineHeight: 1.7, marginBottom: 8 }}>
        Mode: <strong style={{ color: '#00e87a' }}>consumer</strong>
      </p>
      <p style={{ color: 'rgba(185,208,192,0.7)', lineHeight: 1.7, marginBottom: 8 }}>
        Top bar should show: <strong>My Home · Chat · Market Rates</strong>
      </p>
      <p style={{ color: 'rgba(185,208,192,0.7)', lineHeight: 1.7, marginBottom: 8 }}>
        Drawer should group items under <strong>Decide / Tools / Mine / Learn</strong> with footer zone below.
      </p>
      <p style={{ color: 'rgba(185,208,192,0.7)', lineHeight: 1.7 }}>
        No existing pages have moved. This route exists only for Stage 2 verification.
      </p>
    </div>
  );
}
