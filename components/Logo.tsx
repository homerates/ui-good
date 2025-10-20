// components/Logo.tsx
import Image from "next/image";

export default function Logo() {
  return (
    <div className="flex items-center gap-2">
      <Image src="/assets/homerates-mark.svg" alt="HomeRates mark" width={28} height={28} />
      <Image src="/assets/homerates-wordmark.svg" alt="HomeRates wordmark" width={120} height={24} />
    </div>
  );
}

