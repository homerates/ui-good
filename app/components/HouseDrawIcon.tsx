'use client';

import { useEffect, useRef } from 'react';

interface Props {
  color?: string;
  size?: number;
}

// Drawing sequence: [delay_ms, duration_ms] per path
const SEQ: [number, number][] = [
  [0,    260],  // floor
  [140,  260],  // left wall
  [170,  260],  // right wall
  [300,  300],  // roof left
  [340,  300],  // roof right
  [520,  220],  // door
  [560,  220],  // window
];

export default function HouseDrawIcon({ color = '#00e87a', size = 18 }: Props) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const paths = Array.from(svg.querySelectorAll<SVGPathElement>('[data-h]'));

    // initialise all paths as invisible
    paths.forEach(p => {
      const len = p.getTotalLength();
      p.style.strokeDasharray  = String(len);
      p.style.strokeDashoffset = String(len);
      p.style.transition = 'none';
    });

    // stagger each path in
    paths.forEach((p, i) => {
      const [delay, dur] = SEQ[i] ?? [i * 80, 250];
      setTimeout(() => {
        p.style.transition = `stroke-dashoffset ${dur}ms cubic-bezier(0.4,0,0.2,1)`;
        p.style.strokeDashoffset = '0';
      }, delay);
    });
  }, []);

  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ overflow: 'visible', display: 'block' }}
    >
      {/* floor */}
      <path data-h stroke={color} strokeWidth="1.8" strokeLinecap="round"
        d="M2 20h20" />
      {/* left wall */}
      <path data-h stroke={color} strokeWidth="1.8" strokeLinecap="round"
        d="M4 20V11" />
      {/* right wall */}
      <path data-h stroke={color} strokeWidth="1.8" strokeLinecap="round"
        d="M20 20V11" />
      {/* roof left */}
      <path data-h stroke={color} strokeWidth="1.8" strokeLinecap="round"
        d="M2 12L12 4" />
      {/* roof right */}
      <path data-h stroke={color} strokeWidth="1.8" strokeLinecap="round"
        d="M22 12L12 4" />
      {/* door */}
      <path data-h stroke={color} strokeWidth="1.8" strokeLinecap="round"
        d="M10 20v-5h4v5" />
      {/* window */}
      <path data-h stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        d="M6 12.5h3.5v4H6z" />
    </svg>
  );
}
