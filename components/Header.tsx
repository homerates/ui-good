"use client";

import Link from "next/link";
import Image from "next/image";

export default function Header() {
  return (
    <header className="sticky top-0 z-[9999] isolate w-full border-b bg-white/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center">
        <Link
          href="/"
          aria-label="HomeRates.ai home"
          className="inline-flex items-center pointer-events-auto"
        >
          <Image
            src="/assets/homerates-mark.svg"
            alt="HomeRates.ai"
            width={28}
            height={28}
            priority
          />
        </Link>

        <div className="ml-auto text-xs text-neutral-500">{/* status slot */}</div>
      </div>
    </header>
  );
}
