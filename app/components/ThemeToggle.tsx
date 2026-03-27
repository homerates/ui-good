'use client';
// app/components/ThemeToggle.tsx
// Moon/sun toggle — sets data-theme on <html>, persists to localStorage

import React, { useEffect, useState } from 'react';

export default function ThemeToggle() {
    const [dark, setDark] = useState(false);

    // Sync with whatever the anti-flash script already set
    useEffect(() => {
        setDark(document.documentElement.getAttribute('data-theme') === 'dark');
    }, []);

    const toggle = () => {
        const next = !dark;
        setDark(next);
        if (next) {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('hr-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('hr-theme', 'light');
        }
    };

    return (
        <button
            onClick={toggle}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={dark ? 'Light mode' : 'Dark mode'}
            style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '99px',
                padding: '5px 11px',
                cursor: 'pointer',
                fontSize: '15px',
                color: 'var(--text-weak)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                lineHeight: 1,
                transition: 'border-color 0.15s, background 0.15s',
                flexShrink: 0,
            }}
        >
            {dark ? (
                // Sun
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5"/>
                    <line x1="12" y1="1" x2="12" y2="3"/>
                    <line x1="12" y1="21" x2="12" y2="23"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                    <line x1="1" y1="12" x2="3" y2="12"/>
                    <line x1="21" y1="12" x2="23" y2="12"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
            ) : (
                // Moon
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
            )}
        </button>
    );
}
