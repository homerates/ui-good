// ==== REPLACE ENTIRE FILE: app/components/MenuButton.tsx ====
'use client';
import * as React from 'react';

type MenuButtonProps = {
    isOpen: boolean;
    onToggle: () => void;
};

export default function MenuButton({ isOpen, onToggle }: MenuButtonProps) {
    return (
        <button
            className={`hamburger ${isOpen ? 'open' : ''}`}
            type="button"
            aria-label="Toggle sidebar"
            aria-expanded={isOpen}
            aria-controls="hr-sidebar"
            onClick={onToggle}
        >
            <span></span>
            <span></span>
            <span></span>
        </button>
    );
}
