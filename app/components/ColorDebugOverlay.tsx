'use client';
/**
 * ColorDebugOverlay — mount this anywhere, press the 🎨 button,
 * and it scans every visible text node, reads getComputedStyle().color,
 * and draws a coloured border + badge showing the hex.
 *
 * Only rendered when URL has ?debugColors=1
 * Usage: add  <ColorDebugOverlay />  to any page layout, then visit ?debugColors=1
 */

import { useEffect, useState, useCallback } from 'react';

function rgbToHex(rgb: string): string {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return rgb;
  const r = parseInt(m[1]).toString(16).padStart(2, '0');
  const g = parseInt(m[2]).toString(16).padStart(2, '0');
  const b = parseInt(m[3]).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

// Relative luminance for contrast ratio
function lum(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const sRGB = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * sRGB(r) + 0.7152 * sRGB(g) + 0.0722 * sRGB(b);
}

function contrast(fg: string, bg = '#080c12'): number {
  const l1 = lum(fg), l2 = lum(bg);
  const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

interface ColorEntry {
  hex: string;
  ratio: number;
  count: number;
  sample: string;
  sourceAttr: string; // 'inline style' | 'css class' | 'inherited'
  elements: HTMLElement[];
}

export default function ColorDebugOverlay() {
  const [active, setActive] = useState(false);
  const [results, setResults] = useState<ColorEntry[]>([]);
  const [highlighted, setHighlighted] = useState<HTMLElement[]>([]);

  // Only render on ?debugColors=1
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    setEnabled(window.location.search.includes('debugColors=1'));
  }, []);

  const clearHighlights = useCallback(() => {
    highlighted.forEach(el => {
      el.removeAttribute('data-debug-outline');
      (el as any)._debugStyle = null;
    });
    document.querySelectorAll('[data-debug-badge]').forEach(b => b.remove());
    setHighlighted([]);
  }, [highlighted]);

  const scan = useCallback(() => {
    clearHighlights();

    const map = new Map<string, ColorEntry>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);

    const newHighlighted: HTMLElement[] = [];

    while (walker.nextNode()) {
      const el = walker.currentNode as HTMLElement;
      // Skip our own overlay
      if (el.closest('[data-debug-overlay]')) continue;
      // Skip invisible elements
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      // Only elements that directly contain visible text (not just wrappers)
      const hasDirectText = Array.from(el.childNodes).some(
        n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()
      );
      if (!hasDirectText) continue;

      const computed = window.getComputedStyle(el);
      const colorRgb = computed.color;
      const hex = rgbToHex(colorRgb);
      if (!hex.startsWith('#') || hex.length !== 7) continue;

      // Detect source
      let sourceAttr = 'inherited';
      if (el.style.color) {
        sourceAttr = `inline style: ${el.style.color}`;
      } else {
        // Check if any class sets color
        const rules: string[] = [];
        try {
          for (const sheet of Array.from(document.styleSheets)) {
            try {
              for (const rule of Array.from(sheet.cssRules || [])) {
                if ((rule as CSSStyleRule).style?.color &&
                    el.matches((rule as CSSStyleRule).selectorText)) {
                  rules.push((rule as CSSStyleRule).selectorText);
                }
              }
            } catch { /* cross-origin */ }
          }
        } catch { /* */ }
        if (rules.length) sourceAttr = `CSS class: ${rules.slice(0, 2).join(', ')}`;
      }

      const ratio = contrast(hex);
      const sample = (el.textContent || '').trim().slice(0, 40);

      const existing = map.get(hex);
      if (existing) {
        existing.count++;
        existing.elements.push(el);
      } else {
        map.set(hex, { hex, ratio, count: 1, sample, sourceAttr, elements: [el] });
      }

      // Add visible outline for low-contrast text
      if (ratio < 4.5) {
        const badge = document.createElement('span');
        badge.setAttribute('data-debug-badge', '1');
        badge.style.cssText = `
          position:absolute; top:0; right:0; z-index:99999;
          background:${ratio < 3 ? '#ef4444' : '#f59e0b'};
          color:#000; font-size:9px; font-weight:800; padding:1px 4px;
          border-radius:3px; pointer-events:none; white-space:nowrap;
          font-family:monospace;
        `;
        badge.textContent = `${hex} (${ratio.toFixed(1)}:1)`;
        const pos = window.getComputedStyle(el).position;
        if (pos === 'static') el.style.position = 'relative';
        el.appendChild(badge);
        el.style.outline = `2px solid ${ratio < 3 ? '#ef4444' : '#f59e0b'}`;
        newHighlighted.push(el);
      }
    }

    const sorted = Array.from(map.values()).sort((a, b) => a.ratio - b.ratio);
    setResults(sorted);
    setHighlighted(newHighlighted);
    setActive(true);
  }, [clearHighlights]);

  if (!enabled) return null;

  return (
    <div data-debug-overlay="1" style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 99999,
      fontFamily: 'monospace', fontSize: 11,
    }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: active ? 8 : 0 }}>
        <button
          onClick={scan}
          style={{
            background: '#fbbf24', color: '#000', border: 'none',
            borderRadius: 8, padding: '6px 12px', fontWeight: 800,
            cursor: 'pointer', fontSize: 12,
          }}
        >
          🎨 Scan Colors
        </button>
        {active && (
          <button
            onClick={() => { clearHighlights(); setActive(false); setResults([]); }}
            style={{
              background: '#374151', color: '#f9fafb', border: 'none',
              borderRadius: 8, padding: '6px 12px', fontWeight: 700,
              cursor: 'pointer', fontSize: 12,
            }}
          >
            Clear
          </button>
        )}
      </div>

      {active && results.length > 0 && (
        <div style={{
          background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 10, padding: 12, maxHeight: 400, overflowY: 'auto',
          width: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}>
          <div style={{ color: '#f1f5f9', fontWeight: 800, marginBottom: 8, fontSize: 12 }}>
            Text colors found on this page ({results.length} unique)
          </div>
          {results.map(r => (
            <div key={r.hex} style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
              padding: '5px 8px', borderRadius: 6,
              background: r.ratio < 4.5 ? 'rgba(239,68,68,0.12)' : 'rgba(74,222,128,0.06)',
              border: `1px solid ${r.ratio < 3 ? 'rgba(239,68,68,0.4)' : r.ratio < 4.5 ? 'rgba(245,158,11,0.35)' : 'rgba(74,222,128,0.15)'}`,
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                background: r.hex, border: '1px solid rgba(255,255,255,0.2)',
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#f1f5f9', fontSize: 11 }}>
                  <strong>{r.hex}</strong>
                  <span style={{ color: r.ratio < 4.5 ? '#fca5a5' : '#86efac', marginLeft: 6 }}>
                    {r.ratio.toFixed(1)}:1 {r.ratio < 4.5 ? '⚠ FAIL' : '✓'}
                  </span>
                  <span style={{ color: '#94a3b8', marginLeft: 6 }}>×{r.count}</span>
                </div>
                <div style={{ color: '#64748b', fontSize: 10, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.sourceAttr}
                </div>
                <div style={{ color: '#475569', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  "{r.sample}"
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
