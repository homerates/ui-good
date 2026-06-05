'use client';

import React from 'react';
import { SignInButton } from '@clerk/nextjs';
import ConsumerWelcomeCard from '../components/ConsumerWelcomeCard';

export default function ConsumerPage() {
  function goChat(q: string) {
    if (!q.trim()) return;
    window.open(
      '/chat?sq=' + encodeURIComponent(q.trim()) + '&from=%2Fconsumer&fromLabel=Home',
      '_blank',
      'noopener,noreferrer',
    );
  }

  return (
    <div className="page-standalone" style={{
      background: '#080c12', minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Minimal top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 28, height: 28, background: '#00e87a', borderRadius: 7,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: 13, color: '#000',
          }}>H</div>
          <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f0f4ff', fontFamily: 'inherit' }}>
            Home<span style={{ color: '#00e87a' }}>Rates</span>
          </span>
        </div>
        <SignInButton mode="modal">
          <button style={{
            padding: '7px 16px', background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
            color: '#8fa3b8', fontSize: '0.78rem', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Sign in</button>
        </SignInButton>
      </div>
      {/* Consumer welcome card */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 40px' }}>
        <ConsumerWelcomeCard onSend={goChat} />
      </div>
    </div>
  );
}
