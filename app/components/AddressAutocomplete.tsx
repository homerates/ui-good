'use client';

// components/AddressAutocomplete.tsx
// Google Places address autocomplete — drop-in replacement for plain <input type="text">
// Requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in env.
// Loads the Maps JS SDK once per page; subsequent instances reuse the same script.

import { useEffect, useRef, useCallback, forwardRef, CSSProperties, KeyboardEvent } from 'react';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google: any;
    __mapsScriptLoading?: boolean;
  }
}

function loadMapsScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject('SSR');
    if (window.google?.maps?.places) return resolve();

    if (window.__mapsScriptLoading) {
      const poll = setInterval(() => {
        if (window.google?.maps?.places) { clearInterval(poll); resolve(); }
      }, 100);
      return;
    }

    window.__mapsScriptLoading = true;
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject('Maps script failed to load');
    document.head.appendChild(script);
  });
}

interface Props {
  value: string;
  onChange: (val: string) => void;
  onSelect?: (val: string) => void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}

const AddressAutocomplete = forwardRef<HTMLInputElement, Props>(function AddressAutocomplete(
  { value, onChange, onSelect, placeholder = '123 Main St, City, CA 90001', className, style, onKeyDown, disabled },
  forwardedRef,
) {
  const internalRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const acRef = useRef<any>(null);

  // Use forwarded ref if provided, otherwise fall back to internal ref
  const inputRef = (forwardedRef as React.RefObject<HTMLInputElement>) ?? internalRef;

  const initAutocomplete = useCallback(() => {
    const input = inputRef.current;
    if (!input || !window.google?.maps?.places || acRef.current) return;

    acRef.current = new window.google.maps.places.Autocomplete(input, {
      types:                ['address'],
      componentRestrictions: { country: 'us' },
      fields:               ['formatted_address'],
    });

    acRef.current.addListener('place_changed', () => {
      const place = acRef.current!.getPlace();
      const raw   = place.formatted_address ?? input.value;
      const addr  = raw.replace(/,\s*(USA|United States)$/i, '').trim();
      onChange(addr);
      onSelect?.(addr);
    });
  }, [onChange, onSelect, inputRef]);

  useEffect(() => {
    loadMapsScript()
      .then(initAutocomplete)
      .catch(() => { /* graceful degradation — input still works as plain text */ });
  }, [initAutocomplete]);

  return (
    <input
      ref={inputRef}
      type="text"
      autoComplete="off"
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className={className}
      style={style}
      disabled={disabled}
    />
  );
});

export default AddressAutocomplete;
