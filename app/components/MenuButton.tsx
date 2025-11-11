// ==== REPLACE ENTIRE FILE: app/components/MenuButton.tsx ====
'use client';

import * as React from 'react';

type Props = {
    isOpen: boolean;
    onToggle: () => void;
};

export default function MenuButton({ isOpen, onToggle }: Props) {
    return (
        <button
            type="button"
            aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
            aria-pressed={isOpen}
            className="hamburger"
            onClick={onToggle}
        >
            <span className={isOpen ? 'open' : undefined} />
            <span className={isOpen ? 'open' : undefined} />
            <span className={isOpen ? 'open' : undefined} />
        </button>
    );
}
