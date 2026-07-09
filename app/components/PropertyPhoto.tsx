'use client';

// PropertyPhoto — property image with automatic fallback chain:
//   1. Google Street View Static API (return_error_code=true → 404 on no imagery, so onError fires)
//   2. Google Static Maps satellite (always works for any address)
//   3. Empty / CSS background (if both fail)
//
// Used in sidebar rows and saved-lookup lists where no Redfin photo is stored.
// The parent container must be position:relative and have explicit width/height.

import { useState } from 'react';

function streetViewUrl(address: string, w: number, h: number, key: string): string {
  const enc = encodeURIComponent(address);
  return (
    `https://maps.googleapis.com/maps/api/streetview` +
    `?size=${w}x${h}` +
    `&location=${enc}` +
    `&return_error_code=true` +
    `&source=outdoor` +
    `&key=${key}`
  );
}

function staticMapUrl(address: string, w: number, h: number, key: string): string {
  const enc = encodeURIComponent(address);
  return (
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${enc}` +
    `&zoom=15` +
    `&size=${w}x${h}` +
    `&scale=2` +
    `&maptype=satellite` +
    `&markers=color:green%7C${enc}` +
    `&key=${key}`
  );
}

export interface PropertyPhotoProps {
  address?: string | null;
  // Pixel dimensions sent to Google APIs — default 400×200 (good for sidebar thumbnails)
  width?:  number;
  height?: number;
  style?:    React.CSSProperties;
  className?: string;
}

export default function PropertyPhoto({
  address,
  width  = 400,
  height = 200,
  style,
  className,
}: PropertyPhotoProps) {
  // 0 = try Street View, 1 = try satellite map, 2 = give up (empty)
  const [tier, setTier] = useState(0);

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

  if (!key || !address?.trim()) {
    return <div className={className} style={style} />;
  }

  const src =
    tier === 0 ? streetViewUrl(address, width, height, key) :
    tier === 1 ? staticMapUrl(address, width, height, key) :
    null;

  return (
    <div className={className} style={style}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={tier}
          src={src}
          alt="Property photo"
          onError={() => setTier(t => Math.min(t + 1, 2))}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )}
    </div>
  );
}
