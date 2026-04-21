'use client';

/**
 * SliderField — enhanced slider control with:
 *   • Step buttons (‹ ›) with hold-to-repeat
 *   • Click-to-edit inline value display
 *   • Shift+arrow = 4× step jump
 *   • Light and dark theme
 *
 * Usage:
 *   <SliderField
 *     label="Interest Rate"  value={rate}  min={3}  max={12}  step={0.125}
 *     onChange={setRate}
 *     format={v => v.toFixed(3) + '%'}
 *     minLabel="3%"  maxLabel="12%"
 *     trackColor="#10b981"  theme="light"
 *   />
 */

import React, { useState, useRef, useEffect } from 'react';

export interface SliderFieldProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (val: number) => void;
    /** Format the value for display */
    format: (val: number) => string;
    /** Parse user-typed text back to number (defaults to parseFloat) */
    parse?: (text: string) => number;
    minLabel?: string;
    maxLabel?: string;
    /** Optional center label below track (e.g. "FRED: 6.46%") */
    midLabel?: string;
    /** Accent color for track fill and thumb */
    trackColor?: string;
    theme?: 'light' | 'dark';
    /** ms before hold-to-repeat fires (default 380) */
    holdDelay?: number;
    /** ms between repeat steps (default 75) */
    holdInterval?: number;
    /** Steps per Shift+arrow (default 4) */
    shiftMultiplier?: number;
    disabled?: boolean;
    style?: React.CSSProperties;
    className?: string;
}

// ── Style injection (once per page) ──────────────────────────────────────────

