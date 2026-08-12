'use client';

// components/AddressAutocomplete.tsx
// Google Places address autocomplete — drop-in replacement for plain <input type="text">
// Requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in env.
// Loads the Maps JS SDK once per page; subsequent instances reuse the same script.
//
// Uses the Places API (New) — AutocompleteSuggestion.fetchAutocompleteSuggestions() +
// Place.fetchFields() — instead of the legacy google.maps.places.Autocomplete class.
// Google's own deprecation notice on the legacy class: "not available to new customers"
// as of March 2025, and "existing bugs in google.maps.places.Autocomplete will not be
// addressed." The legacy class also renders its dropdown via an opaque, Google-managed
// .pac-container appended to document.body — outside this component's control, which
// made the reported mobile bug (tapping a nearby button sometimes does nothing, as if
// the address was never entered) impossible to diagnose or fix directly. This version
// renders its own dropdown, so the exact click/touch handling is ours to control —
// selection uses onMouseDown+preventDefault (fires before the input's blur), the
// standard fix for "tap dismisses the dropdown instead of registering the tap" on
// touch devices.
//
// External contract (value/onChange/onSelect/onKeyDown/disabled/className/style) and
// DOM shape (a single <input>, no wrapper div) are unchanged from the previous
// implementation — every existing call site keeps working with zero changes, including
// CSS written against a bare <input> as a direct flex/grid child.

import { useEffect, useRef, useCallback, useState, forwardRef, CSSProperties, KeyboardEvent } from 'react';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google: any;
    __mapsScriptLoading?: boolean;
    __mapsScriptFailed?: boolean;
  }
}

function loadMapsScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject('SSR');
    if (window.google?.maps?.places) return resolve();
    if (window.__mapsScriptFailed) return reject('Maps script previously failed');

    if (window.__mapsScriptLoading) {
      let attempts = 0;
      const poll = setInterval(() => {
        if (window.google?.maps?.places) { clearInterval(poll); resolve(); return; }
        if (window.__mapsScriptFailed || ++attempts > 100) { clearInterval(poll); reject('Maps script failed'); }
      }, 100);
      return;
    }

    window.__mapsScriptLoading = true;
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { window.__mapsScriptFailed = true; reject('Maps script failed to load'); };
    document.head.appendChild(script);
  });
}

interface Props {
  value: string;
  onChange: (val: string) => void;
  onSelect?: (val: string) => void;
  // Optional — fires alongside onSelect with the selected place's coordinates
  // (or null if the coordinate fetch failed). Callers that need to resolve a
  // bare city name to a county (city name often != county name) should use
  // this instead of trying to parse the county out of the address string.
  onSelectPlace?: (val: string, coords: { lat: number; lng: number } | null) => void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}

interface Suggestion {
  id: string;
  text: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prediction: any;
}

const DEBOUNCE_MS = 220;
const MIN_CHARS = 4;

