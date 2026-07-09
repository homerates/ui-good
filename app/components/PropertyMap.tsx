'use client';

// PropertyMap — shared map thumbnail component.
// thumbnail: Google Static Maps API <img> — no JS SDK, no bundle cost.
// full:      interactive Google Maps JS — not yet implemented; falls back to thumbnail.
//
// Provider boundary: props use only plain lat/lng/address — no Google-specific types.
// Callers never construct Static Maps URLs directly; use this component instead.

import React from 'react';

type PropertyMapVariant = 'thumbnail' | 'full';
type PropertyMapType    = 'satellite' | 'roadmap' | 'hybrid' | 'terrain';

export interface PropertyMapProps {
  // Location — lat+lng takes priority; address string used if coordinates absent
  address?: string | null;
  lat?: number | null;
  lng?: number | null;

  // Rendering
  variant:  PropertyMapVariant;
  width?:   number;          // px — thumbnail only; default 820
  height?:  number;          // px — thumbnail only; default 260
  zoom?:    number;          // default 15
  mapType?: PropertyMapType; // default 'satellite'

  // Caller-supplied content rendered on top of the map image
  overlay?: React.ReactNode;

  // Pass-through
  style?:    React.CSSProperties;
  className?: string;
}

function buildStaticMapUrl(
  center: string,
  width: number,
  height: number,
  zoom: number,
  mapType: PropertyMapType,
  apiKey: string,
): string {
  const enc = encodeURIComponent(center);
  return (
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${enc}` +
    `&zoom=${zoom}` +
    `&size=${width}x${height}` +
    `&scale=2` +
    `&maptype=${mapType}` +
    `&markers=color:green%7C${enc}` +
    `&key=${apiKey}`
  );
}

export default function PropertyMap({
  address,
  lat,
  lng,
  variant,
  width  = 820,
  height = 260,
  zoom   = 15,
  mapType = 'satellite',
  overlay,
  style,
  className,
}: PropertyMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

  if (!apiKey) return null;

  // Resolve center: prefer lat/lng pair, fall back to address string
  const center =
    lat != null && lng != null
      ? `${lat},${lng}`
      : address?.trim() ?? null;

  if (!center) return null;

  if (variant === 'full') {
    // Interactive map not yet implemented — fall back to thumbnail with a dev warning.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[PropertyMap] variant="full" is not yet implemented — rendering thumbnail fallback.');
    }
  }

  const mapUrl = buildStaticMapUrl(center, width, height, zoom, mapType, apiKey);

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height,
        overflow: 'hidden',
        background: '#0a1628',
        ...style,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mapUrl}
        alt="Property location map"
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        onError={e => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
      />
      {overlay && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {overlay}
        </div>
      )}
    </div>
  );
}
