"use client";

import Link from "next/link";
import Image from "next/image";

export default function SidebarLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`sticky top-0 z-[10000] bg-white/85 backdrop-blur px-4 py-3 ${className}`}>
      <Link
        href="/"
        aria-label="HomeRates.ai home"
        className="inline-flex items-center pointer-events-auto"
      >
        <Image
          src="/assets/homerates-mark.svg"
          alt="HomeRates.ai"
          width={32}
          height={32}
          priority
        />
      </Link>
    </div>
  );
}
