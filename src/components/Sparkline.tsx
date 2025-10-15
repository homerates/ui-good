"use client"; // ensure it's a client component

import React from "react";

type Point = { x: number; y: number };

function normalize(points: Point[], width: number, height: number) {
  if (points.length === 0) return "";
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const dx = maxX - minX || 1;
  const dy = maxY - minY || 1;

  const toSvg = (p: Point) => {
    const x = ((p.x - minX) / dx) * (width - 2) + 1;
    const y = height - (((p.y - minY) / dy) * (height - 2) + 1); // flip Y for SVG
    return `${x},${y}`;
  };

  return points.map(toSvg).join(" ");
}

export default function Sparkline({
  points,
  width = 300,
  height = 60,
  label,
  value,
}: {
  points: Point[];
  width?: number;
  height?: number;
  label: string;
  value?: string | number;
}) {
  const polyline = normalize(points, width, height);
  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm text-gray-500">{label}</div>
        {value !== undefined && <div className="font-semibold">{value}</div>}
      </div>
      <svg width={width} height={height} role="img" aria-label={`${label} sparkline`}>
        <rect x="0" y="0" width={width} height={height} fill="none" />
        {polyline && (
          <polyline
            points={polyline}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </div>
  );
}
