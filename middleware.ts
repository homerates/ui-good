// middleware.ts
import { NextResponse } from "next/server";

// 🚫 Do NOT run middleware on API routes or Next assets.
// This fully bypasses SSO/redirects/etc for /api/*.
export const config = {
  matcher: [
    // everything EXCEPT:
    // - /api/*
    // - /_next/*
    // - /assets/*
    // - /favicon.ico
    "/((?!api/|_next/|assets/|favicon.ico).*)",
  ],
};

export default function middleware() {
  // Keep your existing logic here if you had any (auth, redirects, etc).
  // It will run for pages, not for /api/*.
  return NextResponse.next();
}
