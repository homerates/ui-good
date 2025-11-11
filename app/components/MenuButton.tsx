'use client';

import * as React from 'react';

type Props = {
    isOpen: boolean;
    onToggle: () => void;
};

export default function MenuButton({ isOpen, onToggle }: Props) {
    const title = isOpen ? 'Close sidebar' : 'Open sidebar';
    return (
        <button
            type="button"
            aria-label={title}
            title={title}
            aria-pressed={isOpen}
            className={`hamburger${isOpen ? ' open' : ''}`}
            onClick={onToggle}
        >
            <span />
            <span />
            <span />
        </button>
    );
}
