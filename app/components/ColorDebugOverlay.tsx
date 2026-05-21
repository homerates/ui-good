'use client';

import { useEffect, useState, useCallback } from 'react';

function rgbToHex(rgb: string): string {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return '';
  const hex = (n: string) => parseInt(n).toString(16).padStart(2, '0');
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
}

function contrast(hex: string): number {
  if (hex.length !== 7) return 21;
  const r = parseInt(hex.slice(1,3),16)/255;
  const g = parseInt(hex.slice(3,5),16)/255;
  const b = parseInt(hex.slice(5,7),16)/255;
  const l = (c: number) => c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4);
  const lum = 0.2126*l(r) + 0.7152*l(g) + 0.0722*l(b);
  const bg = 0.2126*l(0x08/255) + 0.7152*l(0x0c/255) + 0.0722*l(0x12/255); // #080c12
  const hi = Math.max(lum, bg), lo = Math.min(lum, bg);
  return (hi + 0.05) / (lo + 0.05);
}

interface Entry { hex: string; ratio: number; count: number; sample: string; source: string }

export default function ColorDebugOverlay() {
  const [show, setShow] = useState(false);
  const [rows, setRows] = useState<Entry[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('debugColors=1')) {
      setShow(true);
    }
  }, []);

  // cleanup markers
  const clear = useCallback(() => {
    document.querySelectorAll('[data-dbg]').forEach(e => e.remove());
    document.querySelectorAll('[data-dbg-el]').forEach(e => {
      (e as HTMLElement).style.outline = '';
      (e as HTMLElement).style.position = '';
      (e as HTMLElement).removeAttribute('data-dbg-el');
    });
  }, []);

  const scan = useCallback(() => {
    clear();
    const map = new Map<string, Entry>();

    try {
      const all = document.body.querySelectorAll('*');
      all.forEach(node => {
        try {
          const el = node as HTMLElement;
          if (el.closest('[data-debug-overlay]')) return;
          // must have direct text content
          const text = Array.from(el.childNodes)
            .filter(n => n.nodeType === 3 && (n.textContent||'').trim().length > 0)
            .map(n => n.textContent!.trim())
            .join(' ');
          if (!text) return;

          const cs = window.getComputedStyle(el);
          const hex = rgbToHex(cs.color);
          if (!hex) return;

          // source detection — safe
          let source = 'inherited';
          if (el.style && el.style.color) source = `inline: ${el.style.color}`;

          const r = contrast(hex);
          const ex = map.get(hex);
          if (ex) { ex.count++; }
          else { map.set(hex, { hex, ratio: r, count: 1, sample: text.slice(0,50), source }); }

          // mark bad contrast elements
          if (r < 4.5) {
            el.setAttribute('data-dbg-el', '1');
            el.style.outline = `2px solid ${r < 3 ? '#ef4444' : '#f59e0b'}`;
            if (window.getComputedStyle(el).position === 'static') el.style.position = 'relative';
            const badge = document.createElement('span');
            badge.setAttribute('data-dbg','1');
            badge.style.cssText = 'position:absolute;top:0;right:0;z-index:99999;background:'+(r<3?'#ef4444':'#f59e0b')+';color:#000;font:700 9px monospace;padding:1px 4px;border-radius:3px;pointer-events:none;white-space:nowrap;';
            badge.textContent = hex+' '+r.toFixed(1)+':1';
            el.appendChild(badge);
          }
        } catch { /* skip individual bad elements */ }
      });
    } catch { /* skip */ }

    const sorted = Array.from(map.values()).sort((a,b) => a.ratio - b.ratio);
    setRows(sorted);
  }, [clear]);

  if (!show) return null;

  return (
    <div data-debug-overlay="1" style={{ position:'fixed', bottom:16, right:16, zIndex:99999, fontFamily:'monospace' }}>
      <div style={{ display:'flex', gap:6, marginBottom: rows.length ? 8 : 0 }}>
        <button onClick={scan} style={{ background:'#fbbf24', color:'#000', border:'none', borderRadius:8, padding:'6px 14px', fontWeight:800, cursor:'pointer', fontSize:13 }}>🎨 Scan Colors</button>
        {rows.length > 0 && <button onClick={() => { clear(); setRows([]); }} style={{ background:'#374151', color:'#f9fafb', border:'none', borderRadius:8, padding:'6px 10px', fontWeight:700, cursor:'pointer', fontSize:13 }}>✕</button>}
      </div>

      {rows.length > 0 && (
        <div style={{ background:'#0f172a', border:'1px solid rgba(255,255,255,0.15)', borderRadius:10, padding:12, maxHeight:420, overflowY:'auto', width:360, boxShadow:'0 8px 32px rgba(0,0,0,0.7)' }}>
          <div style={{ color:'#f1f5f9', fontWeight:800, marginBottom:8, fontSize:12 }}>
            {rows.length} unique colors · {rows.filter(r=>r.ratio<4.5).length} failing contrast
          </div>
          {rows.map(r => (
            <div key={r.hex} style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:6, padding:'5px 8px', borderRadius:6,
              background: r.ratio < 3 ? 'rgba(239,68,68,0.12)' : r.ratio < 4.5 ? 'rgba(245,158,11,0.1)' : 'rgba(74,222,128,0.05)',
              border: `1px solid ${r.ratio<3?'rgba(239,68,68,0.4)':r.ratio<4.5?'rgba(245,158,11,0.3)':'rgba(74,222,128,0.12)'}` }}>
              <div style={{ width:22, height:22, borderRadius:4, background:r.hex, border:'1px solid rgba(255,255,255,0.25)', flexShrink:0, marginTop:1 }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ color:'#f1f5f9', fontSize:12 }}>
                  <b>{r.hex}</b>
                  <span style={{ color: r.ratio<4.5?'#fca5a5':'#86efac', marginLeft:6 }}>{r.ratio.toFixed(1)}:1 {r.ratio<4.5?'⚠':'✓'}</span>
                  <span style={{ color:'#64748b', marginLeft:6 }}>×{r.count}</span>
                </div>
                <div style={{ color:'#94a3b8', fontSize:10, marginTop:1 }}>{r.source}</div>
                <div style={{ color:'#64748b', fontSize:10, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>"{r.sample}"</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
