// app/layout.tsx
import "./globals.css";

export const metadata = {
  title: "HomeRates",
  description: "Mortgage Q&A with market context",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Make <body> the grid parent */}
      <body className="app">
        {children}
      </body>
    </html>
  );
}
