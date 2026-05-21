'use client';
// app/error.tsx — global error boundary for unexpected runtime errors

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[HomeRates error boundary]', error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: '#f8fafc',
        fontFamily: 'system-ui, sans-serif',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚠️</div>
      <h1
        style={{
          fontSize: '1.3rem',
          fontWeight: 700,
          color: '#0f172a',
          margin: '0 0 8px',
        }}
      >
        Something went wrong
      </h1>
      <p
        style={{
          fontSize: '0.9rem',
          color: '#eaf8f7',
          margin: '0 0 28px',
          maxWidth: '340px',
          lineHeight: 1.6,
        }}
      >
        An unexpected error occurred. Try again or return to the homepage.
      </p>
      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={reset}
          style={{
            padding: '10px 22px',
            background: '#10b981',
            color: '#fff',
            border: 'none',
            borderRadius: '9999px',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
        <a
          href="/"
          style={{
            padding: '10px 22px',
            background: '#fff',
            color: '#0f172a',
            border: '1px solid #e2e8f0',
            borderRadius: '9999px',
            fontWeight: 500,
            fontSize: '0.9rem',
            textDecoration: 'none',
          }}
        >
          Go home
        </a>
      </div>
    </div>
  );
}
