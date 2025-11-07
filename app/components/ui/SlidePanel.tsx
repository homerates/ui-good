'use client';

import * as React from 'react';

type SlidePanelProps = {
    open: boolean;
    title?: string;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
    widthClass?: string; // optional override (e.g., 'max-w-lg')
};

/**
 * Minimal, framework-free slide-over panel.
 * No external deps. No alias paths.
 */
export default function SlidePanel({
    open,
    title,
    onClose,
    children,
    footer,
    widthClass = 'max-w-md',
}: SlidePanelProps) {
    return (
        <div
            aria-hidden={!open}
            className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}
        >
            {/* Backdrop */}
            <div
                className={`absolute inset-0 bg-black/40 transition-opacity ${open ? 'opacity-100' : 'opacity-0'
                    }`}
                onClick={onClose}
            />

            {/* Panel */}
            <div
                className={`absolute inset-y-0 right-0 w-full ${widthClass} bg-white shadow-xl transform transition-transform ${open ? 'translate-x-0' : 'translate-x-full'
                    }`}
            >
                <div className="flex items-center justify-between border-b px-4 py-3">
                    <h2 className="text-lg font-semibold">{title || 'Panel'}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md border px-2 py-1 text-sm hover:bg-gray-50"
                    >
                        Close
                    </button>
                </div>

                <div className="p-4 overflow-y-auto h-[calc(100vh-8rem)]">
                    {children}
                </div>

                {footer ? (
                    <div className="border-t px-4 py-3 bg-gray-50">{footer}</div>
                ) : null}
            </div>
        </div>
    );
}
