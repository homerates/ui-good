// No "use client" -> renders as a plain server component (static-friendly)

export const metadata = { title: 'Login • HomeRates.ai' };

export default function LoginPlaceholder() {
    return (
        <main style={{
            minHeight: '100dvh',
            display: 'grid',
            placeItems: 'center',
            padding: 24
        }}>
            <div style={{
                maxWidth: 520,
                width: '100%',
                border: '1px solid #e5e7eb',
                borderRadius: 16,
                padding: 24,
                background: '#fff',
                boxShadow: '0 8px 24px rgba(0,0,0,0.08)'
            }}>
                <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
                    Login (coming soon)
                </h1>
                <p style={{ color: '#6b7280', marginBottom: 16 }}>
                    We’re finalizing the new sign-in system. For now, continue browsing.
                </p>
                <a href="/" className="btn" style={{ display: 'inline-block' }}>
                    Home
                </a>
            </div>
        </main>
    );
}
