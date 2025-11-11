// ==== REPLACE ENTIRE FILE: app/components/MenuButton.tsx ====
'use client';
import * as React from 'react';

type Props = {
    isOpen: boolean;
    onToggle: () => void;
};

/**
 * Header hamburger that ONLY toggles the sidebar.
 * Always returns a single parent element to satisfy JSX.
 */
export default function MenuButton({ isOpen, onToggle }: Props) {
    return (
        <div className="header-menu" style={{ display: 'inline-flex', alignItems: 'center' }}>
            <button
                type="button"
                className={`hamburger ${isOpen ? 'open' : ''}`}
                aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
                aria-pressed={isOpen}
                onClick={onToggle}
            >
                <span />
                <span />
                <span />
            </button>
        </div>
    );
}