let _injected = false;
function ensureStyles() {
    if (_injected || typeof document === 'undefined') return;
    _injected = true;
    const s = document.createElement('style');
    s.id = 'slider-field-styles';
    s.textContent = `
.sf{display:flex;flex-direction:column;gap:5px;width:100%;}
.sf--disabled{opacity:.45;pointer-events:none;}
.sf__header{display:flex;justify-content:space-between;align-items:center;gap:8px;min-height:22px;}
/* label */
.sf__lbl-l{font-size:13px;font-weight:600;color:#374151;}
.sf__lbl-d{font-size:.82rem;font-weight:500;color:rgba(185,208,192,.8);}
/* value display */
.sf__val-l{font-size:13px;font-weight:700;color:#0f172a;cursor:pointer;border-bottom:1.5px dashed transparent;transition:border-color .15s;font-variant-numeric:tabular-nums;white-space:nowrap;padding-bottom:1px;}
.sf__val-l:hover{border-bottom-color:#94a3b8;}
.sf__val-d{font-size:.85rem;font-weight:700;color:#f0f4ff;cursor:pointer;border-bottom:1.5px dashed transparent;transition:border-color .15s;font-variant-numeric:tabular-nums;white-space:nowrap;padding-bottom:1px;}
.sf__val-d:hover{border-bottom-color:rgba(185,208,192,.55);}
/* inline edit input */
.sf__inp-l{font-size:13px;font-weight:700;color:#0f172a;background:#fff;border:1.5px solid var(--sf-c,#10b981);border-radius:5px;outline:none;text-align:right;font-variant-numeric:tabular-nums;width:88px;padding:1px 5px;}
.sf__inp-d{font-size:.85rem;font-weight:700;color:#f0f4ff;background:rgba(255,255,255,.09);border:1.5px solid var(--sf-c,#00e87a);border-radius:5px;outline:none;text-align:right;font-variant-numeric:tabular-nums;width:88px;padding:1px 5px;}
/* track row */
.sf__row{display:flex;align-items:center;gap:7px;}
/* step buttons */
.sf__btn-l{flex-shrink:0;width:30px;height:30px;border-radius:8px;border:1.5px solid #e2e8f0;background:#f8fafc;color:#374151;font-size:18px;font-weight:400;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .12s,border-color .12s,transform .08s;user-select:none;touch-action:none;-webkit-user-select:none;}
.sf__btn-l:hover{background:#e9f0f8;border-color:#cbd5e1;}
.sf__btn-l:active{transform:scale(.85);}
.sf__btn-d{flex-shrink:0;width:30px;height:30px;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:rgba(185,208,192,.9);font-size:18px;font-weight:400;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .12s,transform .08s;user-select:none;touch-action:none;-webkit-user-select:none;}
.sf__btn-d:hover{background:rgba(255,255,255,.13);}
.sf__btn-d:active{transform:scale(.85);}
/* range track */
.sf__rng{-webkit-appearance:none;appearance:none;flex:1;height:6px;border-radius:9999px;outline:none;cursor:pointer;display:block;min-width:0;}
.sf__rng-d{height:4px;border-radius:2px;}
.sf__rng::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:var(--sf-c,#10b981);border:3px solid #fff;box-shadow:0 0 0 1.5px var(--sf-c,#10b981),0 2px 6px rgba(0,0,0,.18);cursor:pointer;transition:box-shadow .15s;}
.sf__rng::-webkit-slider-thumb:hover{box-shadow:0 0 0 5px color-mix(in srgb,var(--sf-c,#10b981) 28%,transparent),0 2px 8px rgba(0,0,0,.2);}
.sf__rng:active::-webkit-slider-thumb{box-shadow:0 0 0 7px color-mix(in srgb,var(--sf-c,#10b981) 20%,transparent),0 2px 8px rgba(0,0,0,.25);}
.sf__rng::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:var(--sf-c,#10b981);border:3px solid #fff;box-shadow:0 0 0 1.5px var(--sf-c,#10b981);cursor:pointer;}
/* minmax */
.sf__mm-l{display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;font-weight:500;margin-top:1px;}
.sf__mm-d{display:flex;justify-content:space-between;font-size:.7rem;color:rgba(185,208,192,.4);margin-top:2px;}
.sf__mid-l{font-size:10px;color:#94a3b8;}
.sf__mid-d{font-size:.7rem;color:rgba(185,208,192,.55);}
`;
    document.head.appendChild(s);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function snap(value: number, step: number, min: number, max: number): number {
    const steps = Math.round((value - min) / step);
    const snapped = min + steps * step;
    const clamped = Math.max(min, Math.min(max, snapped));
    // Trim floating-point noise
    const dec = Math.max(0, Math.ceil(-Math.log10(step))) + 1;
    return parseFloat(clamped.toFixed(dec));
}

function trackBg(value: number, min: number, max: number, color: string, dark: boolean): string {
    const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
    const empty = dark ? 'rgba(255,255,255,0.10)' : '#e2e8f0';
    return `linear-gradient(to right,${color} 0%,${color} ${pct}%,${empty} ${pct}%,${empty} 100%)`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SliderField({
    label, value, min, max, step, onChange, format,
    parse, minLabel, maxLabel, midLabel,
    trackColor = '#10b981', theme = 'light',
    holdDelay = 380, holdInterval = 75, shiftMultiplier = 4,
    disabled = false, style, className,
}: SliderFieldProps) {
    const dark = theme === 'dark';
    const [editing, setEditing] = useState(false);
    const [editText, setEditText] = useState('');
    const editRef = useRef<HTMLInputElement>(null);
    const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const holdRepeat = useRef<ReturnType<typeof setInterval> | null>(null);
    // Always-current value for hold-to-repeat
    const latestVal = useRef(value);
    latestVal.current = value;

    useEffect(() => { ensureStyles(); }, []);

    function doStep(dir: -1 | 1) {
        onChange(snap(latestVal.current + dir * step, step, min, max));
    }

    function startHold(dir: -1 | 1) {
        doStep(dir);
        holdTimer.current = setTimeout(() => {
            holdRepeat.current = setInterval(() => doStep(dir), holdInterval);
        }, holdDelay);
    }

    function stopHold() {
        if (holdTimer.current)  { clearTimeout(holdTimer.current);   holdTimer.current = null; }
        if (holdRepeat.current) { clearInterval(holdRepeat.current); holdRepeat.current = null; }
    }

    function handleRangeKey(e: React.KeyboardEvent<HTMLInputElement>) {
        if (!e.shiftKey) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            onChange(snap(value + shiftMultiplier * step, step, min, max));
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            onChange(snap(value - shiftMultiplier * step, step, min, max));
        }
    }

    function openEdit() {
        setEditText(String(value));
        setEditing(true);
        setTimeout(() => editRef.current?.select(), 0);
    }

    function commitEdit() {
        const rawText = editText.replace(/[$,\s]/g, '');
        const parsed = parse ? parse(editText) : parseFloat(rawText);
        if (!isNaN(parsed)) {
            // Clamp to range but don't snap to step — preserve exact typed values
            const clamped = Math.max(min, Math.min(max, parsed));
            onChange(clamped);
        }
        setEditing(false);
    }

    function handleEditKey(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter')  commitEdit();
        if (e.key === 'Escape') setEditing(false);
    }

    const bg = trackBg(value, min, max, trackColor, dark);
    const btnClass  = dark ? 'sf__btn-d'  : 'sf__btn-l';
    const lblClass  = dark ? 'sf__lbl-d'  : 'sf__lbl-l';
    const valClass  = dark ? 'sf__val-d'  : 'sf__val-l';
    const inpClass  = dark ? 'sf__inp-d'  : 'sf__inp-l';
    const rngClass  = `sf__rng${dark ? ' sf__rng-d' : ''}`;
    const mmClass   = dark ? 'sf__mm-d'   : 'sf__mm-l';
    const midClass  = dark ? 'sf__mid-d'  : 'sf__mid-l';

    const rootStyle = { '--sf-c': trackColor, ...style } as React.CSSProperties;

    return (
        <div
            className={`sf${disabled ? ' sf--disabled' : ''}${className ? ` ${className}` : ''}`}
            style={rootStyle}
        >
            {/* Header: label + value/edit */}
            <div className="sf__header">
                <span className={lblClass}>{label}</span>
                {editing ? (
                    <input
                        ref={editRef}
                        className={inpClass}
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={handleEditKey}
                        autoFocus
                    />
                ) : (
                    <span
                        className={valClass}
                        onClick={openEdit}
                        title="Click to enter a value"
                    >
                        {format(value)}
                    </span>
                )}
            </div>

            {/* Track row: ‹ [range] › */}
            <div className="sf__row">
                <button
                    className={btnClass}
                    onMouseDown={() => startHold(-1)}
                    onMouseUp={stopHold}
                    onMouseLeave={stopHold}
                    onTouchStart={e => { e.preventDefault(); startHold(-1); }}
                    onTouchEnd={stopHold}
                    tabIndex={-1}
                    aria-label={`Decrease ${label}`}
                >‹</button>

                <input
                    type="range"
                    className={rngClass}
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    disabled={disabled}
                    onChange={e => onChange(parseFloat(e.target.value))}
                    onKeyDown={handleRangeKey}
                    style={{ background: bg }}
                />

                <button
                    className={btnClass}
                    onMouseDown={() => startHold(1)}
                    onMouseUp={stopHold}
                    onMouseLeave={stopHold}
                    onTouchStart={e => { e.preventDefault(); startHold(1); }}
                    onTouchEnd={stopHold}
                    tabIndex={-1}
                    aria-label={`Increase ${label}`}
                >›</button>
            </div>

            {/* Min / mid / max labels */}
            {(minLabel || maxLabel || midLabel) && (
                <div className={mmClass}>
                    <span>{minLabel ?? ''}</span>
                    {midLabel && <span className={midClass}>{midLabel}</span>}
                    <span>{maxLabel ?? ''}</span>
                </div>
            )}
        </div>
    );
}
