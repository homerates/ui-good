// ==== REPLACE ENTIRE FILE: app/components/MenuButton.tsx ====
'use client';

import * as React from 'react';

type Props = {
    isOpen: boolean;
    onToggle: () => void;
};

export default function MenuButton({ isOpen, onToggle }: Props) {
    const title = isOpen ? 'Close Sidebar' : 'Open Sidebar';
    return (
        <button
            type="button"
            className={`hamburger${isOpen ? ' open' : ''}`}
            aria-label={title}
            aria-pressed={isOpen}
            title={title}
            onClick={onToggle}
        >
            <span />
            <span />
            <span />
        </button>
    );
}