const AddressAutocomplete = forwardRef<HTMLInputElement, Props>(function AddressAutocomplete(
  { value, onChange, onSelect, onSelectPlace, placeholder = '123 Main St, City, CA 90001', className, style, onKeyDown, disabled },
  forwardedRef,
) {
  const internalRef = useRef<HTMLInputElement>(null);
  const inputRef = (forwardedRef as React.RefObject<HTMLInputElement>) ?? internalRef;

  const [placesReady, setPlacesReady] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionTokenRef = useRef<any>(null);

  useEffect(() => {
    loadMapsScript()
      .then(() => window.google.maps.importLibrary('places'))
      .then(() => setPlacesReady(true))
      .catch(() => { /* graceful degradation — input still works as plain text */ });
  }, []);

  const updateRect = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom, left: r.left, width: r.width });
  }, [inputRef]);

  useEffect(() => {
    if (!open) return;
    updateRect();
    const onScroll = () => updateRect();
    const onResize = () => updateRect();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    // iOS Safari does not reliably fire window's own 'resize'/'scroll' when the
    // on-screen keyboard opens/closes or the page auto-scrolls a focused input
    // into view above it -- only window.visualViewport's events fire for that.
    // Without this, the dropdown's position: fixed coordinates can be computed
    // mid-keyboard-animation and never get corrected, rendering off-screen.
    window.visualViewport?.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('scroll', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('scroll', onScroll);
    };
  }, [open, updateRect]);

  const fetchSuggestions = useCallback((text: string) => {
    if (!placesReady || !window.google?.maps?.places?.AutocompleteSuggestion) return;
    const thisRequest = ++requestIdRef.current;
    if (!sessionTokenRef.current) {
      try { sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken(); } catch { /* optional */ }
    }
    window.google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: text,
      includedRegionCodes: ['us'],
      sessionToken: sessionTokenRef.current,
    }).then((res: { suggestions?: unknown[] }) => {
      if (thisRequest !== requestIdRef.current) return; // stale response — a newer keystroke already fired
      const list: Suggestion[] = (res?.suggestions ?? []).flatMap((s: any, i: number) => {
        const pred = s?.placePrediction;
        const t = pred?.text?.text;
        return t ? [{ id: `${i}-${t}`, text: t, prediction: pred }] : [];
      });
      setSuggestions(list);
      setOpen(list.length > 0);
      updateRect();
    }).catch(() => {
      if (thisRequest !== requestIdRef.current) return;
      setSuggestions([]);
      setOpen(false);
    });
  }, [placesReady, updateRect]);

  function handleChange(text: string) {
    onChange(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < MIN_CHARS) {
      requestIdRef.current++; // invalidate any in-flight request
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => fetchSuggestions(text), DEBOUNCE_MS);
  }

  async function selectSuggestion(s: Suggestion) {
    setOpen(false);
    setSuggestions([]);
    let addr = s.text;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let place: any = null;
    try {
      place = s.prediction.toPlace();
      // 'location' is only fetched when a caller actually needs coordinates
      // (onSelectPlace) — no extra cost for the other call sites.
      const fields = onSelectPlace ? ['formattedAddress', 'location'] : ['formattedAddress'];
      await place.fetchFields({ fields });
      addr = (place.formattedAddress ?? addr).replace(/,\s*(USA|United States)$/i, '').trim();
    } catch {
      // fetchFields failed — fall back to the prediction's own display text rather
      // than blocking selection entirely.
    }
    sessionTokenRef.current = null; // sessions are single-use per Google's billing model
    onChange(addr);
    onSelect?.(addr);
    if (onSelectPlace) {
      const loc = place?.location; // google.maps.LatLng — lat()/lng() are methods, not properties
      const coords = loc && typeof loc.lat === 'function' ? { lat: loc.lat(), lng: loc.lng() } : null;
      onSelectPlace(addr, coords);
    }
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape' && open) { setOpen(false); }
    onKeyDown?.(e);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        value={value}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) { setOpen(true); updateRect(); } }}
        // Delay so a suggestion's onMouseDown (which preventDefault()s to stop this
        // blur firing first) has already run by the time this closes the dropdown.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleInputKeyDown}
        placeholder={placeholder}
        className={className}
        style={style}
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && rect && suggestions.length > 0 && (
        <div
          className="aac-dropdown"
          style={{
            position: 'fixed',
            top: rect.top + 4,
            left: rect.left,
            width: rect.width,
            zIndex: 2000,
            background: '#1a2035',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10,
            boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
            maxHeight: 260,
            overflowY: 'auto',
          }}
        >
          {suggestions.map(s => (
            <button
              key={s.id}
              type="button"
              // onMouseDown (not onClick) + preventDefault: fires before the input's
              // onBlur, so the browser doesn't dismiss the dropdown out from under the
              // tap before the selection registers.
              onMouseDown={e => { e.preventDefault(); selectSuggestion(s); }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 14px',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                color: '#e6edf3',
                fontSize: '0.85rem',
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              {s.text}
            </button>
          ))}
        </div>
      )}
    </>
  );
});

export default AddressAutocomplete;
