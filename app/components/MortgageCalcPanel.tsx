'use client';
import * as React from 'react';

type Props = {
    onSubmit: (vals: {
        price: number;
        downPct: number;
        ratePct: number;
        termYears: number;
        zip: string;
        hoa: number;
    }) => void;
    onCancel: () => void;
};

export default function MortgageCalcPanel({ onSubmit, onCancel }: Props) {
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget as HTMLFormElement);
                const price = Number(String(fd.get('price') || '').replace(/[, ]+/g, '')) || 0;
                const downPct = Number(String(fd.get('downPct') || '').replace(/[, ]+/g, '')) || 0;
                const ratePct = Number(String(fd.get('ratePct') || '').replace(/[, ]+/g, '')) || 0;
                const termYears = Number(String(fd.get('termYears') || '').replace(/[, ]+/g, '')) || 30;
                const zip = String(fd.get('zip') || '').trim();
                const hoa = Number(String(fd.get('hoa') || '').replace(/[, ]+/g, '')) || 0;
                onSubmit({ price, downPct, ratePct, termYears, zip, hoa });
            }}
            style={{ display: 'grid', gap: 10 }}
        >
            {/* Content grid (matches other overlays) */}
            <div style={{ display: 'grid', gap: 10 }}>
                <label className="text-sm" style={{ display: 'grid', gap: 6 }}>
                    Purchase price
                    <input
                        name="price"
                        inputMode="decimal"
                        defaultValue="900000"
                        placeholder="e.g. 900000"
                        className="input"
                        autoFocus
                    />
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <label className="text-sm" style={{ display: 'grid', gap: 6 }}>
                        Down payment %
                        <input
                            name="downPct"
                            inputMode="decimal"
                            defaultValue="20"
                            placeholder="e.g. 20"
                            className="input"
                        />
                    </label>
                    <label className="text-sm" style={{ display: 'grid', gap: 6 }}>
                        Rate %
                        <input
                            name="ratePct"
                            inputMode="decimal"
                            defaultValue="6.25"
                            placeholder="e.g. 6.25"
                            className="input"
                        />
                    </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <label className="text-sm" style={{ display: 'grid', gap: 6 }}>
                        Term (years)
                        <input
                            name="termYears"
                            inputMode="numeric"
                            defaultValue="30"
                            placeholder="e.g. 30"
                            className="input"
                        />
                    </label>
                    <label className="text-sm" style={{ display: 'grid', gap: 6 }}>
                        ZIP
                        <input
                            name="zip"
                            inputMode="numeric"
                            defaultValue="92688"
                            placeholder="e.g. 92688"
                            className="input"
                        />
                    </label>
                </div>

                <label className="text-sm" style={{ display: 'grid', gap: 6 }}>
                    HOA (optional)
                    <input
                        name="hoa"
                        inputMode="decimal"
                        placeholder="e.g. 125"
                        className="input"
                    />
                </label>

                <div className="text-xs" style={{ opacity: 0.7 }}>
                    Guided inputs only. Math runs locally; results are posted back to the chat as a calc card.
                </div>
            </div>

            {/* Actions (matches other overlays) */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn" type="button" onClick={onCancel}>Cancel</button>
                <button className="btn primary" type="submit">Use these inputs</button>
            </div>
        </form>
    );
}
