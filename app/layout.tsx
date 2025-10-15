import "./globals.css";
import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "HomeRates.ai",
  description: "AI mortgage insights",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900">
        <header className="border-b">
          <div className="mx-auto max-w-6xl flex items-center gap-3 p-4">
            <Image src="/assets/homerates-mark.svg" alt="HomeRates.ai" width={32} height={32} />
            <span className="font-semibold">HomeRates.ai</span>
          </div>
        </header>

        <main className="mx-auto max-w-6xl p-4">{children}</main>

        <footer className="border-t mt-10">
          <div className="mx-auto max-w-6xl p-4 text-sm">
            © {new Date().getFullYear()} HomeRates.ai
          </div>
        </footer>
      </body>
    </html>
  );
}
