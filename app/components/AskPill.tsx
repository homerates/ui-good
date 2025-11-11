'use client';

import * as React from 'react';

type AskPillProps = {
    value: string;
    onChange: (v: string) => void;
    onSubmit: () => void;
    loading?: boolean;
    placeholder?: string;
    footerVar?: string; // defaults to '--footer-h'
    className?: string;
};

export default function AskPill({
    value,
    onChange,
    onSubmit,
    loading = false,
    placeholder = 'Ask about DTI, PMI, or where rates sit vs the 10-year | ...',
    footerVar = '--footer-h',
    className = '',
}: AskPillProps) {
    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!loading && value.trim()) onSubmit();
    };

    return (
        <div className="hr-composer-wrap" style={{ paddingBottom: `var(${footerVar})` }}>
            <form
                className={`hr-composer ${className}`}
                style={{ position: 'sticky', bottom: `var(${footerVar})`, zIndex: 900 }}
                onSubmit={handleSubmit}
            >
                <input
                    className="hr-input"
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    autoComplete="off"
                    aria-label="Ask a question"
                />
                <button
                    type="submit"
                    className={`hr-pill${loading ? ' is-loading' : ''}`}
                    aria-label="Send"
                    disabled={loading || !value.trim()}
                >
                    {loading ? 'Sending…' : 'Send'}
                </button>
            </form>
        </div>
    );
}
