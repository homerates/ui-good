'use client';

import React from 'react';

type SlidePanelProps = {
    open: boolean;
    onClose: () => void;
    title?: React.ReactNode;
    widthClassName?: string; // e.g., "w-[480px]"
    children?: React.ReactNode;
};

export default function SlidePanel({
    open,
    onClose,
    title,
    widthClassName = 'w-[520px]',
    children,
}: SlidePanelProps) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[100]">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40"
                onClick={onClose}
                aria-hidden
            />
            {/* Panel (left slide-in) */}
            <div className="absolute inset-y-0 left-0 flex">
                <div
                    className={`h-full ${widthClassName} bg-white shadow-2xl border-r rounded-r-2xl flex flex-col`}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b">
                        <div className="text-base font-semibold">{title || 'Panel'}</div>
                        <button
                            onClick={onClose}
                            className="px-2 py-1 rounded-md border text-sm hover:bg-gray-50"
                        >
                            Close
                        </button>
                    </div>

                    {/* Body */}
                    <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
                </div>
            </div>
        </div>
    );
}
