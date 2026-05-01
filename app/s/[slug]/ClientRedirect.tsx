'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ClientRedirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => { router.replace(to); }, [to, router]);
  return (
    <div style={{ minHeight: '100vh', background: '#080c12', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#8fa3b8', fontFamily: 'sans-serif', fontSize: 14 }}>Loading…</div>
    </div>
  );
}
