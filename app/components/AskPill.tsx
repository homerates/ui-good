'use client';

import * as React from 'react';
import "../chat/styles.css";

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

    const disabled = loading || !value.trim();

    return (
        <div
            className="hr-composer-wrap"
            style={{ paddingBottom: `var(${footerVar})` }}
        >
            <form
                className={`hr-composer ${className}`}
                style={{
                    position: 'sticky',
                    bottom: `var(${footerVar})`,
                    zIndex: 900,
                }}
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
                    aria-label="Send question to HomeRates.ai"
                    disabled={disabled}
                >
                    {/* Animated pill content */}
                    <span className="hr-pill-inner">
                        {/* Left: tiny animated “searching home” glyph */}
                        <span className="hr-pill-icon">
                            <span className="hr-pill-icon-house">
                                <span className="hr-pill-icon-roof" />
                                <span className="hr-pill-icon-door" />
                            </span>
                            <span className="hr-pill-icon-glass">
                                <span className="hr-pill-icon-glass-circle" />
                                <span className="hr-pill-icon-glass-handle" />
                            </span>
                            <span className="hr-pill-icon-spark" />
                        </span>

                        {/* Right: text + status */}
                        <span className="hr-pill-text">
                            <span className="hr-pill-text-main">
                                {loading
                                    ? 'Thinking through your options'
                                    : 'Ask HomeRates.ai'}
                            </span>

                            <span className="hr-pill-text-sub">
                                {loading ? (
                                    <span className="hr-pill-dots">
                                        <span className="hr-pill-dot" />
                                        <span className="hr-pill-dot" />
                                        <span className="hr-pill-dot" />
                                    </span>
                                ) : (
                                    'Rates · Refi · Approval · DPA'
                                )}
                            </span>
                        </span>
                    </span>
                </button>
            </form>
        </div>
    );
}
